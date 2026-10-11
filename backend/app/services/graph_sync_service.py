"""PostgreSQL to Neo4j Graph Synchronization Service (Phase 2).

This service reads entity records and relationships from PostgreSQL (the single
source of truth) and creates/updates the corresponding nodes and relationships
in Neo4j using idempotent Cypher MERGE operations.

Key safety & design principles:
- PostgreSQL is strictly read-only: no records or schemas in PostgreSQL are modified.
- Neo4j writes are fully idempotent via MERGE on stable PostgreSQL primary keys (`id`).
- Uniqueness constraints are enforced on (:Employee {id}), (:Skill {id}), (:Project {id}), (:Certification {id}).
- Transactions: Synchronizations run inside an explicit Neo4j Managed Transaction (`session.execute_write`).
  Any error during the batch sync triggers an automatic rollback of graph writes.
- Parameterized batching using Cypher `UNWIND` is used for high efficiency and atomicity.
- Stale Data Note: This synchronization is additive and updates in-place. If an entity or relationship
  is deleted in PostgreSQL, it is not automatically purged in Neo4j without an explicit prune step.
"""
import logging
from typing import Dict, Any, List
from sqlalchemy.orm import Session, joinedload

from app.models.employee import Employee
from app.models.skill import Skill
from app.models.employee_skill import EmployeeSkill
from app.models.project import Project
from app.models.project_skill import ProjectSkill
from app.models.employee_project import EmployeeProject
from app.models.certification import Certification
from app.services import graph_service

logger = logging.getLogger("talentiq.graph_sync")

# Constraints to enforce uniqueness on stable PostgreSQL primary keys
CONSTRAINT_QUERIES = [
    "CREATE CONSTRAINT employee_id_unique IF NOT EXISTS FOR (e:Employee) REQUIRE e.id IS UNIQUE",
    "CREATE CONSTRAINT skill_id_unique IF NOT EXISTS FOR (s:Skill) REQUIRE s.id IS UNIQUE",
    "CREATE CONSTRAINT project_id_unique IF NOT EXISTS FOR (p:Project) REQUIRE p.id IS UNIQUE",
    "CREATE CONSTRAINT certification_id_unique IF NOT EXISTS FOR (c:Certification) REQUIRE c.id IS UNIQUE",
]


def ensure_constraints() -> Dict[str, Any]:
    """Ensure uniqueness constraints exist in Neo4j.
    Safe and idempotent (IF NOT EXISTS).
    """
    if not graph_service.is_enabled():
        return {"status": "error", "message": "Neo4j driver is not enabled."}

    driver = graph_service._driver
    database = graph_service._database

    created = []
    with driver.session(database=database) as session:
        for query in CONSTRAINT_QUERIES:
            session.run(query)
            created.append(query)

    logger.info("Ensured Neo4j uniqueness constraints: %d applied", len(created))
    return {"status": "success", "constraints_ensured": len(created)}


# -------------------------------------------------------------------------
# Batch Synchronization Functions (Executed inside a Neo4j Transaction)
# -------------------------------------------------------------------------

def sync_skills_tx(tx, skills_data: List[Dict[str, Any]]) -> int:
    """Sync skills in batch using UNWIND."""
    if not skills_data:
        return 0
    query = """
    UNWIND $batch AS row
    MERGE (s:Skill {id: row.id})
    SET s.name = row.name,
        s.category = row.category
    """
    tx.run(query, batch=skills_data)
    return len(skills_data)


def sync_employees_tx(tx, employees_data: List[Dict[str, Any]]) -> int:
    """Sync employees in batch using UNWIND."""
    if not employees_data:
        return 0
    query = """
    UNWIND $batch AS row
    MERGE (e:Employee {id: row.id})
    SET e.name = row.name,
        e.department = row.department,
        e.employee_code = row.employee_code,
        e.job_title = row.job_title
    """
    tx.run(query, batch=employees_data)
    return len(employees_data)


def sync_projects_tx(tx, projects_data: List[Dict[str, Any]]) -> int:
    """Sync projects in batch using UNWIND."""
    if not projects_data:
        return 0
    query = """
    UNWIND $batch AS row
    MERGE (p:Project {id: row.id})
    SET p.name = row.name,
        p.department = row.department,
        p.status = row.status,
        p.priority = row.priority
    """
    tx.run(query, batch=projects_data)
    return len(projects_data)


