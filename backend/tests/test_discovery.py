import sys
import unittest
from pathlib import Path
from app.services.discovery import targets, probe
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'agent'))
from discovery import listen


class RangeTests(unittest.TestCase):
    def test_multiple_and_overlap(self):
        self.assertEqual(targets(['192.168.1.0/30', '192.168.1.2-192.168.1.3']),
                         ['192.168.1.1', '192.168.1.2', '192.168.1.3'])

    def test_reject_unsafe_or_large(self):
        for value in ['8.8.8.8', '127.0.0.1', '169.254.169.254', '10.0.0.0/8', '::1', '10.0.0.2-10.0.0.1']:
            with self.subTest(value=value), self.assertRaises(ValueError):
                targets([value])


class ProtocolTests(unittest.IsolatedAsyncioTestCase):
    async def test_verified_and_wrong_token(self):
        server, tasks = await listen({'host_id': 'test-host'}, 'test-key', host='127.0.0.1', port=0)
        port = server.sockets[0].getsockname()[1]
        try:
            result = await probe('127.0.0.1', 'test-key', port)
            self.assertEqual(result['host_id'], 'test-host')
            self.assertIsNone(await probe('127.0.0.1', 'wrong-key', port))
        finally:
            server.close()
            await server.wait_closed()