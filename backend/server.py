from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api.map_api import router as map_router
from api.prediction_api import router as prediction_router


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
app.include_router(prediction_router)