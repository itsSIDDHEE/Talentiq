import React, { useEffect, useState } from 'react';
import { Award, Plus, Save, Trash2 } from 'lucide-react';
import Button from '../../components/common/Button';
import Card from '../../components/common/Card';
import PageHeader from '../../components/layout/PageHeader';
import { employeeService } from '../../services/employeeService';
import { skillService } from '../../services/skillService';
import EmployeeResumeSection, { EmployeeCertificateSection } from './EmployeeResume';

const inputClass = 'mt-1 w-full rounded-md border border-[#CAD8D0] bg-white px-3 py-2 text-sm text-[#10221E] outline-none focus:border-[#13816D] focus:ring-2 focus:ring-[#DFF2EA]';

const getErrorMessage = (error, fallback) => {
  const detail = error?.response?.data?.detail;
  return typeof detail === 'string' ? detail : fallback;
};

const Field = ({ label, ...props }) => (
  <label className="block text-xs font-medium text-[#42544E]">
    {label}
    <input className={inputClass} {...props} />
  </label>
);

const Notice = ({ children, error = false }) => (
  <p role={error ? 'alert' : 'status'} className={`text-sm ${error ? 'text-rose-700' : 'text-[#075E4F]'}`}>
    {children}
  </p>
);

const Loading = ({ label }) => (
  <div className="space-y-3" aria-live="polite" aria-busy="true">
    <div className="h-4 w-2/3 animate-pulse rounded bg-[#E8EFEA]" />
    <div className="h-3 w-full animate-pulse rounded bg-[#F1F5F2]" />
    <p className="text-xs text-[#687A73]">{label}</p>
  </div>
);