def sync_certifications_tx(tx, certs_data: List[Dict[str, Any]]) -> int:
    """Sync certifications in batch with stable PostgreSQL Certification.id."""
    if not certs_data:
        return 0
    query = """
    UNWIND $batch AS row
    MERGE (c:Certification {id: row.id})
    SET c.name = row.name,
        c.issuer = row.issuer
    """
    tx.run(query, batch=certs_data)
    return len(certs_data)


def sync_employee_skills_tx(tx, emp_skills_data: List[Dict[str, Any]]) -> int:
    """Sync (Employee)-[:HAS_SKILL]->(Skill) relationships in batch."""
    if not emp_skills_data:
        return 0
    query = """
    UNWIND $batch AS row
    MATCH (e:Employee {id: row.employee_id})
    MATCH (s:Skill {id: row.skill_id})
    MERGE (e)-[r:HAS_SKILL]->(s)
    SET r.proficiency = row.proficiency,
        r.years_of_experience = row.years_of_experience,
        r.source = row.source
    """
    tx.run(query, batch=emp_skills_data)
    return len(emp_skills_data)


def sync_project_skills_tx(tx, proj_skills_data: List[Dict[str, Any]]) -> int:
    """Sync (Project)-[:REQUIRES_SKILL]->(Skill) relationships in batch."""
    if not proj_skills_data:
        return 0
    query = """
    UNWIND $batch AS row
    MATCH (p:Project {id: row.project_id})
    MATCH (s:Skill {id: row.skill_id})
    MERGE (p)-[r:REQUIRES_SKILL]->(s)
    SET r.required_proficiency = row.required_proficiency,
        r.importance = row.importance
    """
    tx.run(query, batch=proj_skills_data)
    return len(proj_skills_data)


def sync_employee_projects_tx(tx, emp_projects_data: List[Dict[str, Any]]) -> int:
    """Sync (Employee)-[:WORKED_ON]->(Project) relationships in batch."""
    if not emp_projects_data:
        return 0
    query = """
    UNWIND $batch AS row
    MATCH (e:Employee {id: row.employee_id})
    MATCH (p:Project {id: row.project_id})
    MERGE (e)-[r:WORKED_ON]->(p)
    SET r.role = row.role,
        r.status = row.status,
        r.allocation_percentage = row.allocation_percentage
    """
    tx.run(query, batch=emp_projects_data)
    return len(emp_projects_data)


def sync_employee_certifications_tx(tx, certs_data: List[Dict[str, Any]]) -> int:
    """Sync (Employee)-[:HAS_CERTIFICATION]->(Certification) relationships in batch using stable Certification.id."""
    if not certs_data:
        return 0
    query = """
    UNWIND $batch AS row
    MATCH (e:Employee {id: row.employee_id})
    MATCH (c:Certification {id: row.id})
    MERGE (e)-[r:HAS_CERTIFICATION]->(c)
    """
    tx.run(query, batch=certs_data)
    return len(certs_data)


# -------------------------------------------------------------------------
# PostgreSQL Readers (Pure Read-Only Queries)
# -------------------------------------------------------------------------

