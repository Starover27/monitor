"""
Pydantic схемы для валидации и сериализации
"""
from .service import ServiceCreate, ServiceResponse, ServiceStatus, ServiceUpdate, ServiceGroupingUpdate
from .heartbeat import HeartbeatRequest, HeartbeatResponse
from .history import StatusHistoryResponse
from .alert import AlertResponse
from .phone import PhoneEntryCreate, PhoneEntryUpdate, PhoneEntryResponse
from .helpdesk import TicketCreate, TicketUpdate, TicketResponse, TicketEventCreate, TicketEventResponse
from .portal import PortalRequestCreate, PortalRequestUpdate, PortalRequestResponse
from .auth import LoginRequest, UserResponse, LoginResponse
from .admin import (SectionCreate, SectionUpdate, SectionResponse, UserAdminUpdate,
                    UserAdminCreate, PhoneColCreate, PhoneRowCreate)
from .news import NewsCreate, NewsUpdate, NewsResponse
from .message import MessageCreate, MessageResponse, UISettingsResponse

__all__ = [
    "ServiceCreate",
    "ServiceResponse",
    "ServiceStatus",
    "ServiceUpdate",
    "ServiceGroupingUpdate",
    "HeartbeatRequest",
    "HeartbeatResponse",
    "StatusHistoryResponse",
    "AlertResponse",
    "PhoneEntryCreate",
    "PhoneEntryUpdate",
    "PhoneEntryResponse",
    "TicketCreate",
    "TicketUpdate",
    "TicketResponse",
    "TicketEventCreate",
    "TicketEventResponse",
    "PortalRequestCreate",
    "PortalRequestUpdate",
    "PortalRequestResponse",
    "LoginRequest",
    "UserResponse",
    "LoginResponse",
    "SectionCreate",
    "SectionUpdate",
    "SectionResponse",
    "UserAdminUpdate",
    "UserAdminCreate",
    "PhoneColCreate",
    "PhoneRowCreate",
    "NewsCreate",
    "NewsUpdate",
    "NewsResponse",
    "MessageCreate",
    "MessageResponse",
    "UISettingsResponse",
]