export const EmployeeProfile = () => {
  const [profile, setProfile] = useState(null);
  const [form, setForm] = useState({ jobTitle: '', department: '', bio: '', experience: '' });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [certForm, setCertForm] = useState({ name: '', issuer: '', credentialId: '', issueDate: '', expiryDate: '' });
  const [certSaving, setCertSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    employeeService.getMyProfile().then((data) => {
      if (cancelled) return;
      setProfile(data);
      setForm({
        jobTitle: data.role || '',
        department: data.department || '',
        bio: data.bio || '',
        experience: data.experience ?? '',
      });
    }).catch((loadError) => {
      if (!cancelled) setError(getErrorMessage(loadError, 'Your profile could not be loaded.'));
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

  const saveProfile = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const updated = await employeeService.updateMyProfile({
        role: form.jobTitle,
        department: form.department,
        bio: form.bio,
        experience: Number(form.experience),
      });
      setProfile(updated);
      setMessage('Profile updated.');
    } catch (saveError) {
      setError(getErrorMessage(saveError, 'Your profile could not be updated.'));
    } finally {
      setSaving(false);
    }
  };

  const addCertification = async (event) => {
    event.preventDefault();
    setCertSaving(true);
    setError('');
    setMessage('');
    try {
      const added = await employeeService.addMyCertification(certForm);
      setProfile((current) => ({
        ...current,
        certifications: [...current.certifications, {
          id: added.id,
          name: added.name,
          issuer: added.issuer,
          credentialId: added.credential_id,
          issueDate: added.issue_date,
          expiryDate: added.expiry_date,
        }],
      }));
      setCertForm({ name: '', issuer: '', credentialId: '', issueDate: '', expiryDate: '' });
      setMessage('Certification added.');
    } catch (saveError) {
      setError(getErrorMessage(saveError, 'The certification could not be added.'));
    } finally {
      setCertSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader title="My Profile" subtitle="Your employee details and certifications" />
      {error && <Notice error>{error}</Notice>}
      {message && <Notice>{message}</Notice>}
      {loading ? (
        <Card><Loading label="Loading your profile..." /></Card>
      ) : profile ? (
        <>
          <Card title="Profile details" subtitle="Name is provided by your account; the remaining fields can be updated.">
            <form onSubmit={saveProfile} className="space-y-5">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <Field label="Name" value={profile.name || ''} readOnly />
                <Field label="Job title" value={form.jobTitle} onChange={(event) => setForm({ ...form, jobTitle: event.target.value })} required />
                <Field label="Department" value={form.department} onChange={(event) => setForm({ ...form, department: event.target.value })} required />
                <Field label="Years of experience" type="number" min="0" step="1" value={form.experience} onChange={(event) => setForm({ ...form, experience: event.target.value })} required />
              </div>
              <label className="block text-xs font-medium text-[#42544E]">
                Bio
                <textarea className={`${inputClass} min-h-28 resize-y`} value={form.bio} onChange={(event) => setForm({ ...form, bio: event.target.value })} />
              </label>
              <div className="flex justify-end">
                <Button type="submit" icon={Save} loading={saving}>Save profile</Button>
              </div>
            </form>
          </Card>

          <Card title="Certifications" subtitle={`${profile.certifications.length} recorded`}>
            {profile.certifications.length ? (
              <ul className="mb-6 divide-y divide-[#E8EFEA]">
                {profile.certifications.map((certification) => (
                  <li key={certification.id} className="py-3 first:pt-0 last:pb-0">
                    <p className="text-sm font-semibold text-[#10221E]">{certification.name}</p>
                    <p className="mt-1 text-xs text-[#687A73]">
                      {[certification.issuer, certification.credentialId && `Credential ${certification.credentialId}`].filter(Boolean).join(' · ')}
                    </p>
                    {(certification.issueDate || certification.expiryDate) && (
                      <p className="mt-1 text-xs text-[#687A73]">
                        {[certification.issueDate && `Issued ${certification.issueDate}`, certification.expiryDate && `Expires ${certification.expiryDate}`].filter(Boolean).join(' · ')}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            ) : <p className="mb-6 text-sm text-[#687A73]">No certifications recorded.</p>}
            <form onSubmit={addCertification} className="space-y-4 border-t border-[#E8EFEA] pt-5">
              <h3 className="text-sm font-semibold text-[#10221E]">Add certification</h3>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <Field label="Certification name" value={certForm.name} onChange={(event) => setCertForm({ ...certForm, name: event.target.value })} required />
                <Field label="Issuer" value={certForm.issuer} onChange={(event) => setCertForm({ ...certForm, issuer: event.target.value })} required />
                <Field label="Credential ID" value={certForm.credentialId} onChange={(event) => setCertForm({ ...certForm, credentialId: event.target.value })} />
                <Field label="Issue date" type="date" value={certForm.issueDate} onChange={(event) => setCertForm({ ...certForm, issueDate: event.target.value })} />
                <Field label="Expiry date" type="date" value={certForm.expiryDate} onChange={(event) => setCertForm({ ...certForm, expiryDate: event.target.value })} />
              </div>
              <div className="flex justify-end">
                <Button type="submit" icon={Plus} loading={certSaving}>Add certification</Button>
              </div>
            </form>
          </Card>
        </>
      ) : (
        <Card><p className="text-sm text-[#687A73]">Profile details are unavailable.</p></Card>
      )}
      <EmployeeResumeSection />
      <EmployeeCertificateSection />
    </div>
  );
};

export const EmployeeSkills = () => {
  const [profile, setProfile] = useState(null);
  const [catalog, setCatalog] = useState([]);
  const [form, setForm] = useState({ skillId: '', proficiencyLevel: 1, yearsOfExperience: 0 });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [removingId, setRemovingId] = useState(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const loadData = async () => {
    setLoading(true);
    setError('');
    try {
      const [profileData, skillData] = await Promise.all([employeeService.getMyProfile(), skillService.listSkills()]);
      setProfile(profileData);
      setCatalog(skillData);
      setForm((current) => ({ ...current, skillId: current.skillId || String(skillData[0]?.id || '') }));
    } catch (loadError) {
      setError(getErrorMessage(loadError, 'Skills could not be loaded.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  const addSkill = async (event) => {
    event.preventDefault();
    if (!form.skillId) return;
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const addedSkill = await employeeService.addMySkill({
        skillId: Number(form.skillId),
        proficiencyLevel: Number(form.proficiencyLevel),
        yearsOfExperience: Number(form.yearsOfExperience),
      });
      setProfile((current) => ({
        ...current,
        skills: [...current.skills.filter((skill) => skill.skillId !== addedSkill.skillId), addedSkill],
      }));
      setMessage('Skill added or updated.');
    } catch (saveError) {
      setError(getErrorMessage(saveError, 'The skill could not be saved.'));
    } finally {
      setSaving(false);
    }
  };

  const removeSkill = async (skillId) => {
    setRemovingId(skillId);
    setError('');
    setMessage('');
    try {
      await employeeService.removeMySkill(skillId);
      setProfile((current) => ({ ...current, skills: current.skills.filter((skill) => skill.skillId !== skillId) }));
      setMessage('Skill removed.');
    } catch (removeError) {
      setError(getErrorMessage(removeError, 'The skill could not be removed.'));
    } finally {
      setRemovingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader title="My Skills" subtitle="Manage the skills and experience recorded on your profile" />
      {error && <Notice error>{error}</Notice>}
      {message && <Notice>{message}</Notice>}
      <Card title="Add a skill" subtitle="Choose a skill from the available catalog.">
        <form onSubmit={addSkill} className="grid grid-cols-1 items-end gap-4 md:grid-cols-2 xl:grid-cols-4">
          <label className="block text-xs font-medium text-[#42544E]">
            Skill name
            <select className={inputClass} value={form.skillId} onChange={(event) => setForm({ ...form, skillId: event.target.value })} required disabled={loading || catalog.length === 0}>
              {catalog.length === 0 && <option value="">No skills available</option>}
              {catalog.map((skill) => <option key={skill.id} value={skill.id}>{skill.name}</option>)}
            </select>
          </label>
          <label className="block text-xs font-medium text-[#42544E]">
            Proficiency (1-5)
            <input className={inputClass} type="number" min="1" max="5" step="1" value={form.proficiencyLevel} onChange={(event) => setForm({ ...form, proficiencyLevel: event.target.value })} required />
          </label>
          <label className="block text-xs font-medium text-[#42544E]">
            Years of experience
            <input className={inputClass} type="number" min="0" step="1" value={form.yearsOfExperience} onChange={(event) => setForm({ ...form, yearsOfExperience: event.target.value })} required />
          </label>
          <Button type="submit" icon={Plus} loading={saving} disabled={loading || catalog.length === 0}>Add skill</Button>
        </form>
      </Card>

      <Card title="Recorded skills" subtitle={profile ? `${profile.skills.length} skill${profile.skills.length === 1 ? '' : 's'}` : undefined}>
        {loading ? <Loading label="Loading your skills..." /> : error && !profile ? (
          <SectionError message={error} onRetry={loadData} />
        ) : profile?.skills.length ? (
          <ul className="divide-y divide-[#E8EFEA]">
            {profile.skills.map((skill) => (
              <li key={skill.skillId} className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-[#10221E]">{skill.name}</p>
                  <p className="mt-1 text-xs text-[#687A73]">{skill.category} · Proficiency {skill.proficiencyLevel}/5 · {skill.yearsOfExperience} years</p>
                </div>
                <Button variant="outline" size="sm" icon={Trash2} loading={removingId === skill.skillId} onClick={() => removeSkill(skill.skillId)} aria-label={`Remove ${skill.name}`} title={`Remove ${skill.name}`}>Remove</Button>
              </li>
            ))}
          </ul>
        ) : (
          <div className="py-7 text-center">
            <Award className="mx-auto h-8 w-8 text-[#9BB0A6]" />
            <p className="mt-2 text-sm font-medium text-[#10221E]">No skills recorded</p>
          </div>
        )}
      </Card>
    </div>
  );
};

export const EmployeeAvailability = () => {
  const [form, setForm] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    let cancelled = false;
    employeeService.getMyAvailability().then((data) => {
      if (!cancelled) setForm({
        weekly_capacity_hours: data.weekly_capacity_hours,
        allocated_hours: data.allocated_hours,
        status: data.status,
      });
    }).catch((loadError) => {
      if (!cancelled) setError(getErrorMessage(loadError, 'Availability could not be loaded.'));
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

  const saveAvailability = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const updated = await employeeService.updateMyAvailability({
        weekly_capacity_hours: Number(form.weekly_capacity_hours),
        allocated_hours: Number(form.allocated_hours),
        status: form.status,
      });
      setForm({
        weekly_capacity_hours: updated.weekly_capacity_hours,
        allocated_hours: updated.allocated_hours,
        status: updated.status,
      });
      setMessage('Availability updated.');
    } catch (saveError) {
      setError(getErrorMessage(saveError, 'Availability could not be updated.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Availability" subtitle="Your weekly capacity and current allocation" />
      {error && <Notice error>{error}</Notice>}
      {message && <Notice>{message}</Notice>}
      <Card title="Capacity" subtitle="Values from your availability record">
        {loading ? <Loading label="Loading availability..." /> : form ? (
          <form onSubmit={saveAvailability} className="space-y-5">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <Field label="Weekly capacity (hours)" type="number" min="0" step="1" value={form.weekly_capacity_hours} onChange={(event) => setForm({ ...form, weekly_capacity_hours: event.target.value })} required />
              <Field label="Allocated hours" type="number" min="0" step="1" value={form.allocated_hours} onChange={(event) => setForm({ ...form, allocated_hours: event.target.value })} required />
              <Field label="Availability status" value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })} required />
            </div>
            <div className="flex justify-end">
              <Button type="submit" icon={Save} loading={saving}>Save availability</Button>
            </div>
          </form>
        ) : <p className="text-sm text-[#687A73]">Availability details are unavailable.</p>}
      </Card>
    </div>
  );
};

export default EmployeeProfile;