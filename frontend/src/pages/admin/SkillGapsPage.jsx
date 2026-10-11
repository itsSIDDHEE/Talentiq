import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { RefreshCw, TrendingDown } from 'lucide-react';
import Badge from '../../components/common/Badge';
import Button from '../../components/common/Button';
import Card from '../../components/common/Card';
import PageHeader from '../../components/layout/PageHeader';
import { projectService } from '../../services/projectService';
import { skillGapService } from '../../services/skillGapService';

const tabs = [
  { id: 'organization', label: 'Organization' },
  { id: 'project', label: 'Project' },
  { id: 'team', label: 'Team' },
];

const errorMessage = (error, fallback) => {
  const detail = error?.response?.data?.detail;
  return typeof detail === 'string' ? detail : fallback;
};

const severityVariant = (severity) => {
  const value = (severity || '').toUpperCase();
  if (value === 'HIGH') return 'danger';
  if (value === 'MEDIUM') return 'warning';
  if (value === 'LOW') return 'info';
  if (value === 'NONE') return 'success';
  return 'default';
};

const SkillGapTable = ({ gaps, project }) => (
  <div className="overflow-x-auto">
    <table className="w-full min-w-[680px] text-left">
      <thead>
        <tr className="border-b border-[#E8EFEA] text-[11px] font-semibold uppercase text-[#687A73]">
          <th className="pb-3 pr-4">Required skill</th>
          <th className="pb-3 pr-4">Current proficiency</th>
          <th className="pb-3 pr-4">Required proficiency</th>
          <th className="pb-3 pr-4">Gap</th>
          <th className="pb-3 pr-4">Severity</th>
          <th className="pb-3">Importance</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-[#E8EFEA]">
        {gaps.map((gap) => {
          const requirement = project?.requiredSkills?.find((skill) => skill.skillId === gap.skill_id);
          return (
            <tr key={gap.skill_id}>
              <td className="py-3 pr-4 text-sm font-medium text-[#10221E]">{gap.skill_name}</td>
              <td className="py-3 pr-4 text-sm tabular-nums text-[#42544E]">{gap.current_level}</td>
              <td className="py-3 pr-4 text-sm tabular-nums text-[#42544E]">{gap.required_level}</td>
              <td className="py-3 pr-4 text-sm tabular-nums text-[#42544E]">{gap.gap}</td>
              <td className="py-3 pr-4"><Badge variant={severityVariant(gap.severity)}>{gap.severity}</Badge></td>
              <td className="py-3 text-sm text-[#42544E]">{requirement?.importance || 'Not provided'}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  </div>
);

const OrganizationGapTable = ({ gaps }) => (
  <div className="overflow-x-auto">
    <table className="w-full min-w-[660px] text-left">
      <thead>
        <tr className="border-b border-[#E8EFEA] text-[11px] font-semibold uppercase text-[#687A73]">
          <th className="pb-3 pr-4">Required skill</th>
          <th className="pb-3 pr-4">Required proficiency</th>
          <th className="pb-3 pr-4">Current coverage (qualified)</th>
          <th className="pb-3 pr-4">Projects requiring</th>
          <th className="pb-3 pr-4">Holders at any level</th>
          <th className="pb-3 pr-4">Coverage ratio</th>
          <th className="pb-3">Coverage</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-[#E8EFEA]">
        {gaps.map((gap) => (
          <tr key={gap.skillId}>
            <td className="py-3 pr-4 text-sm font-medium text-[#10221E]">{gap.skill}</td>
            <td className="py-3 pr-4 text-sm tabular-nums text-[#42544E]">{gap.maxRequiredLevel}</td>
            <td className="py-3 pr-4 text-sm tabular-nums text-[#42544E]">{gap.employeesQualified}</td>
            <td className="py-3 pr-4 text-sm tabular-nums text-[#42544E]">{gap.impactedProjects}</td>
            <td className="py-3 pr-4 text-sm tabular-nums text-[#42544E]">{gap.employeesWithSkillAnyLevel}</td>
            <td className="py-3 pr-4 text-sm tabular-nums text-[#42544E]">{gap.coverageRatio ?? 'Not provided'}</td>
            <td className="py-3"><Badge variant={gap.insufficientCoverage ? 'warning' : 'success'}>{gap.insufficientCoverage ? 'Insufficient' : 'Sufficient'}</Badge></td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

const SkillGapsPage = () => {
  const [searchParams] = useSearchParams();
  const initialTeamId = searchParams.get('team_id') || '';
  const initialProjectId = searchParams.get('project_id') || '';
  const initialView = searchParams.get('view') === 'team' ? 'team' : 'organization';

  const [view, setView] = useState(initialView);
  const [projects, setProjects] = useState([]);
  const [projectsLoading, setProjectsLoading] = useState(false);
  const [projectsError, setProjectsError] = useState(false);
  const [projectsReload, setProjectsReload] = useState(0);
  const [projectId, setProjectId] = useState(initialProjectId);
  const [teamIdInput, setTeamIdInput] = useState(initialTeamId);
  const [activeTeamId, setActiveTeamId] = useState(initialTeamId);
  const [activeTeamProjectId, setActiveTeamProjectId] = useState(initialProjectId);
  const [gaps, setGaps] = useState([]);
  const [project, setProject] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const loadProjects = async () => {
      setProjectsLoading(true);
      setProjectsError(false);
      try {
        const data = await projectService.getProjects();
        if (!cancelled) setProjects(data);
      } catch {
        if (!cancelled) setProjectsError(true);
      } finally {
        if (!cancelled) setProjectsLoading(false);
      }
    };

    loadProjects();
    return () => {
      cancelled = true;
    };
  }, [projectsReload]);

  useEffect(() => {
    if (view === 'project' && !projectId) {
      setGaps([]);
      setProject(null);
      setError('');
      setLoading(false);
      return undefined;
    }
    if (view === 'team' && !activeTeamId) {
      setGaps([]);
      setProject(null);
      setError('');
      setLoading(false);
      return undefined;
    }

    let cancelled = false;
    const loadGaps = async () => {
      setLoading(true);
      setError('');
      setProject(null);
      try {
        if (view === 'organization') {
          const data = await skillGapService.getOrganizationGaps();
          if (!cancelled) setGaps(data);
        } else if (view === 'project') {
          const [data, projectData] = await Promise.all([
            skillGapService.getProjectGaps(projectId),
            projectService.getProjectById(projectId),
          ]);
          if (!cancelled) {
            setGaps(data);
            setProject(projectData);
          }
        } else {
          const gapPromise = skillGapService.getTeamGaps(activeTeamId);
          const projectPromise = activeTeamProjectId
            ? projectService.getProjectById(activeTeamProjectId).catch(() => null)
            : Promise.resolve(null);
          const [data, projectData] = await Promise.all([gapPromise, projectPromise]);
          if (!cancelled) {
            setGaps(data);
            setProject(projectData);
          }
        }
      } catch (requestError) {
        if (!cancelled) setError(errorMessage(requestError, 'Skill gaps could not be loaded.'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadGaps();
    return () => {
      cancelled = true;
    };
  }, [view, projectId, activeTeamId, activeTeamProjectId, reload]);

  const submitTeamId = (event) => {
    event.preventDefault();
    const value = teamIdInput.trim();
    if (value) setActiveTeamId(value);
  };

  const selectView = (nextView) => {
    setView(nextView);
    setError('');
    setGaps([]);
  };

  const isSelectionMissing = (view === 'project' && !projectId) || (view === 'team' && !activeTeamId);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Skill Gaps"
        subtitle="Review skill coverage and proficiency gaps across projects, teams, and the organization."
      />

      <div role="tablist" aria-label="Skill gap scope" className="inline-flex max-w-full overflow-x-auto rounded-lg border border-[#DCE5DF] bg-white p-1">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={view === tab.id}
            onClick={() => selectView(tab.id)}
            className={`whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium transition-colors ${view === tab.id ? 'bg-[#063C32] text-white' : 'text-[#42544E] hover:bg-[#F1F5F2]'}`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {view === 'project' && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="w-full max-w-md text-sm font-medium text-[#42544E]">
            Project
            <select
              className="mt-1 w-full rounded-md border border-[#DCE5DF] bg-white px-3 py-2 text-sm text-[#10221E] outline-none focus:border-[#13816D] focus:ring-2 focus:ring-[#DFF2EA]"
              value={projectId}
              onChange={(event) => setProjectId(event.target.value)}
              disabled={projectsLoading || projectsError}
            >
              <option value="">
                {projectsLoading ? 'Loading projects...' : projectsError ? 'Projects unavailable' : projects.length === 0 ? 'No projects available' : 'Select a project'}
              </option>
              {projects.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.department}</option>)}
            </select>
          </label>
          {projectsError && <Button variant="outline" icon={RefreshCw} onClick={() => setProjectsReload((count) => count + 1)}>Retry projects</Button>}
        </div>
      )}

      {view === 'team' && (
        <div className="space-y-3">
          <form onSubmit={submitTeamId} className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <label className="w-full max-w-xs text-sm font-medium text-[#42544E]">
              Team ID
              <input
                className="mt-1 w-full rounded-md border border-[#DCE5DF] bg-white px-3 py-2 text-sm text-[#10221E] outline-none focus:border-[#13816D] focus:ring-2 focus:ring-[#DFF2EA]"
                type="number"
                min="1"
                value={teamIdInput}
                onChange={(event) => setTeamIdInput(event.target.value)}
                required
              />
            </label>
            <label className="w-full max-w-sm text-sm font-medium text-[#42544E]">
              Project
              <select
                className="mt-1 w-full rounded-md border border-[#DCE5DF] bg-white px-3 py-2 text-sm text-[#10221E] outline-none focus:border-[#13816D] focus:ring-2 focus:ring-[#DFF2EA]"
                value={activeTeamProjectId}
                onChange={(event) => setActiveTeamProjectId(event.target.value)}
                disabled={projectsLoading || projectsError}
              >
                <option value="">No project selected</option>
                {projects.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </label>
            <Button type="submit" icon={TrendingDown}>Load team gaps</Button>
          </form>
          {projectsError && <p className="text-xs text-amber-700">Project importance details are unavailable until the project list loads; team gap data can still be loaded.</p>}
        </div>
      )}

      {view === 'organization' && (
        <Card title="Organization skill coverage" subtitle="Coverage and proficiency fields returned by the organization endpoint.">
          {loading ? (
            <div className="space-y-3" aria-live="polite" aria-busy="true">
              {[0, 1, 2].map((item) => <div key={item} className="h-12 animate-pulse rounded-md bg-[#F1F5F2]" />)}
              <p className="text-sm text-[#687A73]">Loading organization skill gaps...</p>
            </div>
          ) : error ? (
            <div role="alert" className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-rose-700">{error}</p>
              <Button variant="outline" size="sm" icon={RefreshCw} onClick={() => setReload((count) => count + 1)}>Retry</Button>
            </div>
          ) : gaps.length === 0 ? (
            <div className="py-8 text-center">
              <TrendingDown className="mx-auto h-8 w-8 text-[#9BB0A6]" />
              <p className="mt-3 text-sm font-semibold text-[#10221E]">No organization skill gaps returned</p>
            </div>
          ) : <OrganizationGapTable gaps={gaps} />}
        </Card>
      )}

      {(view === 'project' || view === 'team') && (
        <Card
          title={view === 'project' ? 'Project skill gaps' : 'Team skill gaps'}
          subtitle={project?.name ? `${project.name} · ${project.department}` : view === 'team' && activeTeamId ? `Team ${activeTeamId}` : undefined}
        >
          {isSelectionMissing ? (
            <div className="py-8 text-center">
              <p className="text-sm font-semibold text-[#10221E]">{view === 'project' ? 'Select a project' : 'Enter a team ID'}</p>
            </div>
          ) : loading ? (
            <div className="space-y-3" aria-live="polite" aria-busy="true">
              {[0, 1].map((item) => <div key={item} className="h-12 animate-pulse rounded-md bg-[#F1F5F2]" />)}
              <p className="text-sm text-[#687A73]">Loading {view} skill gaps...</p>
            </div>
          ) : error ? (
            <div role="alert" className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-rose-700">{error}</p>
              <Button variant="outline" size="sm" icon={RefreshCw} onClick={() => setReload((count) => count + 1)}>Retry</Button>
            </div>
          ) : gaps.length === 0 ? (
            <div className="py-8 text-center">
              <p className="text-sm font-semibold text-[#10221E]">No skill gaps returned</p>
            </div>
          ) : <SkillGapTable gaps={gaps} project={project} />}
        </Card>
      )}
    </div>
  );
};

export default SkillGapsPage;