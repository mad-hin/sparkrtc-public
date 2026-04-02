"""Global configuration shared across services."""

from pathlib import Path

# Default: auto-detect from file location
# __file__ = services/config.py -> backend/ -> testbed/ -> code/ -> my_experiment/ -> repo_root
_default_repo = str(Path(__file__).resolve().parent.parent.parent.parent.parent)

_repo_path: str = _default_repo


def set_repo_path(path: str) -> None:
    global _repo_path
    _repo_path = path


def get_repo_path() -> str:
    return _repo_path
