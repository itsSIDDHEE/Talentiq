import api from './api';

export const skillGapService = {
  getProjectGaps: async (projectId) => {
    const { data } = await api.get(`/skill-gaps/projects/${projectId}`);
    return data;
  },

  getTeamGaps: async (teamId) => {
    const { data } = await api.get(`/skill-gaps/teams/${teamId}`);
    return data;
  },

  getOrganizationGaps: async () => {
    const { data } = await api.get('/skill-gaps/organization');
    return data.map((g) => ({
      skill: g.skill_name,
      skillId: g.skill_id,
      urgency: g.concentration_risk ? 'High' : g.insufficient_coverage ? 'Medium' : 'Low',
      impactedProjects: g.projects_requiring,
      employeesNeeded: Math.max(g.projects_requiring - g.employees_qualified, 0),
      employeesQualified: g.employees_qualified,
      employeesWithSkillAnyLevel: g.employees_with_skill_any_level,
      maxRequiredLevel: g.max_required_level,
      coverageRatio: g.coverage_ratio,
      insufficientCoverage: g.insufficient_coverage,
      concentrationRisk: g.concentration_risk,
    }));
  },
};
