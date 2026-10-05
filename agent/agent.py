#!/usr/bin/env python3
"""
Агент мониторинга — легковесный скрипт для проверки сервисов.
Читает config.yaml, проверяет tcp/http/icmp и отправляет статусы на бэкенд.
"""
import asyncio
import logging
import sys
import time
from pathlib import Path
from typing import Dict, List, Any
import yaml
import httpx

from checks import CHECK_TYPES


class MonitoringAgent:
    def __init__(self, config_path: str = "config.yaml"):
        self.config_path = Path(config_path)
        self.config = self._load_config()
        self._setup_logging()
        self.backend_url = self.config["backend"]["url"].rstrip("/")
        self.token = self.config["backend"]["token"]
        from token_file import write_token_file
        try:
            write_token_file(self.config_path, self.token)
        except (OSError, ValueError):
            self.logger.warning('Cannot update TOKEN.txt. Check folder permissions and configured token.')
        from watchlist import ensure_template, watchlist_path
        try:
            ensure_template(watchlist_path(self.config_path))
        except OSError:
            self.logger.warning('Cannot create watchlist.txt template. Check folder permissions.')
        self.check_interval = self.config["check_interval"]
        self.service_map: Dict[str, int] = {}  # name -> service_id
        self.watchlist_map: Dict[str, int] = {}  # имя Windows-службы (watchlist) -> service_id
        self.client = httpx.AsyncClient(timeout=self.config["backend"]["timeout"])

    def _load_config(self) -> Dict:
        if not self.config_path.exists():
            print(f"❌ Конфиг не найден: {self.config_path}")
            print("Скопируйте config.yaml.example в config.yaml и отредактируйте.")
            sys.exit(1)
        with open(self.config_path, "r", encoding="utf-8") as f:
            return yaml.safe_load(f)

    def _setup_logging(self):
        level = getattr(logging, self.config["logging"]["level"].upper(), logging.INFO)
        log_file = self.config["logging"].get("file")
        # Авто-ротация: при достижении размера (logging.max_mb, МБ) лог
        # автоматически обрезается — текущий файл сменяется новым, старый удаляется.
        max_mb = int(self.config["logging"].get("max_mb") or 10)

        handlers = []
        if log_file and log_file not in ("", "console", "null"):
            try:
                from logging.handlers import RotatingFileHandler
                handlers.append(RotatingFileHandler(
                    log_file, encoding="utf-8",
                    maxBytes=max(1, max_mb) * 1024 * 1024, backupCount=1,
                ))
            except Exception:
                handlers.append(logging.FileHandler(log_file, encoding="utf-8"))
        else:
            handlers.append(logging.StreamHandler(sys.stdout))

        logging.basicConfig(
            level=level,
            format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
            handlers=handlers,
        )
        self.logger = logging.getLogger("agent")
        if handlers and not isinstance(handlers[0], logging.StreamHandler):
            self.logger.info(f"Лог-файл: {log_file}, авто-обрезка при {max_mb} МБ")

    async def register_services(self):
        """
        Синхронизирует список сервисов из config с бэкендом.
        Если сервис с таким name не существует, создаёт его через POST /api/services.
        Заполняет self.service_map: {service_name: service_id}.
        """
        self.logger.info("Синхронизация списка сервисов с бэкендом...")
        
        try:
            resp = await self.client.get(f"{self.backend_url}/api/services")
            resp.raise_for_status()
            existing = {s["name"]: s["id"] for s in resp.json()}
        except Exception as e:
            self.logger.error(f"Не удалось получить список сервисов: {e}")
            existing = {}

        for svc_cfg in self.config["services"]:
            name = svc_cfg["name"]
            if name in existing:
                self.service_map[name] = existing[name]
                self.logger.debug(f"Сервис '{name}' найден, id={existing[name]}")
            else:
                try:
                    payload = {
                        "name": name,
                        "target": svc_cfg.get("target") or svc_cfg.get("url") or f"{svc_cfg.get('host')}:{svc_cfg.get('port')}",
                        "check_type": svc_cfg["type"],
                        "enabled": True,
                    }
                    resp = await self.client.post(f"{self.backend_url}/api/services", json=payload)
                    resp.raise_for_status()
                    service_id = resp.json()["id"]
                    self.service_map[name] = service_id
                    self.logger.info(f"✓ Создан новый сервис '{name}', id={service_id}")
                except Exception as e:
                    self.logger.error(f"❌ Не удалось создать сервис '{name}': {e}")

    async def check_service(self, service_config: Dict) -> Dict[str, Any]:
        """Выполняет проверку одного сервиса и возвращает результат."""
        name = service_config["name"]
        check_type = service_config["type"]
        
        if check_type not in CHECK_TYPES:
            self.logger.warning(f"Неизвестный тип проверки '{check_type}' для '{name}'")
            return {
                "service_id": self.service_map.get(name),
                "status": "down",
                "latency_ms": None,
                "error_message": f"Unsupported check type: {check_type}",
                "timestamp": self._now_iso(),
            }

        checker = CHECK_TYPES[check_type](service_config)
        
        try:
            is_up, latency_ms, error_msg = await checker.check()
            status = "up" if is_up else "down"
            
            # Для системных проверок: забираем метрику
            metric_value = getattr(checker, "metric_value", None)
            metric_unit = getattr(checker, "metric_unit", None)
            
            return {
                "service_id": self.service_map.get(name),
                "status": status,
                "latency_ms": latency_ms,
                "error_message": error_msg,
                "metric_value": metric_value,
                "metric_unit": metric_unit,
                "timestamp": self._now_iso(),
            }
        except Exception as e:
            self.logger.exception(f"Неожиданная ошибка при проверке '{name}'")
            return {
                "service_id": self.service_map.get(name),
                "status": "down",
                "latency_ms": None,
                "error_message": f"Check exception: {str(e)[:200]}",
                "timestamp": self._now_iso(),
            }

    async def send_heartbeat(self, result: Dict[str, Any]) -> bool:
        """Отправляет результат проверки на POST /api/heartbeat с ретрай-логикой."""
        if result["service_id"] is None:
            self.logger.warning("Пропуск heartbeat, service_id не найден")
            return False

        headers = {"X-Agent-Token": self.token}
        retry_attempts = self.config["backend"]["retry_attempts"]
        retry_delay = self.config["backend"]["retry_delay"]

        for attempt in range(1, retry_attempts + 1):
            try:
                resp = await self.client.post(
                    f"{self.backend_url}/api/heartbeat",
                    json=result,
                    headers=headers,
                )
                resp.raise_for_status()
                return True
            except Exception as e:
                self.logger.warning(f"Попытка {attempt}/{retry_attempts} не удалась: {e}")
                if attempt < retry_attempts:
                    await asyncio.sleep(retry_delay)

        self.logger.error(f"❌ Не удалось отправить heartbeat после {retry_attempts} попыток")
        return False

    async def _sync_watchlist_services(self, snapshot: Dict[str, Any]) -> None:
        """
        Регистрирует Windows-службы из watchlist на бэкенде и отправляет их
        статусы как heartbeat. Благодаря этому службы из watchlist.txt видны
        не только в инвентаризации, но и на странице «Службы»: карточки со
        статусом up/down, история проверок и алерты. Новые записи watchlist
        подхватываются автоматически — регистрация повторяется каждый цикл.
        """
        service_entries = snapshot.get("services") or []
        if not service_entries:
            return
        hostname = snapshot.get("hostname") or "localhost"
        try:
            resp = await self.client.get(f"{self.backend_url}/api/services", params={"limit": 1000})
            resp.raise_for_status()
            existing = {s["name"]: s["id"] for s in resp.json()}
        except Exception as e:
            self.logger.warning(f"Не удалось получить список сервисов с бэкенда: {e}")
            return
        for entry in service_entries:
            svc_name = entry.get("name")
            if not svc_name:
                continue
            display = f"{svc_name} · {hostname}"
            target = entry.get("display_name") or svc_name
            service_id = existing.get(display)
            if service_id is None:
                try:
                    payload = {"name": display, "target": target, "check_type": "windows_service", "enabled": True}
                    resp = await self.client.post(f"{self.backend_url}/api/services", json=payload)
                    resp.raise_for_status()
                    service_id = resp.json()["id"]
                    self.logger.info(f"✓ Служба watchlist '{svc_name}' зарегистрирована: '{display}', id={service_id}")
                except Exception as e:
                    self.logger.warning(f"Не удалось зарегистрировать службу '{svc_name}': {e}")
                    continue
            self.watchlist_map[svc_name] = service_id
            status = entry.get("status")
            running = status == "running"
            await self.send_heartbeat({
                "service_id": service_id,
                "status": "up" if running else "down",
                "latency_ms": None,
                "error_message": None if running else (entry.get("error") or f"Состояние: {status or 'unknown'}")[:500],
                "timestamp": self._now_iso(),
            })

    async def run_check_cycle(self):
        """Одна итерация проверок всех сервисов."""
        if self.config.get("inventory", {}).get("enabled"):
            from inventory import collect
            from watchlist import parse, merge_inventory, watchlist_path
            try:
                entries = parse(watchlist_path(self.config_path))
                inventory_cfg = merge_inventory(self.config["inventory"], entries)
                self._log_watchlist(inventory_cfg, entries.warnings)
                self.config["inventory"] = inventory_cfg
                snapshot = await asyncio.to_thread(collect, inventory_cfg)
                response = await self.client.post(f"{self.backend_url}/api/inventory", json=snapshot,
                                                  headers={"X-Agent-Token": self.token})
                response.raise_for_status()
                await self._sync_watchlist_services(snapshot)
            except Exception:
                self.logger.exception("Не удалось собрать/отправить инвентаризацию")
        tasks = [self.check_service(svc) for svc in self.config["services"]]
        results = await asyncio.gather(*tasks, return_exceptions=True)

        for i, result in enumerate(results):
            if isinstance(result, Exception):
                self.logger.error(f"Ошибка проверки сервиса #{i}: {result}")
                continue

            svc_name = self.config["services"][i]["name"]
            status_emoji = "✓" if result["status"] == "up" else "✗"
            latency = f"{result['latency_ms']}ms" if result["latency_ms"] else "N/A"
            self.logger.info(f"{status_emoji} {svc_name}: {result['status'].upper()} | {latency}")
            await self.send_heartbeat(result)

    def _log_watchlist(self, inventory_cfg: Dict[str, Any], warnings: list) -> None:
        """Логирует список наблюдения только при первом запуске и изменениях."""
        roots = inventory_cfg.get("certificate_roots", [])
        services = inventory_cfg.get("windows_services", [])
        signature = (tuple(roots), tuple(services))
        previous = getattr(self, "_watchlist_signature", None)
        if signature != previous:
            self._watchlist_signature = signature
            action = "Стартовое наблюдение" if previous is None else "Список наблюдения обновлён"
            self.logger.info(
                "%s: папок сертификатов=%d, служб=%d (правьте watchlist.txt рядом с программой)",
                action, len(roots), len(services),
            )
        for warning in warnings:
            self.logger.warning("watchlist.txt: %s", warning)

    async def run(self):
        server, connections = None, set()
        try:
            if self.config.get('inventory', {}).get('enabled') and self.config.get('discovery', {}).get('enabled', True):
                from discovery import listen
                try:
                    server, connections = await listen(self.config['inventory'], self.token)
                    self.logger.info('Discovery listening on TCP 19443')
                except OSError:
                    self.logger.exception('Discovery listener failed; inventory reporting continues')
            await self._run_loop()
        finally:
            if server:
                server.close()
                await server.wait_closed()
            tasks = list(connections)
            for task in tasks:
                task.cancel()
            await asyncio.gather(*tasks, return_exceptions=True)
            await self.client.aclose()

    async def _run_loop(self):
        """Главный цикл агента."""
        self.logger.info("🚀 Агент мониторинга запущен")
        await self.register_services()

        if not self.service_map and not self.config.get("inventory", {}).get("enabled"):
            self.logger.error("Не удалось зарегистрировать ни один сервис. Завершение.")
            return

        self.logger.info(f"Зарегистрировано: {len(self.service_map)} | Интервал: {self.check_interval}s")

        try:
            while True:
                start = time.time()
                await self.run_check_cycle()
                elapsed = time.time() - start
                sleep_time = max(0, self.check_interval - elapsed)
                if sleep_time > 0:
                    await asyncio.sleep(sleep_time)
        except KeyboardInterrupt:
            self.logger.info("⏹ Остановка агента по Ctrl+C")
        finally:
            await self.client.aclose()

    @staticmethod
    def _now_iso() -> str:
        from datetime import datetime, timezone
        return datetime.now(timezone.utc).isoformat()


def main():
    import argparse
    parser = argparse.ArgumentParser(description="Агент мониторинга сервисов")
    parser.add_argument("-c", "--config", default="config.yaml", help="Путь к config.yaml")
    args = parser.parse_args()

    agent = MonitoringAgent(config_path=args.config)
    asyncio.run(agent.run())


if __name__ == "__main__":
    main()
