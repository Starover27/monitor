"""Standalone console client with a bundled first-run configuration dialog."""
import argparse
import asyncio
import os
import sys
from pathlib import Path
from agent import MonitoringAgent
from setup_client import main as configure


def main():
    parser = argparse.ArgumentParser(description="Monitor portable Windows client")
    parser.add_argument('command', nargs='?', choices=['install', 'start', 'stop', 'remove', 'status'], help='Windows service command')
    parser.add_argument('--service', action='store_true', help=argparse.SUPPRESS)
    parser.add_argument('--configure', action='store_true', help='Open settings')
    parser.add_argument('--self-test', action='store_true', help='Check bundled dependencies without connecting')
    args = parser.parse_args()
    base = Path(sys.executable).parent if getattr(sys, 'frozen', False) else Path(__file__).parent
    os.chdir(base)
    if args.service:
        import servicemanager
        from service_windows import Win32MonitoringAgentService
        servicemanager.Initialize()
        servicemanager.PrepareToHostSingle(Win32MonitoringAgentService)
        servicemanager.StartServiceCtrlDispatcher()
        return
    if args.command:
        if sys.platform != 'win32':
            raise SystemExit('Windows service commands require Windows')
        from service_commands import manage
        manage(args.command, base)
        return
    if args.self_test:
        import servicemanager
        from service_windows import Win32MonitoringAgentService
        import tkinter
        from inventory import collect
        snapshot = collect({'host_id': 'self-test', 'certificate_roots': [], 'windows_services': []})
        window = tkinter.Tk()
        window.withdraw()
        window.update()
        window.destroy()
        print(f"SELF-TEST OK: GUI, imports, inventory; disks={len(snapshot['disks'])}")
        return
    config = base / 'config.yaml'
    if args.configure or not config.exists():
        if not configure(config):
            return
    try:
        asyncio.run(MonitoringAgent(str(config)).run())
    except KeyboardInterrupt:
        pass
    except Exception as exc:
        print(f'Client failed ({type(exc).__name__}). Check config.yaml and server connectivity.')
        input('Press Enter to close...')
        raise SystemExit(1)


if __name__ == '__main__':
    main()