"""Unit tests for tools/reference.py (the oracle). Run: python3 -m unittest tests/test_reference.py"""
import os
import secrets
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "tools"))
import reference as R  # noqa: E402

MM, PB = R.MEGA_MILLIONS, R.POWERBALL


class TestReference(unittest.TestCase):
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
