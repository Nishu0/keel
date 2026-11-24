"""Configuration comes from the environment, with the repo root .env as defaults."""

from __future__ import annotations

from pathlib import Path

from dotenv import load_dotenv


def load_env() -> None:
    """Load the nearest .env walking up from here. Real environment variables win."""
    for d in [Path.cwd(), *Path(__file__).resolve().parents]:
        f = d / ".env"
        if f.is_file():
            load_dotenv(f, override=False)
            return
