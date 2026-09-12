import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

# Imported for their side effect of registering tables on Base.metadata.
from app.agents import models as agent_models  # noqa: F401
from app.audit import listener as audit_listener
from app.audit import models as audit_models  # noqa: F401
from app.db.session import Base, get_db
from app.restaurant import models as restaurant_models  # noqa: F401

# The listener is global to the Session class, so install it once for the
# whole test session exactly as the app does at import time.
audit_listener.install()


@pytest.fixture
def engine():
    eng = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,  # one shared in-memory db across connections
    )
    Base.metadata.create_all(eng)
    yield eng
    eng.dispose()


@pytest.fixture
def db(engine):
    session_factory = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    session = session_factory()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture
def client(db):
    """TestClient sharing the test's session, so assertions see its writes."""
    from app.main import app

    app.dependency_overrides[get_db] = lambda: db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


@pytest.fixture
def changes(db):
    """Callable returning change_log rows, newest last."""
    from app.audit.models import ChangeLog

    def _changes(entity_type: str | None = None, operation: str | None = None):
        query = db.query(ChangeLog)
        if entity_type:
            query = query.filter(ChangeLog.entity_type == entity_type)
        if operation:
            query = query.filter(ChangeLog.operation == operation)
        return query.order_by(ChangeLog.id).all()

    return _changes
