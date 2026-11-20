"""Unit tests for tools/reference.py (the oracle). Run: python3 -m unittest tests/test_reference.py"""
import os
import secrets
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "tools"))
import reference as R  # noqa: E402

MM, PB = R.MEGA_MILLIONS, R.POWERBALL
CliError, LOAD = R.CliError, R.load_draws


class TestReference(unittest.TestCase):

    def _parse(self, raw):
        import tempfile
        with tempfile.TemporaryDirectory() as d:
            p = os.path.join(d, "x.csv")
            with open(p, "wb") as fh:
                fh.write(raw)
            return LOAD(p, MM)

    def test_data_file_ascii_rules(self):
        H, ROW = b"date,w1,w2,w3,w4,w5,mb", b"2025-04-08,1,2,3,4,5,6"
        ok = (H + b"\n" + ROW + b"\n", b"\xef\xbb\xbf" + H + b"\n" + ROW + b"\n",
              H + b"\r" + ROW + b"\r", H + b"\r\n" + ROW + b"\r\n",
              H + b"\n \t2025-04-08 , +1,2 ,3,\x0b4,5\x0c,6 \n")
        for raw in ok:
            self.assertEqual(self._parse(raw), [("2025-04-08", [1, 2, 3, 4, 5], 6)], raw)
        bad = (b"2025-04-08,1,2,3,4,5,6\xc2\xa0", b"\xc2\xa02025-04-08,1,2,3,4,5,6",
               b"2025-04-08,1,2,3,4,5,6\xc2\x85", b"2025-04-08,1,2,3,4,5,6\xe2\x80\xa8",
               b"2025-04-08,1,2,3,4,5,6\x1f", b"2025-04-08,1,2,3,4,5,\xd9\xa6",
               b"2025-04-08,1,2,3,4,5,\xef\xbc\x96", b"2025-04-08,1_0,2,3,4,5,6",
               b"\xef\xbb\xbf2025-04-08,1,2,3,4,5,6", b"\xff")
        for line in bad:
            with self.assertRaises(CliError, msg=line) as cm:
                self._parse(H + b"\n" + line + b"\n")
            self.assertEqual(str(cm.exception), "bad data file: line 2")
        with self.assertRaises(CliError) as cm:
            self._parse(H + b"\xc2\xa0\n" + ROW + b"\n")
        self.assertIn("header", str(cm.exception))

    def test_int_re_rejects_trailing_newline(self):
        for tok in ("5\n", "\u0665", "1_0"):
            with self.assertRaises(CliError):
                R.parse_int(tok)
    def test_totals(self):
        self.assertEqual(MM.total, 290472336)
        self.assertEqual(PB.total, 292201338)

    def test_pdf_vectors(self):
        for w, b, i in [([7, 19, 33, 48, 62], 11, 147183154), ([8, 24, 37, 38, 66], 9, 200000000),
                        ([1, 2, 3, 4, 5], 1, 0), ([66, 67, 68, 69, 70], 24, 290472335)]:
            self.assertEqual(R.encode(MM, w, b), i)
            self.assertEqual(R.decode(MM, i), (w, b))

    def test_powerball_endpoints(self):
        self.assertEqual(R.decode(PB, 0), ([1, 2, 3, 4, 5], 1))
        self.assertEqual(R.decode(PB, PB.total - 1), ([65, 66, 67, 68, 69], 26))

    def test_round_trip_random(self):
        for g in (MM, PB):
            for _ in range(100000):
                i = secrets.randbelow(g.total)
                w, b = R.decode(g, i)
                self.assertEqual(len(set(w)), 5)
                self.assertTrue(all(1 <= x <= g.white_max for x in w) and 1 <= b <= g.bonus_max)
                self.assertEqual(R.encode(g, w, b), i)

    def test_fmt2(self):
        self.assertEqual(R.fmt2(1, 8, True), "+0.13")   # 0.125 rounds half away from zero
        self.assertEqual(R.fmt2(-1, 8, True), "-0.13")
        self.assertEqual(R.fmt2(-1, 1000, True), "+0.00")
        self.assertEqual(R.fmt2(845, 70, False), "12.07")


if __name__ == "__main__":
    unittest.main()
