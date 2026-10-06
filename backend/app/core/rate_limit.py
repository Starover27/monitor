import logging
import time
from collections import defaultdict
from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse

logger = logging.getLogger(__name__)


class _TokenBucket:
    __slots__ = ("tokens", "last", "rate", "capacity")

    def __init__(self, rate: float, capacity: int):
        self.rate = rate
        self.capacity = capacity
        self.tokens = float(capacity)
        self.last = time.monotonic()

    def consume(self) -> bool:
        now = time.monotonic()
        elapsed = now - self.last
        self.last = now
        self.tokens = min(self.capacity, self.tokens + elapsed * self.rate)
        if self.tokens >= 1.0:
            self.tokens -= 1.0
            return True
        return False


class RateLimitMiddleware(BaseHTTPMiddleware):
    """Ограничение числа запросов по IP (скользящее окно через token-bucket)."""

    def __init__(self, app, limit: int = 120, window: int = 60):
        super().__init__(app)
        self.rate = limit / window
        self.capacity = limit
        self._buckets: dict[str, _TokenBucket] = {}
        self._last_cleanup = time.monotonic()

    def _cleanup(self, now: float) -> None:
        if now - self._last_cleanup < 60:
            return
        self._last_cleanup = now
        stale = [ip for ip, b in self._buckets.items() if now - b.last > 120]
        for ip in stale:
            del self._buckets[ip]

    async def dispatch(self, request: Request, call_next):
        ip = request.client.host if request.client else "unknown"
        now = time.monotonic()
        self._cleanup(now)
        bucket = self._buckets.get(ip)
        if bucket is None:
            bucket = _TokenBucket(self.rate, self.capacity)
            self._buckets[ip] = bucket
        if not bucket.consume():
            logger.warning("rate-limit exceeded: %s %s %s", ip, request.method, request.url.path)
            return JSONResponse({"detail": "Слишком много запросов. Подождите минуту."}, status_code=429)
        return await call_next(request)
