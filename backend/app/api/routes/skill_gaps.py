from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.dependencies import require_manager
from app.database.postgres import get_db
from app.models.team import Team
from app.models.user import User
from app.services import project_service, skill_gap_service

router = APIRouter(prefix="/api/v1/skill-gaps", tags=["Skill Gaps"])


@router.get("/projects/{project_id}")
def get_project_skill_gaps(
    project_id: int,
    current_user: User = Depends(require_manager),
    db: Session = Depends(get_db),
):
    try:
        project = project_service.get_project_or_404(db, project_id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    gaps = skill_gap_service.analyze_project_gaps(db, project)
    return [
        {
            "skill_id": g.skill_id,
            "skill_name": g.skill.name,
            "current_level": g.current_level,
            "required_level": g.required_level,
            "gap": g.gap,
            "severity": g.severity,
        }
        for g in gaps
    ]


@router.get("/teams/{team_id}")
def get_team_skill_gaps(
    team_id: int,
    current_user: User = Depends(require_manager),
    db: Session = Depends(get_db),
):
    team = db.get(Team, team_id)
    if not team:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Team not found")
    project = project_service.get_project_or_404(db, team.project_id)
    gaps = skill_gap_service.analyze_team_gaps(db, project, team)
    return [
        {
            "skill_id": g.skill_id,
            "skill_name": g.skill.name,
            "current_level": g.current_level,
            "required_level": g.required_level,
            "gap": g.gap,
            "severity": g.severity,
        }
        for g in gaps
    ]


@router.get("/organization")
def get_organization_skill_gaps(
    current_user: User = Depends(require_manager),
    db: Session = Depends(get_db),
):
    return skill_gap_service.organization_skill_gap_summary(db)
