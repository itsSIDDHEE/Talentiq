"""Manager review -> approve/reject -> final assignment (Phase 12).

This is the ONLY path by which a Recommendation or Team proposal turns
into an actual staffing change. Nothing upstream (recommendation_service,
team_service) ever writes to EmployeeProject directly -- that would let
a recommendation silently become a real assignment without a manager's
explicit approval, which the master prompt explicitly forbids.

Approving does several things atomically:
1. Create the Assignment audit row (who approved, when, status).
2. Create/update the EmployeeProject staffing row.
3. Recompute the employee's Availability (allocated hours/status).
4. Update the Recommendation/Team status so it's not re-approved.
5. Notify the affected employee(s).
"""
from datetime import datetime
from typing import Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.assignment import Assignment
from app.models.employee import Employee
from app.models.employee_project import EmployeeProject
from app.models.project import Project
from app.models.recommendation import Recommendation
from app.models.team import Team, TeamMember
from app.models.user import User
from app.services import employee_service, notification_service, project_service


def _split_team_allocation_percentages(member_count: int) -> list[int]:
    if member_count <= 0:
        return []
    base, remainder = divmod(100, member_count)
    return [base + (1 if index < remainder else 0) for index in range(member_count)]


def _activate_project_when_fully_staffed(db: Session, project: Project) -> None:
    if project.status != "PLANNING" or not project.required_team_size:
        return

    db.flush()
    staffed_count = len(project_service.get_project_staffing(db, project))
    if staffed_count >= project.required_team_size:
        project.status = "ACTIVE"
        project.updated_at = datetime.utcnow()


def approve_recommendation(
    db: Session,
    recommendation: Recommendation,
    approving_user: User,
    allocation_percentage: int = 100,
    role_on_project: Optional[str] = None,
) -> Assignment:
    project = db.scalar(
        select(Project)
        .where(Project.id == recommendation.project_id)
        .with_for_update()
    )
    if not project:
        raise ValueError("Project not found")
    db.refresh(recommendation)
    if recommendation.status == "ACCEPTED":
        raise ValueError("This recommendation has already been approved")

    employee = db.get(Employee, recommendation.employee_id)
    if db.scalar(
        select(Team.id)
        .where(Team.project_id == project.id, Team.status == "APPROVED")
        .limit(1)
    ):
        raise ValueError(
            "This project has an approved team. Update and approve the team roster instead."
        )

    assignment = Assignment(
        project_id=project.id,
        employee_id=employee.id,
        recommendation_id=recommendation.id,
        approved_by_user_id=approving_user.id,
        status="APPROVED",
        approved_at=datetime.utcnow(),
    )
    db.add(assignment)

    staffing = EmployeeProject(
        employee_id=employee.id,
        project_id=project.id,
        role_on_project=role_on_project or employee.job_title,
        status="ACTIVE",
        allocation_percentage=allocation_percentage,
        start_date=project.start_date,
        end_date=project.end_date,
    )
    db.add(staffing)

    recommendation.status = "ACCEPTED"
    _activate_project_when_fully_staffed(db, project)
    db.commit()

    employee_service.recompute_allocated_hours(db, employee)

    notification_service.create_notification(
        db,
        user_id=employee.user_id,
        type="PROJECT_ASSIGNMENT",
        title=f"You've been assigned to {project.name}",
        message=(
            f"You were assigned to '{project.name}' at {allocation_percentage}% "
            f"allocation, approved by {approving_user.full_name}."
        ),
        related_entity_type="project",
        related_entity_id=project.id,
    )

    db.refresh(assignment)
    return assignment


def reject_recommendation(db: Session, recommendation: Recommendation) -> Recommendation:
    recommendation.status = "REJECTED"
    db.commit()
    db.refresh(recommendation)
    return recommendation


