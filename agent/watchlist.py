"""Plain-text watch list stored next to the client EXE (watchlist.txt).

Файл создаётся автоматически при первом запуске. В него по одной строке
вписываются:
  * пути к каталогам с сертификатами (.cer/.crt/.pem/.der) — подпапки
    сканируются автоматически, клиент следит за сроками сертификатов;
  * имена Windows-служб (как в services.msc).

Записи можно писать вперемешку — тип строки определяется автоматически.
При необходимости записи раскладывают по секциям:
    [certificates] / [сертификаты] / [каталоги]   — только пути;
    [services] / [службы]                         — только имена служб.

Строки, начинающиеся с "#" или ";", — комментарии. Клиент перечитывает
файл перед каждым сбором инвентаризации, поэтому изменения подхватываются
автоматически, без перезапуска.
"""
import os
from dataclasses import dataclass, field
from pathlib import Path

WATCHLIST_NAME = "watchlist.txt"

_CERT_SECTIONS = {"certificates", "сертификаты", "каталоги", "папки", "folders", "certs"}
_SERVICE_SECTIONS = {"services", "службы"}

_TEMPLATE_HEAD = """\
# ===================================================================
#  MONITOR КЛИЕНТ — СПИСОК НАБЛЮДЕНИЯ (watchlist.txt)
# ===================================================================
# Заполните этот файл в Блокноте и сохраните. Клиент подхватит
# изменения автоматически в течение минуты, перезапускать не нужно.
#
# КАК ЗАПОЛНЯТЬ — по одной записи на строку:
#
#  1) Путь к папке с сертификатами (.cer .crt .pem .der).
#     Подпапки проверяются автоматически, клиент следит за сроками.
#     Например:
#         C:\\Certificates
#         C:\\Program Files\\MyApp\\Certs
#
#  2) Имя Windows-службы — как в services.msc, столбец «Имя»
#     (не «Отображаемое имя»). Например:
#         W32Time
#         Spooler
#
#     Службы из этого файла автоматически отображаются и на странице
#     «Службы» сервера Monitor: карточки со статусом, история, алерты.
#
# Папки и службы можно писать вперемешку: клиент сам распознает,
# что чем является. При необходимости раскладывайте по секциям
# [certificates] и [services] ниже.
#
# Строки, начинающиеся с # или ;, — комментарии, они игнорируются.
# ===================================================================

[certificates]
# Впишите здесь пути к папкам с сертификатами:

[services]
# Впишите здесь имена Windows-служб:
# W32Time
# Spooler
"""

TEMPLATE = _TEMPLATE_HEAD

_MAX_ROOTS = 32
_MAX_SERVICES = 1000


@dataclass
class Watchlist:
    """Распарсенное содержимое watchlist.txt."""
    roots: list = field(default_factory=list)
    services: list = field(default_factory=list)
    warnings: list = field(default_factory=list)

    def __bool__(self):
        return bool(self.roots or self.services)


def watchlist_path(config_path) -> Path:
    """watchlist.txt всегда лежит рядом с config.yaml / EXE."""
    return Path(config_path).resolve().parent / WATCHLIST_NAME


def ensure_template(path) -> Path:
    """Создаёт файл-шаблон, если его ещё нет. Существующий не трогает."""
    path = Path(path)
    if not path.exists():
        path.write_text(TEMPLATE, encoding="utf-8", newline="\r\n")
    return path


def _strip_comment(line: str) -> str:
    line = line.strip()
    if not line or line[0] in "#;":
        return ""
    # Убираем комментарий в конце строки: "C:\Certs  # основной"
    return line.split("#", 1)[0].split(";", 1)[0].strip()


def _is_path_like(entry: str) -> bool:
    """True, если запись похожа на путь к каталогу, а не на имя службы."""
    if len(entry) >= 2 and entry[1] == ":" and entry[0].isalpha():
        return True                                    # C:\...
    if entry.startswith("\\\\") or entry.startswith("//"):
        return True                                    # UNC-путь
    if entry.startswith(("/", "~", "%")):
        return True
    return Path(entry).is_dir()


def _strip_trailing_sep(text: str) -> str:
    """Убирает хвостовой разделитель пути, сохраняя корень диска (C:\\)."""
    if len(text) > 3 and text[1:3] == ":\\":
        return text.rstrip("\\/")
    if text.startswith("\\\\") or text.startswith("//"):
        return text.rstrip("\\/")
    return text


def _normalize_root(entry: str) -> str | None:
    """Приводит путь к абсолютному, когда это возможно."""
    path = Path(os.path.expandvars(entry.strip().strip('"')))
    try:
        if path.is_absolute() or path.exists():
            return _strip_trailing_sep(str(path.resolve()))
        return _strip_trailing_sep(str((Path.cwd() / path).resolve()))
    except (OSError, RuntimeError):
        return None


def parse(path) -> Watchlist:
    """Разбирает watchlist.txt на корни сертификатов и имена служб."""
    result = Watchlist()
    path = Path(path)
    if not path.is_file():
        return result
    try:
        text = path.read_text(encoding="utf-8-sig")
    except (OSError, UnicodeError):
        try:
            text = path.read_text(encoding="cp1251")
        except (OSError, UnicodeError):
            result.warnings.append(f"Не удалось прочитать {WATCHLIST_NAME}")
            return result

    section = None
    for raw_line in text.splitlines():
        line = _strip_comment(raw_line)
        if not line:
            continue
        # Строки-разделители (====, ----, ***) игнорируем.
        if len(line) >= 3 and set(line) <= set("=-*_~#"):
            continue
        if len(line) > 2 and line.startswith("[") and line.endswith("]"):
            name = line[1:-1].strip().lower()
            if name in _CERT_SECTIONS:
                section = "cert"
            elif name in _SERVICE_SECTIONS:
                section = "service"
            else:
                section = None
                result.warnings.append(f"Неизвестная секция: {line}")
            continue
        if section == "cert" or (section is None and _is_path_like(line)):
            root = _normalize_root(line)
            if root and root not in result.roots:
                if len(result.roots) < _MAX_ROOTS:
                    result.roots.append(root)
                else:
                    result.warnings.append(f"Превышен лимит {_MAX_ROOTS} папок сертификатов")
        elif line not in result.services:
            if len(result.services) < _MAX_SERVICES:
                result.services.append(line)
            else:
                result.warnings.append(f"Превышен лимит {_MAX_SERVICES} служб")
    return result


def merge_inventory(inventory: dict, watchlist: Watchlist) -> dict:
    """Объединяет записи из watchlist.txt со списками из config.yaml."""
    inventory = dict(inventory or {})
    roots = list(dict.fromkeys([*inventory.get("certificate_roots", []), *watchlist.roots]))
    services = list(dict.fromkeys([*inventory.get("windows_services", []), *watchlist.services]))
    inventory["certificate_roots"] = roots[:_MAX_ROOTS]
    inventory["windows_services"] = services[:_MAX_SERVICES]
    return inventory

