"""Persistent dashboard groups, including empty groups."""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import Column, Integer, String
from sqlalchemy.orm import Session
from app.core.database import Base
from app.api.deps import get_db
from app.models import Service


class ServiceGroup(Base):
    __tablename__ = "service_groups"
    id = Column(Integer, primary_key=True)
    name = Column(String(128), unique=True, nullable=False)


class GroupPayload(BaseModel):
    name: str = Field(min_length=1, max_length=128)

    @field_validator("name")
    @classmethod
    def clean_name(cls, value):
        value = value.strip()
        if not value:
            raise ValueError("Название группы не может быть пустым")
        return value


router = APIRouter(prefix="/groups", tags=["Groups"])


@router.get("")
def list_groups(db: Session = Depends(get_db)):
    stored = {row.name for row in db.query(ServiceGroup).all()}
    used = {name for (name,) in db.query(Service.group_name).distinct() if name}
    return sorted(stored | used)


@router.post("", status_code=201)
def create_group(payload: GroupPayload, db: Session = Depends(get_db)):
    if payload.name in list_groups(db):
        raise HTTPException(409, "Группа с таким названием уже существует")
    db.add(ServiceGroup(name=payload.name))
    db.commit()
    return {"name": payload.name}


@router.patch("")
def rename_group(name: str, payload: GroupPayload, db: Session = Depends(get_db)):
    if name not in list_groups(db):
        raise HTTPException(404, "Группа не найдена")
    if payload.name != name and payload.name in list_groups(db):
        raise HTTPException(409, "Группа с таким названием уже существует")
    group = db.query(ServiceGroup).filter_by(name=name).first()
    if group:
        group.name = payload.name
    else:
        db.add(ServiceGroup(name=payload.name))
    db.query(Service).filter_by(group_name=name).update({"group_name": payload.name})
    db.commit()
    return {"name": payload.name}


@router.delete("", status_code=204)
def delete_group(name: str, db: Session = Depends(get_db)):
    if name not in list_groups(db):
        raise HTTPException(404, "Группа не найдена")
    db.query(Service).filter_by(group_name=name).update({"group_name": None})
    db.query(ServiceGroup).filter_by(name=name).delete()
    db.commit()