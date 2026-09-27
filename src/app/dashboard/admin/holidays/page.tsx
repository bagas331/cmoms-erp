'use client';

import { useEffect, useState } from 'react';
import { getHolidays, addHoliday, deleteHoliday } from '@/lib/supabase-store';
import { Holiday } from '@/lib/types';
import { formatDisplayDate } from '@/lib/utils';
import { Calendar, Plus, Trash2, X } from 'lucide-react';

export default function HolidaysPage() {
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [date, setDate] = useState('');
  const [desc, setDesc] = useState('');

  const fetchHolidays = async () => {
    const data = await getHolidays();
    setHolidays(data);
  };

  useEffect(() => { 
    fetchHolidays(); 
  }, []);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    await addHoliday(date, desc);
    await fetchHolidays();
    setDate(''); setDesc('');
    setShowAdd(false);
  };

  const handleDelete = async (d: string) => {
    await deleteHoliday(d);
    await fetchHolidays();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-[var(--text-primary)] flex items-center gap-2">
            <Calendar className="w-5 h-5" style={{ color: 'var(--accent-amber)' }} />
            Holiday Calendar
          </h1>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            Holidays are excluded from SLA business day calculations
          </p>
        </div>
        <button onClick={() => setShowAdd(true)} className="btn-primary"><Plus className="w-4 h-4" /> Add Holiday</button>
      </div>
      <div className="table-container">
        <table>
          <thead><tr><th>Date</th><th>Display</th><th>Description</th><th>Actions</th></tr></thead>
          <tbody>
            {holidays.map(h => (
              <tr key={h.holiday_date}>
                <td className="font-mono text-sm" style={{ color: 'var(--accent-blue)' }}>{h.holiday_date}</td>
                <td className="text-sm" style={{ color: 'var(--text-secondary)' }}>{formatDisplayDate(h.holiday_date)}</td>
                <td className="font-medium text-[var(--text-primary)] text-sm">{h.description}</td>
                <td>
                  <button onClick={() => handleDelete(h.holiday_date)} className="btn-ghost p-1 text-[var(--accent-red)] hover:text-red-300">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {showAdd && (
        <div className="modal-overlay" onClick={() => setShowAdd(false)}>
          <div className="modal-content max-w-md w-full" onClick={e => e.stopPropagation()}>
            <div className="p-6 flex items-center justify-between" style={{ borderBottom: '1px solid var(--border-primary)' }}>
              <h2 className="text-lg font-bold text-[var(--text-primary)]">Add Holiday</h2>
              <button onClick={() => setShowAdd(false)} className="btn-ghost p-1.5 rounded-full"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleAdd} className="p-6 space-y-5">
              <div className="space-y-1.5"><label className="label">Date *</label><input className="input w-full" type="date" required value={date} onChange={e => setDate(e.target.value)} /></div>
              <div className="space-y-1.5"><label className="label">Description *</label><input className="input w-full" required value={desc} onChange={e => setDesc(e.target.value)} placeholder="e.g. Hari Kemerdekaan RI" /></div>
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
