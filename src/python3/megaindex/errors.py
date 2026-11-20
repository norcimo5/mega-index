"""Error type carrying a process exit code (2 = usage, 1 = data/IO)."""


class CliError(Exception):
    """A user-facing error: printed as ``error: <message>`` with ``code`` as exit status."""

    def __init__(self, msg, code=2):
        Exception.__init__(self, msg)
        self.code = code
