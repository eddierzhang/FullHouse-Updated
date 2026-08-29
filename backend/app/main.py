from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.agents.routes import router as agents_router
from app.config import settings
from app.restaurant.routes import router as restaurant_router

app = FastAPI(title="Restaurant Ops API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.frontend_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(restaurant_router)
app.include_router(agents_router)


@app.get("/health")
def health():
    return {"status": "ok"}
