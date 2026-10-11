from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.dependencies import require_manager
from app.database.postgres import get_db
from app.models.user import User
from app.schemas.recommendation import RecommendationOut
from app.services import project_service, recommendation_service

router = APIRouter(prefix="/api/v1/recommendations", tags=["Recommendations"])


def _serialize(rec, project, db: Session) -> RecommendationOut:
    factors = rec.contributing_factors or {}
    availability = recommendation_service.get_project_availability(db, rec.employee, project)
    capacity_unknown = availability["data_quality"] == "unknown"
    current_utilization = None if capacity_unknown else availability["peak_allocation"]
    available_capacity = None if capacity_unknown else availability["remaining_capacity"]
    reason = rec.reason
    if capacity_unknown:
        reason = f"{reason}; availability data missing for this project window"
    elif reason and "; " in reason:
        reason = f"{reason.rsplit('; ', 1)[0]}; {available_capacity:g}% currently available capacity"
    factors = {**factors, "capacity_unknown": capacity_unknown}

    return RecommendationOut(
        employee_id=rec.employee_id,
        employee_name=rec.employee.user.full_name,
        department=rec.employee.department,
        job_title=rec.employee.job_title,
        score=rec.score,
        rank=rec.rank,
        matched_skills=factors.get("matched_skills", []),
        missing_skills=factors.get("missing_skills", []),
        experience_years=rec.employee.experience_years,
        semantic_similarity=factors.get("semantic_similarity_percentage") or 0.0,
        current_utilization_percentage=current_utilization,
        available_capacity_percentage=available_capacity,
        reason=reason,
        contributing_factors=factors,
    )


@router.post("/projects/{project_id}/generate", response_model=list[RecommendationOut])
def generate_recommendations(
    project_id: int,
    top_n: int = 10,
    current_user: User = Depends(require_manager),
    db: Session = Depends(get_db),
):
    try:
        project = project_service.get_project_or_404(db, project_id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    recs = recommendation_service.generate_recommendations(db, project, top_n=top_n)
    return [_serialize(r, project, db) for r in recs]


@router.get("/projects/{project_id}", response_model=list[RecommendationOut])
def get_latest_recommendations(
    project_id: int,
    current_user: User = Depends(require_manager),
    db: Session = Depends(get_db),
):
    try:
        project = project_service.get_project_or_404(db, project_id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    recs = recommendation_service.get_latest_recommendations(db, project)
    return [_serialize(r, project, db) for r in recs]
