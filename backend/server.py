import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api.map_api import router as map_router
from api.planning_api import router as planning_router
from api.prediction_api import router as prediction_router
from api.routes_api import router as routes_router


app = FastAPI(
    title="Bunbetsu API",
)

# Base local development origins
default_origins = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
]

# Configurable production origins via environment variables
custom_origins: list[str] = []
if frontend_url := os.environ.get("FRONTEND_URL", "").strip():
    custom_origins.extend([orig.strip() for orig in frontend_url.split(",") if orig.strip()])

if allowed_origins_env := os.environ.get("ALLOWED_ORIGINS", "").strip():
    custom_origins.extend([orig.strip() for orig in allowed_origins_env.split(",") if orig.strip()])

# Build unique origins preserving order
origins: list[str] = []
for o in default_origins + custom_origins:
    if o and o not in origins:
        origins.append(o)

is_wildcard = "*" in origins

# Match Vercel deployment preview domains by default, or use custom regex from env
origin_regex = os.environ.get(
    "CORS_ORIGIN_REGEX",
    r"https:\/\/.*\.vercel\.app",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"] if is_wildcard else origins,
    allow_origin_regex=None if is_wildcard else origin_regex,
    allow_methods=["*"],
    allow_headers=["*"],
    allow_credentials=not is_wildcard,
)


@app.get("/")
def root():
    return {"status": "ok", "service": "Bunbetsu API"}


app.include_router(map_router)
app.include_router(planning_router)
app.include_router(prediction_router)
app.include_router(routes_router)
