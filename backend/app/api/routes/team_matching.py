from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.dependencies import require_manager
from app.database.postgres import get_db
from app.models.assignment import Assignment
from app.models.team import Team
from app.models.user import User
from app.schemas.recommendation import TeamDecisionIn, TeamMemberOut, TeamProposalOut
from app.services import assignment_service, project_service, team_service

router = APIRouter(prefix="/api/v1/team-matching", tags=["AI Team Matching"])


def _serialize(team: Team, project, db: Session) -> TeamProposalOut:
    return TeamProposalOut(
        team_id=team.id,
        project_id=team.project_id,
        status=team.status,
        skill_coverage_percentage=team.skill_coverage_percentage or 0.0,
        members=[
            TeamMemberOut(
                employee_id=m.employee_id,
                employee_name=m.employee.user.full_name,
                role_on_team=m.role_on_team,
                match_score=m.match_score or 0.0,
                matched_skills=[es.skill.name for es in m.employee.employee_skills],
            )
            for m in team.members
        ],
        remaining_gaps=team_service.get_remaining_gaps(project, team),
        availability_data_missing=team_service.get_capacity_unknown_candidates(db, project),
    )


@router.post("/projects/{project_id}/form-team", response_model=TeamProposalOut, status_code=status.HTTP_201_CREATED)
def form_team(
    project_id: int,
    team_size: int,
    current_user: User = Depends(require_manager),
    db: Session = Depends(get_db),
):
    try:
        project = project_service.get_project_or_404(db, project_id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    try:
        team = team_service.form_team(db, project, team_size)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    return _serialize(team, project, db)


@router.get("/projects/{project_id}/approved-team", response_model=TeamProposalOut)
def get_approved_team(
    project_id: int,
    current_user: User = Depends(require_manager),
    db: Session = Depends(get_db),
):
    try:
        project = project_service.get_project_or_404(db, project_id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
        
    approved_teams = {
        team.id: team for team in project.teams if team.status == "APPROVED"
    }
    team = None
    if approved_teams:
        approvals = db.scalars(
            select(Assignment)
            .where(
                Assignment.project_id == project_id,
                Assignment.team_id.in_(approved_teams),
                Assignment.status == "APPROVED",
            )
            .order_by(
                Assignment.approved_at.desc().nullslast(),
                Assignment.created_at.desc(),
                Assignment.id.desc(),
            )
        ).all()
        team = next(
            (approved_teams[approval.team_id] for approval in approvals),
            None,
        )
        if team is None:
            team = max(
                approved_teams.values(),
                key=lambda approved: (
                    approved.updated_at or approved.created_at,
                    approved.id,
                ),
            )
    if not team:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No approved team found")
        
    return _serialize(team, project, db)


@router.post("/teams/{team_id}/regenerate", response_model=TeamProposalOut)
def regenerate_team(
    team_id: int,
    team_size: int,
    current_user: User = Depends(require_manager),
    db: Session = Depends(get_db),
):
    team = db.get(Team, team_id)
    if not team:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Team not found")
    project = project_service.get_project_or_404(db, team.project_id)
    try:
        new_team = team_service.regenerate_team(db, project, team_size)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    return _serialize(new_team, project, db)


@router.post("/teams/{team_id}/members/{employee_id}/replace-with/{new_employee_id}", response_model=TeamProposalOut)
def replace_member(
    team_id: int,
    employee_id: int,
    new_employee_id: int,
    current_user: User = Depends(require_manager),
    db: Session = Depends(get_db),
):
    team = db.get(Team, team_id)
    if not team:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Team not found")
    project = project_service.get_project_or_404(db, team.project_id)
    try:
        team = team_service.replace_member(db, team, employee_id, new_employee_id, project)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    return _serialize(team, project, db)


@router.delete("/teams/{team_id}/members/{employee_id}", response_model=TeamProposalOut)
def remove_member(
    team_id: int,
    employee_id: int,
    current_user: User = Depends(require_manager),
    db: Session = Depends(get_db),
):
    team = db.get(Team, team_id)
    if not team:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Team not found")
    project = project_service.get_project_or_404(db, team.project_id)
    try:
        team = team_service.remove_member(db, team, employee_id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    return _serialize(team, project, db)


@router.post("/teams/{team_id}/members/{employee_id}", response_model=TeamProposalOut)
def add_member(
    team_id: int,
    employee_id: int,
    current_user: User = Depends(require_manager),
    db: Session = Depends(get_db),
):
    team = db.get(Team, team_id)
    if not team:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Team not found")
    project = project_service.get_project_or_404(db, team.project_id)
    try:
        team = team_service.add_member(db, team, employee_id, project)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    return _serialize(team, project, db)


@router.post("/teams/{team_id}/decision", response_model=TeamProposalOut)
def decide_team(
    team_id: int,
    payload: TeamDecisionIn,
    current_user: User = Depends(require_manager),
    db: Session = Depends(get_db),
):
    """Final manager review step (Phase 12): APPROVE creates real
    Assignment + EmployeeProject rows for every member (or the
    manager's modified roster); REJECT just closes the proposal out."""
    team = db.get(Team, team_id)
    if not team:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Team not found")
    project = project_service.get_project_or_404(db, team.project_id)

    if payload.action.upper() == "APPROVE":
        try:
            assignment_service.approve_team(db, team, current_user, payload.employee_ids)
        except ValueError as e:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    elif payload.action.upper() == "REJECT":
        try:
            assignment_service.reject_team(db, team)
        except ValueError as e:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    else:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="action must be APPROVE or REJECT")

    db.refresh(team)
    return _serialize(team, project, db)
