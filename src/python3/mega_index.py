#!/usr/bin/env python3
"""mega-index entry point. Run: python3 src/python3/mega_index.py --help"""
import os
import sys

# realpath: a symlinked launcher must still find the package and the bundled data.
HERE = os.path.dirname(os.path.realpath(__file__))
sys.path.insert(0, HERE)

from megaindex.cli import main  # noqa: E402

if __name__ == "__main__":
    # Non-UTF-8 bytes in an argument (e.g. a Latin-1 file name) are echoed back unchanged
    # instead of raising UnicodeEncodeError when the path is printed.
    for _stream in (sys.stdout, sys.stderr):
        try:
            _stream.reconfigure(errors="surrogateescape")
        except (AttributeError, ValueError):
            pass
    try:
        _rc = main(sys.argv[1:], script_dir=HERE)
        sys.stdout.flush()
    except OSError:
        # Full disk / closed pipe on stdout: one clean error, exit 1 (SPEC section 8).
        try:  # keep the interpreter's exit-time flush from failing again
            os.dup2(os.open(os.devnull, os.O_WRONLY), sys.stdout.fileno())
        except (OSError, ValueError):
            pass
        sys.stderr.write("error: cannot write output\n")
        _rc = 1
    sys.exit(_rc)
