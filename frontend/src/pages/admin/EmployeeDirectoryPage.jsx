import React, { useEffect, useState } from 'react';
import { Briefcase, Eye, RefreshCw, Search, X } from 'lucide-react';
import Badge from '../../components/common/Badge';
import Button from '../../components/common/Button';
import Card from '../../components/common/Card';
import PageHeader from '../../components/layout/PageHeader';
import { employeeService } from '../../services/employeeService';

const errorMessage = (error, fallback) => {
  const detail = error?.response?.data?.detail;
  return typeof detail === 'string' ? detail : fallback;
};

const formatStatus = (status) => (status || 'Unknown').replaceAll('_', ' ');

const statusVariant = (status) => {
  switch ((status || '').toUpperCase()) {
    case 'AVAILABLE': return 'success';
    case 'PARTIALLY_AVAILABLE': return 'warning';
    case 'UNAVAILABLE': return 'danger';
    default: return 'default';
  }
};

const formatDate = (value) => {
  if (!value) return 'Not set';
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
};

const EmployeeDetails = ({ employeeId, onClose }) => {
  const [profile, setProfile] = useState(null);
  const [projects, setProjects] = useState([]);
  const [profileLoading, setProfileLoading] = useState(true);
  const [projectsLoading, setProjectsLoading] = useState(true);
  const [profileError, setProfileError] = useState('');
  const [projectsError, setProjectsError] = useState('');
  const [reloadCount, setReloadCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setProfileLoading(true);
    setProjectsLoading(true);
    setProfileError('');
    setProjectsError('');

    Promise.allSettled([
      employeeService.getEmployeeById(employeeId),
      employeeService.getEmployeeProjectHistory(employeeId),
    ]).then(([profileResult, projectsResult]) => {
      if (cancelled) return;

      if (profileResult.status === 'fulfilled') setProfile(profileResult.value);
      else setProfileError(errorMessage(profileResult.reason, 'Employee details could not be loaded.'));

      if (projectsResult.status === 'fulfilled') setProjects(projectsResult.value);
      else setProjectsError(errorMessage(projectsResult.reason, 'Project history could not be loaded.'));
    }).finally(() => {
      if (!cancelled) {
        setProfileLoading(false);
        setProjectsLoading(false);
      }
    });

    return () => { cancelled = true; };
  }, [employeeId, reloadCount]);

  useEffect(() => {
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="presentation">
      <button type="button" aria-label="Close employee details" onClick={onClose} className="absolute inset-0 bg-[#10221E]/45" />
      <aside role="dialog" aria-modal="true" aria-labelledby="employee-details-title" className="relative flex h-full w-full max-w-2xl flex-col overflow-hidden border-l border-[#DCE5DF] bg-[#F9FBF8] shadow-2xl">
        <header className="flex items-start justify-between gap-4 border-b border-[#DCE5DF] bg-white px-5 py-4 sm:px-7">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase text-[#687A73]">Employee details</p>
            <h2 id="employee-details-title" className="mt-1 truncate text-lg font-bold text-[#10221E]">{profile?.name || 'Employee profile'}</h2>
            {profile && <p className="mt-1 text-xs text-[#687A73]">{profile.id}</p>}
          </div>
          <button type="button" aria-label="Close" onClick={onClose} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-[#42544E] hover:bg-[#F1F5F2] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#13816D]">
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5 sm:px-7">
          <Card title="Profile">
            {profileLoading ? (
              <p className="text-sm text-[#687A73]" aria-live="polite" aria-busy="true">Loading employee profile...</p>
            ) : profileError ? (
              <div role="alert" className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-rose-700">{profileError}</p>
                <Button variant="outline" size="sm" icon={RefreshCw} onClick={() => setReloadCount((count) => count + 1)}>Retry</Button>
              </div>
            ) : profile ? (
              <>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div><p className="text-xs text-[#687A73]">Job title</p><p className="mt-1 text-sm font-medium text-[#10221E]">{profile.role}</p></div>
                  <div><p className="text-xs text-[#687A73]">Department</p><p className="mt-1 text-sm font-medium text-[#10221E]">{profile.department}</p></div>
                  <div><p className="text-xs text-[#687A73]">Email</p><p className="mt-1 break-all text-sm font-medium text-[#10221E]">{profile.email}</p></div>
                  <div><p className="text-xs text-[#687A73]">Experience</p><p className="mt-1 text-sm font-medium text-[#10221E]">{profile.experience} years</p></div>
                  <div><p className="text-xs text-[#687A73]">Availability</p><div className="mt-1"><Badge variant={statusVariant(profile.availabilityStatus)}>{formatStatus(profile.availabilityStatus)}</Badge></div></div>
                  <div><p className="text-xs text-[#687A73]">Utilization</p><p className="mt-1 text-sm font-medium tabular-nums text-[#10221E]">{profile.workload}%</p></div>
                </div>
                {profile.bio && <p className="mt-4 border-t border-[#E8EFEA] pt-4 text-sm leading-6 text-[#42544E]">{profile.bio}</p>}
                <div className="mt-4 border-t border-[#E8EFEA] pt-4">
                  <h3 className="text-xs font-semibold text-[#42544E]">Skills</h3>
                  {profile.skills.length ? (
                    <ul className="mt-2 flex flex-wrap gap-2">
                      {profile.skills.map((skill) => <li key={skill.skillId}><Badge variant="primary">{skill.name} · {skill.proficiencyLevel}/5</Badge></li>)}
                    </ul>
                  ) : <p className="mt-2 text-sm text-[#687A73]">No skills recorded.</p>}
                </div>
                <div className="mt-4 border-t border-[#E8EFEA] pt-4">
                  <h3 className="text-xs font-semibold text-[#42544E]">Certifications</h3>
                  {profile.certifications.length ? (
                    <ul className="mt-2 space-y-2">
                      {profile.certifications.map((certification) => (
                        <li key={certification.id} className="text-sm text-[#10221E]">
                          {certification.name}<span className="text-[#687A73]">{certification.issuer ? ` · ${certification.issuer}` : ''}</span>
                        </li>
                      ))}
                    </ul>
                  ) : <p className="mt-2 text-sm text-[#687A73]">No certifications recorded.</p>}
                </div>
              </>
            ) : <p className="text-sm text-[#687A73]">No employee profile returned.</p>}
          </Card>

          <Card title="Project history" subtitle="Assignments returned for this employee">
            {projectsLoading ? (
              <p className="text-sm text-[#687A73]" aria-live="polite" aria-busy="true">Loading project history...</p>
            ) : projectsError ? (
              <div role="alert" className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-rose-700">{projectsError}</p>
                <Button variant="outline" size="sm" icon={RefreshCw} onClick={() => setReloadCount((count) => count + 1)}>Retry</Button>
              </div>
            ) : projects.length === 0 ? (
              <p className="text-sm text-[#687A73]">No project history returned.</p>
            ) : (
              <ul className="divide-y divide-[#E8EFEA]">
                {projects.map((project) => (
                  <li key={project.id} className="py-3 first:pt-0 last:pb-0">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <p className="text-sm font-semibold text-[#10221E]">{project.project_name}</p>
                      <Badge variant={project.status === 'ACTIVE' ? 'success' : 'default'}>{formatStatus(project.status)}</Badge>
                    </div>
                    {project.role_on_project && <p className="mt-1 text-xs text-[#687A73]">{project.role_on_project}</p>}
                    <p className="mt-1 text-xs text-[#687A73]">{project.allocation_percentage}% allocation · {formatDate(project.start_date)} – {formatDate(project.end_date)}</p>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </aside>
    </div>
  );
};

export const EmployeeDirectoryPage = () => {
  const [employees, setEmployees] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [availabilityStatuses, setAvailabilityStatuses] = useState([]);
  const [filters, setFilters] = useState({ search: '', department: 'All', availabilityStatus: 'All', maxUtilization: '' });
  const [searchDraft, setSearchDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reloadCount, setReloadCount] = useState(0);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');

    employeeService.getEmployees({
      ...filters,
      maxUtilization: filters.maxUtilization === '' ? undefined : Number(filters.maxUtilization),
    }).then((data) => {
      if (cancelled) return;
      setEmployees(data);
      setDepartments((current) => [...new Set([...current, ...data.map((employee) => employee.department).filter(Boolean)])].sort());
      setAvailabilityStatuses((current) => [...new Set([...current, ...data.map((employee) => employee.availabilityStatus).filter(Boolean)])].sort());
    }).catch((requestError) => {
      if (!cancelled) setError(errorMessage(requestError, 'The employee directory could not be loaded.'));
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });

    return () => { cancelled = true; };
  }, [filters, reloadCount]);

  const applyFilters = (event) => {
    event.preventDefault();
    setFilters((current) => ({ ...current, search: searchDraft.trim() }));
  };

  const resetFilters = () => {
    setSearchDraft('');
    setFilters({ search: '', department: 'All', availabilityStatus: 'All', maxUtilization: '' });
  };

  const hasFilters = Boolean(filters.search || filters.department !== 'All' || filters.availabilityStatus !== 'All' || filters.maxUtilization !== '');

  return (
    <div className="space-y-6">
      <PageHeader title="Employee Management Directory" subtitle="Search and review employee profiles, skills, availability, and project history." />

      <Card>
        <form onSubmit={applyFilters} className="grid grid-cols-1 items-end gap-4 sm:grid-cols-2 xl:grid-cols-[minmax(240px,1fr)_minmax(160px,0.7fr)_minmax(170px,0.7fr)_minmax(160px,0.6fr)_auto]">
          <label className="block text-xs font-medium text-[#42544E]">
            Search employees
            <span className="relative mt-1 block">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#687A73]" />
              <input className="w-full rounded-md border border-[#DCE5DF] bg-white py-2 pl-9 pr-3 text-sm text-[#10221E] outline-none focus:border-[#13816D] focus:ring-2 focus:ring-[#DFF2EA]" value={searchDraft} onChange={(event) => setSearchDraft(event.target.value)} placeholder="Name, role, department, or code" />
            </span>
          </label>
          <label className="block text-xs font-medium text-[#42544E]">
            Department
            <select className="mt-1 w-full rounded-md border border-[#DCE5DF] bg-white px-3 py-2 text-sm text-[#10221E] outline-none focus:border-[#13816D] focus:ring-2 focus:ring-[#DFF2EA]" value={filters.department} onChange={(event) => setFilters((current) => ({ ...current, department: event.target.value }))}>
              <option value="All">All departments</option>
              {departments.map((department) => <option key={department} value={department}>{department}</option>)}
            </select>
          </label>
          <label className="block text-xs font-medium text-[#42544E]">
            Availability
            <select className="mt-1 w-full rounded-md border border-[#DCE5DF] bg-white px-3 py-2 text-sm text-[#10221E] outline-none focus:border-[#13816D] focus:ring-2 focus:ring-[#DFF2EA]" value={filters.availabilityStatus} onChange={(event) => setFilters((current) => ({ ...current, availabilityStatus: event.target.value }))}>
              <option value="All">All statuses</option>
              {availabilityStatuses.map((status) => <option key={status} value={status}>{formatStatus(status)}</option>)}
            </select>
          </label>
          <label className="block text-xs font-medium text-[#42544E]">
            Max utilization (%)
            <input className="mt-1 w-full rounded-md border border-[#DCE5DF] bg-white px-3 py-2 text-sm text-[#10221E] outline-none focus:border-[#13816D] focus:ring-2 focus:ring-[#DFF2EA]" type="number" min="0" max="100" step="1" value={filters.maxUtilization} onChange={(event) => setFilters((current) => ({ ...current, maxUtilization: event.target.value }))} placeholder="Any" />
          </label>
          <div className="flex gap-2">
            <Button type="submit" icon={Search}>Search</Button>
            {hasFilters && <Button type="button" variant="outline" onClick={resetFilters}>Clear</Button>}
          </div>
        </form>
      </Card>

      <Card title="Employees" subtitle={loading ? 'Loading directory...' : `${employees.length} employee${employees.length === 1 ? '' : 's'} returned`}>
        {loading ? (
          <div className="space-y-3" aria-live="polite" aria-busy="true">
            {[0, 1, 2].map((item) => <div key={item} className="h-14 animate-pulse rounded-md bg-[#F1F5F2]" />)}
            <p className="text-sm text-[#687A73]">Loading employees...</p>
          </div>
        ) : error ? (
          <div role="alert" className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-rose-700">{error}</p>
            <Button variant="outline" size="sm" icon={RefreshCw} onClick={() => setReloadCount((count) => count + 1)}>Retry</Button>
          </div>
        ) : employees.length === 0 ? (
          <div className="py-10 text-center">
            <p className="text-sm font-semibold text-[#10221E]">{hasFilters ? 'No matching employees' : 'No employees returned'}</p>
            <p className="mt-1 text-sm text-[#687A73]">{hasFilters ? 'Adjust or clear the filters to see more employees.' : 'The employee directory is empty.'}</p>
            {hasFilters && <Button className="mt-4" variant="outline" onClick={resetFilters}>Clear filters</Button>}
          </div>
        ) : (
          <div className="-mx-5 overflow-x-auto px-5">
            <table className="w-full min-w-[900px] text-left">
              <thead>
                <tr className="border-b border-[#E8EFEA] text-[11px] font-semibold uppercase text-[#687A73]">
                  <th className="pb-3 pr-4">Employee</th>
                  <th className="pb-3 pr-4">Role</th>
                  <th className="pb-3 pr-4">Department</th>
                  <th className="pb-3 pr-4">Skills</th>
                  <th className="pb-3 pr-4">Availability</th>
                  <th className="pb-3 pr-4">Utilization</th>
                  <th className="pb-3 text-right">Profile</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E8EFEA]">
                {employees.map((employee) => (
                  <tr key={employee.employeeDbId}>
                    <td className="py-4 pr-4">
                      <p className="text-sm font-semibold text-[#10221E]">{employee.name}</p>
                      <p className="mt-1 text-xs text-[#687A73]">{employee.id}</p>
                    </td>
                    <td className="py-4 pr-4 text-sm text-[#42544E]">{employee.role}</td>
                    <td className="py-4 pr-4 text-sm text-[#42544E]">{employee.department}</td>
                    <td className="max-w-xs py-4 pr-4 text-sm text-[#42544E]">{employee.skills.length ? employee.skills.join(', ') : 'No skills listed'}</td>
                    <td className="py-4 pr-4"><Badge variant={statusVariant(employee.availabilityStatus)}>{formatStatus(employee.availabilityStatus)}</Badge></td>
                    <td className="py-4 pr-4 text-sm font-medium tabular-nums text-[#10221E]">{employee.workload}%</td>
                    <td className="py-4 text-right">
                      <Button variant="outline" size="sm" icon={Eye} onClick={() => setSelectedEmployeeId(employee.employeeDbId)}>View Details</Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {selectedEmployeeId !== null && <EmployeeDetails employeeId={selectedEmployeeId} onClose={() => setSelectedEmployeeId(null)} />}
    </div>
  );
};

export default EmployeeDirectoryPage;