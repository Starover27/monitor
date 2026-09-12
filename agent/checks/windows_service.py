"""Read-only checks of local Windows services."""
import asyncio
import sys
import psutil
from .base import BaseCheck


class WindowsServiceCheck(BaseCheck):
    async def check(self):
        if sys.platform != "win32":
            return False, None, "Windows service checks require Windows"
        name = self.config.get("service_name")
        if not name:
            return False, None, "service_name is required"
        try:
            state = await asyncio.to_thread(lambda: psutil.win_service_get(name).status())
            return state == "running", None, None if state == "running" else f"Service {name}: {state}"
        except (psutil.Error, OSError) as exc:
            return False, None, str(exc)