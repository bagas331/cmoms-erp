'use client';

import { useEffect, useState, useMemo } from 'react';
import { getUsers, createUser, deleteUser, updateUserRole } from '@/lib/supabase-store';
import { ROLE_COLORS, ROLE_LABELS, ROLE_DESCRIPTIONS } from '@/lib/constants';
import { User, RoleName } from '@/lib/types';
import {
  Settings, Plus, X, Trash2, Copy, CheckCircle2, Mail,
  Shield, Crown, Lightbulb, Palette, Video, UserCheck, Radio,
  UserCog, Search, AlertTriangle, Check, Loader2, Sparkles, Users, Lock
} from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { formatUserId } from '@/lib/utils';

const ROLE_ICONS: Record<RoleName, any> = {
  ADMIN: Shield,
  TEAM_LEAD: Crown,
  STRATEGIC_PIC: Lightbulb,
  DESIGNER: Palette,
  MOTION_PIC: Video,
  REQUESTER: UserCheck,
  OPERATOR: Radio,
};

const ALL_ROLES: RoleName[] = [
  'ADMIN',
  'TEAM_LEAD',
  'STRATEGIC_PIC',
  'DESIGNER',
  'MOTION_PIC',
  'REQUESTER',
  'OPERATOR',
];

export default function UsersPage() {
  const { user, updateCurrentUser } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters & Search
  const [searchTerm, setSearchTerm] = useState('');
  const [filterRole, setFilterRole] = useState<string>('all');

  // Feedback Notification
  const [feedbackMessage, setFeedbackMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Create User Modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [createFormData, setCreateFormData] = useState({
    email: '',
    role_name: 'DESIGNER' as RoleName,
    daily_capacity_points: 7.0,
  });
  const [isCreating, setIsCreating] = useState(false);

  // Edit / Change Role Modal
  const [showRoleModal, setShowRoleModal] = useState(false);
  const [selectedUserForRole, setSelectedUserForRole] = useState<User | null>(null);
  const [selectedNewRole, setSelectedNewRole] = useState<RoleName>('DESIGNER');
  const [selectedCapacityPoints, setSelectedCapacityPoints] = useState<number>(7.0);
  const [isSavingRole, setIsSavingRole] = useState(false);
  const [roleModalError, setRoleModalError] = useState<string | null>(null);

  const refresh = async () => {
    setLoading(true);
    try {
      const data = await getUsers();
      setUsers(data);
    } catch (err) {
      console.error('Failed to fetch users:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  const canManage = user && ['ADMIN', 'TEAM_LEAD'].includes(user.role_name);

  // Filtered Users
  const filteredUsers = useMemo(() => {
    return users.filter(u => {
      const matchesSearch =
        searchTerm.trim() === '' ||
        u.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        u.email.toLowerCase().includes(searchTerm.toLowerCase());

      const matchesRole = filterRole === 'all' || u.role_name === filterRole;

      return matchesSearch && matchesRole;
    });
  }, [users, searchTerm, filterRole]);

  // Metric counts
  const metrics = useMemo(() => {
    return {
      total: users.length,
      adminsAndLeads: users.filter(u => ['ADMIN', 'TEAM_LEAD'].includes(u.role_name)).length,
      creatives: users.filter(u => ['DESIGNER', 'MOTION_PIC'].includes(u.role_name)).length,
      strategists: users.filter(u => u.role_name === 'STRATEGIC_PIC').length,
      others: users.filter(u => ['REQUESTER', 'OPERATOR'].includes(u.role_name)).length,
    };
  }, [users]);

  // Create User Handler
  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsCreating(true);
    try {
      const finalData = {
        ...createFormData,
        daily_capacity_points: ['DESIGNER', 'MOTION_PIC'].includes(createFormData.role_name)
          ? createFormData.daily_capacity_points
          : 0,
      };
      await createUser(finalData);

      const link = `${window.location.origin}/register?email=${encodeURIComponent(createFormData.email)}`;
      setInviteLink(link);
      await refresh();
    } catch (err: any) {
      console.error('Error creating user:', err);
      alert(err?.message || 'Gagal membuat user');
    } finally {
      setIsCreating(false);
    }
  };

  const handleCopyInvite = () => {
    if (inviteLink) {
      navigator.clipboard.writeText(inviteLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const closeCreateModal = () => {
    setShowCreateModal(false);
    setInviteLink(null);
    setCreateFormData({ email: '', role_name: 'DESIGNER', daily_capacity_points: 7.0 });
  };

  // Open Edit Role Modal
  const handleOpenRoleModal = (targetUser: User) => {
    if (targetUser.role_name === 'ADMIN') {
      alert('Role Administrator bersifat permanen/terkunci dan tidak dapat diubah.');
      return;
    }
    setSelectedUserForRole(targetUser);
    setSelectedNewRole(targetUser.role_name);
    setSelectedCapacityPoints(
      ['DESIGNER', 'MOTION_PIC'].includes(targetUser.role_name)
        ? targetUser.daily_capacity_points > 0
          ? targetUser.daily_capacity_points
          : 7.0
        : 7.0
    );
    setRoleModalError(null);
    setShowRoleModal(true);
  };

  // Save Role Changes
  const handleSaveRole = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUserForRole || !user) return;

    if (selectedUserForRole.role_name === 'ADMIN') {
      setRoleModalError('Role Administrator bersifat permanen/terkunci dan tidak dapat diubah.');
      return;
    }

    setIsSavingRole(true);
    setRoleModalError(null);

    try {
      const finalCapacity = ['DESIGNER', 'MOTION_PIC'].includes(selectedNewRole)
        ? selectedCapacityPoints
        : 0;

      const updated = await updateUserRole(
        selectedUserForRole.id,
        selectedNewRole,
        finalCapacity,
        user.id,
        user.full_name
      );

      if (updated) {
        // If current user modified their own role, update local auth context
        if (selectedUserForRole.id === user.id) {
          updateCurrentUser({
            ...user,
            role_id: updated.role_id,
            role_name: updated.role_name,
            daily_capacity_points: updated.daily_capacity_points,
          });
        }

        setFeedbackMessage({
          type: 'success',
          text: `Role ${selectedUserForRole.full_name || selectedUserForRole.email} berhasil diubah menjadi ${ROLE_LABELS[selectedNewRole]}!`,
        });
        setTimeout(() => setFeedbackMessage(null), 5000);

        setShowRoleModal(false);
        await refresh();
      }
    } catch (err: any) {
      console.error('Failed to update user role:', err);
      setRoleModalError(err?.message || 'Gagal mengubah role user. Silakan coba lagi.');
    } finally {
      setIsSavingRole(false);
    }
  };

  const handleDeleteUser = async (userId: string, userName: string) => {
    if (confirm(`Apakah Anda yakin ingin menghapus user "${userName}"? Tindakan ini tidak dapat dibatalkan.`)) {
      try {
        await deleteUser(userId);
        setFeedbackMessage({
          type: 'success',
          text: `User "${userName}" berhasil dihapus.`,
        });
        setTimeout(() => setFeedbackMessage(null), 4000);
        await refresh();
      } catch (err: any) {
        console.error('Error deleting user:', err);
        alert(err?.message || 'Gagal menghapus user');
      }
    }
  };

  return (
    <div className="space-y-5">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 style={{ fontSize: '18px', fontWeight: '700', color: 'var(--text-primary)', margin: 0 }}>User & Role Management</h1>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '2px' }}>
            Kelola akun tim, ubah role hak akses, dan atur target kapasitas produksi harian.
          </p>
        </div>

        {canManage && (
          <button
            onClick={() => setShowCreateModal(true)}
            className="btn-primary flex items-center gap-2 self-start sm:self-auto"
          >
            <Plus className="w-4 h-4" /> Tambah User Baru
          </button>
        )}
      </div>

      {/* Feedback Banner */}
      {feedbackMessage && (
        <div
          className={`p-3 rounded-lg flex items-center justify-between border transition-all animate-fade-in ${
            feedbackMessage.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400'
              : 'bg-red-500/10 border-red-500/30 text-red-600 dark:text-red-400'
          }`}
        >
          <div className="flex items-center gap-2">
            {feedbackMessage.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 flex-shrink-0 text-emerald-500" />
            ) : (
              <AlertTriangle className="w-4 h-4 flex-shrink-0 text-red-500" />
            )}
            <span style={{ fontSize: '13px', fontWeight: '500' }}>{feedbackMessage.text}</span>
          </div>
          <button
            onClick={() => setFeedbackMessage(null)}
            className="p-1 rounded hover:bg-black/5 dark:hover:bg-white/5 opacity-70 hover:opacity-100"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Summary Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="stat-card flex items-center gap-3">
          <Users style={{ width: '16px', height: '16px', color: 'var(--accent-blue)' }} />
          <div>
            <div style={{ fontSize: '20px', fontWeight: '700', color: 'var(--text-primary)', lineHeight: 1 }}>{metrics.total}</div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>Total User</div>
          </div>
        </div>

        <div className="stat-card flex items-center gap-3">
          <Crown style={{ width: '16px', height: '16px', color: 'var(--accent-purple)' }} />
          <div>
            <div style={{ fontSize: '20px', fontWeight: '700', color: 'var(--text-primary)', lineHeight: 1 }}>{metrics.adminsAndLeads}</div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>Admin & Team Lead</div>
          </div>
        </div>

        <div className="stat-card flex items-center gap-3">
          <Palette style={{ width: '16px', height: '16px', color: 'var(--accent-cyan)' }} />
          <div>
            <div style={{ fontSize: '20px', fontWeight: '700', color: 'var(--text-primary)', lineHeight: 1 }}>{metrics.creatives}</div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>Graphic & Motion Designer</div>
          </div>
        </div>

        <div className="stat-card flex items-center gap-3">
          <Sparkles style={{ width: '16px', height: '16px', color: 'var(--accent-amber)' }} />
          <div>
            <div style={{ fontSize: '20px', fontWeight: '700', color: 'var(--text-primary)', lineHeight: 1 }}>{metrics.strategists + metrics.others}</div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>Strategic, AE & Operator</div>
          </div>
        </div>
      </div>

      {/* Toolbar: Search & Filter */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3" style={{ background: 'var(--bg-secondary)', padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--border-primary)' }}>
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
          <input
            type="text"
            className="input pl-10 w-full bg-[var(--bg-primary)] text-sm"
            placeholder="Cari user berdasarkan nama atau email..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-2.5">
          <select
            className="select text-sm py-2 bg-[var(--bg-primary)] border-[var(--border-primary)]"
            value={filterRole}
            onChange={e => setFilterRole(e.target.value)}
          >
            <option value="all">Semua Role ({users.length})</option>
            {ALL_ROLES.map(role => {
              const count = users.filter(u => u.role_name === role).length;
              return (
                <option key={role} value={role}>
                  {ROLE_LABELS[role]} ({count})
                </option>
              );
            })}
          </select>
        </div>
      </div>

      {/* Users Table */}
      <div className="table-container shadow-sm border border-[var(--border-primary)] rounded-xl overflow-hidden bg-[var(--bg-secondary)]">
        <table>
          <thead>
            <tr>
              <th>User</th>
              <th>Email</th>
              <th>Role & Hak Akses</th>
              <th className="text-center">Kapasitas Harian</th>
              <th className="text-center">Status</th>
              <th className="text-right">Aksi</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} className="text-center py-12 text-[var(--text-muted)]">
                  <div className="flex flex-col items-center justify-center gap-2">
                    <Loader2 className="w-6 h-6 animate-spin text-[var(--accent-blue)]" />
                    <span className="text-sm">Memuat data pengguna...</span>
                  </div>
                </td>
              </tr>
            ) : filteredUsers.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-center py-12 text-[var(--text-secondary)]">
                  <div className="flex flex-col items-center justify-center gap-2">
                    <UserCog className="w-8 h-8 text-[var(--text-muted)] opacity-50" />
                    <span className="font-semibold text-sm">Tidak ada user yang sesuai dengan pencarian</span>
                    <span className="text-xs text-[var(--text-muted)]">Coba atur ulang kata kunci atau filter status/role.</span>
                  </div>
                </td>
              </tr>
            ) : (
              filteredUsers.map(u => {
                const isCurrentUser = user?.id === u.id;
                const RoleIcon = ROLE_ICONS[u.role_name] || Shield;

                return (
                  <tr key={u.id} className="hover:bg-[var(--bg-hover)] transition-colors">
                    <td>
                      <div className="flex items-center gap-3">
                        <div
                          className="w-9 h-9 rounded-xl flex items-center justify-center text-xs font-bold text-white shadow-sm flex-shrink-0"
                          style={{ background: 'var(--gradient-1)' }}
                        >
                          {u.avatar_initials}
                        </div>
                        <div className="flex flex-col">
                          <div className="flex items-center gap-1.5">
                            <span className="font-semibold text-[var(--text-primary)] text-sm">{u.full_name}</span>
                            {isCurrentUser && (
                              <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-500 border border-blue-500/20">
                                Anda
                              </span>
                            )}
                          </div>
                          <span
                            className="text-xs text-[var(--text-muted)] font-mono"
                            title={`Full User ID: ${u.id}`}
                          >
                            ID: #{formatUserId(u.id)}
                          </span>
                        </div>
                      </div>
                    </td>

                    <td className="text-sm font-medium text-[var(--text-secondary)]">{u.email}</td>

                    <td>
                      <div className="inline-flex items-center gap-1.5">
                        <span className={`badge flex items-center gap-1 py-1 px-2.5 ${ROLE_COLORS[u.role_name]}`}>
                          <RoleIcon className="w-3.5 h-3.5" />
                          <span>{ROLE_LABELS[u.role_name]}</span>
                        </span>
                      </div>
                    </td>

                    <td className="text-sm text-center">
                      {['DESIGNER', 'MOTION_PIC'].includes(u.role_name) ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                          {u.daily_capacity_points || 0} pts/hari
                        </span>
                      ) : (
                        <span className="text-xs text-[var(--text-muted)] font-mono">—</span>
                      )}
                    </td>

                    <td className="text-center">
                      {u.is_registered === false ? (
                        <span className="badge bg-amber-500/15 text-amber-500 border-amber-500/30 font-medium">
                          Pending Setup
                        </span>
                      ) : (
                        <span className={`badge ${u.is_active ? 'badge-success' : 'badge-error'} font-medium`}>
                          {u.is_active ? 'Aktif' : 'Nonaktif'}
                        </span>
                      )}
                    </td>

                    <td className="text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {canManage && (
                          u.role_name === 'ADMIN' ? (
                            <span
                              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-[var(--text-muted)] bg-[var(--bg-tertiary)] border border-[var(--border-primary)] opacity-75 cursor-not-allowed select-none"
                              title="Role Administrator bersifat permanen dan tidak dapat diubah"
                            >
                              <Lock className="w-3.5 h-3.5 text-amber-500" />
                              <span>Admin Terkunci</span>
                            </span>
                          ) : (
                            <button
                              onClick={() => handleOpenRoleModal(u)}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-[var(--bg-tertiary)] hover:bg-blue-500/10 hover:text-blue-500 border border-[var(--border-primary)] hover:border-blue-500/30 transition-all text-[var(--text-primary)]"
                              title="Ubah Role & Kapasitas"
                            >
                              <UserCog className="w-3.5 h-3.5" />
                              <span>Ubah Role</span>
                            </button>
                          )
                        )}

                        {canManage && !isCurrentUser && u.role_name !== 'ADMIN' && (
                          <button
                            onClick={() => handleDeleteUser(u.id, u.full_name || u.email)}
                            className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-red-500 hover:bg-red-500/10 transition-colors"
                            title="Hapus User"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Modal: Ubah Role User */}
      {showRoleModal && selectedUserForRole && (
        <div className="modal-overlay" onClick={() => setShowRoleModal(false)}>
          <div
            className="modal-content max-w-2xl w-full max-h-[90vh] flex flex-col p-0 overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="p-5 flex items-center justify-between border-b border-[var(--border-primary)] bg-[var(--bg-secondary)]">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-purple-500/10 text-purple-500">
                  <UserCog className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-[var(--text-primary)]">Ubah Role & Hak Akses</h2>
                  <p className="text-xs text-[var(--text-secondary)]">
                    Pilih role baru untuk mengatur wewenang dan modul yang dapat diakses oleh user ini.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowRoleModal(false)}
                className="btn-ghost p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <form onSubmit={handleSaveRole} className="p-6 space-y-6 overflow-y-auto custom-scrollbar flex-1">
              {/* User Profile Card */}
              <div className="p-4 rounded-xl bg-[var(--bg-tertiary)] border border-[var(--border-primary)] flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div
                    className="w-11 h-11 rounded-xl flex items-center justify-center font-bold text-white text-sm shadow"
                    style={{ background: 'var(--gradient-1)' }}
                  >
                    {selectedUserForRole.avatar_initials}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-[var(--text-primary)]">{selectedUserForRole.full_name}</span>
                      {selectedUserForRole.id === user?.id && (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-500 border border-blue-500/20">
                          Akun Anda
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-[var(--text-secondary)] mt-0.5">{selectedUserForRole.email}</div>
                  </div>
                </div>

                <div className="text-right">
                  <span className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider block mb-1">
                    Role Saat Ini
                  </span>
                  <span className={`badge ${ROLE_COLORS[selectedUserForRole.role_name]}`}>
                    {ROLE_LABELS[selectedUserForRole.role_name]}
                  </span>
                </div>
              </div>

              {/* Role Warning for Self-Demotion */}
              {selectedUserForRole.id === user?.id && selectedNewRole !== user?.role_name && (
                <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-600 dark:text-amber-400 flex items-start gap-2.5 text-xs">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5 text-amber-500" />
                  <div>
                    <strong className="font-semibold block">Perhatian Perubahan Akun Sendiri:</strong>
                    Anda sedang mengubah role akun Anda sendiri. Begitu disimpan, hak akses menu dan wewenang akun Anda
                    akan langsung disesuaikan dengan role baru.
                  </div>
                </div>
              )}

              {/* Role Error */}
              {roleModalError && (
                <div className="p-3.5 rounded-xl bg-red-500/10 border border-red-500/30 text-red-600 dark:text-red-400 flex items-start gap-2.5 text-xs">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5 text-red-500" />
                  <span>{roleModalError}</span>
                </div>
              )}

              {/* Role Selection Grid */}
              <div className="space-y-2.5">
                <label className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider">
                  Pilih Role yang Tersedia
                </label>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                  {ALL_ROLES.map(role => {
                    const RoleIcon = ROLE_ICONS[role];
                    const isSelected = selectedNewRole === role;
                    const isCurrent = selectedUserForRole.role_name === role;

                    return (
                      <div
                        key={role}
                        onClick={() => setSelectedNewRole(role)}
                        className={`p-3.5 rounded-xl border transition-all cursor-pointer flex flex-col justify-between ${
                          isSelected
                            ? 'bg-blue-500/5 border-[var(--accent-blue)] shadow-sm ring-1 ring-[var(--accent-blue)]'
                            : 'bg-[var(--bg-secondary)] border-[var(--border-primary)] hover:border-blue-500/40 hover:bg-[var(--bg-hover)]'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2.5">
                            <div
                              className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                                isSelected ? 'bg-blue-500 text-white' : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)]'
                              }`}
                            >
                              <RoleIcon className="w-4 h-4" />
                            </div>
                            <div>
                              <div className="flex items-center gap-1.5">
                                <span className="text-sm font-bold text-[var(--text-primary)]">
                                  {ROLE_LABELS[role]}
                                </span>
                                {isCurrent && (
                                  <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-500/10 text-slate-500 border border-slate-500/20 font-medium">
                                    Current
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>

                          <div
                            className={`w-4 h-4 rounded-full border flex items-center justify-center transition-colors ${
                              isSelected
                                ? 'bg-[var(--accent-blue)] border-[var(--accent-blue)] text-white'
                                : 'border-[var(--border-primary)] bg-[var(--bg-primary)]'
                            }`}
                          >
                            {isSelected && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                          </div>
                        </div>

                        <p className="text-xs text-[var(--text-secondary)] mt-2.5 line-clamp-2 leading-relaxed">
                          {ROLE_DESCRIPTIONS[role]}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Daily Capacity Points Section for Production Roles */}
              {['DESIGNER', 'MOTION_PIC'].includes(selectedNewRole) ? (
                <div className="p-4 rounded-xl bg-[var(--bg-tertiary)] border border-[var(--border-primary)] space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <label className="text-sm font-bold text-[var(--text-primary)] block">
                        Target Kapasitas Harian (Poin / Hari)
                      </label>
                      <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                        Poin kapasitas harian digunakan untuk menghitung occupancy rate tim produksi pada modul Workload & Capacity.
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                    <input
                      type="number"
                      step="0.5"
                      min="0"
                      max="100"
                      required
                      value={selectedCapacityPoints || ''}
                      onChange={e => setSelectedCapacityPoints(e.target.value === '' ? 0 : parseFloat(e.target.value))}
                      className="input w-full sm:w-36 font-semibold text-center text-base"
                    />

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setSelectedCapacityPoints(5.0)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                          selectedCapacityPoints === 5.0
                            ? 'bg-blue-500 text-white border-blue-500'
                            : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)] border-[var(--border-primary)] hover:border-[var(--text-muted)]'
                        }`}
                      >
                        5.0 Poin (Intern)
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelectedCapacityPoints(7.0)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                          selectedCapacityPoints === 7.0
                            ? 'bg-blue-500 text-white border-blue-500'
                            : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)] border-[var(--border-primary)] hover:border-[var(--text-muted)]'
                        }`}
                      >
                        7.0 Poin (Staff / Standar)
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-3.5 rounded-xl bg-slate-500/5 border border-slate-500/15 text-xs text-[var(--text-secondary)] flex items-center gap-2">
                  <Shield className="w-4 h-4 text-[var(--text-muted)] flex-shrink-0" />
                  <span>
                    Role <strong>{ROLE_LABELS[selectedNewRole]}</strong> bukan tim eksekutor produksi harian. Nilai kapasitas harian akan otomatis diset ke 0 poin.
                  </span>
                </div>
              )}

              {/* Modal Footer */}
              <div className="pt-4 border-t border-[var(--border-primary)] flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowRoleModal(false)}
                  disabled={isSavingRole}
                  className="btn-secondary"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSavingRole}
                  className="btn-primary flex items-center gap-2 shadow-lg shadow-blue-500/20"
                >
                  {isSavingRole ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Menyimpan Perubahan...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Simpan Perubahan Role</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Tambah User Baru (Invite) */}
      {showCreateModal && (
        <div className="modal-overlay" onClick={closeCreateModal}>
          <div className="modal-content max-w-md w-full" onClick={e => e.stopPropagation()}>
            <div className="p-6 flex items-center justify-between border-b border-[var(--border-primary)]">
              <h2 className="text-lg font-bold text-[var(--text-primary)]">
                {inviteLink ? 'User Berhasil Ditambahkan' : 'Tambah User Baru'}
              </h2>
              <button onClick={closeCreateModal} className="btn-ghost p-1.5 rounded-full">
                <X className="w-5 h-5" />
              </button>
            </div>

            {inviteLink ? (
              <div className="p-6 space-y-6">
                <div className="flex flex-col items-center justify-center text-center space-y-3">
                  <div className="w-12 h-12 rounded-full bg-emerald-500/10 flex items-center justify-center">
                    <CheckCircle2 className="w-6 h-6 text-emerald-500" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-[var(--text-primary)]">Akun Menunggu Aktivasi</h3>
                    <p className="text-sm text-[var(--text-secondary)] mt-1">
                      User telah didaftarkan ke sistem. Bagikan tautan undangan registrasi ini kepada user untuk menyelesaikan pembuatan password.
                    </p>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-semibold text-[var(--text-muted)] tracking-wider uppercase">
                    Tautan Undangan (Invite Link)
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      readOnly
                      value={inviteLink}
                      className="input flex-1 font-mono text-sm bg-[var(--bg-tertiary)]"
                    />
                    <button
                      onClick={handleCopyInvite}
                      className={`btn-primary px-3 transition-colors ${
                        copied ? 'bg-emerald-500 border-emerald-500' : ''
                      }`}
                      title="Salin Link"
                    >
                      {copied ? <CheckCircle2 className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div className="pt-5 mt-2 flex justify-center border-t border-[var(--border-primary)]">
                  <button type="button" onClick={closeCreateModal} className="btn-secondary w-full justify-center">
                    Selesai
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleCreateSubmit} className="p-6 space-y-5">
                <div className="space-y-1.5">
                  <label className="label">Alamat Email User</label>
                  <input
                    required
                    type="email"
                    className="input"
                    value={createFormData.email}
                    onChange={e => setCreateFormData({ ...createFormData, email: e.target.value })}
                    placeholder="nama@orbiz.id"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="label">Role Awal</label>
                  <select
                    className="select"
                    value={createFormData.role_name}
                    onChange={e => setCreateFormData({ ...createFormData, role_name: e.target.value as RoleName })}
                  >
                    {ALL_ROLES.map(val => (
                      <option key={val} value={val} className="bg-[var(--bg-secondary)] text-[var(--text-primary)]">
                        {ROLE_LABELS[val]}
                      </option>
                    ))}
                  </select>
                </div>

                {['DESIGNER', 'MOTION_PIC'].includes(createFormData.role_name) && (
                  <div className="space-y-1.5">
                    <label className="label">Target Poin Kapasitas Harian</label>
                    <input
                      required
                      type="number"
                      step="0.5"
                      min="0"
                      max="100"
                      className="input"
                      value={createFormData.daily_capacity_points || ''}
                      onChange={e =>
                        setCreateFormData({
                          ...createFormData,
                          daily_capacity_points: e.target.value === '' ? 0 : parseFloat(e.target.value),
                        })
                      }
                    />
                    <p className="text-[11px] text-[var(--text-muted)]">Default: 7.0 poin (Staff), 5.0 poin (Intern)</p>
                  </div>
                )}

                <div className="pt-5 mt-2 flex justify-end gap-3 border-t border-[var(--border-primary)]">
                  <button type="button" onClick={closeCreateModal} className="btn-secondary">
                    Batal
                  </button>
                  <button type="submit" disabled={isCreating} className="btn-primary flex items-center gap-2">
                    {isCreating ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Membuat...</span>
                      </>
                    ) : (
                      <>
                        <Mail className="w-4 h-4" />
                        <span>Buat & Buat Invite Link</span>
                      </>
                    )}
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
