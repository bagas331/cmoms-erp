'use client';

import { useEffect, useState } from 'react';
import { getMotionTasks, getAllTasksWithRelations, getUsers, assignMotionPic, updateMotionStatus, submitMotionTask, getClients, createStandaloneMotionTask, assignOperatorToMotionTask, editStandaloneMotionTask } from '@/lib/supabase-store';
import { MOTION_KANBAN_COLUMNS, MOTION_STATUS_COLORS, MOTION_STATUS_LABELS, MOTION_DIFFICULTY_LABELS } from '@/lib/constants';
import { formatDisplayDate } from '@/lib/utils';
import { MotionStatus, MotionTask, TaskWithRelations, User as UserType, Client } from '@/lib/types';

import { useAuth } from '@/lib/auth';
import { Film, User, Clock, Play, CheckCircle2, Eye, X, Undo2, ExternalLink, Search, ChevronDown, Filter, Edit2 } from 'lucide-react';

export default function MotionPage() {
  const { user } = useAuth();
  const [motionTasks, setMotionTasks] = useState<(MotionTask & { parentTask?: TaskWithRelations })[]>([]);
  const [allUsers, setAllUsers] = useState<UserType[]>([]);
  const [allClients, setAllClients] = useState<Client[]>([]);
  const [showAssign, setShowAssign] = useState<string | null>(null);
  const [showDetail, setShowDetail] = useState<(MotionTask & { parentTask?: TaskWithRelations }) | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState<string | null>(null);
  const [showSubmitModal, setShowSubmitModal] = useState<string | null>(null);
  const [showHandoverModal, setShowHandoverModal] = useState<string | null>(null);

  const refresh = async () => {
    const [mts, allTasks, users, clients] = await Promise.all([
      getMotionTasks(),
      getAllTasksWithRelations(),
      getUsers(),
      getClients(),
    ]);
    setAllUsers(users);
    setAllClients(clients);
    const enriched = mts.map(mt => ({
      ...mt,
      parentTask: allTasks.find(t => t.id === mt.task_id),
    }));
    setMotionTasks(enriched);
  };

  useEffect(() => { refresh(); }, []);
  if (!user) return null;

  const motionUsers = allUsers.filter(u => ['MOTION_PIC', 'TEAM_LEAD'].includes(u.role_name));

  const handleStatusChange = async (id: string, status: MotionStatus) => {
    await updateMotionStatus(id, status);
    await refresh();
  };

  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterPic, setFilterPic] = useState<string>('all');
  const [filterMonths, setFilterMonths] = useState<string[]>(() => [String(new Date().getMonth() + 1).padStart(2, '0')]);
  const [filterYears, setFilterYears] = useState<string[]>(() => [String(new Date().getFullYear())]);
  const [showMonthDropdown, setShowMonthDropdown] = useState(false);
  const [showYearDropdown, setShowYearDropdown] = useState(false);
  const [filterExactDate, setFilterExactDate] = useState<string>('');

  const allMonths = Array.from({length: 12}, (_, i) => String(i + 1).padStart(2, '0'));
  const availableYears = Array.from(new Set([
    ...motionTasks.map(t => t.created_at.substring(0, 4)),
    ...motionTasks.map(t => t.parentTask?.req_date || '').filter(Boolean).map(d => d.substring(0, 4)),
    String(new Date().getFullYear())
  ])).sort().reverse();

  const uniquePics = Array.from(new Set(motionTasks.map(t => 
    t.motion_pic_id ? motionUsers.find(u => u.id === t.motion_pic_id)?.full_name || 'Unassigned' : 'Unassigned'
  ))).sort();

  const getMonthName = (m: string) => {
    const date = new Date(2000, parseInt(m) - 1);
    return date.toLocaleDateString('en-US', { month: 'short' });
  };

  const filteredMotionTasks = motionTasks.filter(mt => {
    const pt = mt.parentTask;
    const motionPicName = mt.motion_pic_id ? motionUsers.find(u => u.id === mt.motion_pic_id)?.full_name || 'Unassigned' : 'Unassigned';

    const matchSearch = searchQuery === '' ||
      (pt?.task_code || mt.id).toLowerCase().includes(searchQuery.toLowerCase()) ||
      (pt?.client_name || allClients.find(c => c.id === mt.client_id)?.name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (pt?.campaign_name || mt.campaign_type || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      motionPicName.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchStatus = filterStatus === 'all' || mt.status_motion === filterStatus;
    const matchPic = filterPic === 'all' || motionPicName === filterPic;
    
    let matchDate = true;
    if (filterExactDate) {
      matchDate = mt.created_at.startsWith(filterExactDate) || pt?.req_date === filterExactDate;
    } else {
      const createdMonth = mt.created_at.substring(5, 7);
      const createdYear = mt.created_at.substring(0, 4);
      const reqMonth = pt?.req_date?.substring(5, 7) || '';
      const reqYear = pt?.req_date?.substring(0, 4) || '';
      
      const matchMonth = filterMonths.length === 0 || filterMonths.includes(createdMonth) || filterMonths.includes(reqMonth);
      const matchYear = filterYears.length === 0 || filterYears.includes(createdYear) || filterYears.includes(reqYear);
      matchDate = matchMonth && matchYear;
    }
    return matchSearch && matchStatus && matchPic && matchDate;
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-[var(--text-primary)] flex items-center gap-2">
            <Film className="w-5 h-5" style={{ color: 'var(--accent-pink)' }} />
            Motion Graphics Pipeline
          </h1>
        </div>
      </div>

      {/* Toolbar */}
      <div className="bg-[var(--bg-card)] p-4 rounded-xl border border-[var(--border-primary)] shadow-sm mb-6 flex flex-col gap-4">
        
        {/* Top Row: Search & View Toggle */}
        <div className="flex flex-col sm:flex-row items-center gap-4">
          <div className="relative flex-1 w-full">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--text-muted)' }} />
            <input className="input pl-10 w-full" placeholder="Search tasks, brands, PIC..."
              value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
          </div>
        </div>

        {/* Bottom Row: Filters & Actions */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-3 mt-1" style={{ borderTop: '1px solid var(--border-secondary)' }}>
          <div className="flex flex-wrap items-center gap-3 flex-1">
            {/* Filter Group: Unified Pill */}
            <div className="flex flex-wrap items-center bg-[var(--bg-secondary)] rounded-lg border border-[var(--border-primary)] shadow-sm">
              
              {/* Month Dropdown */}
              <div className="relative">
                <button 
                  onClick={() => { setShowMonthDropdown(!showMonthDropdown); setShowYearDropdown(false); }}
                  className="px-4 py-2 h-[38px] flex items-center justify-between min-w-[130px] bg-transparent hover:bg-[var(--bg-tertiary)] rounded-l-lg transition-colors focus:outline-none"
                >
                  <span className="text-sm font-medium text-[var(--text-primary)] flex items-center gap-2">
                    {filterMonths.length === 0 ? 'All Months' : filterMonths.length === 1 ? getMonthName(filterMonths[0]) : `${filterMonths.length} Months`}
                  </span>
                  <ChevronDown className="w-4 h-4 ml-2 opacity-50" />
                </button>
              {showMonthDropdown && (
                <div className="absolute top-full left-0 mt-2 w-48 bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-lg shadow-xl z-50 max-h-64 overflow-y-auto">
                  <div className="p-2 border-b border-[var(--border-primary)] sticky top-0 bg-[var(--bg-secondary)]">
                    <label className="flex items-center gap-2 p-1.5 hover:bg-[var(--bg-tertiary)] rounded cursor-pointer">
                      <input 
                        type="checkbox" 
                        checked={filterMonths.length === 12}
                        onChange={(e) => {
                          if (e.target.checked) setFilterMonths(allMonths);
                          else setFilterMonths([]);
                          setFilterExactDate('');
                        }}
                        className="rounded border-[var(--border-primary)]"
                      />
                      <span className="text-sm font-medium">Select All</span>
                    </label>
                  </div>
                  <div className="p-1">
                    {allMonths.map(m => (
                      <label key={m} className="flex items-center gap-2 p-2 hover:bg-[var(--bg-tertiary)] rounded cursor-pointer">
                        <input 
                          type="checkbox" 
                          checked={filterMonths.includes(m)}
                          onChange={(e) => {
                            if (e.target.checked) setFilterMonths([...filterMonths, m]);
                            else setFilterMonths(filterMonths.filter(x => x !== m));
                            setFilterExactDate('');
                          }}
                          className="rounded border-[var(--border-primary)]"
                        />
                        <span className="text-sm">{getMonthName(m)}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
              </div>

              <div className="w-px h-5 bg-[var(--border-primary)]"></div>

              {/* Year Dropdown */}
              <div className="relative">
                <button 
                  onClick={() => { setShowYearDropdown(!showYearDropdown); setShowMonthDropdown(false); }}
                  className="px-4 py-2 h-[38px] flex items-center justify-between min-w-[110px] bg-transparent hover:bg-[var(--bg-tertiary)] transition-colors focus:outline-none"
                >
                  <span className="text-sm font-medium text-[var(--text-primary)]">
                    {filterYears.length === 0 ? 'All Years' : filterYears.length === 1 ? filterYears[0] : `${filterYears.length} Years`}
                  </span>
                  <ChevronDown className="w-4 h-4 ml-2 opacity-50" />
                </button>
                {showYearDropdown && (
                <div className="absolute top-full left-0 mt-2 w-48 bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-lg shadow-xl z-50 max-h-64 overflow-y-auto">
                  <div className="p-2 border-b border-[var(--border-primary)] sticky top-0 bg-[var(--bg-secondary)]">
                    <label className="flex items-center gap-2 p-1.5 hover:bg-[var(--bg-tertiary)] rounded cursor-pointer">
                      <input 
                        type="checkbox" 
                        checked={filterYears.length === availableYears.length}
                        onChange={(e) => {
                          if (e.target.checked) setFilterYears(availableYears);
                          else setFilterYears([]);
                          setFilterExactDate('');
                        }}
                        className="rounded border-[var(--border-primary)]"
                      />
                      <span className="text-sm font-medium">Select All</span>
                    </label>
                  </div>
                  <div className="p-1">
                    {availableYears.map(y => (
                      <label key={y} className="flex items-center gap-2 p-2 hover:bg-[var(--bg-tertiary)] rounded cursor-pointer">
                        <input 
                          type="checkbox" 
                          checked={filterYears.includes(y)}
                          onChange={(e) => {
                            if (e.target.checked) setFilterYears([...filterYears, y]);
                            else setFilterYears(filterYears.filter(x => x !== y));
                            setFilterExactDate('');
                          }}
                          className="rounded border-[var(--border-primary)]"
                        />
                        <span className="text-sm">{y}</span>
                      </label>
                    ))}
                  </div>
                </div>
                )}
              </div>
              
              <div className="w-px h-5 bg-[var(--border-primary)]"></div>

              {/* Date Input */}
              <div className="flex items-center">
                <input 
                  type="date" 
                  className="px-4 py-2 h-[38px] text-sm bg-transparent border-none focus:outline-none focus:ring-0 min-w-[140px] transition-all hover:bg-[var(--bg-tertiary)]" 
                  value={filterExactDate} 
                  onChange={(e) => setFilterExactDate(e.target.value)} 
                  title="Filter by Exact Date (Overrides Month)"
                />
              </div>

              <div className="w-px h-5 bg-[var(--border-primary)]"></div>

              {/* Status Dropdown */}
              <div className="flex items-center">
                <select className="px-4 py-2 h-[38px] text-sm bg-transparent border-none focus:outline-none focus:ring-0 min-w-[140px] transition-all hover:bg-[var(--bg-tertiary)] cursor-pointer" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
                  <option value="all">All Status</option>
                  {Object.entries(MOTION_STATUS_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </div>

              <div className="w-px h-5 bg-[var(--border-primary)]"></div>

              {/* Designer Dropdown */}
              <div className="flex items-center">
                <select className="px-4 py-2 h-[38px] text-sm bg-transparent border-none focus:outline-none focus:ring-0 min-w-[140px] rounded-r-lg transition-all hover:bg-[var(--bg-tertiary)] cursor-pointer" value={filterPic} onChange={(e) => setFilterPic(e.target.value)}>
                  <option value="all">All Designers</option>
                  {uniquePics.map(pic => (
                    <option key={pic as string} value={pic as string}>{pic}</option>
                  ))}
                </select>
              </div>

            </div>
          </div>

          {/* Actions */}
          {['ADMIN', 'TEAM_LEAD', 'MOTION_PIC', 'REQUESTER'].includes(user.role_name) && (
            <button onClick={() => setShowCreateModal(true)} className="btn-primary shrink-0" style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '0 16px', height: '40px', borderRadius: '8px', fontWeight: '600', background: 'var(--accent-pink)', borderColor: 'var(--accent-pink)' }}>
              <Film className="w-4 h-4" /> <span>Create Request</span>
            </button>
          )}
        </div>
      </div>

      <div className="kanban-board-wrapper" style={{ minHeight: 500 }}>
        {MOTION_KANBAN_COLUMNS.map((col, colIdx) => {
          const colTasks = filteredMotionTasks.filter(mt => mt.status_motion === col.status);
          return (
            <div key={col.status || colIdx} className="kanban-column flex-shrink-0 w-[320px] scroll-snap-align-start">
              <div className="p-4 flex items-center justify-between" style={{ borderBottom: '1px solid var(--border-secondary)' }}>
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ background: col.color, boxShadow: `0 0 8px ${col.color}` }} />
                  <span className="text-sm font-bold text-[var(--text-primary)]">{col.label}</span>
                </div>
                <span className="text-xs px-2.5 py-1 rounded-md font-semibold" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-primary)', color: 'var(--text-secondary)' }}>
                  {colTasks.length}
                </span>
              </div>
              <div className="p-3 flex-1 overflow-y-auto custom-scrollbar flex flex-col gap-3">
                {colTasks.length === 0 && (
                  <div className="empty-state mt-4">
                    <Film className="w-8 h-8 text-[var(--border-primary)]" />
                    <p className="text-sm font-medium" style={{ color: 'var(--text-muted)' }}>Antrean Kosong</p>
                  </div>
                )}
                {colTasks.map((mt, idx) => (
                  <div key={mt.id} className="kanban-card cursor-pointer hover:border-[var(--accent-pink)] transition-colors" onClick={() => setShowDetail(mt)}>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-mono font-bold" style={{ color: 'var(--accent-pink)' }}>
                        {mt.parentTask?.task_code || mt.id.substring(0, 8).toUpperCase()}
                      </span>
                      <span className="badge text-[10px] py-0 px-1.5 bg-purple-500/20 text-purple-300 border-purple-500/30">
                        {MOTION_DIFFICULTY_LABELS[mt.motion_difficulty]}
                      </span>
                    </div>
                    <p className="font-medium text-sm text-[var(--text-primary)] mb-1">
                      {mt.parentTask?.client_name || allClients.find(c => c.id === mt.client_id)?.name || 'Unknown Client'}
                    </p>
                    <p className="text-xs mb-3 truncate" style={{ color: 'var(--text-muted)' }}>
                      {mt.parentTask?.campaign_name || mt.campaign_type || 'Standalone Request'}
                    </p>
                    
                    {mt.motion_pic_id && (
                      <div className="flex items-center gap-1.5 mb-2">
                        <User className="w-3 h-3" style={{ color: 'var(--text-muted)' }} />
                        <span className="text-[11px] font-medium" style={{ color: 'var(--text-secondary)' }}>
                          {motionUsers.find(u => u.id === mt.motion_pic_id)?.full_name || 'Unassigned'}
                        </span>
                      </div>
                    )}

                    {mt.link_motion && (
                      <a href={mt.link_motion} target="_blank" rel="noopener noreferrer"
                        className="text-[11px] flex items-center gap-1 mb-2 hover:underline" style={{ color: 'var(--accent-blue)' }}>
                        <Film className="w-3 h-3" /> View Output
                      </a>
                    )}

                    {/* Actions */}
                    <div className="flex flex-wrap gap-1 mt-3 pt-3" style={{ borderTop: '1px solid var(--border-secondary)' }}>
                      {/* Edit */}
                      {['ADMIN', 'TEAM_LEAD', 'MOTION_PIC'].includes(user.role_name) && !mt.parentTask && (
                        <button onClick={(e) => { e.stopPropagation(); setShowEditModal(mt.id); }}
                          className="btn-ghost text-xs py-1 px-2" style={{ color: 'var(--text-secondary)' }}>
                          <Edit2 className="w-3 h-3" /> Edit
                        </button>
                      )}
                      {mt.status_motion === 'QUEUED' && !mt.motion_pic_id && ['ADMIN', 'TEAM_LEAD'].includes(user.role_name) && (
                        <button onClick={(e) => { e.stopPropagation(); setShowAssign(mt.id); }} className="btn-ghost text-xs py-1 px-2" style={{ color: 'var(--accent-blue)' }}>
                          <User className="w-3 h-3" /> Assign
                        </button>
                      )}
                      {mt.status_motion === 'QUEUED' && mt.motion_pic_id && (mt.motion_pic_id === user.id || ['ADMIN', 'TEAM_LEAD'].includes(user.role_name)) && (
                        <button onClick={(e) => { e.stopPropagation(); handleStatusChange(mt.id, 'IN_PROGRESS'); }}
                          className="btn-ghost text-xs py-1 px-2" style={{ color: 'var(--accent-cyan)' }}>
                          <Play className="w-3 h-3" /> Start
                        </button>
                      )}
                      {/* Submit */}
                      {(mt.status_motion === 'IN_PROGRESS' || mt.status_motion === 'REVISION') && (mt.motion_pic_id === user.id || ['ADMIN', 'TEAM_LEAD'].includes(user.role_name)) && (
                        <button onClick={(e) => { e.stopPropagation(); setShowSubmitModal(mt.id); }}
                          className="btn-ghost text-xs py-1 px-2" style={{ color: 'var(--accent-emerald)' }}>
                          <CheckCircle2 className="w-3 h-3" /> Submit
                        </button>
                      )}
                      {/* Revision */}
                      {mt.status_motion === 'SUBMITTED' && ['ADMIN', 'TEAM_LEAD', 'STRATEGIC_PIC', 'REQUESTER'].includes(user.role_name) && (
                        <button onClick={(e) => { e.stopPropagation(); handleStatusChange(mt.id, 'REVISION'); }}
                          className="btn-ghost text-xs py-1 px-2" style={{ color: 'var(--accent-amber)' }}>
                          <Undo2 className="w-3 h-3" /> Revision
                        </button>
                      )}
                      {/* Approve */}
                      {mt.status_motion === 'SUBMITTED' && ['ADMIN', 'TEAM_LEAD', 'STRATEGIC_PIC', 'REQUESTER'].includes(user.role_name) && (
                        <button onClick={(e) => { e.stopPropagation(); handleStatusChange(mt.id, 'APPROVED'); }}
                          className="btn-ghost text-xs py-1 px-2" style={{ color: 'var(--accent-emerald)' }}>
                          <CheckCircle2 className="w-3 h-3" /> Approve
                        </button>
                      )}
                      {/* Complete / Handover */}
                      {mt.status_motion === 'APPROVED' && ['ADMIN', 'TEAM_LEAD'].includes(user.role_name) && (
                        <button onClick={(e) => { e.stopPropagation(); setShowHandoverModal(mt.id); }}
                          className="btn-ghost text-xs py-1 px-2" style={{ color: 'var(--accent-cyan)' }}>
                          <CheckCircle2 className="w-3 h-3" /> Handover
                        </button>
                      )}
                      {/* Undo Status */}
                      {mt.status_motion !== 'QUEUED' && ['ADMIN', 'TEAM_LEAD'].includes(user.role_name) && (
                        <button onClick={(e) => {
                          e.stopPropagation();
                          let prevStatus: MotionStatus | null = null;
                          switch (mt.status_motion) {
                            case 'IN_PROGRESS': prevStatus = 'QUEUED'; break;
                            case 'SUBMITTED': prevStatus = 'IN_PROGRESS'; break;
                            case 'REVISION': prevStatus = 'SUBMITTED'; break;
                            case 'APPROVED': prevStatus = 'SUBMITTED'; break;
                            case 'COMPLETED': prevStatus = 'APPROVED'; break;
                          }
                          if (prevStatus) { handleStatusChange(mt.id, prevStatus); }
                        }} className="btn-ghost text-xs py-1 px-2 ml-auto" style={{ color: 'var(--accent-red)' }}>
                          <Undo2 className="w-3 h-3" /> Undo
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Assign Motion PIC Modal */}
      {showAssign && (
        <div className="modal-overlay" onClick={() => setShowAssign(null)}>
          <div className="modal-content max-w-sm w-full" onClick={e => e.stopPropagation()}>
            <div className="p-6 flex items-center justify-between" style={{ borderBottom: '1px solid var(--border-primary)', background: 'var(--bg-card)' }}>
              <h2 className="text-lg font-bold text-[var(--text-primary)]">Assign Motion PIC</h2>
              <button onClick={() => setShowAssign(null)} className="btn-ghost p-1.5 rounded-full hover:bg-[var(--bg-tertiary)]"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-6 space-y-4">
              {motionUsers.map(mu => (
                <button key={mu.id} onClick={async () => { await assignMotionPic(showAssign, mu.id, user.id); setShowAssign(null); await refresh(); }}
                  className="w-full p-4 rounded-xl text-left transition-all flex items-center gap-4 border border-transparent hover:border-blue-500 hover:shadow-md"
                  style={{ background: 'var(--bg-tertiary)' }}>
                  <div className="w-10 h-10 rounded-lg flex items-center justify-center text-sm font-bold text-white shadow-sm" style={{ background: 'var(--gradient-3)' }}>
                    {mu.avatar_initials}
                  </div>
                  <div>
                    <p className="font-semibold text-[var(--text-primary)] text-sm mb-0.5">{mu.full_name}</p>
                    <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{mu.email}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Motion Detail Modal */}
      {showDetail && (
        <div className="modal-overlay" onClick={() => setShowDetail(null)}>
          <div className="modal-content max-w-lg w-full" onClick={e => e.stopPropagation()}>
            <div className="p-6 flex items-center justify-between" style={{ borderBottom: '1px solid var(--border-primary)', background: 'var(--bg-card)' }}>
              <div>
                <h2 className="text-lg font-bold text-[var(--text-primary)] flex items-center gap-2">
                  <Film className="w-5 h-5 text-[var(--accent-pink)]" />
                  Detail Motion Task
                </h2>
                <p className="text-sm font-mono mt-1 text-[var(--accent-blue)]">{showDetail.parentTask?.task_code || showDetail.id}</p>
              </div>
              <button onClick={() => setShowDetail(null)} className="btn-ghost p-1.5 rounded-full hover:bg-[var(--bg-tertiary)]"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-6 space-y-5">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">Client / Brand</p>
                  <p className="text-sm font-medium text-[var(--text-primary)]">
                    {showDetail.parentTask?.client_name || allClients.find(c => c.id === showDetail.client_id)?.name || 'Unknown'}
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">Campaign</p>
                  <p className="text-sm font-medium text-[var(--text-primary)]">
                    {showDetail.parentTask?.campaign_name || showDetail.campaign_type || 'Standalone'}
                  </p>
                </div>
                {!showDetail.parentTask && showDetail.motion_type && (
                  <div className="space-y-1">
                    <p className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">Tipe Motion</p>
                    <p className="text-sm font-medium text-[var(--text-primary)]">{showDetail.motion_type}</p>
                  </div>
                )}
                {!showDetail.parentTask && showDetail.studio && (
                  <div className="space-y-1">
                    <p className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">Studio</p>
                    <p className="text-sm font-medium text-[var(--text-primary)]">{showDetail.studio}</p>
                  </div>
                )}
                {!showDetail.parentTask && showDetail.production_date && (
                  <div className="space-y-1">
                    <p className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">Tgl Produksi</p>
                    <p className="text-sm font-medium text-[var(--text-primary)]">{formatDisplayDate(showDetail.production_date)}</p>
                  </div>
                )}
                {!showDetail.parentTask && showDetail.period_start && (
                  <div className="space-y-1">
                    <p className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">Periode</p>
                    <p className="text-sm font-medium text-[var(--text-primary)]">
                      {formatDisplayDate(showDetail.period_start)} - {formatDisplayDate(showDetail.period_end || '')}
                    </p>
                  </div>
                )}
                {!showDetail.parentTask && showDetail.platform && (
                  <div className="space-y-1">
                    <p className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">Platform</p>
                    <p className="text-sm font-medium text-[var(--text-primary)]">{showDetail.platform}</p>
                  </div>
                )}
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">Motion PIC</p>
                  <p className="text-sm font-medium text-[var(--text-primary)]">
                    {showDetail.motion_pic_id ? motionUsers.find(u => u.id === showDetail.motion_pic_id)?.full_name || 'Unknown' : 'Unassigned'}
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">Status</p>
                  <span className={`badge ${MOTION_STATUS_COLORS[showDetail.status_motion]}`}>{MOTION_STATUS_LABELS[showDetail.status_motion]}</span>
                </div>
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">Difficulty</p>
                  <span className="badge text-[10px] py-0.5 px-2 bg-purple-500/20 text-purple-300 border-purple-500/30">
                    {MOTION_DIFFICULTY_LABELS[showDetail.motion_difficulty]}
                  </span>
                </div>
                {showDetail.notes && (
                  <div className="space-y-1 col-span-2 mt-2">
                    <p className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">Catatan</p>
                    <p className="text-sm text-[var(--text-primary)] bg-[var(--bg-tertiary)] p-3 rounded-lg border border-[var(--border-secondary)]">{showDetail.notes}</p>
                  </div>
                )}
              </div>
              
              <div className="space-y-1 p-4 rounded-xl border" style={{ background: 'var(--bg-tertiary)', borderColor: 'var(--border-secondary)' }}>
                <p className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-2">
                  {showDetail.parentTask ? 'Final Asset Handoff (Design)' : 'Asset Request Link'}
                </p>
                {showDetail.parentTask?.final_asset_link || (!showDetail.parentTask && showDetail.link_motion) ? (
                  <a href={showDetail.parentTask?.final_asset_link || showDetail.link_motion || '#'} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm hover:underline" style={{ color: 'var(--accent-blue)' }}>
                    <ExternalLink className="w-4 h-4" /> {showDetail.parentTask?.final_asset_name || 'Buka Link Asset'}
                  </a>
                ) : (
                  <p className="text-sm text-[var(--text-muted)] italic">Tidak ada asset link</p>
                )}
              </div>

              {showDetail.link_motion && (
                <div className="space-y-1 p-4 rounded-xl border border-pink-500/30 bg-pink-500/5">
                  <p className="text-xs font-semibold text-[var(--accent-pink)] uppercase tracking-wider mb-2">Output Motion Render</p>
                  <a href={showDetail.link_motion} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm hover:underline font-medium text-[var(--text-primary)]">
                    <Film className="w-4 h-4 text-[var(--accent-pink)]" /> Buka Output Link
                  </a>
                </div>
              )}
            </div>
            <div className="p-4 flex justify-end" style={{ borderTop: '1px solid var(--border-primary)', background: 'var(--bg-secondary)' }}>
              <button onClick={() => setShowDetail(null)} className="btn-secondary">Tutup</button>
            </div>
          </div>
        </div>
      )}
      {/* CREATE / EDIT MOTION REQUEST MODAL */}
      {showCreateModal && <MotionFormModal onClose={() => { setShowCreateModal(false); refresh(); }} userId={user.id} clients={allClients} motionUsers={motionUsers} />}
      {showEditModal && <MotionFormModal onClose={() => { setShowEditModal(null); refresh(); }} userId={user.id} editTaskId={showEditModal} clients={allClients} motionUsers={motionUsers} motionTasks={motionTasks} />}
      
      {/* SUBMIT MOTION MODAL */}
      {showSubmitModal && <SubmitMotionModal taskId={showSubmitModal} onClose={() => { setShowSubmitModal(null); refresh(); }} userId={user.id} />}

      {/* HANDOVER MODAL */}
      {showHandoverModal && <HandoverModal taskId={showHandoverModal} onClose={() => { setShowHandoverModal(null); refresh(); }} userId={user.id} operators={allUsers.filter(u => u.role_name === 'OPERATOR')} />}
    </div>
  );
}

function HandoverModal({ taskId, onClose, userId, operators }: { taskId: string; onClose: () => void; userId: string; operators: UserType[] }) {
  const [operatorId, setOperatorId] = useState(operators[0]?.id || '');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (operatorId) {
      await assignOperatorToMotionTask(taskId, operatorId, userId);
      onClose();
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content max-w-sm w-full" onClick={e => e.stopPropagation()}>
        <div className="p-6 flex items-center justify-between" style={{ borderBottom: '1px solid var(--border-primary)' }}>
          <h2 className="text-lg font-bold text-[var(--text-primary)]">Handover to Operator</h2>
          <button onClick={onClose} className="btn-ghost p-1"><X className="w-5 h-5" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="label">Pilih Operator</label>
            <select required className="select" value={operatorId} onChange={e => setOperatorId(e.target.value)}>
              {operators.map(op => <option key={op.id} value={op.id}>{op.full_name}</option>)}
              {operators.length === 0 && <option value="" disabled>No Operator Available</option>}
            </select>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
            <button type="submit" className="btn-primary">Handover (Complete)</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function MotionFormModal({ onClose, userId, editTaskId, clients, motionUsers, motionTasks }: { onClose: () => void, userId: string, editTaskId?: string, clients: Client[], motionUsers: UserType[], motionTasks?: MotionTask[] }) {
  const taskToEdit = editTaskId ? motionTasks?.find(t => t.id === editTaskId) : null;

  const [formData, setFormData] = useState({
    client_id: taskToEdit?.client_id || clients[0]?.id || 0,
    platform: (taskToEdit?.platform as any) || 'TIKTOK',
    motion_type: taskToEdit?.motion_type || '',
    campaign_type: taskToEdit?.campaign_type || 'BaU',
    motion_pic_id: taskToEdit?.motion_pic_id || '',
    production_date: taskToEdit?.production_date || '',
    period_start: taskToEdit?.period_start || '',
    period_end: taskToEdit?.period_end || '',
    studio: (taskToEdit?.studio as any) || 'Jakarta',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editTaskId) {
      await editStandaloneMotionTask(editTaskId, {
        ...formData,
        motion_pic_id: formData.motion_pic_id || null,
      }, userId);
    } else {
      await createStandaloneMotionTask({
        ...formData,
        motion_pic_id: formData.motion_pic_id || null,
      }, userId);
    }
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content max-w-2xl w-full" onClick={e => e.stopPropagation()}>
        <div className="p-6 flex items-center justify-between" style={{ borderBottom: '1px solid var(--border-primary)' }}>
          <h2 className="text-xl font-bold text-[var(--text-primary)] flex items-center gap-2">
            <Film className="w-5 h-5 text-[var(--accent-pink)]" /> {editTaskId ? 'Edit Motion Request' : 'Create Motion Request'}
          </h2>
          <button onClick={onClose} className="btn-ghost p-1.5 rounded-full"><X className="w-5 h-5" /></button>
        </div>
        
        <form onSubmit={handleSubmit} className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-6">
            <div className="space-y-1.5">
              <label className="label">Brand <span className="text-red-500">*</span></label>
              <select required className="select" value={formData.client_id} onChange={e => setFormData({...formData, client_id: Number(e.target.value)})}>
                {clients.map(c => (
                  <option key={c.id} value={c.id} className="bg-[var(--bg-secondary)] text-[var(--text-primary)]">{c.name}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="label">Platform <span className="text-red-500">*</span></label>
              <select required className="select" value={formData.platform} onChange={e => setFormData({...formData, platform: e.target.value as any})}>
                <option value="TIKTOK" className="bg-[var(--bg-secondary)] text-[var(--text-primary)]">TikTok</option>
                <option value="SHOPEE" className="bg-[var(--bg-secondary)] text-[var(--text-primary)]">Shopee</option>
                <option value="TOKOPEDIA" className="bg-[var(--bg-secondary)] text-[var(--text-primary)]">Tokopedia</option>
                <option value="LAZADA" className="bg-[var(--bg-secondary)] text-[var(--text-primary)]">Lazada</option>
                <option value="OTHER" className="bg-[var(--bg-secondary)] text-[var(--text-primary)]">Other</option>
              </select>
            </div>
            
            <div className="space-y-1.5">
              <label className="label">Tipe Motion <span className="text-red-500">*</span></label>
              <input required type="text" className="input" placeholder="e.g. 2D Animation, Lower Thirds" value={formData.motion_type} onChange={e => setFormData({...formData, motion_type: e.target.value})} />
            </div>
            <div className="space-y-1.5">
              <label className="label">Jenis Kampanye <span className="text-red-500">*</span></label>
              <select required className="select" value={formData.campaign_type} onChange={e => setFormData({...formData, campaign_type: e.target.value})}>
                <option value="BaU" className="bg-[var(--bg-secondary)] text-[var(--text-primary)]">BaU</option>
                <option value="PayDay" className="bg-[var(--bg-secondary)] text-[var(--text-primary)]">PayDay</option>
                <option value="DD" className="bg-[var(--bg-secondary)] text-[var(--text-primary)]">Double Date (DD)</option>
                <option value="Special" className="bg-[var(--bg-secondary)] text-[var(--text-primary)]">Special</option>
              </select>
            </div>
            
            <div className="space-y-1.5">
              <label className="label">Motion PIC</label>
              <select className="select" value={formData.motion_pic_id} onChange={e => setFormData({...formData, motion_pic_id: e.target.value})}>
                <option value="" className="bg-[var(--bg-secondary)] text-[var(--text-primary)]">Unassigned</option>
                {motionUsers.map(u => (
                  <option key={u.id} value={u.id} className="bg-[var(--bg-secondary)] text-[var(--text-primary)]">{u.full_name}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="label">Studio <span className="text-red-500">*</span></label>
              <select required className="select" value={formData.studio} onChange={e => setFormData({...formData, studio: e.target.value as 'Jakarta' | 'Bandung'})}>
                <option value="Jakarta" className="bg-[var(--bg-secondary)] text-[var(--text-primary)]">Jakarta</option>
                <option value="Bandung" className="bg-[var(--bg-secondary)] text-[var(--text-primary)]">Bandung</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="label">Tanggal Produksi <span className="text-red-500">*</span></label>
              <input required type="date" className="input" value={formData.production_date} onChange={e => setFormData({...formData, production_date: e.target.value})} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="label">Periode Mulai <span className="text-red-500">*</span></label>
                <input required type="date" className="input" value={formData.period_start} onChange={e => setFormData({...formData, period_start: e.target.value})} />
              </div>
              <div className="space-y-1.5">
                <label className="label">Periode Selesai <span className="text-red-500">*</span></label>
                <input required type="date" className="input" value={formData.period_end} onChange={e => setFormData({...formData, period_end: e.target.value})} />
              </div>
            </div>
          </div>
          
          <div className="flex justify-end gap-3 pt-4" style={{ borderTop: '1px solid var(--border-primary)' }}>
            <button type="button" onClick={onClose} className="btn-secondary">Batal</button>
            <button type="submit" className="btn-primary" style={{ background: 'var(--accent-pink)', borderColor: 'var(--accent-pink)' }}>
              {editTaskId ? 'Simpan' : 'Buat Request'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function SubmitMotionModal({ taskId, onClose, userId }: { taskId: string, onClose: () => void, userId: string }) {
  const [linkMotion, setLinkMotion] = useState('');
  const [notes, setNotes] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await submitMotionTask(taskId, linkMotion, notes, userId);
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content max-w-md w-full" onClick={e => e.stopPropagation()}>
        <div className="p-6 flex items-center justify-between" style={{ borderBottom: '1px solid var(--border-primary)' }}>
          <h2 className="text-lg font-bold text-[var(--text-primary)]">Submit Motion Render</h2>
          <button onClick={onClose} className="btn-ghost p-1.5 rounded-full"><X className="w-5 h-5" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="space-y-1.5">
            <label className="label">Link Output / Final Asset <span className="text-red-500">*</span></label>
            <input required type="url" className="input" placeholder="https://drive.google.com/..." value={linkMotion} onChange={e => setLinkMotion(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <label className="label">Catatan (Opsional)</label>
            <textarea className="input min-h-[80px] custom-scrollbar" placeholder="Tambahkan pesan untuk reviewer..." value={notes} onChange={e => setNotes(e.target.value)} />
          </div>
          <div className="flex justify-end gap-3 pt-4" style={{ borderTop: '1px solid var(--border-primary)' }}>
            <button type="button" onClick={onClose} className="btn-secondary">Batal</button>
            <button type="submit" className="btn-primary" style={{ background: 'var(--accent-emerald)', borderColor: 'var(--accent-emerald)' }}>
              Submit
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
