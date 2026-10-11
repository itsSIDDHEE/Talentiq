"""Balanced team formation (Phase 9).

Deliberately NOT "take the top N individual scores" -- that can staff
five Python experts and cover zero of the project's React/DevOps
requirements. Instead this runs a greedy set-cover: repeatedly pick
the candidate who closes the most currently-uncovered, importance-
weighted requirement, breaking ties on individual score, until the
team reaches required_team_size or requirements are fully covered.
"""
import logging
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.models.employee import Employee
from app.models.employee_skill import EmployeeSkill
from app.models.project import Project
from app.models.team import Team, TeamMember
from app.services.recommendation_service import (
    IMPORTANCE_WEIGHT,
    available_capacity_percentage,
    get_project_availability,
    score_employee_for_project,
)

logger = logging.getLogger("talentiq.teams")


def _editable_team(db: Session, team: Team) -> Team:
    if team.status == "RECOMMENDED":
        return team
    if team.status != "APPROVED":
        raise ValueError("Only a recommended team can be edited")

    proposal = Team(
        project_id=team.project_id,
        status="RECOMMENDED",
        skill_coverage_percentage=team.skill_coverage_percentage,
        created_at=datetime.utcnow(),
    )
    db.add(proposal)
    db.flush()

    for member in team.members:
        db.add(TeamMember(
            team_id=proposal.id,
            employee_id=member.employee_id,
            role_on_team=member.role_on_team,
            match_score=member.match_score,
        ))
    db.flush()
    return proposal


def form_team(db: Session, project: Project, team_size: int) -> Team:
    if team_size < 1:
        raise ValueError("Team size must be at least one")
    if project.required_team_size and team_size > project.required_team_size:
        raise ValueError("Team size cannot exceed the project's required team size")

    required_skills = list(project.project_skills)
    required_skill_ids = {ps.skill_id: ps for ps in required_skills}
    total_weight = sum(IMPORTANCE_WEIGHT.get(ps.importance, 2) for ps in required_skills) or 1

    candidates = db.scalars(
        select(Employee)
        .options(
            joinedload(Employee.employee_skills).joinedload(EmployeeSkill.skill),
            joinedload(Employee.availability),
        )
        .where(Employee.is_active == True)  # noqa: E712
    ).unique().all()
    eligible_candidates = []
    for candidate in candidates:
        availability = get_project_availability(db, candidate, project)
        if availability["data_quality"] != "ok":
            continue
        if available_capacity_percentage(db, candidate, project, availability) > 0:
            eligible_candidates.append(candidate)
    candidates = eligible_candidates

    # Precompute each candidate's individual score once.
    scored = {}
    for c in candidates:
        availability = get_project_availability(db, c, project)
        result = score_employee_for_project(db, c, project, availability)
        scored[c.id] = {"employee": c, **result}

    covered_skill_ids: set[int] = set()
    selected: list[dict] = []
    remaining = {c.id: scored[c.id] for c in candidates}

    while len(selected) < team_size and remaining:

        best_id, best_gain, best_new_skills = None, -1.0, set()

        for emp_id, data in remaining.items():
            employee_skill_ids = {es.skill_id for es in data["employee"].employee_skills}
            newly_covered = (employee_skill_ids & required_skill_ids.keys()) - covered_skill_ids
            gain = sum(
                IMPORTANCE_WEIGHT.get(required_skill_ids[sid].importance, 2)
                for sid in newly_covered
            )
            # Tie-break on individual score so among equal coverage gain
            # we still prefer the stronger overall candidate.
            comparable = gain + (data["score"] / 1000)
            if comparable > best_gain:
                best_gain, best_id, best_new_skills = comparable, emp_id, newly_covered

        if best_id is None:
            break

        selected.append(remaining.pop(best_id))
        covered_skill_ids |= best_new_skills
        

    coverage_pct = round(
        sum(IMPORTANCE_WEIGHT.get(required_skill_ids[sid].importance, 2) for sid in covered_skill_ids)
        / total_weight * 100, 1
    ) if required_skill_ids else 100.0

    team = Team(
        project_id=project.id,
        status="RECOMMENDED",
        skill_coverage_percentage=coverage_pct,
        created_at=datetime.utcnow(),
    )
    db.add(team)
    db.flush()

    for data in selected:
        db.add(TeamMember(
            team_id=team.id,
            employee_id=data["employee"].id,
            role_on_team=data["employee"].job_title,
            match_score=data["score"],
        ))

    db.commit()
    db.refresh(team)

    logger.info(
        "team_formed project_id=%s team_id=%s members=%d coverage=%.1f%%",
        project.id, team.id, len(selected), coverage_pct,
    )

    return team


