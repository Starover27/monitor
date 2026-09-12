"""Export the configured token beside config.yaml; never generate a new key."""
import os
import tempfile
from pathlib import Path


def write_token_file(config_path, token):
    if not isinstance(token, str) or not token.strip() or '\n' in token or '\r' in token:
        raise ValueError('Invalid configured token')
    target = Path(config_path).resolve().parent / 'TOKEN.txt'
    content = token + '\n'
    if target.is_symlink():
        raise OSError('TOKEN.txt must not be a symbolic link')
    if target.exists() and target.read_text(encoding='utf-8') == content:
        return target
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(mode='w', encoding='utf-8', dir=target.parent,
                                         prefix='.token-', delete=False) as handle:
            temporary = Path(handle.name)
            handle.write(content)
        os.replace(temporary, target)
    finally:
        if temporary and temporary.exists():
            temporary.unlink()
    return target