"""CSV / JSON export of picks."""
from datetime import datetime, timezone

from .errors import CliError

KEYS = ["play", "mode", "w1", "w2", "w3", "w4", "w5", "bonus", "index", "game", "generated_at"]


def check_export_path(path):
    if not path.lower().endswith((".csv", ".json")):
        raise CliError("export path must end in .csv or .json")


def render(rows, g, mode, stamp, as_json):
    """rows: [(label, whites, bonus, index)] -> file text."""
    recs = [[label, mode] + list(w) + [b, i, g.id, stamp] for label, w, b, i in rows]
    if not as_json:
        return ",".join(KEYS) + "\n" + "".join(",".join(str(v) for v in r) + "\n" for r in recs)
    objs = []
    for r in recs:
        parts = ['"%s": %s' % (k, ('"%s"' % v) if isinstance(v, str) else str(v))
                 for k, v in zip(KEYS, r)]
        objs.append("  {" + ", ".join(parts) + "}")
    return "[\n" + ",\n".join(objs) + "\n]\n"


def utc_stamp():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def export(path, rows, g, mode, stamp=None):
    check_export_path(path)
    text = render(rows, g, mode, stamp or utc_stamp(), path.lower().endswith(".json"))
    try:
        with open(path, "w", newline="\n") as fh:
            fh.write(text)
    except OSError:
        raise CliError("cannot write '%s'" % path, 1)
