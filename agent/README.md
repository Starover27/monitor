# Monitoring Agent

Легковесный клиент-коллектор для мониторинга сервисов в локальной сети и системных метрик (CPU, RAM, диск, сеть).

## Установка

```bash
pip install -r requirements.txt
```

## Конфигурация

Скопируйте `config.yaml.example` в `config.yaml` и настройте:

```bash
cp config.yaml.example config.yaml
nano config.yaml
```

Укажите:
- `backend.url` — адрес FastAPI сервера
- `backend.token` — токен для заголовка X-Agent-Token
- `check_interval` — частота проверок в секундах
- `services` — список проверяемых сервисов

## Запуск

```bash
python agent.py
# Или с кастомным конфигом:
python agent.py -c /path/to/config.yaml
```

Агент автоматически зарегистрирует сервисы на бэкенде и начнет отправлять heartbeat.

## Типы проверок

### Сетевые проверки
- `tcp` — проверка доступности TCP порта
- `http` / `https` — HTTP запрос с проверкой статус-кода
- `icmp` — ping (требует прав или внешней команды ping)

### Системные метрики (локальный хост)
- `disk` — свободное место на диске (% и GB)
- `cpu` — загрузка процессора (%)
- `memory` — использование оперативной памяти (%)
- `network` — сетевой трафик (Mbps)

Все системные метрики передают значение в бэкенд (`metric_value` + `metric_unit`).

## Установка как службы

### Linux (systemd)

```bash
sudo cp systemd/monitoring-agent.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable monitoring-agent
sudo systemctl start monitoring-agent
```

### Windows

#### Вариант 1: Через pywin32 (требует сборки)

```bash
pip install pywin32
python service_windows.py install
python service_windows.py start
```

Логи: `agent-service.log` рядом с exe/скриптом.

#### Вариант 2: Через NSSM (проще)

1. Скачайте [NSSM](https://nssm.cc/download)
2. Установите службу:
   ```cmd
   nssm install MonitorAgent "C:\path\to\python.exe" "C:\path\to\agent.py -c C:\path\to\config.yaml"
   nssm set MonitorAgent AppDirectory "C:\path\to\agent"
   nssm start MonitorAgent
   ```

#### Вариант 3: Собрать в exe (PyInstaller)

```bash
pip install -r requirements.txt
pyinstaller build_agent_windows.spec
```

После сборки `dist/monitor-agent.exe` можно:
- Запустить напрямую: `monitor-agent.exe -c config.yaml`
- Установить как службу: `monitor-agent.exe install && monitor-agent.exe start`

## Переменные окружения

- `MONITOR_AGENT_CONFIG` — путь к config.yaml (по умолчанию `./config.yaml`)

