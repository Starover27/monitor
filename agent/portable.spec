# One-file build: Python and Tcl/Tk are bundled, not installed on the target.
a = Analysis(['portable_client.py'], pathex=[], binaries=[], datas=[],
             hiddenimports=['inventory', 'service_windows', 'win32serviceutil', 'win32service', 'win32event', 'servicemanager', 'win32timezone'], hookspath=[], hooksconfig={},
             runtime_hooks=[], excludes=[], noarchive=False)
pyz = PYZ(a.pure)
exe = EXE(pyz, a.scripts, a.binaries, a.datas, [], name='MonitorClient',
          debug=False, bootloader_ignore_signals=False, strip=False,
          upx=False, console=True)