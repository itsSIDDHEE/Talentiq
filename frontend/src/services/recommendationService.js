import api from './api';

function adaptRecommendation(r) {
  return {
    employeeId: r.employee_id,
    name: r.employee_name,
    department: r.department,
    role: r.job_title,
    matchScore: r.score,
    rank: r.rank,
    matchedSkills: r.matched_skills,
    missingSkills: r.missing_skills,
    experienceYears: r.experience_years,
    semanticSimilarity: r.semantic_similarity,
    currentWorkload: r.current_utilization_percentage,
    availability: r.available_capacity_percentage,
    reason: r.reason,
    contributingFactors: r.contributing_factors,
  };
}

export const recommendationService = {
  // Runs the scoring engine fresh and persists a new ranked batch.
  generateRecommendations: async (projectId, topN = 10) => {
    const { data } = await api.post(
      `/recommendations/projects/${projectId}/generate`,
      null,
      { params: { top_n: topN } }
    );
    return data.map(adaptRecommendation);
  },

  // Reads back the most recently generated batch without recomputing.
  getRecommendations: async (projectId) => {
    const { data } = await api.get(`/recommendations/projects/${projectId}`);
    return data.map(adaptRecommendation);
  },
};
