from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel


class RecommendationOut(BaseModel):
    employee_id: int
    employee_name: str
    department: str
    job_title: str
    score: float
    rank: int
    matched_skills: List[str]
    missing_skills: List[str]
    experience_years: int
    semantic_similarity: float
    current_utilization_percentage: Optional[float]
    available_capacity_percentage: Optional[float]
    reason: str
    contributing_factors: dict


class TeamMemberOut(BaseModel):
    employee_id: int
    employee_name: str
    role_on_team: Optional[str] = None
    match_score: float
    matched_skills: List[str]


class TeamProposalOut(BaseModel):
    team_id: int
    project_id: int
    status: str
    skill_coverage_percentage: float
    members: List[TeamMemberOut]
    remaining_gaps: List[str]
    availability_data_missing: List[str] = []


class TeamDecisionIn(BaseModel):
    action: str  # APPROVE | REJECT
    employee_ids: Optional[List[int]] = None  # manager's final, possibly-modified roster
