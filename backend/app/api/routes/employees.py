from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_user, require_employee, require_manager
from app.database.postgres import get_db
from app.models.user import User
from app.schemas.employee import (
    AvailabilityOut,
    AvailabilityUpdate,
    CertificationIn,
    CertificationOut,
    EmployeeProfileOut,
    EmployeeProfileUpdate,
    EmployeeProjectHistoryOut,
    EmployeeExpertiseOut,
    EmployeeSkillIn,
    EmployeeSkillOut,
    EmployeeSummaryOut,
    ResumeProjectOut,
)
from app.services import employee_service

router = APIRouter(prefix="/api/v1/employees", tags=["Employees"])


def _serialize_profile(employee, db: Session) -> EmployeeProfileOut:
    availability_snapshot = employee_service.get_current_availability_snapshot(
        db, employee.id
    )
    return EmployeeProfileOut(
        id=employee.id,
        employee_code=employee.employee_code,
        full_name=employee.user.full_name,
        email=employee.user.email,
        department=employee.department,
        job_title=employee.job_title,
        experience_years=employee.experience_years,
        bio=employee.bio,
        availability_status=availability_snapshot["status"],
        is_active=employee.is_active,
        skills=[EmployeeSkillOut.model_validate(es) for es in employee.employee_skills],
        certifications=[CertificationOut.model_validate(c) for c in employee.certifications],
        expertise_areas=[EmployeeExpertiseOut.model_validate(item) for item in employee.expertise_areas],
        resume_projects=[ResumeProjectOut.model_validate(item) for item in employee.resume_projects],
        availability=AvailabilityOut(**availability_snapshot),
    )


def _get_own_employee(db: Session, user: User):
    employee = employee_service.get_employee_by_user_id(db, user.id)
    if not employee:
        # Self-healing: a user with role EMPLOYEE should always have a
        # profile row; create one on first access rather than 404ing.
        employee = employee_service.ensure_employee_profile(db, user)
    return employee


@router.get("/me", response_model=EmployeeProfileOut)
def get_my_profile(
    current_user: User = Depends(require_employee),
    db: Session = Depends(get_db),
):
    employee = _get_own_employee(db, current_user)
    return _serialize_profile(employee, db)


@router.patch("/me", response_model=EmployeeProfileOut)
def update_my_profile(
    payload: EmployeeProfileUpdate,
    current_user: User = Depends(require_employee),
    db: Session = Depends(get_db),
):
    employee = _get_own_employee(db, current_user)
    updated = employee_service.update_profile(
        db, employee, payload.model_dump(exclude_unset=True)
    )
    return _serialize_profile(updated, db)


@router.post("/me/skills", response_model=EmployeeSkillOut, status_code=status.HTTP_201_CREATED)
def add_my_skill(
    payload: EmployeeSkillIn,
    current_user: User = Depends(require_employee),
    db: Session = Depends(get_db),
):
    employee = _get_own_employee(db, current_user)
    try:
        row = employee_service.add_or_update_skill(
            db, employee, payload.skill_id, payload.proficiency_level,
            payload.years_of_experience, source="MANUAL",
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    return EmployeeSkillOut.model_validate(row)


@router.delete("/me/skills/{skill_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_my_skill(
    skill_id: int,
    current_user: User = Depends(require_employee),
    db: Session = Depends(get_db),
):
    employee = _get_own_employee(db, current_user)
    try:
        employee_service.remove_skill(db, employee, skill_id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))


@router.post("/me/certifications", response_model=CertificationOut, status_code=status.HTTP_201_CREATED)
def add_my_certification(
    payload: CertificationIn,
    current_user: User = Depends(require_employee),
    db: Session = Depends(get_db),
):
    employee = _get_own_employee(db, current_user)
    cert = employee_service.add_certification(db, employee, payload.model_dump())
    return CertificationOut.model_validate(cert)


@router.get("/me/availability", response_model=AvailabilityOut)
def get_my_availability(
    current_user: User = Depends(require_employee),
    db: Session = Depends(get_db),
):
    employee = _get_own_employee(db, current_user)
    return AvailabilityOut(**employee_service.get_current_availability_snapshot(db, employee.id))


@router.patch("/me/availability", response_model=AvailabilityOut)
def update_my_availability(
    payload: AvailabilityUpdate,
    current_user: User = Depends(require_employee),
    db: Session = Depends(get_db),
):
    employee = _get_own_employee(db, current_user)
    availability = employee_service.get_or_create_availability(db, employee)
    for field, value in payload.model_dump(exclude_unset=True).items():
        if value is not None:
            setattr(availability, field, value)
    db.commit()
    return AvailabilityOut(**employee_service.get_current_availability_snapshot(db, employee.id))


@router.get("/me/projects", response_model=list[EmployeeProjectHistoryOut])
def get_my_project_history(
    current_user: User = Depends(require_employee),
    db: Session = Depends(get_db),
):
    employee = _get_own_employee(db, current_user)
    history = employee_service.get_project_history(db, employee)
    return [
        EmployeeProjectHistoryOut(
            id=ep.id,
            project_id=ep.project_id,
            project_name=ep.project.name,
            role_on_project=ep.role_on_project,
            status=ep.status,
            allocation_percentage=ep.allocation_percentage,
            start_date=ep.start_date,
            end_date=ep.end_date,
        )
        for ep in history
    ]


# ---------------- Manager-facing directory (Phase 3) ----------------

@router.get("", response_model=list[EmployeeSummaryOut])
def list_employees(
    department: Optional[str] = None,
    skill_id: Optional[int] = None,
    min_proficiency: Optional[int] = None,
    max_utilization: Optional[float] = None,
    availability_status: Optional[str] = None,
    search: Optional[str] = None,
    current_user: User = Depends(require_manager),
    db: Session = Depends(get_db),
):
    employee_summaries = employee_service.list_employees(
        db,
        department=department,
        skill_id=skill_id,
        min_proficiency=min_proficiency,
        max_utilization=max_utilization,
        availability_status=availability_status,
        search=search,
    )
    return [
        EmployeeSummaryOut(
            id=e.id,
            employee_code=e.employee_code,
            full_name=e.user.full_name,
            department=e.department,
            job_title=e.job_title,
            experience_years=e.experience_years,
            availability_status=availability_status,
            utilization_percentage=utilization_percentage,
            skill_names=[es.skill.name for es in e.employee_skills],
        )
        for e, availability_status, utilization_percentage in employee_summaries
    ]


@router.get("/{employee_id}", response_model=EmployeeProfileOut)
def get_employee_profile(
    employee_id: int,
    current_user: User = Depends(require_manager),
    db: Session = Depends(get_db),
):
    try:
        employee = employee_service.get_employee_or_404(db, employee_id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    return _serialize_profile(employee, db)


@router.get("/{employee_id}/projects", response_model=list[EmployeeProjectHistoryOut])
def get_employee_project_history(
    employee_id: int,
    current_user: User = Depends(require_manager),
    db: Session = Depends(get_db),
):
    try:
        employee = employee_service.get_employee_or_404(db, employee_id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    history = employee_service.get_project_history(db, employee)
    return [
        EmployeeProjectHistoryOut(
            id=ep.id,
            project_id=ep.project_id,
            project_name=ep.project.name,
            role_on_project=ep.role_on_project,
            status=ep.status,
            allocation_percentage=ep.allocation_percentage,
            start_date=ep.start_date,
            end_date=ep.end_date,
        )
        for ep in history
    ]
