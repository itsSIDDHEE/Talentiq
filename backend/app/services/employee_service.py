"""Employee profile, skills, certifications, availability and workload.

Phase 2 (employee self-service) and part of Phase 3 (manager directory
reads from the same functions).
"""
from datetime import date, datetime, timedelta
from typing import Optional

from sqlalchemy import func, select
from sqlalchemy.orm import Session, joinedload

from app.models.employee import Employee
from app.models.employee_skill import EmployeeSkill
from app.models.certification import Certification
from app.models.availability import Availability
from app.models.employee_project import EmployeeProject
from app.models.project import Project
from app.models.skill import Skill
from app.models.user import User
from app.models.employee_expertise import EmployeeExpertise
from app.models.resume_project import ResumeProject
from app.schemas.llm_extraction import LLMExtraction, PersistedExtractionSummary, RejectedClaim, SkillClaim
from app.services.skill_service import normalize_skill_name


def get_employee_by_user_id(db: Session, user_id: int) -> Optional[Employee]:
    return db.scalar(select(Employee).where(Employee.user_id == user_id))


def get_employee_or_404(db: Session, employee_id: int) -> Employee:
    employee = db.get(Employee, employee_id)
    if not employee:
        raise ValueError("Employee not found")
    return employee


def ensure_employee_profile(db: Session, user: User) -> Employee:
    """Creates the Employee + Availability rows for a user who
    registered with role EMPLOYEE but has no profile row yet
    (e.g. seeded directly via the auth endpoints before Phase 2
    existed). Idempotent."""
    employee = get_employee_by_user_id(db, user.id)
    if employee:
        return employee

    code = f"EMP-{1000 + user.id}"
    employee = Employee(
        user_id=user.id,
        employee_code=code,
        department="Unassigned",
        job_title="Not set",
        experience_years=0,
        availability_status="AVAILABLE",
    )
    db.add(employee)
    db.flush()

    availability = Availability(
        employee_id=employee.id,
        weekly_capacity_hours=40,
        allocated_hours=0,
        status="AVAILABLE",
    )
    db.add(availability)
    db.commit()
    db.refresh(employee)
    return employee


def update_profile(db: Session, employee: Employee, updates: dict) -> Employee:
    for field, value in updates.items():
        if value is not None:
            setattr(employee, field, value)
    employee.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(employee)
    return employee


def add_or_update_skill(
    db: Session,
    employee: Employee,
    skill_id: int,
    proficiency_level: Optional[int],
    years_of_experience: Optional[int],
    source: str = "MANUAL",
    confidence: Optional[float] = None,
    commit: bool = True,
) -> EmployeeSkill:
    existing = db.scalar(
        select(EmployeeSkill).where(
            EmployeeSkill.employee_id == employee.id,
            EmployeeSkill.skill_id == skill_id,
        )
    )
    if existing:
        source_priority = {
            "MANUAL": 100,
            "MANAGER_ASSIGNED": 100,
            "LLM_EXTRACTION": 50,
            "RESUME_EXTRACTION": 25,
        }
        if source_priority.get(source, 10) < source_priority.get(existing.source, 10):
            return existing
        if proficiency_level is not None:
            existing.proficiency_level = proficiency_level
        if years_of_experience is not None:
            existing.years_of_experience = years_of_experience
        existing.source = source
        if confidence is not None or source in {"MANUAL", "MANAGER_ASSIGNED", "LLM_EXTRACTION"}:
            existing.confidence = confidence
        if commit:
            db.commit()
            db.refresh(existing)
        return existing

    row = EmployeeSkill(
        employee_id=employee.id,
        skill_id=skill_id,
        proficiency_level=proficiency_level if proficiency_level is not None else 1,
        years_of_experience=years_of_experience if years_of_experience is not None else 0,
        source=source,
        confidence=confidence,
    )
    db.add(row)
    if commit:
        db.commit()
        db.refresh(row)
    return row


