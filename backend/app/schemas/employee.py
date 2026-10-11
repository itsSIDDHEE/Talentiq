from datetime import date, datetime
from typing import List, Optional

from pydantic import BaseModel, ConfigDict


class SkillOut(BaseModel):
    id: int
    name: str
    category: str
    model_config = ConfigDict(from_attributes=True)


class EmployeeSkillIn(BaseModel):
    skill_id: int
    proficiency_level: int = 1
    years_of_experience: int = 0


class EmployeeSkillOut(BaseModel):
    id: int
    skill: SkillOut
    proficiency_level: int
    years_of_experience: int
    source: str
    confidence: Optional[float] = None
    model_config = ConfigDict(from_attributes=True)


class CertificationIn(BaseModel):
    name: str
    issuer: str
    credential_id: Optional[str] = None
    issue_date: Optional[date] = None
    expiry_date: Optional[date] = None


class CertificationOut(CertificationIn):
    id: int
    model_config = ConfigDict(from_attributes=True)


class EmployeeExpertiseOut(BaseModel):
    id: int
    document_id: int
    name: str
    evidence: str
    source: str
    model_config = ConfigDict(from_attributes=True)


class ResumeProjectOut(BaseModel):
    id: int
    document_id: int
    name: str
    description: Optional[str] = None
    technologies: List[str] = []
    evidence: str
    source: str
    model_config = ConfigDict(from_attributes=True)


class AvailabilityOut(BaseModel):
    weekly_capacity_hours: int
    allocated_hours: int
    status: str
    utilization_percentage: float
    available_from: Optional[date] = None
    notes: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)

class AvailabilityUpdate(BaseModel):
    weekly_capacity_hours: Optional[int] = None
    available_from: Optional[date] = None
    notes: Optional[str] = None

class EmployeeProfileOut(BaseModel):
    id: int
    employee_code: str
    full_name: str
    email: str
    department: str
    job_title: str
    experience_years: int
    bio: Optional[str] = None
    availability_status: str
    is_active: bool
    skills: List[EmployeeSkillOut] = []
    certifications: List[CertificationOut] = []
    expertise_areas: List[EmployeeExpertiseOut] = []
    resume_projects: List[ResumeProjectOut] = []
    availability: Optional[AvailabilityOut] = None
    model_config = ConfigDict(from_attributes=True)


class EmployeeProfileUpdate(BaseModel):
    department: Optional[str] = None
    job_title: Optional[str] = None
    experience_years: Optional[int] = None
    bio: Optional[str] = None


class EmployeeSummaryOut(BaseModel):
    id: int
    employee_code: str
    full_name: str
    department: str
    job_title: str
    experience_years: int
    availability_status: str
    utilization_percentage: float
    skill_names: List[str] = []
    model_config = ConfigDict(from_attributes=True)


class EmployeeProjectHistoryOut(BaseModel):
    id: int
    project_id: int
    project_name: str
    role_on_project: Optional[str] = None
    status: str
    allocation_percentage: int
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    model_config = ConfigDict(from_attributes=True)
