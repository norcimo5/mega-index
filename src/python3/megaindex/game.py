"""Game configuration records. Core code takes a Game and never hard-codes 70/24."""
from math import comb


class Game:
    """One lottery game: 5 white balls from 1..white_max plus one bonus ball."""

    def __init__(self, gid, name, white_count, white_max, bonus_max, bonus_name,
                 bonus_abbr, matrix_start, data_file, data_env):
        self.id = gid
        self.name = name
        self.white_count = white_count
        self.white_max = white_max
        self.bonus_count = 1
        self.bonus_max = bonus_max
        self.bonus_name = bonus_name
        self.bonus_abbr = bonus_abbr
        self.matrix_start = matrix_start
        self.data_file = data_file      # data/<data_file> (SPEC section 4)
        self.data_env = data_env        # env var that overrides the path
        self.white_combos = comb(white_max, white_count)
        self.total = self.white_combos * bonus_max   # number of distinct tickets


MEGA_MILLIONS = Game("megamillions", "Mega Millions", 5, 70, 24, "Mega Ball", "MB",
                     "2025-04-08", "draws.csv", "MEGA_INDEX_DATA")
POWERBALL = Game("powerball", "Powerball", 5, 69, 26, "Powerball", "PB",
                 "2015-10-07", "powerball-draws.csv", "POWER_INDEX_DATA")
GAMES = {g.id: g for g in (MEGA_MILLIONS, POWERBALL)}
DEFAULT_GAME = MEGA_MILLIONS
