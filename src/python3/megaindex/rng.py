"""All randomness comes from the OS CSPRNG via ``secrets`` (unbiased, no seeding)."""
import secrets


def randbelow(n):
    """Uniform integer in [0, n)."""
    return secrets.randbelow(n)
