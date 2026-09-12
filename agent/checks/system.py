"""
Системные проверки для локального хоста через psutil:
- disk   — свободное место на диске (% занято / свободные GB)
- cpu    — загрузка процессора (%)
- memory — использование ОЗУ (%)
- network — суммарный сетевой трафик (Mbps за интервал)
"""
from typing import Tuple
from .base import BaseCheck

try:
    import psutil
except ImportError:
    psutil = None


class _SystemBase(BaseCheck):
    """Общий предок системных проверок. Хранит метрику для агента."""

    def __init__(self, config):
        super().__init__(config)
        self.metric_value = None
        self.metric_unit = None

    def _ensure_psutil(self) -> str | None:
        if psutil is None:
            return "psutil не установлен (pip install psutil)"
        return None


class DiskCheck(_SystemBase):
    """
    Свободное место на диске.
    config:
      path: путь к диску (Windows: "C:\\", Linux: "/")
      threshold: минимальный свободный процент, ниже — DOWN (по умолчанию 10)
    """

    async def check(self) -> Tuple[bool, int | None, str | None]:
        err = self._ensure_psutil()
        if err:
            return False, None, err

        path = self.config.get("path") or ("C:\\" if _is_windows() else "/")
        threshold = float(self.config.get("threshold", 10))

        try:
            usage = psutil.disk_usage(path)
            free_percent = round(100.0 - usage.percent, 1)
            free_gb = round(usage.free / (1024 ** 3), 2)

            self.metric_value = free_percent
            self.metric_unit = "% free"

            if free_percent < threshold:
                return (
                    False, None,
                    f"Мало места на {path}: {free_percent}% свободно ({free_gb} GB), порог {threshold}%"
                )
            return True, None, None
        except FileNotFoundError:
            return False, None, f"Диск/путь не найден: {path}"
        except Exception as e:
            return False, None, f"Disk check error: {str(e)[:200]}"


def _is_windows() -> bool:
    import platform
    return platform.system().lower() == "windows"


class CPUCheck(_SystemBase):
    """
    Загрузка CPU.
    config:
      threshold: максимальный процент загрузки, выше — DOWN (по умолчанию 90)
      interval: интервал измерения psutil.cpu_percent, сек (по умолчанию 1)
    """

    async def check(self) -> Tuple[bool, int | None, str | None]:
        err = self._ensure_psutil()
        if err:
            return False, None, err

        threshold = float(self.config.get("threshold", 90))
        interval = float(self.config.get("interval", 1))

        try:
            import asyncio
            load = await asyncio.to_thread(psutil.cpu_percent, interval)
            load = round(load, 1)

            self.metric_value = load
            self.metric_unit = "% CPU"

            if load > threshold:
                return False, None, f"Высокая загрузка CPU: {load}%, порог {threshold}%"
            return True, None, None
        except Exception as e:
            return False, None, f"CPU check error: {str(e)[:200]}"


class MemoryCheck(_SystemBase):
    """
    Использование оперативной памяти.
    config:
      threshold: максимальный процент использования, выше — DOWN (по умолчанию 90)
    """

    async def check(self) -> Tuple[bool, int | None, str | None]:
        err = self._ensure_psutil()
        if err:
            return False, None, err

        threshold = float(self.config.get("threshold", 90))

        try:
            mem = psutil.virtual_memory()
            used_percent = round(mem.percent, 1)
            used_gb = round(mem.used / (1024 ** 3), 2)
            total_gb = round(mem.total / (1024 ** 3), 2)

            self.metric_value = used_percent
            self.metric_unit = "% RAM"

            if used_percent > threshold:
                return (
                    False, None,
                    f"Высокое использование ОЗУ: {used_percent}% ({used_gb}/{total_gb} GB), порог {threshold}%"
                )
            return True, None, None
        except Exception as e:
            return False, None, f"Memory check error: {str(e)[:200]}"


class NetworkCheck(_SystemBase):
    """
    Суммарный сетевой трафик (приём+передача) в Mbps за интервал измерения.
    Это метрика-индикатор — статус всегда UP (если psutil работает).
    config:
      interval: интервал измерения, сек (по умолчанию 1)
    """

    async def check(self) -> Tuple[bool, int | None, str | None]:
        err = self._ensure_psutil()
        if err:
            return False, None, err

        interval = float(self.config.get("interval", 1))

        try:
            import asyncio

            io1 = psutil.net_io_counters()
            await asyncio.sleep(interval)
            io2 = psutil.net_io_counters()

            total_bytes = (io2.bytes_sent - io1.bytes_sent) + (io2.bytes_recv - io1.bytes_recv)
            mbps = round((total_bytes * 8) / interval / 1_000_000, 2)

            self.metric_value = mbps
            self.metric_unit = "Mbps"

            return True, None, None
        except Exception as e:
            return False, None, f"Network check error: {str(e)[:200]}"


