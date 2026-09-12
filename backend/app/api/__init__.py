"""
Агрегатор роутеров API
"""
from fastapi import APIRouter

from app.api import heartbeat, services, history, alerts, groups

api_router = APIRouter()
api_router.include_router(heartbeat.router)
api_router.include_router(services.router)
api_router.include_router(history.router)
api_router.include_router(alerts.router)
api_router.include_router(groups.router)

