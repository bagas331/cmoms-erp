'use client';

import { useEffect, useState } from 'react';
import { getClients, addClient } from '@/lib/supabase-store';
import { Client } from '@/lib/types';
import { Building2, Plus, X, Loader2 } from 'lucide-react';

export default function ClientsPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [name, setName] = useState('');
  const [type, setType] = useState<'INTERNAL' | 'EXTERNAL'>('EXTERNAL');

  const fetchClients = async () => {
    try {
      const data = await getClients();
      setClients(data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { 
    fetchClients(); 
  }, []);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    await addClient(name, type);
    await fetchClients();
    setName('');
    setShowAdd(false);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-[var(--text-primary)] flex items-center gap-2">
          <Building2 className="w-5 h-5" style={{ color: 'var(--accent-blue)' }} />
          Clients / Brands
        </h1>
        <button onClick={() => setShowAdd(true)} className="btn-primary"><Plus className="w-4 h-4" /> Add Client</button>
      </div>
      <div className="table-container">
        <table>
          <thead><tr><th>ID</th><th>Name</th><th>Type</th><th>Status</th><th>Created</th></tr></thead>
          <tbody>
            {clients.map(c => (
              <tr key={c.id}>
                <td className="text-sm" style={{ color: 'var(--text-muted)' }}>{c.id}</td>
                <td className="font-medium text-[var(--text-primary)] text-sm">{c.name}</td>
                <td><span className={`badge ${c.client_type === 'INTERNAL' ? 'bg-teal-500/20 text-teal-300 border-teal-500/30' : 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30'}`}>{c.client_type}</span></td>
                <td><span className={`badge ${c.is_active ? 'badge-success' : 'badge-error'}`}>{c.is_active ? 'Active' : 'Inactive'}</span></td>
                <td className="text-sm" style={{ color: 'var(--text-muted)' }}>{new Date(c.created_at).toLocaleDateString('id-ID')}</td>
              </tr>
            ))}
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
              <div className="space-y-1.5"><label className="label">Client Name *</label><input className="input" required value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Unilever" /></div>
              <div className="space-y-1.5"><label className="label">Client Type *</label>
                <select className="select" value={type} onChange={e => setType(e.target.value as 'INTERNAL' | 'EXTERNAL')}>
                  <option value="EXTERNAL" className="bg-[var(--bg-secondary)] text-[var(--text-primary)]">External</option>
                  <option value="INTERNAL" className="bg-[var(--bg-secondary)] text-[var(--text-primary)]">Internal</option>
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
