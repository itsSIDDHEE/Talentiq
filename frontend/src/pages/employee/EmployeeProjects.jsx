import React, { useEffect, useState } from 'react';
import { ArrowLeft, Briefcase, RefreshCw } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import Badge from '../../components/common/Badge';
import Button from '../../components/common/Button';
import Card from '../../components/common/Card';
import PageHeader from '../../components/layout/PageHeader';
import { employeeService } from '../../services/employeeService';

const messageFromError = (error) => {
  const detail = error?.response?.data?.detail;
  return typeof detail === 'string' ? detail : 'Your project allocations could not be loaded.';
};

const formatDate = (value) => {
  if (!value) return 'Not set';
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
};

const formatStatus = (status) => (status || 'Unknown').replaceAll('_', ' ');

const statusVariant = (status) => {
  const normalizedStatus = (status || '').toUpperCase();
  if (normalizedStatus === 'ACTIVE') return 'success';
  if (normalizedStatus === 'PLANNED') return 'primary';
  if (normalizedStatus === 'CANCELLED') return 'danger';
  return 'default';
};

export const EmployeeProjects = () => {
  const navigate = useNavigate();
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reloadCount, setReloadCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');

    employeeService.getMyProjectHistory()
      .then((history) => {
        if (!cancelled) setProjects(history);
      })
      .catch((requestError) => {
        if (!cancelled) setError(messageFromError(requestError));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [reloadCount]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="My Project Allocations"
        subtitle="Current project assignments, peer collaborators, roles, and project deliverables."
        actions={(
          <Button variant="outline" size="sm" icon={ArrowLeft} onClick={() => navigate(-1)}>
            Go Back
          </Button>
        )}
      />

      {loading ? (
        <div className="rounded-lg border border-[#DCE5DF] bg-white p-5" aria-live="polite" aria-busy="true">
          <div className="space-y-3">
            <div className="h-4 w-2/3 animate-pulse rounded bg-[#E8EFEA]" />
            <div className="h-3 w-full animate-pulse rounded bg-[#F1F5F2]" />
            <p className="text-xs text-[#687A73]">Loading your project allocations...</p>
          </div>
        </div>
      ) : error ? (
        <Card>
          <div role="alert" className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-rose-700">{error}</p>
            <Button variant="outline" size="sm" icon={RefreshCw} onClick={() => setReloadCount((count) => count + 1)}>
              Retry
            </Button>
          </div>
        </Card>
      ) : projects.length === 0 ? (
        <Card className="py-8 text-center">
          <Briefcase className="mx-auto h-8 w-8 text-[#9BB0A6]" />
          <h2 className="mt-3 text-sm font-semibold text-[#10221E]">No project allocations</h2>
          <p className="mt-1 text-xs text-[#687A73]">No projects were returned for your employee profile.</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {projects.map((project) => (
            <Card key={project.id} className="h-full" bodyClassName="flex h-full flex-col">
              <div className="flex items-start justify-between gap-3">
                <h2 className="min-w-0 text-base font-semibold text-[#10221E]">{project.name}</h2>
                <Badge variant={statusVariant(project.status)}>{formatStatus(project.status)}</Badge>
              </div>
              <p className="mt-2 text-sm text-[#687A73]">{project.role || 'Role not specified'}</p>
              <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-4 border-t border-[#E8EFEA] pt-4">
                <div>
                  <dt className="text-xs text-[#687A73]">Allocation</dt>
                  <dd className="mt-1 text-sm font-semibold tabular-nums text-[#10221E]">
                    {typeof project.allocation === 'number' ? `${project.allocation}%` : 'Not set'}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-[#687A73]">Start date</dt>
                  <dd className="mt-1 text-sm text-[#10221E]">{formatDate(project.startDate)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-[#687A73]">End date</dt>
                  <dd className="mt-1 text-sm text-[#10221E]">{formatDate(project.endDate)}</dd>
                </div>
              </dl>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

export default EmployeeProjects;