def approve_team(
    db: Session,
    team: Team,
    approving_user: User,
    final_employee_ids: Optional[list[int]] = None,
) -> list[Assignment]:
    """Approves a team proposal. If final_employee_ids is given, that
    is the manager's (possibly modified) final roster -- it does not
    have to exactly match the AI-recommended membership, matching the
    spec's requirement that manager modification is always possible
    before final assignment."""
    project = db.scalar(
        select(Project)
        .where(Project.id == team.project_id)
        .with_for_update()
    )
    if not project:
        raise ValueError("Project not found")
    db.refresh(team)
    if team.status != "RECOMMENDED":
        raise ValueError("Only a recommended team can be approved")

    member_ids = final_employee_ids if final_employee_ids is not None else [m.employee_id for m in team.members]
    if len(member_ids) != len(set(member_ids)):
        raise ValueError("A team cannot assign the same employee more than once")
    if project.required_team_size and len(member_ids) > project.required_team_size:
        raise ValueError("Team size cannot exceed the project's required team size")

    approved_members = [
        (employee_id, db.get(Employee, employee_id))
        for employee_id in member_ids
    ]
    approved_members = [
        (employee_id, employee)
        for employee_id, employee in approved_members
        if employee is not None
    ]
    if len(approved_members) != len(member_ids):
        raise ValueError("Every team member must be a valid employee")
    allocations = _split_team_allocation_percentages(len(approved_members))

    existing_eps = {
        ep.employee_id: ep 
        for ep in getattr(project, "employee_projects", [])
    }
    affected_employee_ids = {employee_id for employee_id, _ in approved_members}
    
    # Clean up old active/planned assignments that are not in the new team
    for ep_emp_id, ep in existing_eps.items():
        if ep_emp_id not in member_ids and ep.status in ("PLANNED", "ACTIVE"):
            ep.status = "REMOVED"
            ep.end_date = datetime.utcnow().date()
            affected_employee_ids.add(ep_emp_id)

    assignments = []
    
    # Create ONE assignment for the team approval
    assignment = Assignment(
        project_id=project.id,
        team_id=team.id,
        approved_by_user_id=approving_user.id,
        status="APPROVED",
        approved_at=datetime.utcnow(),
    )
    db.add(assignment)
    assignments.append(assignment)

    approved_member_ids = {employee_id for employee_id, _ in approved_members}
    existing_members = {member.employee_id: member for member in team.members}
    for employee_id, member in existing_members.items():
        if employee_id not in approved_member_ids:
            db.delete(member)

    for (employee_id, employee), allocation_percentage in zip(approved_members, allocations):
        member = existing_members.get(employee_id)
        if member is None:
            db.add(TeamMember(
                team_id=team.id,
                employee_id=employee_id,
                role_on_team=employee.job_title,
            ))
        else:
            member.role_on_team = employee.job_title

        if employee_id in existing_eps:
            ep = existing_eps[employee_id]
            ep.status = "ACTIVE"
            ep.allocation_percentage = allocation_percentage
            ep.role_on_project = employee.job_title
            ep.start_date = project.start_date
            ep.end_date = project.end_date
        else:
            db.add(EmployeeProject(
                employee_id=employee.id,
                project_id=project.id,
                role_on_project=employee.job_title,
                status="ACTIVE",
                allocation_percentage=allocation_percentage,
                start_date=project.start_date,
                end_date=project.end_date,
            ))

    for older_team in project.teams:
        if older_team.id != team.id and older_team.status == "APPROVED":
            older_team.status = "SUPERSEDED"

    team.status = "APPROVED"
    _activate_project_when_fully_staffed(db, project)
    db.commit()

    for employee_id in affected_employee_ids:
        employee = db.get(Employee, employee_id)
        if employee:
            employee_service.recompute_allocated_hours(db, employee)

    for _, employee in approved_members:
        notification_service.create_notification(
            db,
            user_id=employee.user_id,
            type="PROJECT_ASSIGNMENT",
            title=f"You've been assigned to {project.name}",
            message=(
                f"You were assigned to the '{project.name}' team, "
                f"approved by {approving_user.full_name}."
            ),
            related_entity_type="project",
            related_entity_id=project.id,
        )

    for a in assignments:
        db.refresh(a)
    return assignments


def reject_team(db: Session, team: Team) -> Team:
    project = db.scalar(
        select(Project)
        .where(Project.id == team.project_id)
        .with_for_update()
    )
    if not project:
        raise ValueError("Project not found")
    db.refresh(team)
    if team.status != "RECOMMENDED":
        raise ValueError("Only a recommended team can be rejected")
    team.status = "REJECTED"
    db.commit()
    db.refresh(team)
    return team
