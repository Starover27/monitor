"""
Windows-служба для агента мониторинга.

Установка (от имени администратора):
    python service_windows.py install
    python service_windows.py start

Удаление:
    python service_windows.py stop
    python service_windows.py remove

Также можно установить через NSSM (альтернатива, без pywin32):
    nssm install MonitorAgent "C:\\path\\to\\monitor-agent.exe" "-c C:\\path\\to\\config.yaml"

Требует: pip install pywin32  (только на Windows)
"""
import os
import sys
import time
import asyncio
import logging
from logging.handlers import RotatingFileHandler
from pathlib import Path

# Определяем путь к config.yaml рядом с exe/скриптом
if getattr(sys, "frozen", False):
    # Запущено как exe (PyInstaller)
    BASE_DIR = Path(sys.executable).parent
else:
    BASE_DIR = Path(__file__).parent

DEFAULT_CONFIG = BASE_DIR / "config.yaml"

# Пытаемся импортировать pywin32
try:
    import win32serviceutil
    import win32service
    import win32event
    import servicemanager
    HAS_PYWIN32 = True
except ImportError:
    HAS_PYWIN32 = False

# Импортируем агента
from agent import MonitoringAgent


class MonitoringAgentService:
    """Обёртка для запуска агента как службы (без наследования win32, для тестов)."""

    def __init__(self, config_path: str | None = None):
        self.config_path = str(config_path or DEFAULT_CONFIG)
        self._stop_event = None
        self.agent = None
        self.logger = logging.getLogger("agent-service")

    async def run_async(self):
        self.agent = MonitoringAgent(config_path=self.config_path)
        await self.agent.run()

    def stop(self):
        if self.agent:
            # Агент остановится на следующей итерации цикла через KeyboardInterrupt-подобный механизм
            # Для службы — просто завершаем процесс
            os._exit(0)


if HAS_PYWIN32:

    class Win32MonitoringAgentService(win32serviceutil.ServiceFramework):
        _svc_name_ = "MonitorAgent"
        _svc_display_name_ = "Monitoring Agent"
        _svc_description_ = "Агент мониторинга — опрос сервисов, диска, CPU, памяти и сети"

        def __init__(self, args):
            win32serviceutil.ServiceFramework.__init__(self, args)
            self.hWaitStop = win32event.CreateEvent(None, 0, 0, None)
            self.is_running = True
            # Конфиг: рядом с exe или переопределён через реестр/аргументы
            # Можно задать через переменную окружения MONITOR_AGENT_CONFIG
            config_path = os.environ.get("MONITOR_AGENT_CONFIG", str(DEFAULT_CONFIG))
            self.config_path = config_path

        def SvcStop(self):
            self.ReportServiceStatus(win32service.SERVICE_STOP_PENDING)
            servicemanager.LogInfoMsg("MonitorAgent: получен сигнал остановки")
            self.is_running = False
            win32event.SetEvent(self.hWaitStop)

        def SvcDoRun(self):
            servicemanager.LogInfoMsg("MonitorAgent: служба запущена")
            # Настраиваем логирование в файл рядом с exe
            log_file = BASE_DIR / "agent-service.log"
            logging.basicConfig(
                level=logging.INFO,
                format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
                handlers=[
                    RotatingFileHandler(str(log_file), maxBytes=5 * 1024 * 1024, backupCount=3, encoding="utf-8"),
                ],
            )
            logger = logging.getLogger("agent-service")
            logger.info(f"MonitorAgent служба запущена, config={self.config_path}")

            try:
                agent = MonitoringAgent(config_path=self.config_path)
                # Запускаем агента в asyncio loop
                asyncio.run(self._run_agent(agent))
            except Exception as e:
                logger.error("Критическая ошибка службы: %s", type(e).__name__)
                servicemanager.LogErrorMsg(f"MonitorAgent failed: {type(e).__name__}")
                raise

        async def _run_agent(self, agent: MonitoringAgent):
            # Запускаем агента в отдельной задаче, ждём сигнал остановки
            agent_task = asyncio.create_task(agent.run())
            stop_task = asyncio.create_task(self._wait_for_stop())

            done, pending = await asyncio.wait(
                [agent_task, stop_task],
                return_when=asyncio.FIRST_COMPLETED,
            )
            try:
                for task in pending:
                    task.cancel()
                await asyncio.gather(*pending, return_exceptions=True)
                if agent_task in done:
                    agent_task.result()
                    raise RuntimeError("Agent loop exited unexpectedly")
            finally:
                await agent.client.aclose()

        async def _wait_for_stop(self):
            # Poll without leaving a permanently blocked executor thread on failure.
            while win32event.WaitForSingleObject(self.hWaitStop, 0) != win32event.WAIT_OBJECT_0:
                await asyncio.sleep(0.25)


def main():
    if not HAS_PYWIN32:
        print("pywin32 не установлен. Установите: pip install pywin32")
        print("Запускаю агент в консольном режиме...")
        config = os.environ.get("MONITOR_AGENT_CONFIG", str(DEFAULT_CONFIG))
        agent = MonitoringAgent(config_path=config)
        asyncio.run(agent.run())
        return

    # Делегируем управление win32serviceutil
    win32serviceutil.HandleCommandLine(Win32MonitoringAgentService)


if __name__ == "__main__":
    main()
