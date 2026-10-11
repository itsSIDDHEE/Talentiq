"""Development seed data (spec Section 26).

Generates realistic, clearly-fictional employees, skills, projects,
and certifications directly into Postgres, so the
dashboards and AI matching system have something real to demonstrate
against. Never used to hardcode fake numbers into the frontend --
everything created here is a normal row the API endpoints already
read/write. Staffing is intentionally left to the explicit manager
approval workflows.

Usage (from backend/, with the venv active and DATABASE_URL set):
    python -m app.seed
Safe to re-run: skips creating a user if that email already exists.
"""
import random
from datetime import date, timedelta

from app.core.security import hash_password
from app.database.postgres import SessionLocal
from app.models.availability import Availability
from app.models.certification import Certification
from app.models.employee import Employee
from app.models.employee_skill import EmployeeSkill
from app.models.project import Project
from app.models.project_skill import ProjectSkill
from app.models.skill import Skill
from app.models.user import User

DEPARTMENTS = ["Engineering", "Data & AI", "Product", "Design", "DevOps"]

SKILLS = [
    ("Python", "Programming Language"), ("JavaScript", "Programming Language"),
    ("TypeScript", "Programming Language"), ("React", "Frontend"),
    ("FastAPI", "Backend Framework"), ("Node.js", "Backend Framework"),
    ("PostgreSQL", "Database"), ("MongoDB", "Database"),
    ("Docker", "DevOps"), ("Kubernetes", "DevOps"),
    ("Amazon Web Services", "Cloud"), ("Machine Learning", "Data & AI"),
    ("Artificial Intelligence", "Data & AI"), ("REST API", "Backend"),
    ("Structured Query Language", "Database"), ("Figma", "Design"),
    ("Project Management", "Soft Skill"), ("System Design", "Architecture"),
    ("Data Engineering", "Data & AI"), ("CI/CD", "DevOps"),
]

FIRST_NAMES = ["Asha", "Rohan", "Meera", "Kabir", "Isha", "Vikram", "Tara", "Dev",
               "Nisha", "Arjun", "Priya", "Sameer", "Anika", "Karan", "Divya", "Rahul"]
LAST_NAMES = ["Sharma", "Verma", "Iyer", "Reddy", "Nair", "Gupta", "Rao", "Mehta",
              "Kapoor", "Joshi", "Chopra", "Malhotra"]

JOB_TITLES = ["Software Engineer", "Senior Software Engineer", "Data Scientist",
              "DevOps Engineer", "Product Designer", "Backend Engineer",
              "Frontend Engineer", "ML Engineer", "QA Engineer", "Tech Lead"]

PROJECTS = [
    ("Customer Portal Revamp", "Product", "Rebuild the customer self-service portal with a modern React frontend and FastAPI backend.", "HIGH",
     ["React", "FastAPI", "PostgreSQL", "REST API"]),
    ("Churn Prediction Model", "Data & AI", "Build a machine learning model to predict customer churn from usage data.", "HIGH",
     ["Python", "Machine Learning", "PostgreSQL", "Data Engineering"]),
    ("Internal DevOps Platform", "DevOps", "Standardize CI/CD and container orchestration across engineering teams.", "MEDIUM",
     ["Docker", "Kubernetes", "CI/CD", "Amazon Web Services"]),
    ("Mobile Checkout Redesign", "Product", "Redesign the mobile checkout flow to reduce cart abandonment.", "MEDIUM",
     ["Figma", "React", "System Design"]),
    ("Workforce Analytics Dashboard", "Data & AI", "Internal dashboard surfacing workforce utilization and skill gap metrics.", "LOW",
     ["Python", "PostgreSQL", "REST API"]),
]


def get_or_create_user(db, email, full_name, role):
    existing = db.query(User).filter(User.email == email).first()
    if existing:
        return existing, False
    user = User(
        email=email, full_name=full_name,
        password_hash=hash_password("Password123!"),
        role=role, is_active=True,
    )
    db.add(user)
    db.flush()
    return user, True