def persist_llm_extraction(
    db: Session,
    employee: Employee,
    document_id: int,
    extraction: LLMExtraction,
) -> PersistedExtractionSummary:
    skills_by_name = {claim.name.casefold(): claim for claim in extraction.skills}
    for experience in extraction.experience:
        key = experience.technology.casefold()
        current = skills_by_name.get(key)
        if current is None:
            current = SkillClaim(
                name=experience.technology,
                proficiency=None,
                years_of_experience=experience.years,
                evidence=experience.evidence,
            )
            skills_by_name[key] = current
        elif current.years_of_experience is None:
            skills_by_name[key] = current.model_copy(
                update={"years_of_experience": experience.years}
            )

    persisted = PersistedExtractionSummary()
    for claim in skills_by_name.values():
        canonical = normalize_skill_name(claim.name)
        skill = db.scalar(select(Skill).where(func.lower(Skill.name) == canonical.casefold()))
        if not skill:
            continue
        existing = db.scalar(
            select(EmployeeSkill).where(
                EmployeeSkill.employee_id == employee.id,
                EmployeeSkill.skill_id == skill.id,
            )
        )
        previous_source = existing.source if existing else None
        saved = add_or_update_skill(
            db,
            employee,
            skill_id=skill.id,
            proficiency_level=claim.proficiency,
            years_of_experience=claim.years_of_experience,
            source="LLM_EXTRACTION",
            confidence=None,
            commit=False,
        )
        if previous_source in {"MANUAL", "MANAGER_ASSIGNED"} and saved.source == previous_source:
            persisted.manual_skills_preserved.append(skill.name)
        else:
            persisted.skills.append(skill.name)

    for claim in extraction.certifications:
        if not claim.issuer:
            persisted.skipped.append(RejectedClaim(
                category="certification",
                name=claim.name,
                reason="issuer_required_by_existing_certification_schema",
                evidence=claim.evidence,
            ))
            continue
        existing = db.scalar(
            select(Certification).where(
                Certification.employee_id == employee.id,
                func.lower(Certification.name) == claim.name.casefold(),
                func.lower(Certification.issuer) == claim.issuer.casefold(),
            )
        )
        if existing:
            persisted.certifications.append(existing.name)
            continue
        db.add(Certification(
            employee_id=employee.id,
            name=claim.name,
            issuer=claim.issuer,
        ))
        persisted.certifications.append(claim.name)

    for claim in extraction.expertise_areas:
        existing = db.scalar(
            select(EmployeeExpertise).where(
                EmployeeExpertise.employee_id == employee.id,
                func.lower(EmployeeExpertise.name) == claim.name.casefold(),
            )
        )
        if existing:
            existing.document_id = document_id
            existing.evidence = claim.evidence
        else:
            db.add(EmployeeExpertise(
                employee_id=employee.id,
                document_id=document_id,
                name=claim.name,
                evidence=claim.evidence,
            ))
        persisted.expertise_areas.append(claim.name)

    for claim in extraction.projects:
        existing = db.scalar(
            select(ResumeProject).where(
                ResumeProject.employee_id == employee.id,
                ResumeProject.document_id == document_id,
                func.lower(ResumeProject.name) == claim.name.casefold(),
            )
        )
        if existing:
            existing.description = claim.description
            existing.technologies = claim.technologies
            existing.evidence = claim.evidence
        else:
            db.add(ResumeProject(
                employee_id=employee.id,
                document_id=document_id,
                name=claim.name,
                description=claim.description,
                technologies=claim.technologies,
                evidence=claim.evidence,
            ))
        persisted.projects.append(claim.name)

    db.commit()
    return persisted


def remove_skill(db: Session, employee: Employee, skill_id: int) -> None:
    row = db.scalar(
        select(EmployeeSkill).where(
            EmployeeSkill.employee_id == employee.id,
            EmployeeSkill.skill_id == skill_id,
        )
    )
    if not row:
        raise ValueError("Employee does not have this skill on record")
    db.delete(row)
    db.commit()


def add_certification(db: Session, employee: Employee, data: dict) -> Certification:
    cert = Certification(employee_id=employee.id, **data)
    db.add(cert)
    db.commit()
    db.refresh(cert)
    return cert


def get_or_create_availability(db: Session, employee: Employee) -> Availability:
    availability = db.scalar(
        select(Availability).where(Availability.employee_id == employee.id)
    )
    if availability:
        return availability
    availability = Availability(employee_id=employee.id)
    db.add(availability)
    db.commit()
    db.refresh(availability)
    return availability


def get_availability_for_window(
    db: Session,
    employee_id: int,
    window_start: date,
    window_end: date,
) -> dict:
    """Return peak allocation and remaining capacity over an inclusive date window."""
    if window_end < window_start:
        raise ValueError("window_end must be on or after window_start")

    availability = db.scalar(
        select(Availability).where(Availability.employee_id == employee_id)
    )
    projects = db.scalars(
        select(EmployeeProject)
        .options(joinedload(EmployeeProject.project))
        .where(
            EmployeeProject.employee_id == employee_id,
            EmployeeProject.status == "ACTIVE",
        )
    ).all()

    window_exclusive_end = window_end + timedelta(days=1)
    breakpoints = {window_start, window_exclusive_end}
    changes: dict[date, float] = {}

    for staffing in projects:
        if staffing.status != "ACTIVE":
            continue

        project = staffing.project
        effective_start = staffing.start_date or project.start_date
        effective_end = staffing.end_date or project.end_date

        if effective_start and effective_end and effective_start > effective_end:
            continue
        if effective_start and effective_start > window_end:
            continue
        if effective_end and effective_end < window_start:
            continue

        overlap_start = max(window_start, effective_start) if effective_start else window_start
        overlap_end = min(window_end, effective_end) if effective_end else window_end
        if overlap_start > overlap_end:
            continue

        allocation = float(staffing.allocation_percentage)
        changes[overlap_start] = changes.get(overlap_start, 0.0) + allocation
        day_after_overlap = overlap_end + timedelta(days=1)
        changes[day_after_overlap] = changes.get(day_after_overlap, 0.0) - allocation
        breakpoints.add(overlap_start)
        breakpoints.add(day_after_overlap)

    ordered_breakpoints = sorted(breakpoints)
    timeline = []
    active_allocation = 0.0
    peak_allocation = 0.0

    for index, interval_start in enumerate(ordered_breakpoints[:-1]):
        active_allocation += changes.get(interval_start, 0.0)
        interval_end = ordered_breakpoints[index + 1] - timedelta(days=1)
        if interval_start > window_end or interval_end < window_start:
            continue
        timeline.append({
            "start": interval_start,
            "end": interval_end,
            "allocation": active_allocation,
        })
        peak_allocation = max(peak_allocation, active_allocation)

    data_quality = (
        "unknown"
        if not availability or availability.weekly_capacity_hours <= 0
        else "ok"
    )
    return {
        "peak_allocation": peak_allocation,
        "remaining_capacity": (
            None if data_quality == "unknown" else max(100.0 - peak_allocation, 0.0)
        ),
        "weekly_capacity_hours": availability.weekly_capacity_hours if availability else 0,
        "timeline": timeline,
        "data_quality": data_quality,
    }


