'use client';

import { useEffect, useState } from 'react';
import { getContentTypes, addContentType } from '@/lib/supabase-store';
import { DIFFICULTY_LABELS, DIFFICULTY_COLORS } from '@/lib/constants';
import { ContentType, DesignDifficulty } from '@/lib/types';
import { FileType, Plus, X } from 'lucide-react';

export default function ContentTypesPage() {
  const [types, setTypes] = useState<ContentType[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [name, setName] = useState('');
  const [difficulty, setDifficulty] = useState<DesignDifficulty>('MEDIUM');

  const fetchTypes = async () => {
    const data = await getContentTypes();
    setTypes(data);
  };

  useEffect(() => { 
    fetchTypes(); 
  }, []);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    await addContentType(name, difficulty);
    await fetchTypes();
    setName('');
    setShowAdd(false);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-[var(--text-primary)] flex items-center gap-2">
          <FileType className="w-5 h-5" style={{ color: 'var(--accent-purple)' }} />
          Content Types
        </h1>
        <button onClick={() => setShowAdd(true)} className="btn-primary"><Plus className="w-4 h-4" /> Add Type</button>
      </div>
      <div className="table-container">
        <table>
          <thead><tr><th>ID</th><th>Name</th><th>Default Difficulty</th></tr></thead>
          <tbody>
            {types.map(ct => (
              <tr key={ct.id}>
                <td className="text-sm" style={{ color: 'var(--text-muted)' }}>{ct.id}</td>
                <td className="font-medium text-[var(--text-primary)] text-sm">{ct.name}</td>
                <td><span className={`badge ${DIFFICULTY_COLORS[ct.default_difficulty]}`}>{DIFFICULTY_LABELS[ct.default_difficulty]}</span></td>
              </tr>
            ))}
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
              <div className="space-y-1.5"><label className="label">Type Name *</label><input className="input" required value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Landing Page" /></div>
              <div className="space-y-1.5"><label className="label">Default Difficulty *</label>
                <select className="select" value={difficulty} onChange={e => setDifficulty(e.target.value as DesignDifficulty)}>
                  <option value="LOW" className="bg-[var(--bg-secondary)] text-[var(--text-primary)]">Low (2.5 pts)</option>
                  <option value="MEDIUM" className="bg-[var(--bg-secondary)] text-[var(--text-primary)]">Medium (3.5 pts)</option>
                  <option value="HIGH" className="bg-[var(--bg-secondary)] text-[var(--text-primary)]">High (4.5 pts)</option>
                </select>
              </div>
              <div className="pt-5 mt-2 flex justify-end gap-3" style={{ borderTop: '1px solid var(--border-primary)' }}>
                <button type="button" onClick={() => setShowAdd(false)} className="btn-secondary">Cancel</button>
                <button type="submit" className="btn-primary"><Plus className="w-4 h-4" /> Add</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
