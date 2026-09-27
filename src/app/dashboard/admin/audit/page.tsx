'use client';

import { useEffect, useState } from 'react';
import { getAuditLogs } from '@/lib/supabase-store';
import { AuditLog } from '@/lib/types';
import { Database, Filter } from 'lucide-react';
import { formatDisplayDateTime } from '@/lib/utils';

export default function AuditTrailPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [filterEntity, setFilterEntity] = useState<string>('all');

  useEffect(() => {
    getAuditLogs().then(data => {
      setLogs(data.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()));
    }).catch(console.error);
  }, []);

  const filteredLogs = filterEntity === 'all' ? logs : logs.filter(l => l.entity_name === filterEntity);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-[var(--text-primary)] flex items-center gap-2">
          <Database className="w-5 h-5" style={{ color: 'var(--text-muted)' }} />
          Audit Trail
        </h1>
        <select className="select w-auto" value={filterEntity} onChange={e => setFilterEntity(e.target.value)}>
          <option value="all">All Entities</option>
          <option value="creative_tasks">Creative Tasks</option>
          <option value="motion_tasks">Motion Tasks</option>
        </select>
      </div>
      <div className="table-container">
        <table>
          <thead><tr><th>Timestamp</th><th>Action</th><th>Entity</th><th>Record ID</th><th>Performed By</th><th>Details</th></tr></thead>
          <tbody>
            {filteredLogs.map(log => (
              <tr key={log.id}>
                <td className="text-sm" style={{ color: 'var(--text-secondary)' }}>{formatDisplayDateTime(log.timestamp)}</td>
                <td>
                  <span className={`badge ${log.action === 'CREATE' ? 'badge-success' : 
                    log.action.includes('STATUS') ? 'badge-info' : 
                    log.action.includes('REVISION') ? 'badge-warning' : 
                    'bg-slate-500/20 text-slate-600 border-slate-500/30'}`}>
                    {log.action.replace(/_/g, ' ')}
                  </span>
                </td>
                <td className="text-sm font-mono" style={{ color: 'var(--text-secondary)' }}>{log.entity_name}</td>
                <td className="font-medium text-[var(--text-primary)] text-sm">{log.entity_id}</td>
                <td className="text-sm text-[var(--text-primary)]">{log.performer_name}</td>
                <td>
                  <div className="text-[10px] font-mono space-y-1 max-w-xs overflow-x-auto whitespace-pre-wrap" style={{ color: 'var(--text-muted)' }}>
                    {log.before_state && <div><span className="text-[var(--accent-red)]">-</span> {JSON.stringify(log.before_state)}</div>}
                    {log.after_state && <div><span className="text-[var(--accent-emerald)]">+</span> {JSON.stringify(log.after_state)}</div>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
