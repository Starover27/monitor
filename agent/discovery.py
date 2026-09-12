"""Authenticated discovery only; never accepts commands or changes config."""
import asyncio
import hashlib
import hmac
import json
import secrets
import socket


def signature(key, text):
    return hmac.new(key.encode(), text.encode(), hashlib.sha256).hexdigest()


async def listen(config, token, host='0.0.0.0', port=19443):
    active = set()

    async def respond(reader, writer):
        task = asyncio.current_task()
        if len(active) >= 32:
            writer.close()
            return
        active.add(task)
        try:
            async with asyncio.timeout(3):
                challenge = secrets.token_hex(32)
                writer.write((challenge + '\n').encode())
                await writer.drain()
                proof = (await reader.readline()).decode().strip()
                if not hmac.compare_digest(proof, signature(token, 'request:' + challenge)):
                    return
                data = json.dumps({'protocol': 'monitor-discovery-1', 'host_id': config['host_id'],
                                   'hostname': socket.gethostname()}, ensure_ascii=True, sort_keys=True)
                writer.write((json.dumps({'data': data, 'signature': signature(token, 'response:' + challenge + ':' + data)}) + '\n').encode())
                await writer.drain()
        except (OSError, ValueError, TimeoutError):
            pass
        finally:
            active.discard(task)
            writer.close()
            try:
                await writer.wait_closed()
            except OSError:
                pass

    server = await asyncio.start_server(respond, host, port, limit=4096)
    return server, active