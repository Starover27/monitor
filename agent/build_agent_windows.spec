# -*- mode: python ; coding: utf-8 -*-
"""
PyInstaller spec для сборки автономного exe агента мониторинга (Windows).

Использование:
    pyinstaller build_agent_windows.spec

После сборки:
    dist/monitor-agent.exe -c config.yaml

Установка как служба:
    dist/monitor-agent.exe install
    dist/monitor-agent.exe start
"""

block_cipher = None

a = Analysis(
    ['service_windows.py'],
    pathex=[],
    binaries=[],
    datas=[
        ('config.yaml.example', '.'),
        ('checks/*.py', 'checks'),
    ],
    hiddenimports=['win32timezone', 'psutil', 'httpx', 'yaml'],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.zipfiles,
    a.datas,
    [],
    name='monitor-agent',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon=None,
)
