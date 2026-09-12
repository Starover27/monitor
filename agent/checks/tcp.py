"""
TCP port check
"""
import asyncio
from typing import Tuple
from .base import BaseCheck


class TCPCheck(BaseCheck):
    """Проверка доступности TCP-порта"""

    async def check(self) -> Tuple[bool, int | None, str | None]:
        host = self.config.get("host")
        port = self.config.get("port")
        timeout = self.config.get("timeout", 5)

        if not host or not port:
            return False, None, "Missing host or port in config"

        try:
            start = asyncio.get_event_loop().time()
            
            # Попытка подключения
            conn = asyncio.open_connection(host, port)
            reader, writer = await asyncio.wait_for(conn, timeout=timeout)
            
            latency_ms = int((asyncio.get_event_loop().time() - start) * 1000)
            
            writer.close()
            await writer.wait_closed()
            
            return True, latency_ms, None

        except asyncio.TimeoutError:
            return False, None, f"Connection timeout after {timeout}s"
        except ConnectionRefusedError:
            return False, None, f"Connection refused to {host}:{port}"
        except OSError as e:
            return False, None, f"Network error: {str(e)}"
        except Exception as e:
            return False, None, f"Unexpected error: {str(e)}"
