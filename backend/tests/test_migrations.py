"""The migration must actually run -- models alone don't prove that."""

from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, inspect

BACKEND_ROOT = Path(__file__).resolve().parents[1]


def _alembic_config(db_url: str) -> Config:
    config = Config(str(BACKEND_ROOT / "alembic.ini"))
    config.set_main_option("script_location", str(BACKEND_ROOT / "alembic"))
    config.set_main_option("sqlalchemy.url", db_url)
    return config


def test_upgrade_head_creates_the_change_log(tmp_path, monkeypatch):
    db_path = tmp_path / "migration_check.db"
    db_url = f"sqlite:///{db_path}"
    # env.py reads settings.database_url, which is resolved at import time.
    monkeypatch.setattr("app.config.settings.database_url", db_url)

    command.upgrade(_alembic_config(db_url), "head")

    inspector = inspect(create_engine(db_url))
    assert "change_log" in inspector.get_table_names()
    assert "applied_result" in {c["name"] for c in inspector.get_columns("agent_actions")}

    indexes = {ix["name"] for ix in inspector.get_indexes("change_log")}
    assert "ix_change_log_entity" in indexes


def test_downgrade_is_reversible(tmp_path, monkeypatch):
    db_path = tmp_path / "downgrade_check.db"
    db_url = f"sqlite:///{db_path}"
    monkeypatch.setattr("app.config.settings.database_url", db_url)
    config = _alembic_config(db_url)

    command.upgrade(config, "head")
    command.downgrade(config, "-1")

    inspector = inspect(create_engine(db_url))
    assert "change_log" not in inspector.get_table_names()
    assert "agent_actions" in inspector.get_table_names()
