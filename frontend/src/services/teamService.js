import api from './api';

function adaptTeam(t) {
  return {
    teamId: t.team_id,
    projectId: t.project_id,
    status: t.status,
    skillCoverage: t.skill_coverage_percentage,
    members: t.members.map((m) => ({
      employeeId: m.employee_id,
      name: m.employee_name,
      role: m.role_on_team,
      matchScore: m.match_score,
      matchedSkills: m.matched_skills,
    })),
    remainingGaps: t.remaining_gaps,
    availabilityDataMissing: t.availability_data_missing || [],
  };
}

export const teamService = {
  getApprovedTeam: async (projectId) => {
    const { data } = await api.get(`/team-matching/projects/${projectId}/approved-team`);
    return adaptTeam(data);
  },

  formTeam: async (projectId, teamSize) => {
    const { data } = await api.post(
      `/team-matching/projects/${projectId}/form-team`,
      null,
      { params: { team_size: teamSize } }
    );
    return adaptTeam(data);
  },

  regenerateTeam: async (teamId, teamSize) => {
    const { data } = await api.post(
      `/team-matching/teams/${teamId}/regenerate`,
      null,
      { params: { team_size: teamSize } }
    );
    return adaptTeam(data);
  },

  replaceMember: async (teamId, oldEmployeeId, newEmployeeId) => {
    const { data } = await api.post(
      `/team-matching/teams/${teamId}/members/${oldEmployeeId}/replace-with/${newEmployeeId}`
    );
    return adaptTeam(data);
  },

  removeMember: async (teamId, employeeId) => {
    const { data } = await api.delete(`/team-matching/teams/${teamId}/members/${employeeId}`);
    return adaptTeam(data);
  },

  addMember: async (teamId, employeeId) => {
    const { data } = await api.post(`/team-matching/teams/${teamId}/members/${employeeId}`);
    return adaptTeam(data);
  },

  // The Phase 12 approval gate -- APPROVE turns this proposal into
  // real Assignment + EmployeeProject rows; REJECT just closes it out.
  decideTeam: async (teamId, action, employeeIds = null) => {
    const { data } = await api.post(`/team-matching/teams/${teamId}/decision`, {
      action,
      employee_ids: employeeIds,
    });
    return adaptTeam(data);
  },
};
