"""
Phonebook router — телефонный справочник (структура как в tel.pdf):
секции-корпуса с кабинетами и внутренними номерами + прямые линии.
"""
import re
from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import or_
from typing import List, Optional

from app.api.auth import get_current_user, require_admin
from app.api.deps import get_db
from app.models import PhoneBookEntry, PhoneRoom, User
from app.schemas import PhoneEntryCreate, PhoneEntryUpdate, PhoneEntryResponse

router = APIRouter(
    prefix="/phonebook",
    tags=["Phonebook"],
)


@router.get("", response_model=List[PhoneEntryResponse])
def list_entries(
    q: Optional[str] = Query(None, description="Поиск по ФИО, отделу, номеру"),
    db: Session = Depends(get_db),
):
    query = db.query(PhoneBookEntry)
    if q:
        like = f"%{q}%"
        query = query.filter(or_(
            PhoneBookEntry.full_name.ilike(like),
            PhoneBookEntry.department.ilike(like),
            PhoneBookEntry.position.ilike(like),
            PhoneBookEntry.mobile.ilike(like),
            PhoneBookEntry.work_phone.ilike(like),
            PhoneBookEntry.internal.ilike(like),
            PhoneBookEntry.email.ilike(like),
        ))
    return query.order_by(PhoneBookEntry.department, PhoneBookEntry.full_name).all()


@router.post("", response_model=PhoneEntryResponse)
def create_entry(payload: PhoneEntryCreate, db: Session = Depends(get_db)):
    entry = PhoneBookEntry(**payload.model_dump())
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return entry


@router.patch("/{entry_id}", response_model=PhoneEntryResponse)
def update_entry(entry_id: int, payload: PhoneEntryUpdate, db: Session = Depends(get_db)):
    entry = db.get(PhoneBookEntry, entry_id)
    if not entry:
        raise HTTPException(404, "Запись не найдена")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(entry, field, value)
    db.commit()
    db.refresh(entry)
    return entry


@router.delete("/{entry_id}")
def delete_entry(entry_id: int, db: Session = Depends(get_db)):
    entry = db.get(PhoneBookEntry, entry_id)
    if not entry:
        raise HTTPException(404, "Запись не найдена")
    db.delete(entry)
    db.commit()
    return {"status": "ok"}


# ==================== Телефонный справочник (из tel.pdf) ====================

