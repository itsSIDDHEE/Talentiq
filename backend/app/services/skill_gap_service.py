"""Skill gap analysis (Phase 10) -- individual, project/team, and
organization-wide.
"""
from datetime import datetime

from sqlalchemy import select, func
from sqlalchemy.orm import Session, joinedload

from app.models.employee import Employee
from app.models.employee_skill import EmployeeSkill
from app.models.project import Project
from app.models.project_skill import ProjectSkill
from app.models.skill import Skill
from app.models.skill_gap import SkillGap
from app.models.team import Team


def _severity(gap: int, importance: str) -> str:
    if gap <= 0:
        return "NONE"
    if importance == "MUST_HAVE" and gap >= 2:
        return "HIGH"
    if importance == "MUST_HAVE" or gap >= 2:
        return "MEDIUM"
    return "LOW"


def analyze_project_gaps(db: Session, project: Project) -> list[SkillGap]:
    """Compares required project skills against the *best available*
    level among any active employee, i.e. "could we currently staff
    this requirement at all" -- not a specific team's coverage. For a
    specific team's gaps use analyze_team_gaps instead."""
    gaps = []
    for ps in project.project_skills:
        best_level = db.scalar(
            select(func.max(EmployeeSkill.proficiency_level)).where(
                EmployeeSkill.skill_id == ps.skill_id
            )
        ) or 0
        gap_value = max(ps.required_proficiency - best_level, 0)
        gap = SkillGap(
            project_id=project.id,
            skill_id=ps.skill_id,
            current_level=best_level,
            required_level=ps.required_proficiency,
            gap=gap_value,
            severity=_severity(gap_value, ps.importance),
            created_at=datetime.utcnow(),
        )
        db.add(gap)
        gaps.append(gap)
    db.commit()
    for g in gaps:
        db.refresh(g)
    return gaps


def analyze_team_gaps(db: Session, project: Project, team: Team) -> list[SkillGap]:
    member_skill_levels: dict[int, int] = {}
    for member in team.members:
        for es in member.employee.employee_skills:
            member_skill_levels[es.skill_id] = max(
                member_skill_levels.get(es.skill_id, 0), es.proficiency_level
            )

    gaps = []
    for ps in project.project_skills:
        current = member_skill_levels.get(ps.skill_id, 0)
        gap_value = max(ps.required_proficiency - current, 0)
        gap = SkillGap(
            team_id=team.id,
            skill_id=ps.skill_id,
            current_level=current,
            required_level=ps.required_proficiency,
            gap=gap_value,
            severity=_severity(gap_value, ps.importance),
            created_at=datetime.utcnow(),
        )
        db.add(gap)
        gaps.append(gap)
    db.commit()
    for g in gaps:
        db.refresh(g)
    return gaps


def organization_skill_gap_summary(db: Session) -> list[dict]:
    """Organization-level view: for every skill that appears as a
    project requirement anywhere, how many employees currently hold it
    at or above the required level, and how many active/planning
    projects need it. Built entirely from real rows -- no invented
    "AI insight" text."""
    required_rows = db.scalars(
        select(ProjectSkill)
        .options(joinedload(ProjectSkill.skill), joinedload(ProjectSkill.project))
        .join(Project)
        .where(Project.status.in_(["PLANNING", "ACTIVE"]))
    ).all()

    by_skill: dict[int, dict] = {}
    for ps in required_rows:
        entry = by_skill.setdefault(ps.skill_id, {
            "skill_id": ps.skill_id,
            "skill_name": ps.skill.name,
            "projects_requiring": 0,
            "max_required_level": 0,
        })
        entry["projects_requiring"] += 1
        entry["max_required_level"] = max(entry["max_required_level"], ps.required_proficiency)

    summary = []
    for skill_id, entry in by_skill.items():
        qualified_count = db.scalar(
            select(func.count(EmployeeSkill.id)).where(
                EmployeeSkill.skill_id == skill_id,
                EmployeeSkill.proficiency_level >= entry["max_required_level"],
            )
        ) or 0
        total_holders = db.scalar(
            select(func.count(EmployeeSkill.id)).where(EmployeeSkill.skill_id == skill_id)
        ) or 0

        entry["employees_qualified"] = qualified_count
        entry["employees_with_skill_any_level"] = total_holders
        entry["coverage_ratio"] = round(
            qualified_count / entry["projects_requiring"], 2
        ) if entry["projects_requiring"] else None
        entry["insufficient_coverage"] = qualified_count < entry["projects_requiring"]
        entry["concentration_risk"] = 0 < total_holders <= 2
        summary.append(entry)

    summary.sort(key=lambda e: (e["insufficient_coverage"], e["projects_requiring"]), reverse=True)
    return summary
