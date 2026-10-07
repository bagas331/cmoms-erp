'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { getAuditLogs } from '@/lib/supabase-store';
import { AuditLog } from '@/lib/types';
import { Database, ShieldAlert, ArrowLeft } from 'lucide-react';
import { formatDisplayDateTime, formatUserId } from '@/lib/utils';
import Link from 'next/link';

export default function AuditTrailPage() {
  const { user, isLoading } = useAuth();
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterEntity, setFilterEntity] = useState<string>('all');

  useEffect(() => {
    if (!isLoading && user && user.role_name === 'ADMIN') {
      getAuditLogs()
        .then(data => {
          setLogs(data.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()));
        })
        .catch(console.error)
        .finally(() => {
          setLoading(false);
        });
    }
  }, [user, isLoading]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-2 rounded-full animate-spin" style={{ borderColor: 'var(--border-primary)', borderTopColor: 'var(--accent-blue)' }} />
      </div>
    );
  }

  // Access control: only ADMIN can view Audit Trail
  if (user?.role_name !== 'ADMIN') {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center space-y-4">
        <div className="p-3 rounded-2xl bg-red-500/10 text-red-500 border border-red-500/20">
          <ShieldAlert className="w-10 h-10" />
        </div>
        <div className="space-y-1">
          <h2 className="text-lg font-bold text-[var(--text-primary)]">Akses Ditolak</h2>
          <p className="text-sm text-[var(--text-secondary)] max-w-md">
            Halaman Audit Trail hanya dapat diakses oleh pengguna dengan role Administrator.
          </p>
        </div>
        <Link
          href="/dashboard"
          className="btn-primary inline-flex items-center gap-2 mt-2"
        >
          <ArrowLeft className="w-4 h-4" /> Kembali ke Dashboard
        </Link>
      </div>
    );
  }

  const filteredLogs = filterEntity === 'all' ? logs : logs.filter(l => l.entity_name === filterEntity);

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-[var(--text-primary)] flex items-center gap-2">
            <Database className="w-5 h-5" style={{ color: 'var(--text-muted)' }} />
            Audit Trail
          </h1>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            Log aktivitas dan riwayat perubahan data sistem (khusus Administrator)
          </p>
        </div>
        <select className="select w-auto" value={filterEntity} onChange={e => setFilterEntity(e.target.value)}>
          <option value="all">All Entities</option>
          <option value="creative_tasks">Creative Tasks</option>
          <option value="motion_tasks">Motion Tasks</option>
          <option value="users">Users / Role Changes</option>
        </select>
      </div>

      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th>Timestamp</th>
              <th>Action</th>
              <th>Entity</th>
              <th>Record ID</th>
              <th>Performed By</th>
              <th>Details</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} className="text-center py-8 text-sm" style={{ color: 'var(--text-muted)' }}>
                  Loading audit logs...
                </td>
              </tr>
            ) : filteredLogs.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-center py-8 text-sm" style={{ color: 'var(--text-muted)' }}>
                  No audit logs found.
                </td>
              </tr>
            ) : (
              filteredLogs.map(log => (
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
                  <td className="font-medium text-[var(--text-primary)] text-sm font-mono" title={log.entity_id}>
                    #{formatUserId(log.entity_id)}
                  </td>
                  <td className="text-sm text-[var(--text-primary)]">{log.performer_name}</td>
                  <td>
                    <div className="text-[10px] font-mono space-y-1 max-w-xs overflow-x-auto whitespace-pre-wrap" style={{ color: 'var(--text-muted)' }}>
                      {log.before_state && <div><span className="text-[var(--accent-red)]">-</span> {JSON.stringify(log.before_state)}</div>}
                      {log.after_state && <div><span className="text-[var(--accent-emerald)]">+</span> {JSON.stringify(log.after_state)}</div>}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