def seed():
    db = SessionLocal()
    try:
        print("Seeding TalentIQ demo data...")

        # --- Manager -----------------------------------------------------
        manager, created = get_or_create_user(db, "manager@talentiq.dev", "Workforce Manager", "MANAGER")
        print(f"Manager: {manager.email} ({'created' if created else 'already existed'})")

        # --- Skills -------------------------------------------------------
        skill_objs = {}
        for name, category in SKILLS:
            skill = db.query(Skill).filter(Skill.name == name).first()
            if not skill:
                skill = Skill(name=name, category=category)
                db.add(skill)
                db.flush()
            skill_objs[name] = skill
        print(f"Skills: {len(skill_objs)} available")

        # --- Employees ------------------------------------------------
        employees = []
        for i in range(32):
            first, last = FIRST_NAMES[i % len(FIRST_NAMES)], LAST_NAMES[i % len(LAST_NAMES)]
            email = f"{first.lower()}.{last.lower()}{i}@talentiq.dev"
            full_name = f"{first} {last}"
            user, created = get_or_create_user(db, email, full_name, "EMPLOYEE")

            employee = db.query(Employee).filter(Employee.user_id == user.id).first()
            if not employee:
                employee = Employee(
                    user_id=user.id,
                    employee_code=f"EMP-U{user.id}",
                    department=random.choice(DEPARTMENTS),
                    job_title=random.choice(JOB_TITLES),
                    experience_years=random.randint(1, 12),
                    bio=f"{full_name} is a {random.choice(JOB_TITLES).lower()} focused on delivering reliable software.",
                    availability_status="AVAILABLE",
                )
                db.add(employee)
                db.flush()

                db.add(Availability(
                    employee_id=employee.id,
                    weekly_capacity_hours=40,
                    allocated_hours=0,
                    status="AVAILABLE",
                ))

                # 3-6 random skills per employee
                chosen_skills = random.sample(list(skill_objs.values()), k=random.randint(3, 6))
                for skill in chosen_skills:
                    db.add(EmployeeSkill(
                        employee_id=employee.id,
                        skill_id=skill.id,
                        proficiency_level=random.randint(2, 5),
                        years_of_experience=random.randint(1, employee.experience_years or 1),
                        source="MANUAL",
                    ))

                if random.random() > 0.5:
                    db.add(Certification(
                        employee_id=employee.id,
                        name=random.choice([
                            "AWS Certified Solutions Architect", "Certified Kubernetes Administrator",
                            "PMP Certification", "Google Data Analytics Certificate",
                        ]),
                        issuer=random.choice(["Amazon", "CNCF", "PMI", "Google"]),
                        issue_date=date.today() - timedelta(days=random.randint(30, 900)),
                    ))

            employees.append(employee)
        db.commit()
        print(f"Employees: {len(employees)} available")

        # --- Projects -------------------------------------------------
        projects = []
        for name, dept, desc, priority, req_skill_names in PROJECTS:
            project = db.query(Project).filter(Project.name == name).first()
            if not project:
                project = Project(
                    name=name, description=desc, department=dept,
                    status="ACTIVE", priority=priority,
                    start_date=date.today() - timedelta(days=random.randint(0, 60)),
                    end_date=date.today() + timedelta(days=random.randint(60, 180)),
                    required_team_size=random.randint(3, 6),
                )
                db.add(project)
                db.flush()
                for skill_name in req_skill_names:
                    skill = skill_objs.get(skill_name)
                    if skill:
                        db.add(ProjectSkill(
                            project_id=project.id, skill_id=skill.id,
                            required_proficiency=random.randint(2, 4),
                            importance=random.choice(["MUST_HAVE", "IMPORTANT", "NICE_TO_HAVE"]),
                        ))
            projects.append(project)
        db.commit()
        print(f"Projects: {len(projects)} available")

        print("\nSeed complete.")
        print("Manager login: manager@talentiq.dev / Password123!")
        print("Employee logins: <firstname>.<lastname><n>@talentiq.dev / Password123!")

    finally:
        db.close()


if __name__ == "__main__":
    seed()
