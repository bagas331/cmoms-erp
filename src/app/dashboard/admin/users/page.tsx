'use client';

import { useEffect, useState } from 'react';
import { getUsers, createUser, deleteUser } from '@/lib/supabase-store';
import { ROLE_COLORS, ROLE_LABELS } from '@/lib/constants';
import { User, RoleName } from '@/lib/types';
import { Settings, Plus, X, Trash2, Copy, CheckCircle2, Mail } from 'lucide-react';
import { useAuth } from '@/lib/auth';

export default function UsersPage() {
  const { user } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [formData, setFormData] = useState({
    email: '',
    role_name: 'DESIGNER' as RoleName,
    daily_capacity_points: 0,
  });

  const refresh = async () => {
    const data = await getUsers();
    setUsers(data);
  };

  useEffect(() => { 
    refresh(); 
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const finalData = {
      ...formData,
      daily_capacity_points: ['DESIGNER', 'MOTION_PIC'].includes(formData.role_name) ? formData.daily_capacity_points : 0
    };
    await createUser(finalData);
    
    // Simulate sending an email and generate invite link
    const link = `${window.location.origin}/register?email=${encodeURIComponent(formData.email)}`;
    setInviteLink(link);
    
    await refresh();
  };

  const handleCopy = () => {
    if (inviteLink) {
      navigator.clipboard.writeText(inviteLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const closeAndResetModal = () => {
    setShowModal(false);
    setInviteLink(null);
    setFormData({ email: '', role_name: 'DESIGNER', daily_capacity_points: 0 });
  };

  const handleDeleteUser = async (userId: string) => {
    if (confirm('Are you sure you want to delete this user? This action cannot be undone.')) {
      await deleteUser(userId);
      await refresh();
    }
  };

  const canCreate = user && ['ADMIN', 'TEAM_LEAD'].includes(user.role_name);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-[var(--text-primary)] flex items-center gap-2">
          <Settings className="w-5 h-5" style={{ color: 'var(--accent-red)' }} />
          User Management
        </h1>
        {canCreate && (
          <button onClick={() => setShowModal(true)} className="btn-primary">
            <Plus className="w-4 h-4" /> New User
          </button>
        )}
      </div>
      <div className="table-container">
        <table>
          <thead><tr><th>User</th><th>Email</th><th>Role</th><th>Capacity Points</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>
            {users.map(u => (
              <tr key={u.id}>
                <td>
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold text-white" style={{ background: 'var(--gradient-1)' }}>{u.avatar_initials}</div>
                    <span className="font-medium text-[var(--text-primary)] text-sm">{u.full_name}</span>
                  </div>
                </td>
                <td className="text-sm" style={{ color: 'var(--text-secondary)' }}>{u.email}</td>
                <td><span className={`badge ${ROLE_COLORS[u.role_name]}`}>{ROLE_LABELS[u.role_name]}</span></td>
                <td className="text-sm text-center" style={{ color: 'var(--text-secondary)' }}>{u.daily_capacity_points > 0 ? u.daily_capacity_points : '—'}</td>
                <td>
                  {u.is_registered === false ? (
                    <span className="badge bg-amber-500/20 text-amber-500 border-amber-500/30">Pending</span>
                  ) : (
                    <span className={`badge ${u.is_active ? 'badge-success' : 'badge-error'}`}>{u.is_active ? 'Active' : 'Inactive'}</span>
                  )}
                </td>
                <td>
                  {canCreate && u.id !== user?.id && (
                    <button onClick={() => handleDeleteUser(u.id)} className="btn-ghost p-2" style={{ color: 'var(--accent-red)' }} title="Delete User">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={closeAndResetModal}>
          <div className="modal-content max-w-md w-full" onClick={e => e.stopPropagation()}>
            <div className="p-6 flex items-center justify-between" style={{ borderBottom: '1px solid var(--border-primary)' }}>
              <h2 className="text-lg font-bold text-[var(--text-primary)]">
                {inviteLink ? 'User Created Successfully' : 'Create New User'}
              </h2>
              <button onClick={closeAndResetModal} className="btn-ghost p-1.5 rounded-full"><X className="w-5 h-5" /></button>
            </div>
            
            {inviteLink ? (
              <div className="p-6 space-y-6">
                <div className="flex flex-col items-center justify-center text-center space-y-3">
                  <div className="w-12 h-12 rounded-full bg-emerald-500/10 flex items-center justify-center">
                    <CheckCircle2 className="w-6 h-6 text-emerald-500" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-[var(--text-primary)]">Account is Pending Activation</h3>
                    <p className="text-sm text-[var(--text-secondary)] mt-1">
                      User has been added to the system. Share this secure invite link with them to complete their profile setup.
                    </p>
                  </div>
                </div>
                
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-[var(--text-muted)] tracking-wider uppercase">Invite Link</label>
                  <div className="flex items-center gap-2">
                    <input 
                      type="text" 
                      readOnly 
                      value={inviteLink} 
                      className="input flex-1 font-mono text-sm bg-[var(--bg-tertiary)]"
                    />
                    <button 
                      onClick={handleCopy}
                      className={`btn-primary px-3 transition-colors ${copied ? 'bg-emerald-500 border-emerald-500' : ''}`}
                      title="Copy link"
                    >
                      {copied ? <CheckCircle2 className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div className="pt-5 mt-2 flex justify-center" style={{ borderTop: '1px solid var(--border-primary)' }}>
                  <button type="button" onClick={closeAndResetModal} className="btn-secondary w-full justify-center">Done</button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="p-6 space-y-5">
                <div className="space-y-1.5">
                  <label className="label">Email</label>
                  <input required type="email" className="input" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} placeholder="john@orbiz.id" />
                </div>
                <div className="space-y-1.5">
                  <label className="label">Role</label>
                  <select className="select" value={formData.role_name} onChange={e => setFormData({...formData, role_name: e.target.value as RoleName})}>
                    {Object.entries(ROLE_LABELS).map(([val, label]) => (
                      <option key={val} value={val} className="bg-[var(--bg-secondary)] text-[var(--text-primary)]">{label as string}</option>
                    ))}
                  </select>
                </div>
                {['DESIGNER', 'MOTION_PIC'].includes(formData.role_name) && (
                  <div className="space-y-1.5">
                    <label className="label">Daily Capacity Points</label>
                    <input required type="number" min="0" max="100" className="input" value={formData.daily_capacity_points || ''} onChange={e => setFormData({...formData, daily_capacity_points: e.target.value === '' ? 0 : parseInt(e.target.value)})} />
                  </div>
                )}
                <div className="pt-5 mt-2 flex justify-end gap-3" style={{ borderTop: '1px solid var(--border-primary)' }}>
                  <button type="button" onClick={closeAndResetModal} className="btn-secondary">Cancel</button>
                  <button type="submit" className="btn-primary">
                    <Mail className="w-4 h-4" /> Create & Generate Invite
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
