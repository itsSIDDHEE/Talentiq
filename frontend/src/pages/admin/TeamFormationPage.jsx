import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Check, Plus, RefreshCw, Trash2, Users, UsersRound, X } from 'lucide-react';
import Badge from '../../components/common/Badge';
import Button from '../../components/common/Button';
import Card from '../../components/common/Card';
import PageHeader from '../../components/layout/PageHeader';
import { projectService } from '../../services/projectService';
import { skillGapService } from '../../services/skillGapService';
import { teamService } from '../../services/teamService';
import { employeeService } from '../../services/employeeService';

const errorMessage = (error, fallback) => {
  const detail = error?.response?.data?.detail;
  return typeof detail === 'string' ? detail : fallback;
};

const severityVariant = (severity) => {
  const value = (severity || '').toUpperCase();
  if (value === 'HIGH') return 'danger';
  if (value === 'MEDIUM') return 'warning';
  if (value === 'NONE') return 'success';
  return 'info';
};

const TeamFormationPage = () => {
  const [projects, setProjects] = useState([]);
  const [projectsLoading, setProjectsLoading] = useState(true);
  const [projectsError, setProjectsError] = useState(false);
  const [projectsReload, setProjectsReload] = useState(0);
  const [selectedProject, setSelectedProject] = useState(null);
  const [teamSize, setTeamSize] = useState('');
  const [proposal, setProposal] = useState(null);
  const [forming, setForming] = useState(false);
  const [formError, setFormError] = useState('');
  const [gaps, setGaps] = useState([]);
  const [gapsLoading, setGapsLoading] = useState(false);
  const [gapsError, setGapsError] = useState('');
  const [gapsReload, setGapsReload] = useState(0);
  const [employees, setEmployees] = useState([]);
  const [employeesLoading, setEmployeesLoading] = useState(false);
  const [employeesError, setEmployeesError] = useState('');
  const [memberToAdd, setMemberToAdd] = useState('');
  const [replacementIds, setReplacementIds] = useState({});
  const [teamAction, setTeamAction] = useState('');
  const [teamActionError, setTeamActionError] = useState('');
  const [teamActionMessage, setTeamActionMessage] = useState('');

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
    if (!proposal?.teamId) return undefined;
    let cancelled = false;

    const loadTeamGaps = async () => {
      setGapsLoading(true);
      setGapsError('');
      try {
        const data = await skillGapService.getTeamGaps(proposal.teamId);
        if (!cancelled) setGaps(data);
      } catch (error) {
        if (!cancelled) setGapsError(errorMessage(error, 'Team skill gaps could not be loaded.'));
      } finally {
        if (!cancelled) setGapsLoading(false);
      }
    };

    loadTeamGaps();
    return () => {
      cancelled = true;
    };
  }, [proposal?.teamId, gapsReload]);

  useEffect(() => {
    if (!proposal?.teamId) return undefined;
    let cancelled = false;

    const loadEmployees = async () => {
      setEmployeesLoading(true);
      setEmployeesError('');
      try {
        const data = await employeeService.getEmployees();
        if (!cancelled) setEmployees(data);
      } catch (error) {
        if (!cancelled) setEmployeesError(errorMessage(error, 'The employee list could not be loaded.'));
      } finally {
        if (!cancelled) setEmployeesLoading(false);
      }
    };

    loadEmployees();
    return () => { cancelled = true; };
  }, [proposal?.teamId]);

  const chooseProject = async (project) => {
    setSelectedProject(project);
    setTeamSize(project.teamSize > 0 ? String(project.teamSize) : '');
    setProposal(null);
    setGaps([]);
    setFormError('');
    setTeamActionError('');
    setTeamActionMessage('');

    try {
      const existing = await teamService.getApprovedTeam(project.id);
      setProposal(existing);
    } catch (e) {
      // no approved team, perfectly normal
    }
  };

  const formTeam = async (event) => {
    event.preventDefault();
    const requestedSize = Number(teamSize);
    if (!selectedProject || !Number.isInteger(requestedSize) || requestedSize < 1) {
      setFormError('Enter a team size of at least one.');
      return;
    }

    setFormError('');
    setGapsError('');
    setProposal(null);
    setGaps([]);
    setForming(true);
    try {
      const data = await teamService.formTeam(selectedProject.id, requestedSize);
      setProposal(data);
    } catch (error) {
      setFormError(errorMessage(error, 'The team proposal could not be created.'));
    } finally {
      setForming(false);
    }
  };

  const startOver = () => {
    setSelectedProject(null);
    setTeamSize('');
    setProposal(null);
    setGaps([]);
    setFormError('');
    setGapsError('');
    setTeamActionError('');
    setTeamActionMessage('');
  };

  const currentTeamSize = proposal?.members?.length ?? 0;
  const requiredTeamSize = selectedProject?.teamSize > 0 ? selectedProject.teamSize : Number(teamSize) || null;
  const teamAtCapacity = requiredTeamSize !== null && currentTeamSize >= requiredTeamSize;
  const currentTeamStatus = (proposal?.status || '').toUpperCase();
  const canEditProposal = proposal && currentTeamStatus !== 'REJECTED';
  const availableEmployees = employees.filter((employee) =>
    !proposal?.members.some((member) => member.employeeId === employee.employeeDbId)
  );

  const updateTeamProposal = async (action, operation) => {
    setTeamAction(action);
    setTeamActionError('');
    setTeamActionMessage('');
    try {
      const updated = await operation();
      setProposal(updated);
      setGaps([]);
      setGapsReload((count) => count + 1);
      setReplacementIds({});
      setTeamActionMessage('Team proposal updated.');
    } catch (error) {
      setTeamActionError(errorMessage(error, 'The team proposal could not be updated.'));
    } finally {
      setTeamAction('');
    }
  };

  const addTeamMember = async (event) => {
    event.preventDefault();
    if (!memberToAdd || !proposal) return;
    await updateTeamProposal('add', () => teamService.addMember(proposal.teamId, Number(memberToAdd)));
    setMemberToAdd('');
  };

  const replaceTeamMember = async (employeeId) => {
    const newEmployeeId = replacementIds[employeeId];
    if (!newEmployeeId || !proposal) return;
    await updateTeamProposal(`replace-${employeeId}`, () => teamService.replaceMember(
      proposal.teamId,
      employeeId,
      Number(newEmployeeId),
    ));
  };

  const removeTeamMember = async (employeeId) => {
    if (!proposal) return;
    await updateTeamProposal(`remove-${employeeId}`, () => teamService.removeMember(proposal.teamId, employeeId));
  };

  const decideTeam = async (decision) => {
    if (!proposal) return;
    const employeeIds = decision === 'APPROVE' ? proposal.members.map((member) => member.employeeId) : null;
    await updateTeamProposal(decision.toLowerCase(), () => teamService.decideTeam(proposal.teamId, decision, employeeIds));
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Team Formation"
        subtitle="Form a proposed team and review its returned skill coverage and gaps."
        actions={selectedProject && (
          <Button variant="outline" icon={ArrowLeft} onClick={startOver}>Choose another project</Button>
        )}
      />

      {!selectedProject ? (
        <Card title="Select a project" subtitle="Choose the project to form a proposed team for.">
          {projectsLoading ? (
            <div className="space-y-4" aria-live="polite" aria-busy="true">
              {[0, 1, 2].map((item) => (
                <div key={item} className="animate-pulse border-b border-[#E8EFEA] pb-4 last:border-0">
                  <div className="h-4 w-48 rounded bg-[#E8EFEA]" />
                  <div className="mt-2 h-3 w-32 rounded bg-[#F1F5F2]" />
                </div>
              ))}
              <p className="text-sm text-[#687A73]">Loading projects...</p>
            </div>
          ) : projectsError ? (
            <div role="alert" className="py-8 text-center">
              <p className="text-sm font-semibold text-[#10221E]">Projects could not be loaded</p>
              <Button className="mt-4" variant="outline" icon={RefreshCw} onClick={() => setProjectsReload((count) => count + 1)}>Retry</Button>
            </div>
          ) : projects.length === 0 ? (
            <div className="py-8 text-center">
              <UsersRound className="mx-auto h-8 w-8 text-[#9BB0A6]" />
              <p className="mt-3 text-sm font-semibold text-[#10221E]">No projects available</p>
              <p className="mt-1 text-sm text-[#687A73]">Create a project before forming a team.</p>
            </div>
          ) : (
            <div className="-my-2 divide-y divide-[#E8EFEA]">
              {projects.map((project) => (
                <button
                  key={project.id}
                  type="button"
                  onClick={() => chooseProject(project)}
                  className="group flex w-full items-center justify-between gap-4 py-4 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-[#13816D]"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-[#10221E] group-hover:text-[#075E4F]">{project.name}</span>
                    <span className="mt-1 block truncate text-xs text-[#687A73]">{project.department} · {project.status}</span>
                  </span>
                  <span className="shrink-0 text-sm font-medium text-[#075E4F]">
                    {project.teamSize > 0 ? `Required team size: ${project.teamSize}` : 'Set team size'}
                  </span>
                </button>
              ))}
            </div>
          )}
        </Card>
      ) : (
        <>
          {!proposal && (
            <Card title={selectedProject.name} subtitle={selectedProject.department}>
              <form onSubmit={formTeam} className="flex flex-col gap-4 sm:flex-row sm:items-end">
                <label className="w-full max-w-xs text-sm font-medium text-[#42544E]">
                  Required team size
                  <input
                    className="mt-1 w-full rounded-md border border-[#DCE5DF] bg-white px-3 py-2 text-sm text-[#10221E] outline-none focus:border-[#13816D] focus:ring-2 focus:ring-[#DFF2EA]"
                    type="number"
                    min="1"
                    max={selectedProject.teamSize > 0 ? selectedProject.teamSize : undefined}
                    step="1"
                    required
                    value={teamSize}
                    onChange={(event) => setTeamSize(event.target.value)}
                    aria-describedby="team-size-hint"
                  />
                  <span id="team-size-hint" className="mt-1 block text-xs font-normal text-[#687A73]">
                    {selectedProject.teamSize > 0 ? 'Pre-filled from this project’s required team size.' : 'No team size is set on this project.'}
                  </span>
                </label>
                <Button type="submit" icon={UsersRound} loading={forming}>Form  Team</Button>
              </form>
              {formError && <p role="alert" className="mt-4 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{formError}</p>}
            </Card>
          )}

          {proposal && (
            <>
              <Card
                title={currentTeamStatus === 'APPROVED' ? "Current Staffed Team" : "Proposed team"}
                subtitle={currentTeamStatus === 'APPROVED' ? `${selectedProject.name} · Approved Team` : `${selectedProject.name} · Proposal #${proposal.teamId}`}
                action={<Badge variant={currentTeamStatus === 'APPROVED' ? 'success' : 'primary'}>{proposal.status}</Badge>}
              >
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <div className="rounded-lg border border-[#DCE5DF] bg-[#FAFBF8] p-4">
                    <p className="text-xs font-medium text-[#687A73]">Required team size</p>
                    <p className="mt-1 text-2xl font-bold tabular-nums text-[#10221E]">{requiredTeamSize ?? 'Not set'}</p>
                  </div>
                  <div className="rounded-lg border border-[#DCE5DF] bg-[#FAFBF8] p-4">
                    <p className="text-xs font-medium text-[#687A73]">Current team size</p>
                    <p className="mt-1 text-2xl font-bold tabular-nums text-[#10221E]">{currentTeamSize}</p>
                  </div>
                  {proposal.skillCoverage !== undefined && proposal.skillCoverage !== null && (
                    <div className="rounded-lg border border-[#DCE5DF] bg-[#FAFBF8] p-4">
                      <p className="text-xs font-medium text-[#687A73]">Skill coverage</p>
                      <p className="mt-1 text-2xl font-bold tabular-nums text-[#075E4F]">{proposal.skillCoverage}%</p>
                      <div className="mt-3 h-2 overflow-hidden rounded-full bg-[#E8EFEA]" aria-hidden="true">
                        <div className="h-full rounded-full bg-[#13816D]" style={{ width: `${proposal.skillCoverage}%` }} />
                      </div>
                    </div>
                  )}
                </div>
                {proposal.availabilityDataMissing?.length > 0 && (
                  <div role="status" className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2">
                    <p className="text-sm font-semibold text-amber-900">Some employees were excluded from team formation</p>
                    <p className="mt-1 text-xs text-amber-800">
                      Availability data is missing or invalid for: {proposal.availabilityDataMissing.join(', ')}.
                    </p>
                  </div>
                )}
                {selectedProject.requiredSkills?.length > 0 && (
                  <div className="mt-4 border-t border-[#E8EFEA] pt-4">
                    <p className="text-xs font-semibold text-[#42544E]">Uncovered required skills</p>
                    {proposal.remainingGaps?.length > 0 ? (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {proposal.remainingGaps.map((skill) => <Badge key={skill} variant="warning">{skill}</Badge>)}
                      </div>
                    ) : (
                      <p className="mt-2 text-xs text-[#687A73]">All required project skills are covered.</p>
                    )}
                  </div>
                )}
                {canEditProposal && currentTeamStatus === 'RECOMMENDED' && (
                  <div className="mt-5 flex flex-col gap-2 border-t border-[#E8EFEA] pt-4 sm:flex-row sm:justify-end">
                    <Button size="sm" icon={Check} loading={teamAction === 'approve'} disabled={Boolean(teamAction)} onClick={() => decideTeam('APPROVE')}>
                      Approve team
                    </Button>
                    <Button size="sm" variant="danger" icon={X} loading={teamAction === 'reject'} disabled={Boolean(teamAction)} onClick={() => decideTeam('REJECT')}>
                      Reject team
                    </Button>
                  </div>
                )}
                <Button className="mt-5" variant="outline" icon={RefreshCw} onClick={() => { setProposal(null); setGaps([]); }}>Form another team</Button>
              </Card>

              <Card title={currentTeamStatus === 'APPROVED' ? "Current Staffed Members" : "Proposed members"} subtitle={`${currentTeamSize} member${currentTeamSize === 1 ? '' : 's'}`}>
                {teamActionError && <p role="alert" className="mb-4 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{teamActionError}</p>}
                {teamActionMessage && <p role="status" className="mb-4 text-sm text-[#075E4F]">{teamActionMessage}</p>}
                {currentTeamSize === 0 ? (
                  <div className="py-8 text-center">
                    <Users className="mx-auto h-8 w-8 text-[#9BB0A6]" />
                    <p className="mt-3 text-sm text-[#687A73]">The proposal contains no team members.</p>
                  </div>
                ) : (
                  <ul className="divide-y divide-[#E8EFEA]">
                    {proposal.members.map((member) => (
                      <li key={member.employeeId} className="py-4 first:pt-0 last:pb-0">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-[#10221E]">{member.name}</p>
                            {member.role && <p className="mt-1 text-xs text-[#687A73]">{member.role}</p>}
                            {Array.isArray(member.matchedSkills) && member.matchedSkills.length > 0 && (
                              <div className="mt-2 flex flex-wrap gap-1.5">
                                {member.matchedSkills.map((skill, index) => <Badge key={`${member.employeeId}-${skill}-${index}`} variant="success">{skill}</Badge>)}
                              </div>
                            )}
                          </div>
                          {member.matchScore !== undefined && member.matchScore !== null && (
                            <span className="shrink-0 text-xs font-semibold tabular-nums text-[#075E4F]">{member.matchScore}% match</span>
                          )}
                        </div>
                        {canEditProposal && (
                          <div className="mt-3 flex flex-col gap-2 border-t border-[#E8EFEA] pt-3 sm:flex-row sm:items-end sm:justify-end">
                            <label className="block w-full text-xs font-medium text-[#687A73] sm:max-w-xs">
                              Replace with
                              <select
                                className="mt-1 w-full rounded-md border border-[#DCE5DF] bg-white px-3 py-2 text-sm text-[#10221E] outline-none focus:border-[#13816D] focus:ring-2 focus:ring-[#DFF2EA]"
                                value={replacementIds[member.employeeId] || ''}
                                onChange={(event) => setReplacementIds((current) => ({ ...current, [member.employeeId]: event.target.value }))}
                                disabled={employeesLoading || Boolean(employeesError) || availableEmployees.length === 0 || Boolean(teamAction)}
                              >
                                <option value="">{employeesLoading ? 'Loading employees...' : availableEmployees.length ? 'Select an employee' : 'No replacement available'}</option>
                                {availableEmployees.map((employee) => (
                                  <option key={employee.employeeDbId} value={employee.employeeDbId}>
                                    {employee.name}{employee.department ? ` · ${employee.department}` : ''}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <Button
                              variant="outline"
                              size="sm"
                              icon={RefreshCw}
                              loading={teamAction === `replace-${member.employeeId}`}
                              disabled={!replacementIds[member.employeeId] || Boolean(teamAction) || Boolean(employeesError)}
                              onClick={() => replaceTeamMember(member.employeeId)}
                            >
                              Replace
                            </Button>
                            <Button
                              variant="danger"
                              size="sm"
                              icon={Trash2}
                              loading={teamAction === `remove-${member.employeeId}`}
                              disabled={Boolean(teamAction)}
                              onClick={() => removeTeamMember(member.employeeId)}
                            >
                              Remove
                            </Button>
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                )}

                {canEditProposal && (
                  <div className="mt-5 border-t border-[#E8EFEA] pt-5">
                    <form onSubmit={addTeamMember} className="flex flex-col gap-3 sm:flex-row sm:items-end">
                      <label className="block w-full text-xs font-medium text-[#42544E] sm:max-w-md">
                        Add an employee
                        <select
                          className="mt-1 w-full rounded-md border border-[#DCE5DF] bg-white px-3 py-2 text-sm text-[#10221E] outline-none focus:border-[#13816D] focus:ring-2 focus:ring-[#DFF2EA]"
                          value={memberToAdd}
                          onChange={(event) => setMemberToAdd(event.target.value)}
                          disabled={employeesLoading || Boolean(employeesError) || availableEmployees.length === 0 || Boolean(teamAction)}
                          required
                        >
                          <option value="">{employeesLoading ? 'Loading employees...' : availableEmployees.length ? 'Select an employee' : 'No additional employees available'}</option>
                          {availableEmployees.map((employee) => (
                            <option key={employee.employeeDbId} value={employee.employeeDbId}>
                              {employee.name}{employee.department ? ` · ${employee.department}` : ''}
                            </option>
                          ))}
                        </select>
                      </label>
                      <Button type="submit" icon={Plus} loading={teamAction === 'add'} disabled={!memberToAdd || teamAtCapacity || Boolean(teamAction) || Boolean(employeesError)}>
                        Add member
                      </Button>
                    </form>
                    {employeesError && <p role="alert" className="mt-3 text-sm text-rose-700">{employeesError}</p>}
                  </div>
                )}
              </Card>

              <Card
                title="Team skill gaps"
                subtitle="Gap analysis for the proposed team"
                action={(
                  <Link
                    to={`/admin/skill-gaps?view=team&team_id=${proposal.teamId}&project_id=${proposal.projectId}`}
                    className="text-xs font-semibold text-[#075E4F] hover:text-[#063C32]"
                  >
                    Full analysis
                  </Link>
                )}
              >
                {gapsLoading ? (
                  <div className="space-y-3" aria-live="polite" aria-busy="true">
                    {[0, 1].map((item) => <div key={item} className="h-12 animate-pulse rounded-md bg-[#F1F5F2]" />)}
                    <p className="text-sm text-[#687A73]">Loading skill gaps...</p>
                  </div>
                ) : gapsError ? (
                  <div role="alert" className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-sm text-rose-700">{gapsError}</p>
                    <Button variant="outline" size="sm" icon={RefreshCw} onClick={() => setGapsReload((count) => count + 1)}>Retry gaps</Button>
                  </div>
                ) : gaps.length === 0 ? (
                  <div className="py-7 text-center">
                    <p className="text-sm font-semibold text-[#10221E]">No skill gaps returned</p>
                    <p className="mt-1 text-xs text-[#687A73]">The team gap endpoint returned no gap records.</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[540px] text-left">
                      <thead>
                        <tr className="border-b border-[#E8EFEA] text-[11px] font-semibold uppercase text-[#687A73]">
                          <th className="pb-3 pr-4">Skill</th>
                          <th className="pb-3 pr-4">Current level</th>
                          <th className="pb-3 pr-4">Required level</th>
                          <th className="pb-3 pr-4">Gap</th>
                          <th className="pb-3">Severity</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#E8EFEA]">
                        {gaps.map((gap) => (
                          <tr key={gap.skill_id}>
                            <td className="py-3 pr-4 text-sm font-medium text-[#10221E]">{gap.skill_name}</td>
                            <td className="py-3 pr-4 text-sm tabular-nums text-[#42544E]">{gap.current_level}</td>
                            <td className="py-3 pr-4 text-sm tabular-nums text-[#42544E]">{gap.required_level}</td>
                            <td className="py-3 pr-4 text-sm tabular-nums text-[#42544E]">{gap.gap}</td>
                            <td className="py-3"><Badge variant={severityVariant(gap.severity)}>{gap.severity}</Badge></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>
            </>
          )}
        </>
      )}
    </div>
  );
};

export default TeamFormationPage;