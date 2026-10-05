import tempfile
import unittest
from pathlib import Path

from watchlist import (
    Watchlist, ensure_template, merge_inventory, parse, watchlist_path,
    WATCHLIST_NAME,
)


def _write(directory, text, name=WATCHLIST_NAME, encoding="utf-8"):
    path = Path(directory) / name
    path.write_text(text, encoding=encoding, newline="\n")
    return path


class WatchlistTests(unittest.TestCase):
    def test_ensure_template_creates_once_and_keeps_existing(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / WATCHLIST_NAME
            created = ensure_template(path)
            self.assertTrue(created.exists())
            first = created.read_text(encoding="utf-8")
            self.assertIn("[certificates]", first)
            self.assertIn("[services]", first)
            _write(directory, "W32Time\n")
            again = ensure_template(path)
            self.assertEqual(again.read_text(encoding="utf-8"), "W32Time\n")

    def test_parse_autodetects_paths_and_services(self):
        with tempfile.TemporaryDirectory() as directory:
            existing = Path(directory) / "CertsFolder"
            existing.mkdir()
            config = Path(directory) / "config.yaml"
            _write(directory, f"C:\\Certificates\n{existing}\nW32Time\nSpooler\n")
            result = parse(watchlist_path(config))
            self.assertEqual(result.services, ["W32Time", "Spooler"])
            self.assertIn("C:\\Certificates", result.roots)
            self.assertIn(str(existing), result.roots)

    def test_parse_sections_and_comments(self):
        with tempfile.TemporaryDirectory() as directory:
            config = Path(directory) / "config.yaml"
            _write(directory, "# комментарий\n"
                               "[сертификаты]\n"
                               "C:\\Certs  # основной склад\n"
                               "[службы]\n"
                               "W32Time\n"
                               "; тоже комментарий\n"
                               "Spooler\n")
            result = parse(watchlist_path(config))
            self.assertEqual(result.roots, ["C:\\Certs"])
            self.assertEqual(result.services, ["W32Time", "Spooler"])

    def test_parse_ignores_unc_paths_as_services(self):
        with tempfile.TemporaryDirectory() as directory:
            config = Path(directory) / "config.yaml"
            _write(directory, "\\\\fileserver\\certs\nW32Time\n")
            result = parse(watchlist_path(config))
            self.assertEqual(result.roots, ["\\\\fileserver\\certs"])
            self.assertEqual(result.services, ["W32Time"])

    def test_parse_missing_file_is_empty(self):
        with tempfile.TemporaryDirectory() as directory:
            config = Path(directory) / "config.yaml"
            result = parse(watchlist_path(config))
            self.assertEqual(result, Watchlist([], [], []))
            self.assertFalse(result)

    def test_parse_deduplicates(self):
        with tempfile.TemporaryDirectory() as directory:
            config = Path(directory) / "config.yaml"
            _write(directory, "[services]\nW32Time\nW32Time\n")
            result = parse(watchlist_path(config))
            self.assertEqual(result.services, ["W32Time"])

    def test_merge_inventory_combines_and_dedups(self):
        inventory = {"certificate_roots": ["C:\\Certs"], "windows_services": ["Spooler"]}
        merged = merge_inventory(inventory, Watchlist(["C:\\Certs", "D:\\Pki"], ["W32Time", "Spooler"]))
        self.assertEqual(merged["certificate_roots"], ["C:\\Certs", "D:\\Pki"])
        self.assertEqual(merged["windows_services"], ["Spooler", "W32Time"])
        # Исходный словарь не изменяется
        self.assertEqual(inventory["certificate_roots"], ["C:\\Certs"])

    def test_template_itself_parses_to_empty_watchlist(self):
        """Шаблон по умолчанию не должен добавлять случайных записей."""
        with tempfile.TemporaryDirectory() as directory:
            config = Path(directory) / "config.yaml"
            ensure_template(Path(directory) / WATCHLIST_NAME)
            result = parse(watchlist_path(config))
            self.assertEqual(result.roots, [])
            self.assertEqual(result.services, [])

    def test_cp1251_encoding_is_supported(self):
        with tempfile.TemporaryDirectory() as directory:
            config = Path(directory) / "config.yaml"
            _write(directory, "[сертификаты]\nC:\\Сертификаты\n", encoding="cp1251")
            result = parse(watchlist_path(config))
            self.assertEqual(result.roots, ["C:\\Сертификаты"])


if __name__ == "__main__":
    unittest.main()
