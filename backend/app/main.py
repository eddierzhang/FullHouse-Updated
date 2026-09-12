from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.agents.routes import router as agents_router
from app.bootstrap import setup
from app.audit.middleware import AuditActorMiddleware
from app.audit.routes import router as changes_router
from app.config import settings
from app.restaurant.routes import router as restaurant_router

# Must happen before any session is used, so that no mutation escapes
# unrecorded during startup.
setup()

app = FastAPI(title="Restaurant Ops API")

app.add_middleware(AuditActorMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.frontend_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(restaurant_router)
app.include_router(agents_router)
app.include_router(changes_router)


@app.get("/health")
def health():
    return {"status": "ok"}
