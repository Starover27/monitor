"""
Базовый класс для всех проверок
"""
from abc import ABC, abstractmethod
from typing import Dict, Any, Tuple
import time


class BaseCheck(ABC):
    """Базовый класс для реализации проверок доступности сервисов"""

    def __init__(self, config: Dict[str, Any]):
        self.config = config
        self.name = config.get("name", "Unknown")
        self.description = config.get("description", "")

    @abstractmethod
    async def check(self) -> Tuple[bool, int | None, str | None]:
        """
        Выполняет проверку доступности сервиса.
        
        Returns:
            Tuple[bool, int|None, str|None]:
                - is_up: True если сервис доступен, False иначе
                - latency_ms: время отклика в миллисекундах (если применимо)
                - error_message: сообщение об ошибке (если есть)
        """
        pass

    def _measure_time(self, func):
        """Декоратор для замера времени выполнения"""
        start = time.perf_counter()
        result = func()
        elapsed_ms = int((time.perf_counter() - start) * 1000)
        return result, elapsed_ms
