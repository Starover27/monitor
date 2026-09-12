import tempfile
import unittest
from pathlib import Path
from token_file import write_token_file


class TokenFileTests(unittest.TestCase):
    def test_create_and_update_next_to_config(self):
        with tempfile.TemporaryDirectory() as directory:
            config = Path(directory) / 'config.yaml'
            path = write_token_file(config, 'test-only-token')
            self.assertEqual(path, Path(directory) / 'TOKEN.txt')
            self.assertEqual(path.read_text(encoding='utf-8'), 'test-only-token\n')
            before = path.stat().st_mtime_ns
            write_token_file(config, 'test-only-token')
            self.assertEqual(path.stat().st_mtime_ns, before)
            write_token_file(config, 'updated-test-token')
            self.assertEqual(path.read_text(encoding='utf-8'), 'updated-test-token\n')
            self.assertEqual(len(list(Path(directory).iterdir())), 1)

    def test_invalid_does_not_create_file(self):
        with tempfile.TemporaryDirectory() as directory:
            for token in [None, '', ' ', 'one\ntwo']:
                with self.assertRaises(ValueError):
                    write_token_file(Path(directory) / 'config.yaml', token)
            self.assertFalse((Path(directory) / 'TOKEN.txt').exists())