def load_postgres_records(db: Session) -> Dict[str, List[Dict[str, Any]]]:
    """Read all relevant entities and relationships from PostgreSQL.
    Strictly read-only; does not mutate PostgreSQL.
    """
    # 1. Skills
    skills = [
        {"id": s.id, "name": s.name, "category": s.category or "General"}
        for s in db.query(Skill).all()
    ]

    # 2. Employees
    employees = [
        {
            "id": emp.id,
            "name": emp.user.full_name if emp.user else f"Employee {emp.id}",
            "department": emp.department or "Unassigned",
            "employee_code": emp.employee_code or f"EMP-{emp.id}",
            "job_title": emp.job_title or "Not set",
        }
        for emp in db.query(Employee).options(joinedload(Employee.user)).all()
    ]

    # 3. Projects
    projects = [
        {
            "id": p.id,
            "name": p.name,
            "department": p.department or "General",
            "status": p.status or "PLANNING",
            "priority": p.priority or "MEDIUM",
        }
        for p in db.query(Project).all()
    ]

    # 4. Certifications
    certifications = [
        {
            "id": c.id,
            "employee_id": c.employee_id,
            "name": c.name,
            "issuer": c.issuer,
        }
        for c in db.query(Certification).all()
    ]

    # 5. Employee Skills
    employee_skills = [
        {
            "employee_id": es.employee_id,
            "skill_id": es.skill_id,
            "proficiency": es.proficiency_level,
            "years_of_experience": es.years_of_experience,
            "source": es.source,
        }
        for es in db.query(EmployeeSkill).all()
    ]

    # 6. Project Skills
    project_skills = [
        {
            "project_id": ps.project_id,
            "skill_id": ps.skill_id,
            "required_proficiency": ps.required_proficiency,
            "importance": ps.importance,
        }
        for ps in db.query(ProjectSkill).all()
    ]

    # 7. Employee Projects
    employee_projects = [
        {
            "employee_id": ep.employee_id,
            "project_id": ep.project_id,
            "role": ep.role_on_project,
            "status": ep.status,
            "allocation_percentage": ep.allocation_percentage,
        }
        for ep in db.query(EmployeeProject).all()
    ]

    return {
        "skills": skills,
        "employees": employees,
        "projects": projects,
        "certifications": certifications,
        "employee_skills": employee_skills,
        "project_skills": project_skills,
        "employee_projects": employee_projects,
    }


# -------------------------------------------------------------------------
# Synchronization Orchestrator
# -------------------------------------------------------------------------

def sync_all(db: Session, apply_constraints: bool = True) -> Dict[str, Any]:
    """Orchestrate complete idempotent PostgreSQL to Neo4j synchronization.

    Guarantees:
    - Atomicity: All graph modifications occur inside a single Managed Write Transaction (`execute_write`).
      If any failure occurs, the entire transaction is rolled back by the Neo4j driver.
    - PostgreSQL is read-only.
    """
    if not graph_service.is_enabled():
        return {
            "status": "error",
            "message": "Neo4j is not connected or enabled. Please check configuration.",
        }

    driver = graph_service._driver
    database = graph_service._database

    stats = {
        "skills_synced": 0,
        "employees_synced": 0,
        "projects_synced": 0,
        "certifications_synced": 0,
        "employee_skills_synced": 0,
        "project_skills_synced": 0,
        "employee_projects_synced": 0,
        "employee_certifications_synced": 0,
    }

    try:
        # Step 1: Ensure constraints before transaction
        if apply_constraints:
            ensure_constraints()

        # Step 2: Read data from PostgreSQL (pure read-only)
        pg_data = load_postgres_records(db)

        # Step 3: Write to Neo4j within an explicit managed write transaction
        def _write_transaction(tx):
            # A. Sync Nodes
            stats["skills_synced"] = sync_skills_tx(tx, pg_data["skills"])
            stats["employees_synced"] = sync_employees_tx(tx, pg_data["employees"])
            stats["projects_synced"] = sync_projects_tx(tx, pg_data["projects"])
            stats["certifications_synced"] = sync_certifications_tx(tx, pg_data["certifications"])

            # B. Sync Relationships
            stats["employee_skills_synced"] = sync_employee_skills_tx(tx, pg_data["employee_skills"])
            stats["project_skills_synced"] = sync_project_skills_tx(tx, pg_data["project_skills"])
            stats["employee_projects_synced"] = sync_employee_projects_tx(tx, pg_data["employee_projects"])
            stats["employee_certifications_synced"] = sync_employee_certifications_tx(tx, pg_data["certifications"])

        with driver.session(database=database) as session:
            session.execute_write(_write_transaction)

        logger.info("Successfully completed Neo4j graph synchronization: %s", stats)
        return {
            "status": "success",
            "message": "Graph synchronization completed successfully.",
            "details": stats,
        }

    except Exception as exc:
        logger.error("Error during Neo4j synchronization: %s", exc, exc_info=True)
        return {
            "status": "error",
            "message": f"Graph synchronization failed: {str(exc)}",
            "details": stats,
        }