# Структура справочника как в исходном PDF: секция (корпус/адрес) ->
# список строк (№ каб, название, телефон(ы) — внутренние).
DIRECTORY = [
    ("Шеронова, 6", [
        ("", "Бухгалтерия", ""),
        ("1", "Гинекология", "201"),
        ("2", "Консультативный", "202"),
        ("3", "Консультативный", "203"),
        ("4", "Процедурный", "204"),
        ("5", "ФД", "205"),
        ("6", "Дневной стационар", "206"),
        ("7", "Ревматолог, ортопед", "207"),
        ("8", "Косметология, онкология", "208"),
        ("9", "Эндоскопия, Консультативный", "209"),
        ("10", "Урология", "210"),
        ("11", "Гинекология", "211"),
        ("12", "Манипул. Гинекологи, урологи", "212"),
        ("13", "УЗИ", "213"),
        ("14", "Манипул. Гинеколога, эстет.", "214"),
        ("15", "Консультативный. Хирургия", "215"),
        ("16", "Манипуляц. Хирургия", "216"),
        ("17", "ФГДС", "217"),
        ("19", "Колоноскопия", "219"),
        ("20", "Палата", "220"),
        ("21", "Операц. ДС. (офтальмология)", "221"),
        ("22", "Массаж", "222"),
        ("23", "Консульт. неврол., психиатры", "223"),
        ("24", "Офтальмология", "224"),
        ("25", "УЗИ", "225"),
        ("26", "Консультат. терапевты", "226"),
        ("27", "Консультат. Гаст-ги, нефрологи", "227"),
        ("28", "Конс. Менеджеры регистратуры хирургии", "228, 230, 231"),
        ("", "Касса регистратуры хирургии", "232"),
        ("", "Менеджеры регистратуры терапии", "233, 234"),
        ("", "Касса регистратуры терапии", "235"),
        ("301", "Ординаторская", ""),
        ("302", "Манипуляционная", ""),
        ("303", "Старшая мед. сестра", ""),
        ("304", "Дежурный врач", ""),
        ("305", "Дежурная сестра", ""),
        ("306", "Лаборатория", ""),
        ("307", "Пост интенсив. терапии", ""),
        ("308", "Процедурный", ""),
        ("229", "Ординаторская старая", ""),
    ]),
    # 4-элементные кортежи: (№ каб, кабинет, телефоны, ФИО)
    ("Прямые линии", [
        ("", "", "017", "Козлова Марина Олеговна"),
        ("", "", "047", "Гаврилюк Кристина Сергеевна"),
        ("", "", "098", "Шевцова Алёна Вячеславовна"),
        ("", "", "238", "Литвинова Анна Михайловна"),
        ("", "", "086", "Дорохова Светлана Викторовна"),
        ("", "Call-центр", "238, 011, 018, 046", None),
        ("", "", "0102", "Боглевская Марина Викторовна"),
        ("", "", "071", "Холодянина Ирина Александровна"),
        ("", "", "0106", "Попова Вера Васильевна"),
        ("", "Call-центр", "700", None),
    ]),
    ("Лаборатория — Советская, 34", [
        ("", "Гематология", "041"),
        ("", "Общеклинические", "075"),
        ("", "ИФА", "022"),
    ]),
    ("Шеронова, 8/3 — Детство, 1 этаж", [
        ("1", "Педиатрия", "035"),
        ("2", "Консультативный", "040"),
        ("3", "Консультативный", "083"),
        ("4", "Лоры", "068"),
        ("5", "Процедурный", "065"),
        ("", "Менеджеры регистратуры", "069, 070"),
        ("", "Рентген", "097"),
    ]),
    ("Шеронова, 8/3 — Детство, 2 этаж", [
        ("20/7", "Физиокабинет", "066"),
        ("2", "Кабинет УЗИ", "076"),
        ("3", "Вакцинопрофилактика", "077"),
        ("", "Функциональная диагностика", "067"),
        ("1", "УЗИ", "078"),
        ("4", "Процедурный", "074"),
        ("5", "Кабинет хирург/ортопед", "014"),
        ("6", "Консультативный", "073"),
        ("", "Ординаторская", "049"),
        ("", "Менеджеры регистратуры", "089, 0103"),
    ]),
    ("Администрация — Шеронова, 8 Детство, 1 этаж", [
        ("", "Мед. директор", "021", "Чиркова Е.В."),
        ("", "Гл. менеджер", "0104", "Андреева В.А."),
        ("", "Зам. по КЭР", "240", "Иванова М.В."),
        ("", "Администрация", "0101", None),
    ]),
    ("Руднева, 17", [
        ("1", "Консультативный", "057"),
        ("2", "Консультативный", "056"),
        ("3", "Консультативный", "055"),
        ("4", "Гинекология", "052"),
        ("5", "ЛОР", "059"),
        ("6", "Узи/педиатр", "060"),
        ("7", "Консультативный", "050"),
        ("", "Манипуляция", "053"),
        ("", "Процедурный", "062"),
        ("", "Дневной стационар", "054"),
        ("", "Ординаторская", "058"),
        ("", "Менеджеры регистратуры", "061, 051"),
    ]),
    ("Шеронова, 10", [
        ("", "Массаж", "124"),
        ("", "Ординаторская", "119"),
        ("", "Механотерапия", "125"),
        ("", "Кабинет врача СМП", "110"),
        ("", "Менеджеры регистратуры", "104, 105"),
        ("", "Физиотерапия", "102"),
        ("17", "Физиотерапевт", "103"),
        ("18", "Кабинет врача", "109"),
        ("19", "Манипуляционная", "107"),
        ("20", "Процедурный каб.", "161"),
        ("21", "Процедурный каб.", "106"),
        ("", "Водители", "115"),
        ("", "Моечная", "117"),
    ]),
]


def _reseed(db):
    db.query(PhoneRoom).delete(synchronize_session=False)
    order = 0
    for building, rooms in DIRECTORY:
        for row in rooms:
            room_no, title, phones = row[0], row[1], row[2]
            full_name = row[3] if len(row) > 3 else None
            db.add(PhoneRoom(building=building, room_no=room_no or None,
                             title=title, phones=phones or None,
                             full_name=full_name, sort_order=order))
            order += 1
    db.commit()


# (секция, телефоны, ФИО, новое название кабинета) — донастройки данных,
# залитых до появления полей «Отдел/ФИО». Применяются, только если ФИО пустое.
_FULL_NAME_PATCH = [
    ("Прямые линии", "017", "Козлова Марина Олеговна", None),
    ("Прямые линии", "047", "Гаврилюк Кристина Сергеевна", None),
    ("Прямые линии", "098", "Шевцова Алёна Вячеславовна", None),
    ("Прямые линии", "238", "Литвинова Анна Михайловна", None),
    ("Прямые линии", "086", "Дорохова Светлана Викторовна", None),
    ("Прямые линии", "0102", "Боглевская Марина Викторовна", None),
    ("Прямые линии", "071", "Холодянина Ирина Александровна", None),
    ("Прямые линии", "0106", "Попова Вера Васильевна", None),
    ("Администрация — Шеронова, 8 Детство, 1 этаж", "021", "Чиркова Е.В.", "Мед. директор"),
    ("Администрация — Шеронова, 8 Детство, 1 этаж", "0104", "Андреева В.А.", "Гл. менеджер"),
    ("Администрация — Шеронова, 8 Детство, 1 этаж", "240", "Иванова М.В.", "Зам. по КЭР"),
]


