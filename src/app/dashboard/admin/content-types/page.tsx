'use client';

import { useEffect, useState } from 'react';
import { getContentTypes, addContentType, deleteContentType, getAllTasksWithRelations } from '@/lib/supabase-store';
import { DIFFICULTY_LABELS, DIFFICULTY_COLORS } from '@/lib/constants';
import { ContentType, DesignDifficulty, TaskWithRelations } from '@/lib/types';
import { FileType, Plus, X, Trash2, AlertCircle, CheckCircle2, Loader2, Layers } from 'lucide-react';

export default function ContentTypesPage() {
  const [types, setTypes] = useState<ContentType[]>([]);
  const [tasks, setTasks] = useState<TaskWithRelations[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [name, setName] = useState('');
  const [difficulty, setDifficulty] = useState<DesignDifficulty>('MEDIUM');
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const fetchData = async () => {
    try {
      const [contentTypesData, tasksData] = await Promise.all([
        getContentTypes(),
        getAllTasksWithRelations()
      ]);
      setTypes(contentTypesData);
      setTasks(tasksData);
    } catch (err: any) {
      console.error('Failed to fetch content types:', err?.message || err);
      setErrorMessage(err?.message || 'Gagal memuat data content types.');
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
      await addContentType(name.trim(), difficulty);
      await fetchData();
      setName('');
      setShowAdd(false);
      setSuccessMessage(`Tipe konten "${name.trim()}" berhasil ditambahkan.`);
    } catch (err: any) {
      console.error('Failed to add content type:', err?.message || err);
      setErrorMessage(err?.message || 'Gagal menambahkan tipe konten.');
    } finally {
      setSubmitting(false);
    }
  };

  const getTaskCountForType = (typeId: number) => {
    return tasks.filter(t => t.content_type_id === typeId);
  };

  const handleDelete = async (ct: ContentType) => {
    const relatedTasks = getTaskCountForType(ct.id);
    if (relatedTasks.length > 0) {
      const taskCodes = relatedTasks.slice(0, 3).map(t => t.task_code).join(', ');
      const moreCount = relatedTasks.length > 3 ? ` dan ${relatedTasks.length - 3} lainnya` : '';
      setErrorMessage(
        `Tipe konten "${ct.name}" tidak dapat dihapus karena masih digunakan oleh ${relatedTasks.length} tiket request (${taskCodes}${moreCount}). Ubah atau hapus tiket terkait terlebih dahulu.`
      );
      return;
    }

    const confirmed = confirm(`Apakah Anda yakin ingin menghapus tipe konten "${ct.name}"?`);
    if (!confirmed) return;

    setDeletingId(ct.id);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      await deleteContentType(ct.id);
      await fetchData();
      setSuccessMessage(`Tipe konten "${ct.name}" berhasil dihapus.`);
    } catch (err: any) {
      console.error('Failed to delete content type:', err?.message || err);
      const msg = err?.message || 'Gagal menghapus tipe konten. Pastikan tidak ada tiket aktif yang menggunakan tipe konten ini.';
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
            <FileType className="w-5 h-5" style={{ color: 'var(--accent-purple)' }} />
            Content Types
          </h1>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            Kelola jenis dan format konten beserta estimasi poin kesulitannya
          </p>
        </div>
        <button onClick={() => { setShowAdd(true); setErrorMessage(null); }} className="btn-primary">
          <Plus className="w-4 h-4" /> Add Type
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
              <th>Default Difficulty</th>
              <th>Penggunaan di Tiket</th>
              <th className="text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} className="text-center py-8 text-sm" style={{ color: 'var(--text-muted)' }}>
                  <div className="flex items-center justify-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin text-purple-500" />
                    <span>Memuat data content types...</span>
                  </div>
                </td>
              </tr>
            ) : types.length === 0 ? (
              <tr>
                <td colSpan={5} className="text-center py-8 text-sm" style={{ color: 'var(--text-muted)' }}>
                  No content types found.
                </td>
              </tr>
            ) : (
              types.map(ct => {
                const related = getTaskCountForType(ct.id);
                const isUsed = related.length > 0;
                const isDeleting = deletingId === ct.id;

                return (
                  <tr key={ct.id}>
                    <td className="text-sm font-mono" style={{ color: 'var(--text-muted)' }}>{ct.id}</td>
                    <td className="font-medium text-[var(--text-primary)] text-sm">{ct.name}</td>
                    <td>
                      <span className={`badge ${DIFFICULTY_COLORS[ct.default_difficulty]}`}>
                        {DIFFICULTY_LABELS[ct.default_difficulty]}
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
                    <td className="text-right">
                      <button
                        onClick={() => handleDelete(ct)}
                        disabled={isDeleting}
                        title={isUsed ? `Digunakan oleh ${related.length} tiket request (klik untuk rincian)` : `Hapus tipe konten ${ct.name}`}
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
              <h2 className="text-lg font-bold text-[var(--text-primary)]">Add Content Type</h2>
              <button onClick={() => setShowAdd(false)} className="btn-ghost p-1.5 rounded-full"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleAdd} className="p-6 space-y-5">
              <div className="space-y-1.5">
                <label className="label">Type Name *</label>
                <input className="input w-full" required value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Landing Page" />
              </div>
              <div className="space-y-1.5">
                <label className="label">Default Difficulty *</label>
                <select className="select w-full" value={difficulty} onChange={e => setDifficulty(e.target.value as DesignDifficulty)}>
                  <option value="LOW" className="bg-[var(--bg-secondary)] text-[var(--text-primary)]">Low (2.5 pts)</option>
                  <option value="MEDIUM" className="bg-[var(--bg-secondary)] text-[var(--text-primary)]">Medium (3.5 pts)</option>
                  <option value="HIGH" className="bg-[var(--bg-secondary)] text-[var(--text-primary)]">High (4.5 pts)</option>
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
