import api from './api';

// Maps a backend proficiency_level (1-5) to a display percentage/level
// label. Kept in one place so every screen that shows a skill bar
// agrees on what "4/5" means.
function proficiencyToDisplay(level) {
  const score = Math.round((level / 5) * 100);
  const label =
    level >= 5 ? 'expert' : level >= 4 ? 'advanced' : level >= 3 ? 'intermediate' : 'beginner';
  return { score, label };
}

function adaptEmployeeSkill(es) {
  return {
    skillId: es.skill.id,
    name: es.skill.name,
    category: es.skill.category,
    level: proficiencyToDisplay(es.proficiency_level).label,
    score: proficiencyToDisplay(es.proficiency_level).score,
    proficiencyLevel: es.proficiency_level,
    yearsOfExperience: es.years_of_experience,
    source: es.source,
  };
}

// Adapts the backend's EmployeeProfileOut shape into the flatter shape
// the existing dashboard components expect (profile.name, .role,
// .workload, .skills[].score, etc.) so those components don't need to
// be rewritten just because the data source changed.
function adaptProfile(backendProfile) {
  const availability = backendProfile.availability;
  const utilization = availability?.utilization_percentage ?? (
    availability && availability.weekly_capacity_hours
      ? Math.round((availability.allocated_hours / availability.weekly_capacity_hours) * 100)
      : 0
  );

  return {
    id: backendProfile.employee_code,
    employeeDbId: backendProfile.id,
    name: backendProfile.full_name,
    email: backendProfile.email,
    role: backendProfile.job_title,
    department: backendProfile.department,
    experience: backendProfile.experience_years,
    bio: backendProfile.bio,
    status: backendProfile.is_active ? 'Active' : 'Inactive',
    workload: Math.round(utilization),
    availability: Math.max(100 - Math.round(utilization), 0),
    availabilityStatus: backendProfile.availability_status,
    skills: (backendProfile.skills || []).map(adaptEmployeeSkill),
    certifications: (backendProfile.certifications || []).map((c) => ({
      id: c.id,
      name: c.name,
      issuer: c.issuer,
      credentialId: c.credential_id,
      issueDate: c.issue_date,
      expiryDate: c.expiry_date,
    })),
  };
}

export const employeeService = {
  // ---- Employee self-service ----

  getMyProfile: async () => {
    const { data } = await api.get('/employees/me');
    return adaptProfile(data);
  },

  updateMyProfile: async (updates) => {
    const payload = {};
    if (updates.department !== undefined) payload.department = updates.department;
    if (updates.role !== undefined) payload.job_title = updates.role;
    if (updates.experience !== undefined) payload.experience_years = updates.experience;
    if (updates.bio !== undefined) payload.bio = updates.bio;
    const { data } = await api.patch('/employees/me', payload);
    return adaptProfile(data);
  },

  addMySkill: async ({ skillId, proficiencyLevel = 3, yearsOfExperience = 0 }) => {
    const { data } = await api.post('/employees/me/skills', {
      skill_id: skillId,
      proficiency_level: proficiencyLevel,
      years_of_experience: yearsOfExperience,
    });
    return adaptEmployeeSkill(data);
  },

  removeMySkill: async (skillId) => {
    await api.delete(`/employees/me/skills/${skillId}`);
  },

  addMyCertification: async ({ name, issuer, credentialId, issueDate, expiryDate }) => {
    const { data } = await api.post('/employees/me/certifications', {
      name,
      issuer,
      credential_id: credentialId || null,
      issue_date: issueDate || null,
      expiry_date: expiryDate || null,
    });
    return data;
  },

  getMyAvailability: async () => {
    const { data } = await api.get('/employees/me/availability');
    return data;
  },

  updateMyAvailability: async (updates) => {
    const { data } = await api.patch('/employees/me/availability', updates);
    return data;
  },

  getMyProjectHistory: async () => {
    const { data } = await api.get('/employees/me/projects');
    return data.map((h) => ({
      id: h.project_id,
      name: h.project_name,
      role: h.role_on_project,
      status: h.status,
      allocation: h.allocation_percentage,
      startDate: h.start_date,
      endDate: h.end_date,
    }));
  },

  // ---- Manager-facing directory ----

  getEmployees: async (filters = {}) => {
    const params = {};
    if (filters.department && filters.department !== 'All') params.department = filters.department;
    if (filters.skillId) params.skill_id = filters.skillId;
    if (filters.minProficiency) params.min_proficiency = filters.minProficiency;
    if (filters.maxUtilization !== undefined) params.max_utilization = filters.maxUtilization;
    if (filters.availabilityStatus && filters.availabilityStatus !== 'All') {
      params.availability_status = filters.availabilityStatus;
    }
    if (filters.search) params.search = filters.search;

    const { data } = await api.get('/employees', { params });
    return data.map((e) => ({
      id: e.employee_code,
      employeeDbId: e.id,
      name: e.full_name,
      department: e.department,
      role: e.job_title,
      experience: e.experience_years,
      availabilityStatus: e.availability_status,
      workload: Math.round(e.utilization_percentage),
      skills: e.skill_names,
    }));
  },

  getEmployeeById: async (employeeDbId) => {
    const { data } = await api.get(`/employees/${employeeDbId}`);
    return adaptProfile(data);
  },

  getEmployeeProjectHistory: async (employeeDbId) => {
    const { data } = await api.get(`/employees/${employeeDbId}/projects`);
    return data;
  },
};
