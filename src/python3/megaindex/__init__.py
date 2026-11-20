"""mega-index: Mega Millions / Powerball ticket <-> index encoder, CSPRNG picker, stats."""
from .core import decode, encode, fmt2, fmt_ticket, validate_ticket
from .game import GAMES, MEGA_MILLIONS, POWERBALL, Game
from .rng import randbelow

__all__ = ["Game", "GAMES", "MEGA_MILLIONS", "POWERBALL", "encode", "decode",
           "validate_ticket", "fmt_ticket", "fmt2", "randbelow"]
