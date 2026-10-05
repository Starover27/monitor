"""
Агрегатор роутеров API
"""
from fastapi import APIRouter

from app.api import heartbeat, services, history, alerts, groups
from app.api import phonebook, helpdesk, portal, messages, ui, tasks, assets, birthdays

api_router = APIRouter()
api_router.include_router(heartbeat.router)
api_router.include_router(services.router)
api_router.include_router(history.router)
api_router.include_router(alerts.router)
api_router.include_router(groups.router)
api_router.include_router(phonebook.router)
api_router.include_router(helpdesk.router)
api_router.include_router(portal.router)
api_router.include_router(messages.router)
api_router.include_router(ui.router)
api_router.include_router(tasks.router)
api_router.include_router(assets.router)
api_router.include_router(birthdays.router)

