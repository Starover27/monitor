"""Explicit SCM registration for a frozen executable, no pythonservice.exe."""
import ctypes
import subprocess
import sys
from pathlib import Path
import yaml

SERVICE = 'MonitorAgent'


def command_args(command, executable):
    if command == 'install':
        return ['create', SERVICE, 'binPath=', f'"{executable}" --service',
                'start=', 'auto', 'DisplayName=', 'Monitoring Agent']
    return [{'remove': 'delete', 'status': 'query'}.get(command, command), SERVICE]


def manage(command, base):
    if command != 'status' and not ctypes.windll.shell32.IsUserAnAdmin():
        raise SystemExit('Open Command Prompt as Administrator and try again.')
    if command in {'install', 'start'}:
        config = base / 'config.yaml'
        if not config.is_file():
            raise SystemExit('First run MonitorClient.exe --configure to save config.yaml next to the EXE.')
        try:
            data = yaml.safe_load(config.read_text(encoding='utf-8'))
            if not data['backend']['url'] or not data['backend']['token']:
                raise ValueError('Missing backend settings')
        except (OSError, ValueError, KeyError, TypeError, yaml.YAMLError):
            raise SystemExit('Invalid config.yaml. Run MonitorClient.exe --configure.')
    if command == 'install' and not getattr(sys, 'frozen', False):
        raise SystemExit('Install using the built MonitorClient.exe, not the Python source.')
    sc = str(Path(__import__('os').environ['SystemRoot']) / 'System32' / 'sc.exe')
    result = subprocess.run([sc, *command_args(command, sys.executable)], check=False)
    if result.returncode:
        raise SystemExit(result.returncode)
    if command == 'install':
        print('Installed with automatic startup as LocalSystem. Run MonitorClient.exe start.')
    if command in {'start', 'stop'}:
        import win32service
        import win32serviceutil
        expected = win32service.SERVICE_RUNNING if command == 'start' else win32service.SERVICE_STOPPED
        try:
            win32serviceutil.WaitForServiceStatus(SERVICE, expected, 30)
        except Exception:
            raise SystemExit('Service did not reach the requested state in 30s. Check agent-service.log and Windows Event Viewer.')
        print(f'Service {command} completed.')