def availability_status_for_window(result: dict) -> str:
    if result["data_quality"] != "ok":
        return "UNKNOWN"
    if result["peak_allocation"] >= 100:
        return "UNAVAILABLE"
    if result["peak_allocation"] > 0:
        return "PARTIALLY_AVAILABLE"
    return "AVAILABLE"


def get_current_availability_snapshot(db: Session, employee_id: int) -> dict:
    """Build current availability values from staffing and capacity records."""
    today = date.today()
    result = get_availability_for_window(db, employee_id, today, today)
    utilization = (
        round(result["peak_allocation"], 1)
        if result["data_quality"] == "ok"
        else 0.0
    )
    capacity_hours = result["weekly_capacity_hours"]
    availability = db.scalar(
        select(Availability).where(Availability.employee_id == employee_id)
    )
    return {
        "weekly_capacity_hours": capacity_hours,
        "allocated_hours": round((utilization / 100) * capacity_hours),
        "status": availability_status_for_window(result),
        "utilization_percentage": utilization,
        "available_from": availability.available_from if availability else None,
        "notes": availability.notes if availability else None,
    }


def recompute_allocated_hours(db: Session, employee: Employee) -> Availability:
    """Recomputes cached allocated_hours from active EmployeeProject
    rows. Called any time an assignment changes so Availability never
    drifts from the actual staffing facts."""
    availability = get_or_create_availability(db, employee)
    snapshot = get_current_availability_snapshot(db, employee.id)
    availability.allocated_hours = snapshot["allocated_hours"]
    availability.status = snapshot["status"]
    employee.availability_status = availability.status
    availability.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(availability)
    return availability


def get_project_history(db: Session, employee: Employee) -> list[EmployeeProject]:
    return db.scalars(
        select(EmployeeProject)
        .options(joinedload(EmployeeProject.project))
        .where(EmployeeProject.employee_id == employee.id)
        .order_by(EmployeeProject.start_date.desc().nulls_last())
    ).all()


def list_employees(
    db: Session,
    department: Optional[str] = None,
    skill_id: Optional[int] = None,
    min_proficiency: Optional[int] = None,
    max_utilization: Optional[float] = None,
    availability_status: Optional[str] = None,
    search: Optional[str] = None,
) -> list[tuple[Employee, str, float]]:
    """Manager-facing filtered employee directory (Phase 3)."""
    stmt = (
        select(Employee)
        .join(User, Employee.user_id == User.id)
        .options(
            joinedload(Employee.user),
            joinedload(Employee.employee_skills).joinedload(EmployeeSkill.skill),
            joinedload(Employee.availability),
        )
        .where(Employee.is_active == True)  # noqa: E712
    )

    if department:
        stmt = stmt.where(Employee.department == department)

    if search:
        like = f"%{search.lower()}%"
        stmt = stmt.where(
            (User.full_name.ilike(like))
            | (Employee.job_title.ilike(like))
            | (Employee.department.ilike(like))
            | (Employee.employee_code.ilike(like))
        )

    employees = db.scalars(stmt).unique().all()

    if skill_id is not None:
        employees = [
            e for e in employees
            if any(
                es.skill_id == skill_id
                and (min_proficiency is None or es.proficiency_level >= min_proficiency)
                for es in e.employee_skills
            )
        ]

    summaries = []
    for employee in employees:
        snapshot = get_current_availability_snapshot(db, employee.id)
        status = snapshot["status"]
        utilization = snapshot["utilization_percentage"]
        if availability_status and status != availability_status:
            continue
        if max_utilization is not None and utilization > max_utilization:
            continue
        summaries.append((employee, status, round(utilization, 1)))

    return summaries