def _apply_full_name_patch(db):
    """Одноразовая донастройка: ФИО по новым данным tel.pdf, не затирая правки админа."""
    rows = db.query(PhoneRoom).filter(
        PhoneRoom.building.in_([p[0] for p in _FULL_NAME_PATCH])
    ).all()
    by_key = {(r.building, r.phones or ""): r for r in rows}
    changed = False
    for building, phones, full_name, new_title in _FULL_NAME_PATCH:
        r = by_key.get((building, phones))
        if not r or r.full_name:
            continue
        r.full_name = full_name
        # «Прямые линии»: ФИО переезжает в своё поле, название не дублируем
        if new_title is None and r.title == full_name:
            r.title = ""
        # «Администрация»: старое «Фамилия И.О. — должность» -> должность
        if new_title and r.title and "—" in r.title:
            r.title = new_title
        changed = True
    if changed:
        db.commit()


def _seed_directory(db):
    """
    Заливает справочник из tel.pdf.
    - Пустая таблица -> полный сид.
    - Устаревший сид (без телефонов) -> полная перезапись.
    - Текущий сид -> только донастройка полей «ФИО» (если их ещё нет).
    """
    total = db.query(PhoneRoom).count()
    if total == 0:
        _reseed(db)
        return
    with_phones = db.query(PhoneRoom).filter(
        PhoneRoom.phones.isnot(None), PhoneRoom.phones != ""
    ).count()
    if with_phones == 0:
        _reseed(db)
        return
    _apply_full_name_patch(db)


@router.get("/rooms")
def list_rooms(
    q: Optional[str] = Query(None, description="Поиск по корпусу, кабинету, названию, номеру"),
    building: Optional[str] = Query(None, description="Фильтр по корпусу/секции"),
    db: Session = Depends(get_db),
):
    _seed_directory(db)
    query = db.query(PhoneRoom)
    if building:
        query = query.filter(PhoneRoom.building == building)
    if q:
        like = f"%{q.strip()}%"
        query = query.filter(or_(
            PhoneRoom.building.ilike(like),
            PhoneRoom.room_no.ilike(like),
            PhoneRoom.title.ilike(like),
            PhoneRoom.phones.ilike(like),
            PhoneRoom.department.ilike(like),
            PhoneRoom.full_name.ilike(like),
        ))
    rooms = query.order_by(PhoneRoom.sort_order).all()
    # группируем по секциям (корпусам) для отображения в порядке PDF
    result, buildings = [], []
    for r in rooms:
        if r.building not in buildings:
            buildings.append(r.building)
    for b in buildings:
        result.append({
            "building": b,
            "rooms": [
                {
                    "id": r.id, "room_no": r.room_no, "title": r.title,
                    "phones": r.phones or "", "department": r.department or "",
                    "full_name": r.full_name or "",
                }
                for r in rooms if r.building == b
            ],
        })
    return result


@router.get("/rooms/buildings")
def list_buildings(db: Session = Depends(get_db)):
    _seed_directory(db)
    rows = db.query(PhoneRoom.building).distinct().order_by(PhoneRoom.sort_order).all()
    return [r[0] for r in rows]


def _norm_phones(value) -> str:
    """Нормализуем телефоны: '238, 011' или '238 011' -> '238, 011'."""
    if value is None:
        return ""
    s = str(value).replace(";", ",")
    parts = [p.strip() for p in s.split(",") if p.strip()]
    return ", ".join(parts)


@router.post("/rooms", status_code=201)
def create_room(payload: dict, me: User = Depends(require_admin), db: Session = Depends(get_db)):
    """Добавить строку в справочник (админ): {building, room_no, title, phones}."""
    title = str((payload or {}).get("title") or "").strip()
    if not title:
        raise HTTPException(400, "Укажите название кабинета/линии")
    building = str((payload or {}).get("building") or "").strip() or "Другое"
    room_no = str((payload or {}).get("room_no") or "").strip() or None
    phones = _norm_phones((payload or {}).get("phones")) or None
    department = str((payload or {}).get("department") or "").strip() or None
    full_name = str((payload or {}).get("full_name") or "").strip() or None
    last = db.query(PhoneRoom.sort_order).order_by(PhoneRoom.sort_order.desc()).first()
    sort_order = (last[0] or 0) + 1
    r = PhoneRoom(building=building, room_no=room_no, title=title, phones=phones,
                  department=department, full_name=full_name, sort_order=sort_order)
    db.add(r)
    db.commit()
    db.refresh(r)
    return {"id": r.id, "building": r.building, "room_no": r.room_no, "title": r.title,
            "phones": r.phones or "", "department": r.department or "", "full_name": r.full_name or ""}


