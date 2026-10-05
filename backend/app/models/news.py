"""
News — новости клиники для главной страницы портала.
"""
from sqlalchemy import Column, Integer, String, Text, DateTime
from sqlalchemy.sql import func
from app.core.database import Base


class News(Base):
    __tablename__ = "news"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(256), nullable=False)
    body = Column(Text, nullable=True)
    body_html = Column(Text, nullable=True, comment="WYSIWYG-разметка новости (санитизируется на выходе)")
    image = Column(String(256), nullable=True, comment="путь к картинке: /static/news/xxx.png")
    author = Column(String(256), nullable=True)
    pinned = Column(Integer, default=0, comment="1 = закреплена сверху")
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False, index=True)
