'use client';

import { useEffect, useState } from 'react';
import { getClients, addClient, deleteClient, getAllTasksWithRelations } from '@/lib/supabase-store';
import { Client, TaskWithRelations } from '@/lib/types';
import { formatDisplayDate } from '@/lib/utils';
import { Building2, Plus, X, Trash2, Loader2, AlertCircle, CheckCircle2, Layers } from 'lucide-react';

export default function ClientsPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [tasks, setTasks] = useState<TaskWithRelations[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [name, setName] = useState('');
  const [type, setType] = useState<'INTERNAL' | 'EXTERNAL'>('EXTERNAL');
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const fetchData = async () => {
    try {
      const [clientsData, tasksData] = await Promise.all([
        getClients(),
        getAllTasksWithRelations()
      ]);
      setClients(clientsData);
      setTasks(tasksData);
    } catch (err: any) {
      console.error('Failed to fetch clients:', err?.message || err);
      setErrorMessage(err?.message || 'Gagal memuat data clients.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { 
    fetchData(); 
  }, []);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSubmitting(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      await addClient(name.trim(), type);
      await fetchData();
      setName('');
      setShowAdd(false);
      setSuccessMessage(`Client/Brand "${name.trim()}" berhasil ditambahkan.`);
    } catch (err: any) {
      console.error('Failed to add client:', err?.message || err);
      setErrorMessage(err?.message || 'Gagal menambahkan client.');
    } finally {
      setSubmitting(false);
    }
  };

  const getTaskCountForClient = (clientId: number) => {
    return tasks.filter(t => t.client_id === clientId);
  };

  const handleDelete = async (client: Client) => {
    const relatedTasks = getTaskCountForClient(client.id);
    if (relatedTasks.length > 0) {
      const taskCodes = relatedTasks.slice(0, 3).map(t => t.task_code).join(', ');
      const moreCount = relatedTasks.length > 3 ? ` dan ${relatedTasks.length - 3} lainnya` : '';
      setErrorMessage(
        `Brand "${client.name}" tidak dapat dihapus karena masih digunakan oleh ${relatedTasks.length} tiket request (${taskCodes}${moreCount}). Ubah atau hapus tiket terkait terlebih dahulu.`
      );
      return;
    }

    const confirmed = confirm(`Apakah Anda yakin ingin menghapus client/brand "${client.name}"?`);
    if (!confirmed) return;

    setDeletingId(client.id);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      await deleteClient(client.id);
      await fetchData();
      setSuccessMessage(`Client/Brand "${client.name}" berhasil dihapus.`);
    } catch (err: any) {
      console.error('Failed to delete client:', err?.message || err);
      const msg = err?.message || 'Gagal menghapus client/brand. Pastikan tidak ada tiket aktif yang terhubung dengan brand ini.';
      setErrorMessage(msg);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-[var(--text-primary)] flex items-center gap-2">
            <Building2 className="w-5 h-5" style={{ color: 'var(--accent-blue)' }} />
            Clients / Brands
          </h1>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            Kelola daftar brand klien internal maupun eksternal
          </p>
        </div>
        <button onClick={() => { setShowAdd(true); setErrorMessage(null); }} className="btn-primary">
          <Plus className="w-4 h-4" /> Add Client
        </button>
      </div>

      {/* Success Notification Banner */}
      {successMessage && (
        <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 text-xs flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{successMessage}</span>
          </div>
          <button type="button" onClick={() => setSuccessMessage(null)} className="text-emerald-500 hover:text-emerald-700">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Error Notification Banner */}
      {errorMessage && (
        <div className="p-3.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-500 text-xs flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMessage}</span>
          </div>
          <button type="button" onClick={() => setErrorMessage(null)} className="text-red-500 hover:text-red-700">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Name</th>
              <th>Type</th>
              <th>Status</th>
              <th>Penggunaan di Tiket</th>
              <th>Created</th>
              <th className="text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} className="text-center py-8 text-sm" style={{ color: 'var(--text-muted)' }}>
                  <div className="flex items-center justify-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
                    <span>Memuat data clients...</span>
                  </div>
                </td>
              </tr>
            ) : clients.length === 0 ? (
              <tr>
                <td colSpan={7} className="text-center py-8 text-sm" style={{ color: 'var(--text-muted)' }}>
                  No clients/brands found.
                </td>
              </tr>
            ) : (
              clients.map(c => {
                const related = getTaskCountForClient(c.id);
                const isUsed = related.length > 0;
                const isDeleting = deletingId === c.id;

                return (
                  <tr key={c.id}>
                    <td className="text-sm font-mono" style={{ color: 'var(--text-muted)' }}>{c.id}</td>
                    <td className="font-medium text-[var(--text-primary)] text-sm">{c.name}</td>
                    <td>
                      <span className={`badge ${c.client_type === 'INTERNAL' ? 'bg-teal-500/20 text-teal-300 border-teal-500/30' : 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30'}`}>
                        {c.client_type}
                      </span>
                    </td>
                    <td>
                      <span className={`badge ${c.is_active ? 'badge-success' : 'badge-error'}`}>
                        {c.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td>
                      {isUsed ? (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-blue-500/10 text-blue-500 border border-blue-500/20">
                          <Layers className="w-3 h-3" />
                          {related.length} Tiket
                        </span>
                      ) : (
                        <span className="text-xs text-[var(--text-muted)]">
                          0 Tiket (Bebas)
                        </span>
                      )}
                    </td>
                    <td className="text-sm" style={{ color: 'var(--text-muted)' }}>
                      {formatDisplayDate(c.created_at)}
                    </td>
                    <td className="text-right">
                      <button
                        onClick={() => handleDelete(c)}
                        disabled={isDeleting}
                        title={isUsed ? `Digunakan oleh ${related.length} tiket request (klik untuk rincian)` : `Hapus brand ${c.name}`}
                        className={`p-1.5 rounded-lg transition-colors inline-flex items-center justify-center ${
                          isUsed 
                            ? 'text-[var(--text-muted)] hover:text-amber-500 hover:bg-amber-500/10' 
                            : 'text-[var(--accent-red)] hover:text-red-400 hover:bg-red-500/10'
                        }`}
                      >
                        {isDeleting ? (
                          <Loader2 className="w-4 h-4 animate-spin text-red-500" />
                        ) : (
                          <Trash2 className="w-4 h-4" />
                        )}
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {showAdd && (
        <div className="modal-overlay" onClick={() => setShowAdd(false)}>
          <div className="modal-content max-w-md w-full" onClick={e => e.stopPropagation()}>
            <div className="p-6 flex items-center justify-between" style={{ borderBottom: '1px solid var(--border-primary)' }}>
              <h2 className="text-lg font-bold text-[var(--text-primary)]">Add Client</h2>
              <button onClick={() => setShowAdd(false)} className="btn-ghost p-1.5 rounded-full"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleAdd} className="p-6 space-y-5">
              <div className="space-y-1.5">
                <label className="label">Client Name *</label>
                <input className="input w-full" required value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Unilever" />
              </div>
              <div className="space-y-1.5">
                <label className="label">Client Type *</label>
                <select className="select w-full" value={type} onChange={e => setType(e.target.value as 'INTERNAL' | 'EXTERNAL')}>
                  <option value="EXTERNAL" className="bg-[var(--bg-secondary)] text-[var(--text-primary)]">External</option>
                  <option value="INTERNAL" className="bg-[var(--bg-secondary)] text-[var(--text-primary)]">Internal</option>
                </select>
              </div>
              <div className="pt-5 mt-2 flex justify-end gap-3" style={{ borderTop: '1px solid var(--border-primary)' }}>
                <button type="button" onClick={() => setShowAdd(false)} className="btn-secondary">Cancel</button>
                <button type="submit" disabled={submitting} className="btn-primary">
                  {submitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" /> Adding...
                    </>
                  ) : (
                    <>
                      <Plus className="w-4 h-4" /> Add
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
