"""Small Windows setup UI using Python's standard library."""
import socket
import uuid
from pathlib import Path
from urllib.parse import urlparse
import tkinter as tk
from tkinter import filedialog, messagebox
import yaml
from token_file import write_token_file


def main(config_path=None):
    path = Path(config_path) if config_path else Path(__file__).with_name("config.yaml")
    saved = False
    existing = yaml.safe_load(path.read_text(encoding="utf-8")) if path.exists() else {}
    existing = existing or {}
    backend = existing.get("backend", {})
    inventory = existing.get("inventory", {})
    window = tk.Tk()
    window.title("Monitor — настройка клиента")
    window.geometry("680x430")
    window.configure(padx=24, pady=20)
    fields = {}
    for key, label, value in [
        ("url", "Адрес сервера (порт 80, для удалённого подключения используйте HTTPS)", backend.get("url", "http://127.0.0.1:80")),
        ("token", "Токен — значение SECRET_KEY сервера", backend.get("token", "")),
        ("root", "Папка сертификатов (включая все подпапки)", next(iter(inventory.get("certificate_roots", [])), "")),
        ("services", "Системные имена Windows-служб через запятую", ", ".join(inventory.get("windows_services", ["W32Time", "Spooler"]))),
    ]:
        tk.Label(window, text=label, anchor="w").pack(fill="x", pady=(10, 4))
        var = tk.StringVar(value=value)
        row = tk.Frame(window)
        row.pack(fill="x")
        entry = tk.Entry(row, textvariable=var, show="*" if key == "token" else "")
        entry.pack(side="left", fill="x", expand=True)
        if key == "token":
            def paste_token(var=var, entry=entry):
                try:
                    value = window.clipboard_get()
                except tk.TclError:
                    messagebox.showwarning("Буфер обмена пуст", "Скопируйте токен и нажмите эту кнопку ещё раз.")
                    return
                var.set(value.strip())
                entry.icursor(tk.END)
                entry.focus_set()
            tk.Button(row, text="Вставить из буфера", command=paste_token).pack(side="left", padx=(8, 0))
        fields[key] = var
        if key == "root":
            def browse():
                selected = filedialog.askdirectory()
                if selected:
                    fields["root"].set(selected)
            tk.Button(window, text="Выбрать папку…", command=browse).pack(anchor="e", pady=4)

    tk.Label(
        window,
        text="Подсказка: рядом с программой создан файл watchlist.txt — туда можно\n"
             "построчно дописывать папки сертификатов и имена служб; изменения\n"
             "подхватываются автоматически, без перезапуска клиента.",
        anchor="w", justify="left", fg="#5a6b7f",
    ).pack(fill="x", pady=(14, 0))

    def save():
        nonlocal saved
        url = fields["url"].get().strip().rstrip("/")
        parsed = urlparse(url)
        token = fields["token"].get().strip()
        root = fields["root"].get().strip()
        if parsed.scheme not in {"http", "https"} or not parsed.hostname or not token:
            messagebox.showerror("Проверьте настройки", "Нужен HTTP(S)-адрес сервера и непустой токен.")
            return
        if root and not Path(root).is_dir():
            messagebox.showerror("Папка недоступна", "Выберите существующий каталог.")
            return
        existing.update({
            "backend": {**backend, "url": url, "token": token, "timeout": 30, "retry_attempts": 3, "retry_delay": 5},
            "check_interval": 30, "check_timeout": 5,
            "logging": {"level": "INFO", "file": "console"},
            "services": existing.get("services", []),
            "inventory": {"enabled": True, "host_id": inventory.get("host_id", f"{socket.gethostname()}-{uuid.uuid4().hex[:8]}"),
                          "certificate_roots": [str(Path(root).resolve())] if root else [],
                          "windows_services": [s.strip() for s in fields["services"].get().split(",") if s.strip()]},
        })
        try:
            path.write_text(yaml.safe_dump(existing, allow_unicode=True, sort_keys=False), encoding="utf-8")
            write_token_file(path, token)
        except OSError as exc:
            messagebox.showerror("Не удалось сохранить", str(exc))
            return
        saved = True
        window.destroy()

    tk.Button(window, text="Сохранить и запустить", command=save, padx=16, pady=8).pack(pady=20)
    window.mainloop()
    return saved


if __name__ == "__main__":
    main()