def get_remaining_gaps(project: Project, team: Team) -> list[str]:
    covered_skill_ids = set()
    for member in team.members:
        employee_skill_ids = {es.skill_id for es in member.employee.employee_skills}
        covered_skill_ids |= employee_skill_ids
    return [
        ps.skill.name for ps in project.project_skills
        if ps.skill_id not in covered_skill_ids
    ]


def get_capacity_unknown_candidates(db: Session, project: Project) -> list[str]:
    employees = db.scalars(
        select(Employee)
        .options(joinedload(Employee.availability), joinedload(Employee.user))
        .where(Employee.is_active == True)  # noqa: E712
    ).unique().all()
    return [
        employee.user.full_name
        for employee in employees
        if get_project_availability(db, employee, project)["data_quality"] == "unknown"
    ]


def regenerate_team(db: Session, project: Project, team_size: int) -> Team:
    """Creates a fresh Team proposal (old ones remain for history)."""
    return form_team(db, project, team_size)


def replace_member(db: Session, team: Team, old_employee_id: int, new_employee_id: int, project: Project) -> Team:
    member = next((m for m in team.members if m.employee_id == old_employee_id), None)
    if not member:
        raise ValueError("Employee is not currently on this team")
    if any(m.employee_id == new_employee_id for m in team.members):
        raise ValueError("Employee is already on this team")

    employee = db.get(Employee, new_employee_id)
    if not employee:
        raise ValueError("Employee not found")

    availability = get_project_availability(db, employee, project)
    if availability["data_quality"] != "ok":
        raise ValueError("Availability data missing for employee")
    if available_capacity_percentage(db, employee, project, availability) <= 0:
        raise ValueError("Employee has no available capacity for this project window")

    result = score_employee_for_project(db, employee, project, availability)
    editable_team = _editable_team(db, team)
    editable_member = next(
        m for m in editable_team.members if m.employee_id == old_employee_id
    )
    editable_member.employee_id = new_employee_id
    editable_member.role_on_team = employee.job_title
    editable_member.match_score = result["score"]

    db.commit()
    db.refresh(editable_team)
    return editable_team


def remove_member(db: Session, team: Team, employee_id: int) -> Team:
    member = next((m for m in team.members if m.employee_id == employee_id), None)
    if not member:
        raise ValueError("Employee is not currently on this team")

    editable_team = _editable_team(db, team)
    editable_member = next(
        m for m in editable_team.members if m.employee_id == employee_id
    )
    db.delete(editable_member)
    db.commit()
    db.refresh(editable_team)
    return editable_team


def add_member(db: Session, team: Team, employee_id: int, project: Project) -> Team:
    if any(member.employee_id == employee_id for member in team.members):
        raise ValueError("Employee is already on this team")
    employee = db.get(Employee, employee_id)
    if not employee:
        raise ValueError("Employee not found")
    if project.required_team_size and len(team.members) >= project.required_team_size:
        raise ValueError("The project has already reached its required team size")
    availability = get_project_availability(db, employee, project)
    if availability["data_quality"] != "ok":
        raise ValueError("Availability data missing for employee")
    if available_capacity_percentage(db, employee, project, availability) <= 0:
        raise ValueError("Employee has no available capacity for this project window")

    result = score_employee_for_project(db, employee, project, availability)
    editable_team = _editable_team(db, team)
    db.add(TeamMember(
        team_id=editable_team.id,
        employee_id=employee_id,
        role_on_team=employee.job_title,
        match_score=result["score"],
    ))

    db.commit()
    db.refresh(editable_team)
    return editable_team
