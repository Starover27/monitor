import asyncio
import hashlib
import hmac
import ipaddress
import json
from datetime import datetime, timezone
from sqlalchemy import Column, Integer, JSON
from app.core.database import Base, SessionLocal
from app.core.config import settings

PRIVATE = [ipaddress.ip_network(n) for n in ('10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16')]


class DiscoveryConfig(Base):
    __tablename__ = 'discovery_config'
    id = Column(Integer, primary_key=True)
    config = Column(JSON, nullable=False)


def targets(ranges):
    result = set()
    for text in ranges:
        text = text.strip()
        if '-' in text:
            first, last = [ipaddress.IPv4Address(v.strip()) for v in text.split('-', 1)]
            if int(last) < int(first) or int(last) - int(first) >= 4096:
                raise ValueError('Диапазон слишком большой или задан в обратном порядке')
            networks = list(ipaddress.summarize_address_range(first, last))
            addresses = range(int(first), int(last) + 1)
        else:
            network = ipaddress.IPv4Network(text, strict=False)
            networks = [network]
            if network.num_addresses > 4096:
                raise ValueError('Максимум 4096 адресов за сканирование')
            addresses = network.hosts()
        if not all(any(n.subnet_of(p) for p in PRIVATE) for n in networks):
            raise ValueError('Разрешены только частные IPv4-сети 10/8, 172.16/12 и 192.168/16')
        result.update(str(ipaddress.IPv4Address(a)) for a in addresses)
        if len(result) > 4096:
            raise ValueError('Суммарно максимум 4096 уникальных адресов')
    return sorted(result, key=ipaddress.IPv4Address)


def sign(key, text):
    return hmac.new(key.encode(), text.encode(), hashlib.sha256).hexdigest()


async def probe(address, key, port=19443):
    writer = None
    try:
        async with asyncio.timeout(2):
            reader, writer = await asyncio.open_connection(address, port, limit=4096)
            challenge = (await reader.readline()).decode().strip()
            if len(challenge) != 64 or any(c not in '0123456789abcdef' for c in challenge):
                return None
            writer.write((sign(key, 'request:' + challenge) + '\n').encode())
            await writer.drain()
            envelope = json.loads(await reader.readline())
            data = envelope['data']
            if not isinstance(data, str) or not hmac.compare_digest(envelope['signature'], sign(key, 'response:' + challenge + ':' + data)):
                return None
            item = json.loads(data)
            if item.get('protocol') != 'monitor-discovery-1':
                return None
            if not all(isinstance(item.get(k), str) and 0 < len(item[k]) <= limit for k, limit in [('host_id', 128), ('hostname', 255)]):
                return None
            return {'ip': address, 'host_id': item['host_id'], 'hostname': item['hostname'],
                    'seen_at': datetime.now(timezone.utc).isoformat()}
    except (OSError, ValueError, KeyError, TypeError, TimeoutError):
        return None
    finally:
        if writer:
            writer.close()
            try:
                await writer.wait_closed()
            except OSError:
                pass


def load_config():
    with SessionLocal() as db:
        row = db.get(DiscoveryConfig, 1)
        return row.config if row else {'ranges': [], 'enabled': False, 'interval_seconds': 300}


class Scanner:
    def __init__(self):
        self.state = {'running': False, 'checked': 0, 'total': 0, 'results': [], 'finished_at': None, 'error': None}
        self.wake = asyncio.Event()

    async def scan(self, config):
        if self.state['running']:
            return
        addresses = targets(config['ranges'])
        self.state = {'running': True, 'checked': 0, 'total': len(addresses), 'results': [], 'finished_at': None, 'error': None}
        try:
            if settings.SECRET_KEY == 'your-secret-key-change-in-production':
                raise ValueError('Задайте SECRET_KEY сервера')
            # Batches bound concurrency and memory; only one fixed discovery port.
            for offset in range(0, len(addresses), 32):
                batch = addresses[offset:offset + 32]
                results = await asyncio.gather(*(probe(a, settings.SECRET_KEY) for a in batch))
                self.state['results'].extend(r for r in results if r)
                self.state['checked'] += len(batch)
        except Exception as exc:
            self.state['error'] = str(exc)
        finally:
            self.state['running'] = False
            self.state['finished_at'] = datetime.now(timezone.utc).isoformat()

    async def run(self):
        while True:
            config = load_config()
            if config['enabled'] or self.wake.is_set():
                self.wake.clear()
                await self.scan(config)
            try:
                await asyncio.wait_for(self.wake.wait(), timeout=config['interval_seconds'])
            except TimeoutError:
                pass


scanner = Scanner()