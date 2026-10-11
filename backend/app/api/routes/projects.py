from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_user, require_manager
from app.database.postgres import get_db
from app.models.user import User
from app.schemas.project import (
    ProjectCreate,
    ProjectOut,
    ProjectSkillOut,
    ProjectStaffingOut,
    ProjectUpdate,
)
from app.services import project_service

router = APIRouter(prefix="/api/v1/projects", tags=["Projects"])


def _serialize(project) -> ProjectOut:
    return ProjectOut(
        id=project.id,
        name=project.name,
        description=project.description,
        department=project.department,
        status=project.status,
        priority=project.priority,
        start_date=project.start_date,
        end_date=project.end_date,
        required_team_size=project.required_team_size,
        required_skills=[
            ProjectSkillOut(
                id=ps.id, skill_id=ps.skill_id, skill_name=ps.skill.name,
                required_proficiency=ps.required_proficiency, importance=ps.importance,
            )
            for ps in project.project_skills
        ],
        staffed_count=len([
            ep for ep in getattr(project, "employee_projects", [])
            if ep.status in ("PLANNED", "ACTIVE")
        ]),
    )


@router.get("", response_model=list[ProjectOut])
def list_projects(
    status_filter: Optional[str] = None,
    department: Optional[str] = None,
    priority: Optional[str] = None,
    search: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    projects = project_service.list_projects(
        db, status=status_filter, department=department, priority=priority, search=search
    )
    return [_serialize(p) for p in projects]


@router.post("", response_model=ProjectOut, status_code=status.HTTP_201_CREATED)
def create_project(
    payload: ProjectCreate,
    current_user: User = Depends(require_manager),
    db: Session = Depends(get_db),
):
    data = payload.model_dump(exclude={"required_skills"})
    required_skills = [rs.model_dump() for rs in payload.required_skills]
    try:
        project = project_service.create_project(db, data, required_skills)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    return _serialize(project)


@router.get("/{project_id}", response_model=ProjectOut)
def get_project(
    project_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    try:
        project = project_service.get_project_or_404(db, project_id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    return _serialize(project)


@router.patch("/{project_id}", response_model=ProjectOut)
def update_project(
    project_id: int,
    payload: ProjectUpdate,
    current_user: User = Depends(require_manager),
    db: Session = Depends(get_db),
):
    try:
        project = project_service.get_project_or_404(db, project_id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    try:
        updated = project_service.update_project(db, project, payload.model_dump(exclude_unset=True))
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    return _serialize(updated)


@router.post("/{project_id}/archive", response_model=ProjectOut)
def archive_project(
    project_id: int,
    current_user: User = Depends(require_manager),
    db: Session = Depends(get_db),
):
    try:
        project = project_service.get_project_or_404(db, project_id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    return _serialize(project_service.archive_project(db, project))


@router.get("/{project_id}/staffing", response_model=list[ProjectStaffingOut])
def get_project_staffing(
    project_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    try:
        project = project_service.get_project_or_404(db, project_id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    staffing = project_service.get_project_staffing(db, project)
    return [
        ProjectStaffingOut(
            employee_id=ep.employee_id,
            employee_name=ep.employee.user.full_name,
            role_on_project=ep.role_on_project,
            status=ep.status,
            allocation_percentage=ep.allocation_percentage,
        )
        for ep in staffing
    ]
