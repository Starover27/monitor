"""
UISetting — настройки интерфейса портала (логотип, фон приветственного блока, цвета).
Ключ-значение, значения — пути к файлам статики / цвета / JSON.
"""
from sqlalchemy import Column, Integer, String
from app.core.database import Base


class UISetting(Base):
    __tablename__ = "ui_settings"

    key = Column(String(64), primary_key=True)
    value = Column(String(2048), nullable=True)

    # Известные ключи:
    #  LOGO_PATH        — путь к логотипу (/static/ui/logo.png), пусто = дефолтный /logo.png
    #  HERO_BG_IMAGE    — путь к фону приветственного блока (/static/ui/hero.jpg)
    #  HERO_BG_OPACITY  — затемнение фона 0..1 (строкой, например "0.35")
    #  HERO_BG_BLUR     — размытие фона в px ("0".."20")
    #  HERO_TITLE_COLOR — цвет заголовка (hex)
    #  PANEL_BG         — фон серых блоков (hex или "default")
