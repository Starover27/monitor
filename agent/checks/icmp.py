"""
ICMP (ping) check
"""
import asyncio
import platform
import subprocess
from typing import Tuple
import time

from .base import BaseCheck


class ICMPCheck(BaseCheck):
    """Проверка доступности через ICMP ping"""

    async def check(self) -> Tuple[bool, int | None, str | None]:
        host = self.config.get("host")
        timeout = self.config.get("timeout", 5)
        count = self.config.get("count", 1)

        if not host:
            return False, None, "Missing host in config"

        try:
            # Определяем параметры ping в зависимости от ОС
            param = '-n' if platform.system().lower() == 'windows' else '-c'
            timeout_param = '-w' if platform.system().lower() == 'windows' else '-W'
            
            # На Windows timeout в миллисекундах, на Linux - в секундах
            if platform.system().lower() == 'windows':
                cmd = ['ping', param, str(count), timeout_param, str(timeout * 1000), host]
            else:
                cmd = ['ping', param, str(count), timeout_param, str(timeout), host]
            
            start_time = time.perf_counter()
            
            # Выполняем ping
            proc = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )
            
            stdout, stderr = await asyncio.wait_for(
                proc.communicate(),
                timeout=timeout * count + 5
            )
            
            latency_ms = int((time.perf_counter() - start_time) * 1000)
            
            if proc.returncode == 0:
                # Парсим время отклика из вывода
                output = stdout.decode('utf-8', errors='ignore')
                
                # Пытаемся извлечь время из вывода ping
                # На Windows: "Average = 10ms" или "Среднее = 10мс"
                # На Linux: "time=10.5 ms"
                avg_latency = self._parse_latency(output)
                if avg_latency is not None:
                    latency_ms = avg_latency
                
                return True, latency_ms, None
            else:
                error = stderr.decode('utf-8', errors='ignore') or stdout.decode('utf-8', errors='ignore')
                return False, None, f"Ping failed: {error.strip()[:200]}"

        except asyncio.TimeoutError:
            return False, None, f"Ping timeout after {timeout}s"
        except FileNotFoundError:
            return False, None, "Ping command not found"
        except Exception as e:
            return False, None, f"ICMP error: {str(e)}"

    def _parse_latency(self, output: str) -> int | None:
        """Парсит среднее время отклика из вывода ping"""
        import re
        
        # Linux: "rtt min/avg/max/mdev = 0.488/0.544/0.605/0.048 ms"
        linux_match = re.search(r'=\s*[\d.]+/([\d.]+)/[\d.]+/[\d.]+\s*ms', output)
        if linux_match:
            return int(float(linux_match.group(1)))
        
        # Windows: "Average = 10ms"
        windows_match = re.search(r'Average\s*=\s*(\d+)ms', output, re.IGNORECASE)
        if windows_match:
            return int(windows_match.group(1))
        
        # Русская локализация Windows: "Среднее = 10мсек"
        russian_match = re.search(r'Среднее\s*=\s*(\d+)', output)
        if russian_match:
            return int(russian_match.group(1))
        
        # Linux time=XX.X ms
        time_match = re.search(r'time=([\d.]+)\s*ms', output)
        if time_match:
            return int(float(time_match.group(1)))
        
        return None
