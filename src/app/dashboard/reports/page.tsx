'use client';

import { useEffect, useState } from 'react';
import { getTasks, getClients, getUsers, getMotionTasks } from '@/lib/supabase-store';
import { EXCELLENCE_COLORS, EXCELLENCE_LABELS, SOURCE_LABELS } from '@/lib/constants';
import { CreativeTask, MotionTask, OperationalExcellence, Client, User } from '@/lib/types';
import { getMonthName } from '@/lib/utils';
import { downloadCSV } from '@/lib/export';
import { BarChart3, TrendingUp, Target, FileText, PieChart, Users, Calendar, Film, Download, CheckCircle2 } from 'lucide-react';

export default function ReportsPage() {
  const [tasks, setTasks] = useState<CreativeTask[]>([]);
  const [motionTasks, setMotionTasks] = useState<MotionTask[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  
  const [filterMonth, setFilterMonth] = useState<string>('all');
  const [filterYear, setFilterYear] = useState<string>(() => String(new Date().getFullYear()));
  const [activeTab, setActiveTab] = useState<'GRAPHIC' | 'MOTION'>('GRAPHIC');

  useEffect(() => { 
    Promise.all([getTasks(), getMotionTasks(), getClients(), getUsers()]).then(([t, m, c, u]) => {
      setTasks(t);
      setMotionTasks(m);
      setClients(c);
      setUsers(u);
    }).catch(console.error);
  }, []);

  const availableYears = Array.from(new Set([
    ...tasks.map(t => (t.req_date || t.created_at || '').substring(0, 4)).filter(Boolean),
    ...motionTasks.map(m => (m.created_at || '').substring(0, 4)).filter(Boolean),
    String(new Date().getFullYear())
  ])).sort().reverse();

  // Filter tasks based on global Month and Year filter
  const filteredTasks = tasks.filter(t => {
    const dStr = t.req_date || t.created_at || '';
    if (!dStr) return true;
    const yearStr = dStr.substring(0, 4);
    const monthStr = dStr.substring(5, 7);
    if (filterYear !== 'all' && yearStr !== filterYear) return false;
    if (filterMonth !== 'all' && monthStr !== filterMonth) return false;
    return true;
  });

  const filteredMotionTasks = motionTasks.filter(mt => {
    const dStr = mt.created_at || '';
    if (!dStr) return true;
    const yearStr = dStr.substring(0, 4);
    const monthStr = dStr.substring(5, 7);
    if (filterYear !== 'all' && yearStr !== filterYear) return false;
    if (filterMonth !== 'all' && monthStr !== filterMonth) return false;
    return true;
  });

  const completedTasks = filteredTasks.filter(t => t.operational_excellence || ['DESIGN_APPROVED', 'TASK_CLOSED'].includes(t.status_design));
  const completedMotionTasks = filteredMotionTasks.filter(m => ['APPROVED', 'COMPLETED'].includes(m.status_motion));

  // By Brand
  const byBrand = clients.map(c => {
    const brandTasks = completedTasks.filter(t => t.client_id === c.id);
    return {
      brand: c.name,
      total: brandTasks.length,
      excellence: brandTasks.filter(t => t.operational_excellence === 'EXCELLENCE').length,
      good: brandTasks.filter(t => t.operational_excellence === 'GOOD').length,
      bad: brandTasks.filter(t => t.operational_excellence === 'BAD').length,
    };
  }).filter(b => b.total > 0).sort((a, b) => b.total - a.total);

  // By Month
  const byMonth: Record<string, { total: number; excellence: number; good: number; bad: number }> = {};
  completedTasks.forEach(t => {
    const dStr = t.req_date || t.created_at || '';
    if (!dStr) return;
    const key = dStr.substring(0, 7);
    if (!byMonth[key]) byMonth[key] = { total: 0, excellence: 0, good: 0, bad: 0 };
    byMonth[key].total++;
    if (t.operational_excellence === 'EXCELLENCE') byMonth[key].excellence++;
    if (t.operational_excellence === 'GOOD') byMonth[key].good++;
    if (t.operational_excellence === 'BAD') byMonth[key].bad++;
  });
  const monthEntries = Object.entries(byMonth).sort((a, b) => a[0].localeCompare(b[0]));

  // By Designer
  const designers = users.filter(u => ['DESIGNER', 'TEAM_LEAD'].includes(u.role_name));
  const byDesigner = designers.map(d => {
    const dTasks = completedTasks.filter(t => t.design_pic_id === d.id);
    return {
      name: d.full_name,
      total: dTasks.length,
      excellence: dTasks.filter(t => t.operational_excellence === 'EXCELLENCE').length,
      good: dTasks.filter(t => t.operational_excellence === 'GOOD').length,
      bad: dTasks.filter(t => t.operational_excellence === 'BAD').length,
      avg_sla: dTasks.length > 0 ? dTasks.reduce((sum, t) => sum + (t.sla_working_days || 0), 0) / dTasks.length : 0,
      revisions: dTasks.reduce((sum, t) => sum + t.design_revision_count, 0),
    };
  }).filter(d => d.total > 0).sort((a, b) => b.total - a.total);

  // By Motion Designer
  const motionDesigners = users.filter(u => ['MOTION_PIC', 'TEAM_LEAD'].includes(u.role_name));
  const byMotionDesigner = motionDesigners.map(d => {
    const dTasks = completedMotionTasks.filter(t => t.motion_pic_id === d.id);
    return {
      name: d.full_name,
      total: dTasks.length,
      revisions: dTasks.reduce((sum, t) => sum + t.motion_revision_count, 0),
    };
  }).filter(d => d.total > 0).sort((a, b) => b.total - a.total);

  // By Source
  const bySource = { 
    ORCA: completedTasks.filter(t => t.task_source === 'ORCA').length, 
    ECOMMERCE: completedTasks.filter(t => t.task_source === 'ECOMMERCE').length 
  };

  const totalExcellence = completedTasks.filter(t => t.operational_excellence === 'EXCELLENCE').length;
  const totalGood = completedTasks.filter(t => t.operational_excellence === 'GOOD').length;
  const totalBad = completedTasks.filter(t => t.operational_excellence === 'BAD').length;

  // Workload Tracking by PIC
  const allPics = users.filter(u => ['DESIGNER', 'TEAM_LEAD', 'MOTION_PIC'].includes(u.role_name));
  const workloadByPic = allPics.map(pic => {
    const gd = filteredTasks.filter(t => t.design_pic_id === pic.id);
    const mo = filteredMotionTasks.filter(m => m.motion_pic_id === pic.id);
    
    return {
      name: pic.full_name,
      role: pic.role_name,
      total: gd.length + mo.length,
      graphic: {
        total: gd.length,
        queued: gd.filter(t => ['DESIGN_UNASSIGNED', 'DESIGN_ASSIGNED'].includes(t.status_design)).length,
        in_progress: gd.filter(t => t.status_design === 'DESIGN_IN_PROGRESS').length,
        submitted: gd.filter(t => t.status_design === 'DESIGN_SUBMITTED').length,
        revision: gd.filter(t => t.status_design === 'DESIGN_REVISION').length,
        done: gd.filter(t => ['DESIGN_APPROVED', 'TASK_CLOSED'].includes(t.status_design)).length,
      },
      motion: {
        total: mo.length,
        queued: mo.filter(m => m.status_motion === 'QUEUED').length,
        in_progress: mo.filter(m => m.status_motion === 'IN_PROGRESS').length,
        submitted: mo.filter(m => m.status_motion === 'SUBMITTED').length,
        revision: mo.filter(m => m.status_motion === 'REVISION').length,
        done: mo.filter(m => ['APPROVED', 'COMPLETED'].includes(m.status_motion)).length,
      }
    };
  }).filter(p => p.total > 0).sort((a, b) => b.total - a.total);

  const getPeriodLabel = () => {
    if (filterMonth === 'all' && filterYear === 'all') return 'All Time';
    if (filterMonth === 'all') return `Year ${filterYear}`;
    if (filterYear === 'all') return `${getMonthName(Number(filterMonth))} (All Years)`;
    return `${getMonthName(Number(filterMonth))} ${filterYear}`;
  };

  return (
    <div className="space-y-6">
      {/* Page Header with Global Filter */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-[var(--text-primary)] flex items-center gap-2">
            <BarChart3 className="w-5 h-5" style={{ color: 'var(--accent-cyan)' }} />
            Reports & Analytics
          </h1>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            Operational performance reports and SLA analytics • Cutoff: <strong className="text-[var(--text-primary)]">{getPeriodLabel()}</strong>
          </p>
        </div>

        {/* Global Month & Year Filter Bar */}
        <div className="flex flex-wrap items-center gap-3 bg-[var(--bg-card)] p-2 rounded-xl border border-[var(--border-primary)] shadow-sm">
          <div className="flex items-center gap-2 px-2 py-1 bg-[var(--bg-secondary)] rounded-lg border border-[var(--border-secondary)]">
            <Calendar className="w-4 h-4 text-[var(--accent-blue)]" />
            
            <select 
              className="select border-none bg-transparent py-1 text-sm focus:ring-0 min-w-[120px] cursor-pointer" 
              value={filterMonth} 
              onChange={(e) => setFilterMonth(e.target.value)}
            >
              <option value="all">All Months</option>
              {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                <option key={m} value={String(m).padStart(2, '0')}>{getMonthName(m)}</option>
              ))}
            </select>

            <div className="w-px h-4 bg-[var(--border-primary)]"></div>

            <select 
              className="select border-none bg-transparent py-1 text-sm focus:ring-0 min-w-[100px] cursor-pointer" 
              value={filterYear} 
              onChange={(e) => setFilterYear(e.target.value)}
            >
              <option value="all">All Years</option>
              {availableYears.map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>

          <span className="badge text-xs px-2.5 py-1 bg-cyan-500/10 text-cyan-400 border-cyan-500/30">
            {getPeriodLabel()}
          </span>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-4 border-b border-[var(--border-primary)] mb-6">
        <button
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === 'GRAPHIC' ? 'border-[var(--accent-cyan)] text-[var(--text-primary)]' : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'}`}
          onClick={() => setActiveTab('GRAPHIC')}
        >
          Graphic Design
        </button>
        <button
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === 'MOTION' ? 'border-[var(--accent-cyan)] text-[var(--text-primary)]' : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'}`}
          onClick={() => setActiveTab('MOTION')}
        >
          Motion Graphics
        </button>
      </div>

      {/* Summary Cards */}
      {activeTab === 'GRAPHIC' && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <div className="stat-card">
            <p className="text-2xl font-bold text-[var(--text-primary)]">{filteredTasks.length}</p>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Total Tasks ({getPeriodLabel()})</p>
          </div>
          <div className="stat-card">
            <p className="text-2xl font-bold text-[var(--text-primary)]">{completedTasks.length}</p>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Completed</p>
          </div>
          <div className="stat-card">
            <p className="text-2xl font-bold text-[var(--accent-emerald)]">{totalExcellence}</p>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Excellence</p>
          </div>
          <div className="stat-card">
            <p className="text-2xl font-bold text-[var(--accent-blue)]">{totalGood}</p>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Good</p>
          </div>
          <div className="stat-card">
            <p className="text-2xl font-bold text-[var(--accent-red)]">{totalBad}</p>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Bad</p>
          </div>
        </div>
      )}

      {activeTab === 'MOTION' && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <div className="stat-card">
            <p className="text-2xl font-bold text-[var(--text-primary)]">{filteredMotionTasks.length}</p>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Total Tasks ({getPeriodLabel()})</p>
          </div>
          <div className="stat-card">
            <p className="text-2xl font-bold text-[var(--accent-emerald)]">{completedMotionTasks.length}</p>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Completed</p>
          </div>
          <div className="stat-card">
            <p className="text-2xl font-bold text-[var(--accent-amber)]">{filteredMotionTasks.filter(m => m.status_motion === 'QUEUED').length}</p>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Queued</p>
          </div>
          <div className="stat-card">
            <p className="text-2xl font-bold text-[var(--accent-blue)]">{filteredMotionTasks.filter(m => m.status_motion === 'IN_PROGRESS').length}</p>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>In Progress</p>
          </div>
          <div className="stat-card">
            <p className="text-2xl font-bold text-[var(--accent-red)]">{filteredMotionTasks.filter(m => m.status_motion === 'REVISION').length}</p>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Revision</p>
          </div>
        </div>
      )}

      {/* PIC Workload Tracking */}
      <div className="card-static p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
          <h3 className="font-semibold text-[var(--text-primary)] flex items-center gap-2">
            <Users className="w-5 h-5" style={{ color: 'var(--accent-blue)' }} />
            Designer & Motion PIC Workload Tracking ({getPeriodLabel()})
          </h3>
          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                if (activeTab === 'GRAPHIC') {
                  const data = users.filter(u => ['DESIGNER', 'TEAM_LEAD'].includes(u.role_name)).map(u => {
                    const uTasks = filteredTasks.filter(t => t.design_pic_id === u.id);
                    return {
                      'PIC Name': u.full_name,
                      'Period': getPeriodLabel(),
                      'Total Assigned': uTasks.length,
                      'Completed': uTasks.filter(t => ['TASK_CLOSED', 'DESIGN_APPROVED'].includes(t.status_design)).length,
                      'In Progress': uTasks.filter(t => !['TASK_CLOSED', 'DESIGN_APPROVED'].includes(t.status_design)).length
                    };
                  });
                  downloadCSV(data, `Workload_Graphic_${filterYear}_${filterMonth}.csv`);
                } else {
                  const data = users.filter(u => ['MOTION_PIC', 'TEAM_LEAD'].includes(u.role_name)).map(u => {
                    const uTasks = filteredMotionTasks.filter(t => t.motion_pic_id === u.id);
                    return {
                      'PIC Name': u.full_name,
                      'Period': getPeriodLabel(),
                      'Total Assigned': uTasks.length,
                      'Completed': uTasks.filter(t => ['COMPLETED', 'APPROVED'].includes(t.status_motion)).length,
                      'In Progress': uTasks.filter(t => !['COMPLETED', 'APPROVED'].includes(t.status_motion)).length
                    };
                  });
                  downloadCSV(data, `Workload_Motion_${filterYear}_${filterMonth}.csv`);
                }
              }}
              className="btn-outline text-xs px-3 py-1.5 h-auto border-[var(--border-primary)]"
            >
              <Download className="w-3.5 h-3.5 mr-1" />
              Download CSV
            </button>
          </div>
        </div>

        <div className="table-container" style={{ border: 'none' }}>
          <table>
            <thead>
              <tr>
                <th className="min-w-[150px]">PIC Name</th>
                <th className="text-center w-24">Role</th>
                <th className="text-center w-24">Total</th>
                {activeTab === 'GRAPHIC' && <th>Graphic Design Pipeline</th>}
                {activeTab === 'MOTION' && <th>Motion Pipeline</th>}
              </tr>
            </thead>
            <tbody>
              {workloadByPic.filter(p => activeTab === 'GRAPHIC' ? (p.graphic.total > 0 || p.role.includes('DESIGNER')) : (p.motion.total > 0 || p.role.includes('MOTION'))).map(p => (
                <tr key={p.name}>
                  <td className="font-medium text-[var(--text-primary)] text-sm">{p.name}</td>
                  <td className="text-center">
                    <span className="badge text-[10px]" style={{ background: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}>
                      {p.role.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="text-center font-bold text-[var(--text-primary)]">{activeTab === 'GRAPHIC' ? p.graphic.total : p.motion.total}</td>
                  {activeTab === 'GRAPHIC' && (
                  <td>
                    {p.graphic.total > 0 ? (
                      <div className="flex flex-wrap gap-1.5">
                        {p.graphic.queued > 0 && <span className="badge text-[10px] bg-slate-500/20 text-slate-300 border-slate-500/30">Q: {p.graphic.queued}</span>}
                        {p.graphic.in_progress > 0 && <span className="badge text-[10px] bg-blue-500/20 text-blue-400 border-blue-500/30">IP: {p.graphic.in_progress}</span>}
                        {p.graphic.submitted > 0 && <span className="badge text-[10px] bg-indigo-500/20 text-indigo-400 border-indigo-500/30">S: {p.graphic.submitted}</span>}
                        {p.graphic.revision > 0 && <span className="badge text-[10px] bg-amber-500/20 text-amber-400 border-amber-500/30">R: {p.graphic.revision}</span>}
                        {p.graphic.done > 0 && <span className="badge text-[10px] bg-emerald-500/20 text-emerald-400 border-emerald-500/30">D: {p.graphic.done}</span>}
                      </div>
                    ) : (
                      <span className="text-xs text-[var(--text-muted)]">-</span>
                    )}
                  </td>
                  )}
                  {activeTab === 'MOTION' && (
                  <td>
                    {p.motion.total > 0 ? (
                      <div className="flex flex-wrap gap-1.5">
                        {p.motion.queued > 0 && <span className="badge text-[10px] bg-slate-500/20 text-slate-300 border-slate-500/30">Q: {p.motion.queued}</span>}
                        {p.motion.in_progress > 0 && <span className="badge text-[10px] bg-blue-500/20 text-blue-400 border-blue-500/30">IP: {p.motion.in_progress}</span>}
                        {p.motion.submitted > 0 && <span className="badge text-[10px] bg-indigo-500/20 text-indigo-400 border-indigo-500/30">S: {p.motion.submitted}</span>}
                        {p.motion.revision > 0 && <span className="badge text-[10px] bg-amber-500/20 text-amber-400 border-amber-500/30">R: {p.motion.revision}</span>}
                        {p.motion.done > 0 && <span className="badge text-[10px] bg-emerald-500/20 text-emerald-400 border-emerald-500/30">D: {p.motion.done}</span>}
                      </div>
                    ) : (
                      <span className="text-xs text-[var(--text-muted)]">-</span>
                    )}
                  </td>
                  )}
                </tr>
              ))}
              {workloadByPic.filter(p => activeTab === 'GRAPHIC' ? (p.graphic.total > 0 || p.role.includes('DESIGNER')) : (p.motion.total > 0 || p.role.includes('MOTION'))).length === 0 && (
                <tr>
                  <td colSpan={4} className="text-center py-8 text-sm" style={{ color: 'var(--text-muted)' }}>
                    No tasks found for period {getPeriodLabel()}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* SLA by Month */}
        {activeTab === 'GRAPHIC' && (
        <div className="card-static p-5">
          <h3 className="font-semibold text-[var(--text-primary)] mb-4 flex items-center gap-2">
            <TrendingUp className="w-4 h-4" style={{ color: 'var(--accent-cyan)' }} />
            SLA Performance by Month
          </h3>
          <div className="space-y-3">
            {monthEntries.map(([month, data]) => {
              const [y, m] = month.split('-');
              return (
                <div key={month}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm text-[var(--text-primary)]">{getMonthName(Number(m))} {y}</span>
                    <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{data.total} tasks</span>
                  </div>
                  <div className="flex h-6 rounded-md overflow-hidden" style={{ background: 'var(--bg-tertiary)' }}>
                    {data.excellence > 0 && (
                      <div className="h-full flex items-center justify-center text-[9px] font-bold text-[var(--text-primary)]"
                        style={{ width: `${(data.excellence / data.total) * 100}%`, background: 'var(--accent-emerald)', minWidth: data.excellence > 0 ? 20 : 0 }}>
                        {data.excellence}
                      </div>
                    )}
                    {data.good > 0 && (
                      <div className="h-full flex items-center justify-center text-[9px] font-bold text-[var(--text-primary)]"
                        style={{ width: `${(data.good / data.total) * 100}%`, background: 'var(--accent-blue)', minWidth: data.good > 0 ? 20 : 0 }}>
                        {data.good}
                      </div>
                    )}
                    {data.bad > 0 && (
                      <div className="h-full flex items-center justify-center text-[9px] font-bold text-[var(--text-primary)]"
                        style={{ width: `${(data.bad / data.total) * 100}%`, background: 'var(--accent-red)', minWidth: data.bad > 0 ? 20 : 0 }}>
                        {data.bad}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
            {monthEntries.length === 0 && (
              <p className="text-sm text-[var(--text-muted)] text-center py-4">No completed tasks in this period</p>
            )}
          </div>
          <div className="flex gap-4 mt-4 pt-3" style={{ borderTop: '1px solid var(--border-primary)' }}>
            {(['EXCELLENCE', 'GOOD', 'BAD'] as OperationalExcellence[]).map(s => (
              <div key={s} className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-sm" style={{ background: s === 'EXCELLENCE' ? 'var(--accent-emerald)' : s === 'GOOD' ? 'var(--accent-blue)' : 'var(--accent-red)' }} />
                <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{EXCELLENCE_LABELS[s]}</span>
              </div>
            ))}
          </div>
        </div>
        )}

        {/* SLA by Brand */}
        {activeTab === 'GRAPHIC' && (
        <div className="card-static p-5">
          <h3 className="font-semibold text-[var(--text-primary)] mb-4 flex items-center gap-2">
            <Target className="w-4 h-4" style={{ color: 'var(--accent-purple)' }} />
            SLA Performance by Brand
          </h3>
          <div className="table-container" style={{ border: 'none' }}>
            <table>
              <thead>
                <tr>
                  <th>Brand</th>
                  <th className="text-center">Total</th>
                  <th className="text-center">Excellence</th>
                  <th className="text-center">Good</th>
                  <th className="text-center">Bad</th>
                  <th className="text-center">Rate</th>
                </tr>
              </thead>
              <tbody>
                {byBrand.map(b => (
                  <tr key={b.brand}>
                    <td className="font-medium text-[var(--text-primary)] text-sm">{b.brand}</td>
                    <td className="text-center text-sm" style={{ color: 'var(--text-secondary)' }}>{b.total}</td>
                    <td className="text-center text-sm text-[var(--accent-emerald)]">{b.excellence}</td>
                    <td className="text-center text-sm text-[var(--accent-blue)]">{b.good}</td>
                    <td className="text-center text-sm text-[var(--accent-red)]">{b.bad}</td>
                    <td className="text-center">
                      <span className={`badge text-[10px] ${b.total > 0 && (b.excellence / b.total) >= 0.8 ? 'badge-success' : b.total > 0 && (b.excellence / b.total) >= 0.5 ? 'badge-info' : 'badge-error'}`}>
                        {b.total > 0 ? ((b.excellence / b.total) * 100).toFixed(0) : 0}%
                      </span>
                    </td>
                  </tr>
                ))}
                {byBrand.length === 0 && (
                  <tr>
                    <td colSpan={6} className="text-center py-4 text-sm text-[var(--text-muted)]">No data for this period</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
        )}

        {/* Graphic Designer Performance */}
        {activeTab === 'GRAPHIC' && (
        <div className="card-static p-5">
          <h3 className="font-semibold text-[var(--text-primary)] mb-4 flex items-center gap-2">
            <FileText className="w-4 h-4" style={{ color: 'var(--accent-amber)' }} />
            Graphic Designer Performance
          </h3>
          <div className="table-container" style={{ border: 'none' }}>
            <table>
              <thead>
                <tr>
                  <th>Designer</th>
                  <th className="text-center">Tasks</th>
                  <th className="text-center">Avg SLA</th>
                  <th className="text-center">Revisions</th>
                  <th className="text-center">Excellence</th>
                </tr>
              </thead>
              <tbody>
                {byDesigner.map(d => (
                  <tr key={d.name}>
                    <td className="font-medium text-[var(--text-primary)] text-sm">{d.name}</td>
                    <td className="text-center text-sm" style={{ color: 'var(--text-secondary)' }}>{d.total}</td>
                    <td className="text-center text-sm" style={{ color: d.avg_sla <= 3 ? 'var(--accent-emerald)' : d.avg_sla <= 4 ? 'var(--accent-blue)' : 'var(--accent-red)' }}>
                      {d.avg_sla.toFixed(1)}d
                    </td>
                    <td className="text-center text-sm" style={{ color: d.revisions > 5 ? 'var(--accent-amber)' : 'var(--text-secondary)' }}>
                      {d.revisions}
                    </td>
                    <td className="text-center">
                      <span className={`badge text-[10px] ${d.total > 0 && (d.excellence / d.total) >= 0.7 ? 'badge-success' : 'badge-warning'}`}>
                        {d.total > 0 ? ((d.excellence / d.total) * 100).toFixed(0) : 0}%
                      </span>
                    </td>
                  </tr>
                ))}
                {byDesigner.length === 0 && (
                  <tr>
                    <td colSpan={5} className="text-center py-4 text-sm text-[var(--text-muted)]">No designer data for this period</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
        )}

        {/* Motion Designer Performance */}
        {activeTab === 'MOTION' && (
        <div className="card-static p-5">
          <h3 className="font-semibold text-[var(--text-primary)] mb-4 flex items-center gap-2">
            <Film className="w-4 h-4" style={{ color: 'var(--accent-pink)' }} />
            Motion Designer Performance
          </h3>
          <div className="table-container" style={{ border: 'none' }}>
            <table>
              <thead>
                <tr>
                  <th>Designer</th>
                  <th className="text-center">Total Tasks</th>
                  <th className="text-center">Total Revisions</th>
                </tr>
              </thead>
              <tbody>
                {byMotionDesigner.map(d => (
                  <tr key={d.name}>
                    <td className="font-medium text-[var(--text-primary)] text-sm">{d.name}</td>
                    <td className="text-center text-sm" style={{ color: 'var(--text-secondary)' }}>{d.total}</td>
                    <td className="text-center text-sm" style={{ color: d.revisions > 5 ? 'var(--accent-amber)' : 'var(--text-secondary)' }}>
                      {d.revisions}
                    </td>
                  </tr>
                ))}
                {byMotionDesigner.length === 0 && (
                  <tr>
                    <td colSpan={3} className="text-center py-4 text-sm" style={{ color: 'var(--text-muted)' }}>
                      No motion tasks completed in this period
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
        )}

        {/* Source Distribution */}
        {activeTab === 'GRAPHIC' && (
        <div className="card-static p-5">
          <h3 className="font-semibold text-[var(--text-primary)] mb-4 flex items-center gap-2">
            <PieChart className="w-4 h-4" style={{ color: 'var(--accent-pink)' }} />
            Task Source Distribution
          </h3>
          <div className="flex items-center justify-center gap-12 py-8">
            {Object.entries(bySource).map(([source, count]) => {
              const pct = completedTasks.length > 0 ? ((count / completedTasks.length) * 100).toFixed(0) : '0';
              return (
                <div key={source} className="text-center">
                  <div className="relative w-28 h-28 mb-3">
                    <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
                      <circle cx="50" cy="50" r="40" fill="none" strokeWidth="10" stroke="var(--bg-tertiary)" />
                      <circle cx="50" cy="50" r="40" fill="none" strokeWidth="10"
                        stroke={source === 'ORCA' ? 'var(--accent-blue)' : 'var(--accent-pink)'}
                        strokeDasharray={`${Number(pct) * 2.51} 251`}
                        strokeLinecap="round" />
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <span className="text-xl font-bold text-[var(--text-primary)]">{pct}%</span>
                    </div>
                  </div>
                  <p className="font-semibold text-[var(--text-primary)] text-sm">{SOURCE_LABELS[source as 'ORCA' | 'ECOMMERCE']}</p>
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{count} tasks</p>
                </div>
              );
            })}
          </div>
        </div>
        )}
      </div>
    </div>
  );
}
