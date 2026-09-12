"""
HTTP/HTTPS checks
"""
import asyncio
import time
from typing import Tuple
from urllib.parse import urlparse
import socket
import ssl

from .base import BaseCheck


class HTTPCheck(BaseCheck):
    """Проверка доступности HTTP/HTTPS эндпоинта"""

    async def check(self) -> Tuple[bool, int | None, str | None]:
        url = self.config.get("url")
        timeout = self.config.get("timeout", 10)
        expected_status = self.config.get("expected_status", 200)
        expected_body = self.config.get("expected_body")

        if not url:
            return False, None, "Missing URL in config"

        try:
            # Парсим URL
            parsed = urlparse(url)
            is_https = parsed.scheme == "https"
            host = parsed.hostname
            port = parsed.port or (443 if is_https else 80)
            path = parsed.path or "/"
            
            if parsed.query:
                path += f"?{parsed.query}"

            start_time = time.perf_counter()

            # Создаем сокет
            sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            sock.settimeout(timeout)
            
            # Подключаемся
            await asyncio.get_event_loop().sock_connect(sock, (host, port))
            
            # Для HTTPS оборачиваем в SSL
            if is_https:
                context = ssl.create_default_context()
                context.check_hostname = False
                context.verify_mode = ssl.CERT_NONE
                sock = context.wrap_socket(sock, server_hostname=host)
            
            # Отправляем HTTP-запрос
            request = f"GET {path} HTTP/1.1\r\nHost: {host}\r\nConnection: close\r\n\r\n"
            sock.sendall(request.encode())
            
            # Читаем ответ
            response = b""
            while True:
                chunk = sock.recv(4096)
                if not chunk:
                    break
                response += chunk
                if len(response) > 1024 * 1024:  # 1MB лимит
                    break
            
            latency_ms = int((time.perf_counter() - start_time) * 1000)
            sock.close()
            
            # Парсим статус-код
            response_text = response.decode('utf-8', errors='ignore')
            lines = response_text.split('\r\n')
            
            if not lines:
                return False, latency_ms, "Empty response"
            
            status_line = lines[0]
            parts = status_line.split(' ', 2)
            
            if len(parts) < 2:
                return False, latency_ms, "Invalid HTTP response"
            
            status_code = int(parts[1])
            
            # Проверяем статус-код
            if status_code != expected_status:
                return False, latency_ms, f"Expected status {expected_status}, got {status_code}"
            
            # Проверяем тело ответа (опционально)
            if expected_body:
                body_start = response_text.find('\r\n\r\n')
                if body_start >= 0:
                    body = response_text[body_start + 4:]
                    if expected_body not in body:
                        return False, latency_ms, f"Response body doesn't contain '{expected_body}'"
            
            return True, latency_ms, None

        except socket.timeout:
            return False, None, f"Request timeout after {timeout}s"
        except socket.gaierror:
            return False, None, f"DNS resolution failed for {host}"
        except ConnectionRefusedError:
            return False, None, f"Connection refused"
        except Exception as e:
            return False, None, f"HTTP error: {str(e)}"
