from fastapi import APIRouter, HTTPException

from map.campus import find_campus


router = APIRouter(
    prefix="/api/map",
    tags=["map"],
)


@router.get("/campus")
async def get_campus(college: str):
    try:
        campus = await find_campus(college)

        return {
            "success": True,
            "campus": campus,
        }

    except ValueError as exc:
        raise HTTPException(
            status_code=404,
            detail=str(exc),
        )

    except Exception:
        raise HTTPException(
            status_code=502,
            detail="Unable to retrieve campus data from OpenStreetMap.",
        )