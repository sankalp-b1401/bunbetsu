from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api.map_api import router as map_router


app = FastAPI(
    title="Bunbetsu API",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
    allow_credentials=True,
)

app.include_router(map_router)