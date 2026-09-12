import unittest
from service_commands import command_args


class ServiceCommandsTests(unittest.TestCase):
    def test_install_quotes_path_and_enables_auto_start(self):
        args = command_args('install', r'C:\Program Files\Monitor\MonitorClient.exe')
        self.assertEqual(args[3], '"C:\\Program Files\\Monitor\\MonitorClient.exe" --service')
        self.assertEqual(args[4:6], ['start=', 'auto'])

    def test_commands(self):
        for command, verb in [('start', 'start'), ('stop', 'stop'), ('remove', 'delete'), ('status', 'query')]:
            self.assertEqual(command_args(command, 'unused'), [verb, 'MonitorAgent'])


if __name__ == '__main__':
    unittest.main()