@router.post("/rooms/{room_id}")
def update_room(room_id: int, payload: dict, me: User = Depends(require_admin), db: Session = Depends(get_db)):
    """Обновить строку справочника (админ): room_no, title, phones."""
    r = db.get(PhoneRoom, room_id)
    if not r:
        raise HTTPException(404, "Строка не найдена")
    payload = payload or {}
    if "title" in payload:
        title = str(payload["title"] or "").strip()
        if not title:
            raise HTTPException(400, "Пустое название")
        r.title = title
    if "room_no" in payload:
        r.room_no = str(payload["room_no"] or "").strip() or None
    if "phones" in payload:
        r.phones = _norm_phones(payload["phones"]) or None
    if "department" in payload:
        r.department = str(payload["department"] or "").strip() or None
    if "full_name" in payload:
        r.full_name = str(payload["full_name"] or "").strip() or None
    if "building" in payload:
        building = str(payload["building"] or "").strip()
        if building:
            r.building = building
    db.commit()
    return {"status": "ok"}


@router.delete("/rooms/{room_id}")
def delete_room(room_id: int, me: User = Depends(require_admin), db: Session = Depends(get_db)):
    """Удалить строку из справочника (админ)."""
    r = db.get(PhoneRoom, room_id)
    if not r:
        raise HTTPException(404, "Строка не найдена")
    db.delete(r)
    db.commit()
    return {"status": "ok"}

def _dial_with_wt52x(number: str) -> bool:
    """Fanvil WT52X (wt52x://) — если на компе установлен клиент."""
    import webbrowser
    try:
        webbrowser.open(f"wt52x://{number}")
        return True
    except Exception:
        return False


def _dial_with_tapi(number: str) -> None:
    """Набор через TAPI (Windows) — работает, если у IP-телефона установлен TAPI-драйвер
    (например, панель 3CX, YoLink, Mobility Master и т.п.)."""
    import ctypes
    tapi = ctypes.windll.tapi32
    # Упрощённый вариант: передаём номер в tapiRequestMakeCall
    res = tapi.tapiRequestMakeCallW(number, "", "", "")
    if res != 0:
        raise RuntimeError(f"TAPI tapiRequestMakeCall вернул код {res}: TAPI-провайдер не установлен")


def _dial_with_callto(number: str) -> bool:
    """Фallback: стандартный обработчик callto:/tel: в Windows."""
    import webbrowser
    try:
        webbrowser.open(f"callto:{number}")
        return True
    except Exception:
        return False


@router.post("/dial")
def dial_number(payload: dict, me: User = Depends(get_current_user)):
    """
    Набор номера с компьютера.
    payload: {"number": "+79991234567"}

    Порядок попыток:
      1) TAPI (если на ПК установлен драйвер IP-телефона — реально звонит через телефон)
      2) wt52x:// (если установлен клиент Fanvil)
      3) callto:/tel: (откроется стандартное приложение звонков)
    Возвращает, каким способом пошёл набор и что увидел пользователь.
    """
    raw = (payload or {}).get("number", "").strip()
    if not raw:
        raise HTTPException(400, "Укажите номер")
    # оставляем только цифры, +, * # , ; — символы DTMF
    number = re.sub(r"[^\d+*#,,;\-]", "", raw).strip(",")
    if not number:
        raise HTTPException(400, f"Некорректный номер: {raw}")

    method = None
    detail = ""
    # 1) TAPI — наиболее правильный способ (звонок пойдёт через зарегистрированный телефон)
    try:
        _dial_with_tapi(number)
        method = "tapi"
        detail = f"Набор запущен через TAPI: номер {number} отправлен на ваш телефон."
    except Exception as e:
        detail = f"TAPI недоступен ({e})."

    # 2) wt52x URI
    if method is None:
        if _dial_with_wt52x(number):
            method = "wt52x"
            detail = f"Набор передан клиенту wt52x:// с номером {number}."

    # 3) callto:
    if method is None:
        if _dial_with_callto(number):
            method = "callto"
            detail = f"Номер {number} передан в приложение звонков по умолчанию."

    if method is None:
        raise HTTPException(
            400,
            f"Не удалось запустить набор: ни TAPI, ни wt52x://, ни callto:// не настроены. {detail} "
            "Установите драйвер IP-телефона (TAPI) на компьютер — тогда звонок будет идти через аппарат.",
        )
    return {"ok": True, "method": method, "number": number, "detail": detail}
