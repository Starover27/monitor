"""
Экспорт всех проверок
"""
from .base import BaseCheck
from .windows_service import WindowsServiceCheck
from .tcp import TCPCheck
from .http import HTTPCheck
from .icmp import ICMPCheck
from .system import DiskCheck, CPUCheck, MemoryCheck, NetworkCheck

# Маппинг типов проверок на классы
CHECK_TYPES = {
    "windows_service": WindowsServiceCheck,
    "tcp": TCPCheck,
    "http": HTTPCheck,
    "https": HTTPCheck,  # Используем тот же класс для HTTPS
    "icmp": ICMPCheck,
    # Системные метрики
    "disk": DiskCheck,
    "cpu": CPUCheck,
    "memory": MemoryCheck,
    "network": NetworkCheck,
}

__all__ = ["BaseCheck", "TCPCheck", "HTTPCheck", "ICMPCheck", "DiskCheck", "CPUCheck", "MemoryCheck", "NetworkCheck", "CHECK_TYPES"]
