'use client';
import { motion } from 'framer-motion';

import { useEffect, useState, useCallback } from 'react';

import { useAuth } from '@/lib/auth';
import {
  getAllTasksWithRelations, getClients, getContentTypes, getUsers,
  createTask, editTask, assignTask, updateTaskStatus, submitTask, requestRevision, setMotionReadyness,
  deleteTask, getAuditLogs, updateStratStatus, submitStrategicConcept
} from '@/lib/supabase-store';
import {
  DESIGN_STATUS_COLORS, DESIGN_STATUS_LABELS, DESIGN_KANBAN_COLUMNS,
  EXCELLENCE_COLORS, EXCELLENCE_LABELS, DIFFICULTY_LABELS, DIFFICULTY_COLORS,
  SOURCE_LABELS, REASON_LABELS, STRAT_STATUS_LABELS,
  MOTION_STATUS_COLORS, MOTION_STATUS_LABELS
} from '@/lib/constants';
import { formatDisplayDate, cn, sanitizeUrl } from '@/lib/utils';
import { TaskWithRelations, CreateTaskInput, AssignTaskInput, DesignStatus, TaskSource, ReasonCategory, Client, ContentType, User as UserType, StratStatus } from '@/lib/types';
import {
  Plus, Search, Filter, LayoutGrid, List, X, ChevronRight, ChevronDown, Trash2,
  User, Clock, Tag, Send, RotateCcw, CheckCircle2, Undo2, Play, Edit3,
  AlertTriangle, FileText, ExternalLink, ArrowRight, Download,
  MessageSquare, Loader2, Sparkles, Presentation, Film
} from 'lucide-react';
import { downloadCSV } from '@/lib/export';

type ViewMode = 'kanban' | 'table';

export default function TasksPage() {
  const { user } = useAuth();
  const [tasks, setTasks] = useState<TaskWithRelations[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [contentTypes, setContentTypes] = useState<ContentType[]>([]);
  const [allUsers, setAllUsers] = useState<UserType[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [viewMode, setViewMode] = useState<ViewMode>('kanban');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterPic, setFilterPic] = useState<string>('all');
  const [filterMonths, setFilterMonths] = useState<string[]>(() => [String(new Date().getMonth() + 1).padStart(2, '0')]);
  const [filterYears, setFilterYears] = useState<string[]>(() => [String(new Date().getFullYear())]);
  const [showMonthDropdown, setShowMonthDropdown] = useState(false);
  const [showYearDropdown, setShowYearDropdown] = useState(false);
  const [filterExactDate, setFilterExactDate] = useState<string>('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState<string | null>(null);
  const [showDetailModal, setShowDetailModal] = useState<string | null>(null);
  const [showAssignModal, setShowAssignModal] = useState<string | null>(null);
  const [showRevisionModal, setShowRevisionModal] = useState<{ taskId: string; stage: 'STRATEGIC' | 'DESIGN' } | null>(null);
  const [showSubmitModal, setShowSubmitModal] = useState<string | null>(null);
  const [showStratSubmitModal, setShowStratSubmitModal] = useState<string | null>(null);


  const refreshTasks = useCallback(async () => {
    try {
      const [tData, cData, ctData, uData] = await Promise.all([
        getAllTasksWithRelations(),
        getClients(),
        getContentTypes(),
        getUsers()
      ]);
      setTasks(tData);
      setClients(cData);
      setContentTypes(ctData);
      setAllUsers(uData);
    } catch (err) {
      console.error('Error fetching Supabase tasks:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { 
    refreshTasks(); 
  }, [refreshTasks]);

  const formatPeriod = (yyyyMm: string) => {
    if (!yyyyMm) return '';
    const [y, m] = yyyyMm.split('-');
    const date = new Date(parseInt(y), parseInt(m) - 1);
    return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  };
  const allMonths = Array.from({length: 12}, (_, i) => String(i + 1).padStart(2, '0'));
  
  const availableYears = Array.from(new Set([
    ...tasks.map(t => t.created_at.substring(0, 4)),
    ...tasks.map(t => t.req_date.substring(0, 4)),
    String(new Date().getFullYear())
  ])).sort().reverse();

  const getMonthName = (m: string) => {
    const date = new Date(2000, parseInt(m) - 1);
    return date.toLocaleDateString('en-US', { month: 'short' });
  };

  const uniquePics = Array.from(new Set(tasks.filter(t => t.design_pic_name).map(t => t.design_pic_name))).sort();

  const filteredTasks = tasks.filter(t => {
    const matchSearch = searchQuery === '' ||
      t.task_code.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.client_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.campaign_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (t.design_pic_name || '').toLowerCase().includes(searchQuery.toLowerCase());
    const matchStatus = filterStatus === 'all' || t.status_design === filterStatus;
    
    // Date Filtering
    let matchDate = true;
    if (filterExactDate) {
      matchDate = t.created_at.startsWith(filterExactDate) || t.req_date === filterExactDate;
    } else {
      const createdMonth = t.created_at.substring(5, 7);
      const createdYear = t.created_at.substring(0, 4);
      const reqMonth = t.req_date.substring(5, 7);
      const reqYear = t.req_date.substring(0, 4);
      
      const matchMonth = filterMonths.length === 0 || filterMonths.includes(createdMonth) || filterMonths.includes(reqMonth);
      const matchYear = filterYears.length === 0 || filterYears.includes(createdYear) || filterYears.includes(reqYear);
      matchDate = matchMonth && matchYear;
    }

    const matchPic = filterPic === 'all' || t.design_pic_name === filterPic;

    return matchSearch && matchStatus && matchDate && matchPic;
  });

  if (!user) return null;

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="bg-[var(--bg-card)] p-4 rounded-xl border border-[var(--border-primary)] shadow-sm mb-6 flex flex-col gap-4">
        
        {/* Top Row: Search & View Toggle */}
        <div className="flex flex-col sm:flex-row items-center gap-4">
          <div className="relative flex-1 w-full">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--text-muted)' }} />
            <input className="input pl-10 w-full" placeholder="Search tasks, brands, PIC..."
              value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
          </div>

          <div className="flex items-center gap-4 shrink-0">
            <button onClick={() => setViewMode('kanban')}
              className={`flex items-center gap-2 px-5 py-2 h-[38px] text-sm font-medium rounded-lg transition-all focus:outline-none ${viewMode === 'kanban' ? 'bg-[var(--bg-secondary)] border border-[var(--border-primary)] text-[var(--accent-blue)] shadow-sm' : 'text-[var(--text-secondary)] bg-transparent border border-transparent hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)]'}`}>
              <LayoutGrid className="w-4 h-4" /> Kanban
            </button>
            <button onClick={() => setViewMode('table')}
              className={`flex items-center gap-2 px-5 py-2 h-[38px] text-sm font-medium rounded-lg transition-all focus:outline-none ${viewMode === 'table' ? 'bg-[var(--bg-secondary)] border border-[var(--border-primary)] text-[var(--accent-blue)] shadow-sm' : 'text-[var(--text-secondary)] bg-transparent border border-transparent hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)]'}`}>
              <List className="w-4 h-4" /> Table
            </button>
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
                  {Object.entries(DESIGN_STATUS_LABELS).map(([k, v]) => (
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
          <button 
            onClick={() => {
              downloadCSV(filteredTasks.map(t => ({
                'Task Code': t.task_code,
                'Brand': t.client_name,
                'Campaign': t.campaign_name,
                'Platform': t.platform || '-',
                'Req Date': new Date(t.req_date).toLocaleDateString(),
                'Due Date': new Date(t.due_date).toLocaleDateString(),
                'Designer': t.design_pic_name || 'Unassigned',
                'Status': DESIGN_STATUS_LABELS[t.status_design as keyof typeof DESIGN_STATUS_LABELS] || t.status_design
              })), 'Graphic_Tasks_Export.csv');
            }}
            className="btn-outline shrink-0 h-10 px-4 rounded-lg flex items-center gap-2"
          >
            <Download className="w-4 h-4" /> Export
          </button>
          
          {['ADMIN', 'TEAM_LEAD', 'REQUESTER', 'STRATEGIC_PIC'].includes(user.role_name) && (
            <button onClick={() => setShowCreateModal(true)} className="btn-primary shrink-0" style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '0 16px', height: '40px', borderRadius: '8px', fontWeight: '600' }}>
              <Plus className="w-4 h-4" /> <span>New Task</span>
            </button>
          )}
        </div>
      </div>

      {/* KANBAN VIEW */}
      {viewMode === 'kanban' && (
        <div className="flex gap-6 overflow-x-auto pb-6 scroll-smooth snap-x" style={{ minHeight: 'calc(100vh - 200px)' }}>
          {DESIGN_KANBAN_COLUMNS.map(col => {
            const colTasks = filteredTasks.filter(t => t.status_design === col.status);
            return (
              <div key={col.status} className="kanban-column flex-shrink-0 w-[320px] snap-center">
                <div className="p-4 flex items-center justify-between sticky top-0 bg-[var(--bg-secondary)] z-10" style={{ borderBottom: '1px solid var(--border-secondary)', borderTopLeftRadius: '16px', borderTopRightRadius: '16px' }}>
                  <div className="flex items-center gap-2.5">
                    <div className="w-3 h-3 rounded-full shadow-sm" style={{ background: col.color }} />
                    <span className="text-sm font-bold text-[var(--text-primary)] tracking-wide">{col.label}</span>
                  </div>
                  <span className="text-xs px-2.5 py-1 rounded-full font-medium" style={{ background: 'var(--bg-tertiary)', color: 'var(--text-muted)' }}>
                    {colTasks.length}
                  </span>
                </div>
                <div className="p-3 space-y-3 overflow-y-auto flex-1">
                  {colTasks.length === 0 && (
                    <div className="p-8 text-center flex flex-col items-center justify-center h-full opacity-60">
                      <LayoutGrid className="w-8 h-8 mb-3" style={{ color: 'var(--text-muted)' }} />
                      <p className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>No active tasks</p>
                    </div>
                  )}
                  {colTasks.map(task => (
                    <div key={task.id} className="kanban-card" onClick={() => setShowDetailModal(task.id)}>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-mono font-semibold" style={{ color: 'var(--accent-blue)' }}>
                          {task.task_code}
                        </span>
                        <div className="flex items-center gap-1">
                          {task.requires_strategic_concept && (
                            <span className="badge text-[9px] py-0 px-1.5 bg-purple-500/20 text-purple-300 border-purple-500/30">
                              Strat: {STRAT_STATUS_LABELS[task.status_strat]}
                            </span>
                          )}
                          {task.operational_excellence && (
                            <span className={`badge text-[10px] py-0 px-1.5 ${EXCELLENCE_COLORS[task.operational_excellence]}`}>
                              {task.operational_excellence}
                            </span>
                          )}
                        </div>
                      </div>
                      <p className="font-medium text-sm text-[var(--text-primary)] mb-0.5">{task.client_name}</p>
                      <p className="text-xs mb-2" style={{ color: 'var(--text-muted)' }}>{task.campaign_name}</p>
                      
                      {/* Requester Information */}
                      <div className="flex items-center gap-1.5 text-[11px] mb-2 text-[var(--text-muted)]">
                        <span className="text-[10px] uppercase font-semibold text-[var(--text-muted)]">Req:</span>
                        <span className="font-medium text-[var(--text-secondary)] truncate">{task.created_by_name || 'Requester'}</span>
                      </div>

                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          {task.design_difficulty && (
                            <span className={`badge text-[10px] py-0 px-1.5 ${DIFFICULTY_COLORS[task.design_difficulty]}`}>
                              {DIFFICULTY_LABELS[task.design_difficulty]}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1">
                          <Clock className="w-3 h-3" style={{ color: 'var(--text-muted)' }} />
                          <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                            {formatDisplayDate(task.due_date)}
                          </span>
                        </div>
                      </div>

                      {/* Strategic PIC Info (if applicable) */}
                      {task.requires_strategic_concept && (
                        <div className="mt-2 pt-2 flex items-center justify-between text-[11px]" style={{ borderTop: '1px dashed var(--border-secondary)' }}>
                          <span className="text-[var(--text-muted)]">Strat PIC:</span>
                          <span className="font-medium text-purple-300">{task.strat_pic_name || 'Unassigned'}</span>
                        </div>
                      )}

                      {/* Design PIC */}
                      {task.design_pic_name && (
                        <div className="mt-2 pt-2 flex items-center gap-2" style={{ borderTop: '1px dashed var(--border-secondary)' }}>
                          <div className="flex items-center justify-center w-5 h-5 rounded-full" style={{ background: 'var(--bg-tertiary)' }}>
                            <User className="w-3 h-3" style={{ color: 'var(--text-secondary)' }} />
                          </div>
                          <span className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>
                            {task.design_pic_name}
                          </span>
                        </div>
                      )}

                      {/* Motion Subtask indicator / quick move */}
                      {task.status_design === 'DESIGN_APPROVED' && (
                        <div className="mt-2.5 pt-2 flex items-center justify-between" style={{ borderTop: '1px solid var(--border-secondary)' }}>
                          {task.motion_task ? (
                            <span className="text-[11px] font-medium text-pink-400 flex items-center gap-1">
                              <Film className="w-3 h-3" /> Motion: {task.motion_task.status_motion}
                            </span>
                          ) : (
                            <button
                              onClick={async (e) => {
                                e.stopPropagation();
                                await setMotionReadyness(task.id, true, user.id);
                                refreshTasks();
                              }}
                              className="btn-ghost text-xs py-1 px-2 text-pink-400 hover:bg-pink-500/10 flex items-center gap-1"
                            >
                              <Film className="w-3 h-3" /> Move to Motion
                            </button>
                          )}
                        </div>
                      )}

                      {/* Quick Action Buttons on Card */}
                      {task.status_design === 'STRAT_PENDING' && (
                        <div className="mt-2 pt-2 flex flex-wrap gap-1.5" style={{ borderTop: '1px solid var(--border-secondary)' }}>
                          {!task.strat_pic_id && ['ADMIN', 'TEAM_LEAD'].includes(user.role_name) && (
                            <button onClick={(e) => { e.stopPropagation(); setShowAssignModal(task.id); }}
                              className="btn-ghost text-[11px] py-1 px-2 text-blue-400 font-medium">
                              <User className="w-3 h-3" /> Assign Strat PIC
                            </button>
                          )}
                          {task.status_strat === 'PENDING' && task.strat_pic_id && (task.strat_pic_id === user.id || ['ADMIN', 'TEAM_LEAD'].includes(user.role_name)) && (
                            <button onClick={async (e) => { e.stopPropagation(); await updateStratStatus(task.id, 'IN_PROGRESS', user.id); refreshTasks(); }}
                              className="btn-ghost text-[11px] py-1 px-2 text-cyan-400">
                              <Play className="w-3 h-3" /> Start Strat
                            </button>
                          )}
                          {(task.status_strat === 'IN_PROGRESS' || task.status_strat === 'REVISION') && (task.strat_pic_id === user.id || ['ADMIN', 'TEAM_LEAD'].includes(user.role_name)) && (
                            <button onClick={(e) => { e.stopPropagation(); setShowStratSubmitModal(task.id); }}
                              className="btn-ghost text-[11px] py-1 px-2 text-emerald-400">
                              <Presentation className="w-3 h-3" /> Submit Deck
                            </button>
                          )}
                          {task.status_strat === 'REVIEW' && ['ADMIN', 'TEAM_LEAD', 'REQUESTER'].includes(user.role_name) && (
                            <>
                              <button onClick={async (e) => { e.stopPropagation(); await updateStratStatus(task.id, 'APPROVED', user.id); refreshTasks(); }}
                                className="btn-ghost text-[11px] py-1 px-2 text-emerald-400">
                                <CheckCircle2 className="w-3 h-3" /> Approve Strat
                              </button>
                              <button onClick={(e) => { e.stopPropagation(); setShowRevisionModal({ taskId: task.id, stage: 'STRATEGIC' }); }}
                                className="btn-ghost text-[11px] py-1 px-2 text-amber-400">
                                <RotateCcw className="w-3 h-3" /> Revise
                              </button>
                            </>
                          )}
                        </div>
                      )}

                      {task.status_design === 'DESIGN_UNASSIGNED' && ['ADMIN', 'TEAM_LEAD'].includes(user.role_name) && (
                        <div className="mt-2 pt-2 flex gap-1.5" style={{ borderTop: '1px solid var(--border-secondary)' }}>
                          <button onClick={(e) => { e.stopPropagation(); setShowAssignModal(task.id); }}
                            className="btn-ghost text-[11px] py-1 px-2 text-blue-400 font-medium">
                            <User className="w-3 h-3" /> {task.design_pic_id ? 'Confirm Assignment' : 'Assign Design PIC'}
                          </button>
                        </div>
                      )}

                      {task.status_design === 'DESIGN_ASSIGNED' && (task.design_pic_id === user.id || ['ADMIN', 'TEAM_LEAD'].includes(user.role_name)) && (
                        <div className="mt-2 pt-2 flex gap-1.5" style={{ borderTop: '1px solid var(--border-secondary)' }}>
                          <button onClick={async (e) => { e.stopPropagation(); await updateTaskStatus(task.id, 'DESIGN_IN_PROGRESS', user.id); refreshTasks(); }}
                            className="btn-ghost text-[11px] py-1 px-2 text-cyan-400">
                            <Play className="w-3 h-3" /> Start Work
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* TABLE VIEW */}
      {viewMode === 'table' && (
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Task Code</th>
                <th>Brand / Campaign</th>
                <th>Requester</th>
                <th>Content</th>
                <th>Source</th>
                <th>Qty</th>
                <th>Designer</th>
                <th>Difficulty</th>
                <th>Status</th>
                <th>SLA</th>
                <th>Rev</th>
                <th>Req Date</th>
                <th>Due Date</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredTasks.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).map(task => (
                <motion.tr initial={{opacity:0}} animate={{opacity:1}} transition={{duration:0.2}} key={task.id}>
                  <td>
                    <button onClick={() => setShowDetailModal(task.id)} className="font-mono text-sm font-semibold hover:underline" style={{ color: 'var(--accent-blue)' }}>
                      {task.task_code}
                    </button>
                  </td>
                  <td>
                    <p className="font-medium text-[var(--text-primary)] text-sm">{task.client_name}</p>
                    <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{task.campaign_name}</p>
                  </td>
                  <td className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
                    {task.created_by_name || 'Requester'}
                  </td>
                  <td className="text-sm" style={{ color: 'var(--text-secondary)' }}>{task.content_type_name}</td>
                  <td><span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{SOURCE_LABELS[task.task_source]}</span></td>
                  <td className="text-sm text-center" style={{ color: 'var(--text-secondary)' }}>{task.output_qty}</td>
                  <td className="text-sm" style={{ color: task.design_pic_name ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                    {task.design_pic_name || '—'}
                  </td>
                  <td>
                    {task.design_difficulty ? (
                      <span className={`badge text-[10px] ${DIFFICULTY_COLORS[task.design_difficulty]}`}>{DIFFICULTY_LABELS[task.design_difficulty]}</span>
                    ) : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                  </td>
                  <td><span className={`badge ${DESIGN_STATUS_COLORS[task.status_design]}`}>{DESIGN_STATUS_LABELS[task.status_design]}</span></td>
                  <td>
                    {task.operational_excellence ? (
                      <span className={`badge ${EXCELLENCE_COLORS[task.operational_excellence]}`}>{EXCELLENCE_LABELS[task.operational_excellence]}</span>
                    ) : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                  </td>
                  <td className="text-sm text-center" style={{ color: task.design_revision_count > 0 ? 'var(--accent-amber)' : 'var(--text-muted)' }}>
                    {task.design_revision_count}
                  </td>
                  <td className="text-sm" style={{ color: 'var(--text-secondary)' }}>{formatDisplayDate(task.req_date)}</td>
                  <td className="text-sm" style={{ color: 'var(--text-secondary)' }}>{formatDisplayDate(task.due_date)}</td>
                  <td>
                    <div className="flex items-center gap-1">
                      {/* Edit (Requester can only edit their own task) */}
                      {['ADMIN', 'TEAM_LEAD'].includes(user.role_name) || (user.role_name === 'REQUESTER' && task.created_by === user.id) ? (
                        <button onClick={() => setShowEditModal(task.id)} className="btn-ghost text-xs py-1 px-2" style={{ color: 'var(--text-primary)' }} title="Edit Request">
                          <Edit3 className="w-3 h-3" /> Edit
                        </button>
                      ) : null}

                      {/* Status-specific actions */}
                      {task.status_design === 'STRAT_PENDING' && (
                        <>
                          {!task.strat_pic_id && ['ADMIN', 'TEAM_LEAD'].includes(user.role_name) && (
                            <button onClick={() => setShowAssignModal(task.id)} className="btn-ghost text-xs py-1 px-2 text-blue-400 font-medium">Assign Strat</button>
                          )}
                          {task.status_strat === 'PENDING' && task.strat_pic_id && (task.strat_pic_id === user.id || ['ADMIN', 'TEAM_LEAD'].includes(user.role_name)) && (
                            <button onClick={async () => { await updateStratStatus(task.id, 'IN_PROGRESS', user.id); refreshTasks(); }} className="btn-ghost text-xs py-1 px-2 text-cyan-400">Start Strat</button>
                          )}
                          {(task.status_strat === 'IN_PROGRESS' || task.status_strat === 'REVISION') && (task.strat_pic_id === user.id || ['ADMIN', 'TEAM_LEAD'].includes(user.role_name)) && (
                            <button onClick={() => setShowStratSubmitModal(task.id)} className="btn-ghost text-xs py-1 px-2 text-emerald-400">Submit Deck</button>
                          )}
                          {task.status_strat === 'REVIEW' && ['ADMIN', 'TEAM_LEAD', 'REQUESTER'].includes(user.role_name) && (
                            <>
                              <button onClick={async () => { await updateStratStatus(task.id, 'APPROVED', user.id); refreshTasks(); }} className="btn-ghost text-xs py-1 px-2 text-emerald-400">Approve Strat</button>
                              <button onClick={() => setShowRevisionModal({ taskId: task.id, stage: 'STRATEGIC' })} className="btn-ghost text-xs py-1 px-2 text-amber-400">Revise</button>
                            </>
                          )}
                        </>
                      )}

                      {task.status_design === 'DESIGN_UNASSIGNED' && ['ADMIN', 'TEAM_LEAD'].includes(user.role_name) && (
                        <button onClick={() => setShowAssignModal(task.id)} className="btn-ghost text-xs py-1 px-2" style={{ color: 'var(--accent-blue)' }}>{task.design_pic_id ? 'Confirm' : 'Assign'}</button>
                      )}
                      {task.status_design === 'DESIGN_ASSIGNED' && (task.design_pic_id === user.id || ['ADMIN', 'TEAM_LEAD'].includes(user.role_name)) && (
                        <button onClick={async () => { await updateTaskStatus(task.id, 'DESIGN_IN_PROGRESS', user.id); refreshTasks(); }} className="btn-ghost text-xs py-1 px-2" style={{ color: 'var(--accent-cyan)' }}>
                          <Play className="w-3 h-3" /> Start
                        </button>
                      )}
                      {task.status_design === 'DESIGN_IN_PROGRESS' && (task.design_pic_id === user.id || ['ADMIN', 'TEAM_LEAD'].includes(user.role_name)) && (
                        <button onClick={() => setShowSubmitModal(task.id)} className="btn-ghost text-xs py-1 px-2" style={{ color: 'var(--accent-emerald)' }}>
                          <Send className="w-3 h-3" /> Submit
                        </button>
                      )}
                      {task.status_design === 'DESIGN_SUBMITTED' && ['ADMIN', 'TEAM_LEAD', 'REQUESTER'].includes(user.role_name) && (
                        <>
                          <button onClick={async () => { await updateTaskStatus(task.id, 'DESIGN_APPROVED', user.id); refreshTasks(); }} className="btn-ghost text-xs py-1 px-2" style={{ color: 'var(--accent-emerald)' }}>
                            <CheckCircle2 className="w-3 h-3" /> Approve
                          </button>
                          <button onClick={() => setShowRevisionModal({ taskId: task.id, stage: 'DESIGN' })} className="btn-ghost text-xs py-1 px-2" style={{ color: 'var(--accent-amber)' }}>
                            <RotateCcw className="w-3 h-3" /> Revise
                          </button>
                        </>
                      )}
                      {task.status_design === 'DESIGN_REVISION' && (task.design_pic_id === user.id || ['ADMIN', 'TEAM_LEAD'].includes(user.role_name)) && (
                        <button onClick={() => setShowSubmitModal(task.id)} className="btn-ghost text-xs py-1 px-2" style={{ color: 'var(--accent-emerald)' }}>
                          <Send className="w-3 h-3" /> Re-submit
                        </button>
                      )}
                      {task.status_design === 'DESIGN_APPROVED' && !task.motion_task && (
                        <button onClick={async () => { await setMotionReadyness(task.id, true, user.id); refreshTasks(); }} className="btn-ghost text-xs py-1 px-2 text-pink-400">
                          <Film className="w-3 h-3" /> Motion
                        </button>
                      )}
                      
                      {/* Undo Status */}
                      {['ADMIN', 'TEAM_LEAD'].includes(user.role_name) && task.status_design !== 'DESIGN_UNASSIGNED' && task.status_design !== 'TASK_CLOSED' && (
                        <button onClick={async () => { 
                          const prevStatus = task.status_design === 'DESIGN_ASSIGNED' ? 'DESIGN_UNASSIGNED' :
                                             task.status_design === 'DESIGN_IN_PROGRESS' ? 'DESIGN_ASSIGNED' :
                                             task.status_design === 'DESIGN_SUBMITTED' ? 'DESIGN_IN_PROGRESS' :
                                             task.status_design === 'DESIGN_REVISION' ? 'DESIGN_SUBMITTED' :
                                             task.status_design === 'DESIGN_APPROVED' ? 'DESIGN_SUBMITTED' : null;
                          if (prevStatus) {
                            await updateTaskStatus(task.id, prevStatus, user.id);
                            refreshTasks();
                          }
                        }} className="btn-ghost text-xs py-1 px-2" style={{ color: 'var(--text-secondary)' }} title="Undo Status">
                          <Undo2 className="w-3 h-3" /> Undo
                        </button>
                      )}
                    </div>
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* CREATE / EDIT TASK MODAL */}
      {showCreateModal && (
        <TaskFormModal
          onClose={() => { setShowCreateModal(false); refreshTasks(); }}
          userId={user.id}
          userRole={user.role_name}
          clients={clients}
          contentTypes={contentTypes}
          stratUsers={allUsers.filter(u => ['STRATEGIC_PIC', 'TEAM_LEAD', 'ADMIN'].includes(u.role_name))}
        />
      )}
      {showEditModal && (
        <TaskFormModal
          onClose={() => { setShowEditModal(null); refreshTasks(); }}
          userId={user.id}
          userRole={user.role_name}
          editTaskId={showEditModal}
          taskToEdit={tasks.find(t => t.id === showEditModal)}
          clients={clients}
          contentTypes={contentTypes}
          stratUsers={allUsers.filter(u => ['STRATEGIC_PIC', 'TEAM_LEAD', 'ADMIN'].includes(u.role_name))}
        />
      )}
      {/* ASSIGN MODAL */}
      {showAssignModal && (
        <AssignModal
          taskId={showAssignModal}
          task={tasks.find(t => t.id === showAssignModal)}
          onClose={() => { setShowAssignModal(null); refreshTasks(); }}
          userId={user.id}
          designers={allUsers.filter(u => ['DESIGNER', 'TEAM_LEAD'].includes(u.role_name) && u.daily_capacity_points > 0)}
          stratUsers={allUsers.filter(u => ['STRATEGIC_PIC', 'TEAM_LEAD', 'ADMIN'].includes(u.role_name))}
        />
      )}
      {/* DETAIL MODAL */}
      {showDetailModal && (
        <TaskDetailModal 
          task={tasks.find(t => t.id === showDetailModal)} 
          onClose={() => { setShowDetailModal(null); refreshTasks(); }} 
          user={user} 
          onRefresh={refreshTasks} 
          onAssign={() => { const id = showDetailModal; setShowDetailModal(null); setShowAssignModal(id); }}
          onSubmit={() => { const id = showDetailModal; setShowDetailModal(null); setShowSubmitModal(id); }}
          onSubmitStrat={() => { const id = showDetailModal; setShowDetailModal(null); setShowStratSubmitModal(id); }}
          onRevise={(stage = 'DESIGN') => { const id = showDetailModal; setShowDetailModal(null); setShowRevisionModal({ taskId: id, stage }); }}
          onEdit={() => { const id = showDetailModal; setShowDetailModal(null); setShowEditModal(id); }}
        />
      )}
      {/* REVISION MODAL */}
      {showRevisionModal && (
        <RevisionModal 
          taskId={showRevisionModal.taskId} 
          stage={showRevisionModal.stage}
          onClose={() => { setShowRevisionModal(null); refreshTasks(); }} 
          userId={user.id} 
        />
      )}
      {/* SUBMIT MODAL */}
      {showSubmitModal && <SubmitModal taskId={showSubmitModal} onClose={() => { setShowSubmitModal(null); refreshTasks(); }} userId={user.id} />}
      {/* STRATEGIC SUBMIT MODAL */}
      {showStratSubmitModal && <SubmitStratModal taskId={showStratSubmitModal} onClose={() => { setShowStratSubmitModal(null); refreshTasks(); }} userId={user.id} />}
    </div>
  );
}

// ===================== CREATE / EDIT TASK MODAL =====================
function TaskFormModal({ 
  onClose, userId, userRole, editTaskId, taskToEdit, clients, contentTypes, stratUsers
}: { 
  onClose: () => void; userId: string; userRole?: string; editTaskId?: string; taskToEdit?: TaskWithRelations | null;
  clients: Client[]; contentTypes: ContentType[]; stratUsers: UserType[];
}) {
  const activeClients = clients.filter(c => c.is_active);

  const [form, setForm] = useState<CreateTaskInput>({
    client_id: taskToEdit?.client_id || activeClients[0]?.id || 1, 
    campaign_name: taskToEdit?.campaign_name || '', 
    content_type_id: taskToEdit?.content_type_id || contentTypes[0]?.id || 1,
    task_source: taskToEdit?.task_source || 'ORCA',
    platform: taskToEdit?.platform || 'TIKTOK', 
    req_qty: taskToEdit?.req_qty || 1, 
    req_date: taskToEdit?.req_date ? taskToEdit.req_date.substring(0, 10) : new Date().toISOString().split('T')[0],
    due_date: taskToEdit?.due_date ? taskToEdit.due_date.substring(0, 10) : '', 
    requires_strategic_concept: taskToEdit ? (taskToEdit.status_strat !== 'NOT_REQUIRED') : false, 
    strat_pic_id: taskToEdit?.strat_pic_id || '',
    notes: taskToEdit?.notes || '',
  });
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const sanitizedForm: CreateTaskInput = {
        ...form,
        strat_pic_id: (form.requires_strategic_concept && form.strat_pic_id && form.strat_pic_id.trim() !== '')
          ? form.strat_pic_id
          : undefined,
      };
      if (editTaskId) {
        await editTask(editTaskId, sanitizedForm, userId, userRole);
      } else {
        await createTask(sanitizedForm, userId);
      }
      onClose();
    } catch (err: any) {
      console.error('Error saving task:', err);
      const errMsg = err?.message || err?.details || err?.error_description || (typeof err === 'object' ? JSON.stringify(err) : String(err));
      alert(`Gagal menyimpan task: ${errMsg}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <div className="p-5 flex items-center justify-between" style={{ borderBottom: '1px solid var(--border-primary)' }}>
          <h2 className="text-lg font-bold text-[var(--text-primary)]">{editTaskId ? 'Edit Task Request' : 'Create New Task'}</h2>
          <button onClick={onClose} className="btn-ghost p-1"><X className="w-5 h-5" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label className="label">Client / Brand *</label>
              <select className="select" value={form.client_id} onChange={e => setForm({ ...form, client_id: Number(e.target.value) })}>
                {activeClients.map(c => <option key={c.id} value={c.id}>{c.name} ({c.client_type})</option>)}
              </select>
            </div>
            <div>
              <label className="label">Content Type *</label>
              <select className="select" value={form.content_type_id} onChange={e => setForm({ ...form, content_type_id: Number(e.target.value) })}>
                {contentTypes.map(ct => <option key={ct.id} value={ct.id}>{ct.name}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="label">Campaign Name *</label>
            <input className="input" placeholder="e.g. Ramadhan Big Sale 2026" required
              value={form.campaign_name} onChange={e => setForm({ ...form, campaign_name: e.target.value })} />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label className="label">Task Source *</label>
              <select className="select" value={form.task_source} onChange={e => setForm({ ...form, task_source: e.target.value as TaskSource })}>
                <option value="ORCA">Orca</option>
                <option value="ECOMMERCE">E-Commerce</option>
              </select>
            </div>
            <div>
              <label className="label">Request Qty *</label>
              <input className="input" type="number" min={1} required
                value={form.req_qty} onChange={e => setForm({ ...form, req_qty: Number(e.target.value) })} />
            </div>
          </div>

          {/* STRATEGIC CONCEPT SECTION */}
          <div className="p-4 rounded-xl space-y-3" style={{ background: 'rgba(59, 130, 246, 0.04)', border: '1px solid rgba(59, 130, 246, 0.18)' }}>
            <div className="flex items-center justify-between">
              <div>
                <label className="label mb-0" style={{ fontWeight: '600', color: 'var(--text-primary)' }}>Requires Strategic Concept?</label>
                <p className="text-xs text-[var(--text-muted)] mt-0.5">Aktifkan jika brief memerlukan deck konsep/strategi sebelum didesain</p>
              </div>
              <div className="flex items-center gap-3">
                <div className={`toggle ${form.requires_strategic_concept ? 'active' : ''}`}
                  onClick={() => setForm({ 
                    ...form, 
                    requires_strategic_concept: !form.requires_strategic_concept,
                    strat_pic_id: !form.requires_strategic_concept ? form.strat_pic_id : ''
                  })} 
                />
                <span className="text-sm font-semibold" style={{ color: form.requires_strategic_concept ? 'var(--accent-blue)' : 'var(--text-secondary)', minWidth: '28px' }}>
                  {form.requires_strategic_concept ? 'Yes' : 'No'}
                </span>
              </div>
            </div>

            {form.requires_strategic_concept && (
              <div className="pt-3 border-t border-[rgba(59,130,246,0.15)] space-y-1.5">
                <label className="label">Assign Strategic PIC / Team Lead</label>
                <select className="select" value={form.strat_pic_id || ''} onChange={e => setForm({ ...form, strat_pic_id: e.target.value })}>
                  <option value="">(Belum Di-assign / Unassigned)</option>
                  {stratUsers.map(u => (
                    <option key={u.id} value={u.id}>
                      {u.full_name} ({u.role_name === 'TEAM_LEAD' ? 'Team Lead' : u.role_name === 'STRATEGIC_PIC' ? 'Strategic PIC' : u.role_name})
                    </option>
                  ))}
                </select>
                <p className="text-xs text-[var(--accent-blue)] flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 shrink-0" />
                  Team Lead atau Strategic PIC yang dipilih akan bertanggung jawab menyusun deck konsep.
                </p>
              </div>
            )}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label className="label">Request Date *</label>
              <input className="input" type="date" required
                value={form.req_date} onChange={e => setForm({ ...form, req_date: e.target.value })} />
            </div>
            <div>
              <label className="label">Due Date *</label>
              <input className="input" type="date" required
                value={form.due_date} onChange={e => setForm({ ...form, due_date: e.target.value })} />
            </div>
          </div>
          <div>
            <label className="label">Notes</label>
            <textarea className="input" rows={3} placeholder="Additional notes..."
              value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
          </div>
          <div className="flex justify-end gap-3 pt-4 border-t border-[var(--border-secondary)]">
            <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
            <button type="submit" className="btn-primary" disabled={submitting}>
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              {editTaskId ? 'Save Changes' : 'Create Task'}
            </button>
          </div>
        </form>
      </div>
    </motion.div>
  );
}

// ===================== ASSIGN MODAL =====================
function AssignModal({ 
  taskId, onClose, userId, designers, stratUsers = [], task
}: { 
  taskId: string; onClose: () => void; userId: string; designers: UserType[]; stratUsers?: UserType[]; task?: TaskWithRelations | null;
}) {
  const [picId, setPicId] = useState(task?.design_pic_id || (task?.design_pic_id ? '' : (designers[0]?.id || '')));
  const [stratPicId, setStratPicId] = useState(task?.strat_pic_id || '');
  const [difficulty, setDifficulty] = useState<'LOW' | 'MEDIUM' | 'HIGH'>(task?.design_difficulty || 'MEDIUM');
  const [submitting, setSubmitting] = useState(false);

  const hasStrategic = Boolean(task?.requires_strategic_concept && task?.status_strat !== 'NOT_REQUIRED');
  const alreadyHasStratPic = Boolean(task?.strat_pic_id);
  const alreadyHasDesignPic = Boolean(task?.design_pic_id);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const finalDesignPicId = task?.design_pic_id || picId;
      const finalStratPicId = task?.strat_pic_id || stratPicId;

      const payload: AssignTaskInput = {
        design_pic_id: finalDesignPicId || undefined,
        design_difficulty: difficulty,
        strat_pic_id: (hasStrategic && finalStratPicId) ? finalStratPicId : undefined
      };
      await assignTask(taskId, payload, userId, 'TEAM_LEAD');
      onClose();
    } catch (err: any) {
      console.error('Error assigning task:', err);
      const errMsg = err?.message || err?.details || err?.error_description || (typeof err === 'object' ? JSON.stringify(err) : String(err));
      alert(`Gagal assign task: ${errMsg}`);
    } finally {
      setSubmitting(false);
    }
  };

  const getModalTitle = () => {
    if (hasStrategic && !alreadyHasStratPic && !alreadyHasDesignPic) return 'Assign Strategic & Design PIC';
    if (hasStrategic && !alreadyHasStratPic) return 'Assign Strategic PIC';
    if (!alreadyHasDesignPic) return 'Assign Design PIC';
    return 'Confirm Assignment & Difficulty';
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="modal-overlay" onClick={onClose}>
      <div className="modal-content max-w-md" onClick={e => e.stopPropagation()}>
        <div className="p-5 flex items-center justify-between" style={{ borderBottom: '1px solid var(--border-primary)' }}>
          <h2 className="text-lg font-bold text-[var(--text-primary)]">
            {getModalTitle()}
          </h2>
          <button onClick={onClose} className="btn-ghost p-1"><X className="w-5 h-5" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* Strategic PIC Section */}
          {hasStrategic && (
            alreadyHasStratPic ? (
              <div className="p-3 rounded-lg flex items-center justify-between" style={{ background: 'rgba(59,130,246,0.05)', border: '1px solid rgba(59,130,246,0.15)' }}>
                <div>
                  <span className="text-[11px] font-semibold text-[var(--accent-blue)] block uppercase">Strategic PIC</span>
                  <span className="text-sm font-semibold text-[var(--text-primary)]">{task?.strat_pic_name || 'Sudah Ditugaskan'}</span>
                </div>
                <span className="badge text-[10px] bg-blue-500/20 text-blue-400 border-blue-500/30">Assigned</span>
              </div>
            ) : (
              <div className="p-3 rounded-lg" style={{ background: 'rgba(59,130,246,0.05)', border: '1px solid rgba(59,130,246,0.15)' }}>
                <label className="label">Strategic PIC / Team Lead</label>
                <select className="select" value={stratPicId} onChange={e => setStratPicId(e.target.value)}>
                  <option value="">(Belum Di-assign / Unassigned)</option>
                  {stratUsers.map(u => (
                    <option key={u.id} value={u.id}>
                      {u.full_name} ({u.role_name === 'TEAM_LEAD' ? 'Team Lead' : 'Strategic PIC'})
                    </option>
                  ))}
                </select>
              </div>
            )
          )}

          {/* Design PIC Section */}
          {alreadyHasDesignPic ? (
            <div className="p-3 rounded-lg flex items-center justify-between" style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border-secondary)' }}>
              <div>
                <span className="text-[11px] font-semibold text-[var(--text-muted)] block uppercase">Design PIC</span>
                <span className="text-sm font-semibold text-[var(--text-primary)]">{task?.design_pic_name || 'Sudah Ditugaskan'}</span>
              </div>
              <span className="badge text-[10px] bg-emerald-500/20 text-emerald-400 border-emerald-500/30">Assigned</span>
            </div>
          ) : (
            <div>
              <label className="label">Design PIC *</label>
              <select className="select" value={picId} onChange={e => setPicId(e.target.value)} required>
                <option value="">(Pilih Desainer)</option>
                {designers.map(d => <option key={d.id} value={d.id}>{d.full_name} ({d.daily_capacity_points} pts/day)</option>)}
              </select>
            </div>
          )}

          {/* Design Difficulty */}
          <div>
            <label className="label">Design Difficulty *</label>
            <select className="select" value={difficulty} onChange={e => setDifficulty(e.target.value as 'LOW' | 'MEDIUM' | 'HIGH')}>
              <option value="LOW">Low (2.5 pts)</option>
              <option value="MEDIUM">Medium (3.5 pts)</option>
              <option value="HIGH">High (4.5 pts)</option>
            </select>
          </div>
          <div className="flex justify-end gap-3">
            <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
            <button type="submit" className="btn-primary" disabled={submitting}>
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <User className="w-4 h-4" />} Simpan Assignment
            </button>
          </div>
        </form>
      </div>
    </motion.div>
  );
}

// ===================== SUBMIT STRATEGIC CONCEPT MODAL =====================
function SubmitStratModal({ taskId, onClose, userId }: { taskId: string; onClose: () => void; userId: string }) {
  const [conceptName, setConceptName] = useState('');
  const [conceptLink, setConceptLink] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await submitStrategicConcept(taskId, { strat_concept_name: conceptName, strat_concept_link: conceptLink }, userId);
      onClose();
    } catch (err: any) {
      console.error('Error submitting strategic concept:', err);
      alert(err.message || 'Error submitting concept');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="modal-overlay" onClick={onClose}>
      <div className="modal-content max-w-md" onClick={e => e.stopPropagation()}>
        <div className="p-5 flex items-center justify-between" style={{ borderBottom: '1px solid var(--border-primary)' }}>
          <h2 className="text-lg font-bold text-[var(--text-primary)]">Submit Strategic Concept Deck</h2>
          <button onClick={onClose} className="btn-ghost p-1"><X className="w-5 h-5" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="label">Deck / Concept Name *</label>
            <input className="input" required placeholder="e.g. Sosro Big Idea & Key Visual Concept V1" value={conceptName} onChange={e => setConceptName(e.target.value)} />
          </div>
          <div>
            <label className="label">Google Slides / Doc Link *</label>
            <input className="input" required placeholder="https://docs.google.com/presentation/d/..." value={conceptLink} onChange={e => setConceptLink(e.target.value)} />
          </div>
          <p className="text-xs p-3 rounded-lg" style={{ background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.2)', color: 'var(--accent-blue)' }}>
            Strategic deck akan diteruskan ke Review Requester / Team Lead sebelum task design dapat di-assign.
          </p>
          <div className="flex justify-end gap-3">
            <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
            <button type="submit" className="btn-primary" disabled={submitting}>
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Presentation className="w-4 h-4" />} Submit Deck
            </button>
          </div>
        </form>
      </div>
    </motion.div>
  );
}

// ===================== SUBMIT MODAL =====================
function SubmitModal({ taskId, onClose, userId }: { taskId: string; onClose: () => void; userId: string }) {
  const [outputQty, setOutputQty] = useState(1);
  const [assetName, setAssetName] = useState('');
  const [assetLink, setAssetLink] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await submitTask(taskId, { output_qty: outputQty, final_asset_name: assetName, final_asset_link: assetLink }, userId);
      onClose();
    } catch (err: any) {
      console.error('Error submitting task:', err);
      const errMsg = err?.message || err?.details || err?.error_description || (typeof err === 'object' ? JSON.stringify(err) : String(err));
      alert(`Gagal submit design: ${errMsg}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="modal-overlay" onClick={onClose}>
      <div className="modal-content max-w-md" onClick={e => e.stopPropagation()}>
        <div className="p-5 flex items-center justify-between" style={{ borderBottom: '1px solid var(--border-primary)' }}>
          <h2 className="text-lg font-bold text-[var(--text-primary)]">Submit Design</h2>
          <button onClick={onClose} className="btn-ghost p-1"><X className="w-5 h-5" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="label">Output Quantity *</label>
            <input className="input" type="number" min={1} required value={outputQty} onChange={e => setOutputQty(Number(e.target.value))} />
          </div>
          <div>
            <label className="label">Final Asset Name *</label>
            <input className="input" required placeholder="e.g. Delfi_Ramadhan_Banner_V1" value={assetName} onChange={e => setAssetName(e.target.value)} />
          </div>
          <div>
            <label className="label">Google Drive Link *</label>
            <input className="input" required placeholder="https://drive.google.com/..." value={assetLink} onChange={e => setAssetLink(e.target.value)} />
          </div>
          <p className="text-xs p-3 rounded-lg" style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)', color: 'var(--accent-emerald)' }}>
            SLA akan dihitung otomatis saat submit (hari kerja exclude weekend & libur nasional)
          </p>
          <div className="flex justify-end gap-3">
            <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
            <button type="submit" className="btn-primary" disabled={submitting}>
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} Submit
            </button>
          </div>
        </form>
      </div>
    </motion.div>
  );
}

// ===================== REVISION MODAL =====================
function RevisionModal({ 
  taskId, stage = 'DESIGN', onClose, userId 
}: { 
  taskId: string; stage?: 'STRATEGIC' | 'DESIGN'; onClose: () => void; userId: string; 
}) {
  const [reason, setReason] = useState<ReasonCategory>('CLIENT_CHANGE');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await requestRevision(taskId, { stage, reason_category: reason, notes }, userId);
      onClose();
    } catch (err: any) {
      console.error('Error requesting revision:', err);
      const errMsg = err?.message || err?.details || err?.error_description || (typeof err === 'object' ? JSON.stringify(err) : String(err));
      alert(`Gagal request revisi: ${errMsg}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="modal-overlay" onClick={onClose}>
      <div className="modal-content max-w-md" onClick={e => e.stopPropagation()}>
        <div className="p-5 flex items-center justify-between" style={{ borderBottom: '1px solid var(--border-primary)' }}>
          <h2 className="text-lg font-bold text-[var(--text-primary)]">Request Revision ({stage})</h2>
          <button onClick={onClose} className="btn-ghost p-1"><X className="w-5 h-5" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="label">Reason Category *</label>
            <select className="select" value={reason} onChange={e => setReason(e.target.value as ReasonCategory)}>
              {Object.entries(REASON_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Revision Notes *</label>
            <textarea className="input" rows={3} required placeholder="Describe what needs to be changed..."
              value={notes} onChange={e => setNotes(e.target.value)} />
          </div>
          <div className="flex justify-end gap-3">
            <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
            <button type="submit" className="btn-danger" disabled={submitting}>
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />} Request Revision
            </button>
          </div>
        </form>
      </div>
    </motion.div>
  );
}

// ===================== TASK DETAIL MODAL =====================
function TaskDetailModal({ 
  task, onClose, user, onRefresh, onAssign, onSubmit, onRevise, onEdit, onSubmitStrat
}: { 
  task?: TaskWithRelations | null; onClose: () => void; user: UserType; onRefresh: () => void;
  onAssign?: () => void; onSubmit?: () => void; onRevise?: (stage?: 'STRATEGIC' | 'DESIGN') => void; onEdit?: () => void;
  onSubmitStrat?: () => void;
}) {
  const [auditLogs, setAuditLogs] = useState<any[]>([]);

  useEffect(() => {
    if (!task) return;
    getAuditLogs().then(logs => {
      setAuditLogs(logs.filter(l => l.entity_id === task.id || l.entity_id === task.task_code));
    }).catch(console.error);
  }, [task]);

  if (!task) return null;

  const canEdit = ['ADMIN', 'TEAM_LEAD'].includes(user.role_name) || (user.role_name === 'REQUESTER' && task.created_by === user.id);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="modal-overlay" onClick={onClose} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
      <div className="modal-content" onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: '720px', background: 'var(--bg-card)', borderRadius: '16px', border: '1px solid var(--border-primary)', boxShadow: 'var(--shadow-dropdown)', display: 'flex', flexDirection: 'column', maxHeight: '90vh' }}>
        
        {/* Header */}
        <div style={{ padding: '24px', borderBottom: '1px solid var(--border-primary)', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <span style={{ fontFamily: 'monospace', fontSize: '13px', color: 'var(--accent-blue)', fontWeight: '600' }}>{task.task_code}</span>
            <h2 style={{ fontSize: '20px', fontWeight: '700', color: 'var(--text-primary)', margin: 0 }}>{task.campaign_name}</h2>
            
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '4px' }}>
              <span className={`badge ${DESIGN_STATUS_COLORS[task.status_design]}`}>{DESIGN_STATUS_LABELS[task.status_design]}</span>
              {task.status_strat !== 'NOT_REQUIRED' && (
                <span className="badge" style={{ background: 'rgba(59, 130, 246, 0.1)', color: '#3b82f6', borderColor: 'rgba(59, 130, 246, 0.2)' }}>
                  Strat: {STRAT_STATUS_LABELS[task.status_strat]}
                </span>
              )}
              {task.operational_excellence && <span className={`badge ${EXCELLENCE_COLORS[task.operational_excellence]}`}>{EXCELLENCE_LABELS[task.operational_excellence]}</span>}
              {task.design_difficulty && <span className={`badge ${DIFFICULTY_COLORS[task.design_difficulty]}`}>{DIFFICULTY_LABELS[task.design_difficulty]}</span>}
              {task.motion_readiness === 'READY_TO_ANIMATE' && <span className="badge" style={{ background: 'rgba(236, 72, 153, 0.1)', color: '#ec4899', borderColor: 'rgba(236, 72, 153, 0.2)' }}>Motion Ready</span>}
            </div>
          </div>
          <button onClick={onClose} className="btn-ghost" style={{ padding: '8px', borderRadius: '8px', background: 'var(--bg-tertiary)', border: 'none', cursor: 'pointer' }}>
            <X style={{ width: '20px', height: '20px', color: 'var(--text-secondary)' }} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '32px', overflowY: 'auto' }} className="custom-scrollbar">
          
          {/* Info Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '24px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}><span style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Brand</span><p style={{ color: 'var(--text-primary)', fontWeight: '500', fontSize: '14px', margin: 0 }}>{task.client_name} <span style={{ fontSize: '10px', padding: '2px 6px', background: 'var(--bg-tertiary)', borderRadius: '4px', marginLeft: '4px', color: 'var(--text-secondary)' }}>{task.client_type}</span></p></div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}><span style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Requester</span><p style={{ color: 'var(--text-primary)', fontWeight: '600', fontSize: '14px', margin: 0 }}>{task.created_by_name || 'Requester'}</p></div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}><span style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Content Type</span><p style={{ color: 'var(--text-primary)', fontSize: '14px', margin: 0 }}>{task.content_type_name}</p></div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}><span style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Source</span><p style={{ color: 'var(--text-secondary)', fontSize: '14px', margin: 0 }}>{SOURCE_LABELS[task.task_source]}</p></div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}><span style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Quantity</span><p style={{ color: 'var(--text-secondary)', fontSize: '14px', margin: 0 }}>Req: {task.req_qty} &nbsp;|&nbsp; Output: {task.output_qty}</p></div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}><span style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Request Date</span><p style={{ color: 'var(--text-secondary)', fontSize: '14px', margin: 0 }}>{formatDisplayDate(task.req_date)}</p></div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}><span style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Due Date</span><p style={{ color: 'var(--text-primary)', fontWeight: '600', fontSize: '14px', margin: 0 }}>{formatDisplayDate(task.due_date)}</p></div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}><span style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em' }}>SLA Working Days</span><p style={{ color: 'var(--text-secondary)', fontSize: '14px', margin: 0 }}>{task.sla_working_days ?? '—'} days</p></div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}><span style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Design PIC</span><p style={{ color: 'var(--text-primary)', fontSize: '14px', fontWeight: '500', margin: 0 }}>{task.design_pic_name || '—'}</p></div>
            {task.requires_strategic_concept && task.status_strat !== 'NOT_REQUIRED' ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}><span style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Strategic PIC</span><p style={{ color: 'var(--text-secondary)', fontSize: '14px', margin: 0 }}>{task.strat_pic_name || '—'}</p></div>
            ) : null}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}><span style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Revisions</span><p style={{ color: task.design_revision_count > 0 ? 'var(--accent-amber)' : 'var(--text-secondary)', fontSize: '14px', fontWeight: '500', margin: 0 }}>Design: {task.design_revision_count} &nbsp;|&nbsp; Strat: {task.strat_revision_count}</p></div>
          </div>

          {/* Strategic Concept Link Section */}
          {task.status_strat !== 'NOT_REQUIRED' && (
            <div style={{ padding: '20px', background: 'rgba(59,130,246,0.05)', borderRadius: '12px', border: '1px solid rgba(59,130,246,0.2)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div className="flex items-center justify-between">
                <span style={{ fontSize: '12px', color: 'var(--accent-blue)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Strategic Concept</span>
                <span className="badge" style={{ background: 'rgba(59, 130, 246, 0.1)', color: '#3b82f6', borderColor: 'rgba(59, 130, 246, 0.2)' }}>{STRAT_STATUS_LABELS[task.status_strat]}</span>
              </div>
              {task.strat_concept_link ? (
                <>
                  <p style={{ fontSize: '15px', color: 'var(--text-primary)', fontWeight: '600', margin: 0 }}>{task.strat_concept_name || 'Strategic Concept Deck'}</p>
                  <a href={sanitizeUrl(task.strat_concept_link)} target="_blank" rel="noopener noreferrer"
                    style={{ fontSize: '13px', color: 'var(--accent-blue)', display: 'flex', alignItems: 'center', gap: '6px', textDecoration: 'none', fontWeight: '500' }}>
                    <ExternalLink style={{ width: '14px', height: '14px' }} /> {task.strat_concept_link}
                  </a>
                  {task.strat_submitted_at && (
                    <span className="text-xs text-slate-400 mt-1">Submitted at: {new Date(task.strat_submitted_at).toLocaleString('id-ID')}</span>
                  )}
                </>
              ) : (
                <p className="text-xs text-slate-400">Concept deck belum di-submit oleh Strategic PIC.</p>
              )}
            </div>
          )}

          {/* Final Asset */}
          {task.final_asset_link && (
            <div style={{ padding: '20px', background: 'var(--bg-tertiary)', borderRadius: '12px', border: '1px solid var(--border-primary)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Final Asset</span>
              <p style={{ fontSize: '15px', color: 'var(--text-primary)', fontWeight: '600', margin: 0 }}>{task.final_asset_name}</p>
              <a href={sanitizeUrl(task.final_asset_link)} target="_blank" rel="noopener noreferrer"
                style={{ fontSize: '13px', color: 'var(--accent-blue)', display: 'flex', alignItems: 'center', gap: '6px', textDecoration: 'none', fontWeight: '500' }}>
                <ExternalLink style={{ width: '14px', height: '14px' }} /> {task.final_asset_link}
              </a>
            </div>
          )}

          {/* Motion Task */}
          {task.motion_task && (
            <div style={{ padding: '16px', background: 'rgba(236,72,153,0.05)', borderRadius: '12px', border: '1px solid rgba(236,72,153,0.2)', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <span style={{ fontSize: '12px', color: 'var(--accent-pink)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Motion Subtask</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <span className={`badge ${MOTION_STATUS_COLORS[task.motion_task.status_motion]}`}>{MOTION_STATUS_LABELS[task.motion_task.status_motion]}</span>
                {task.motion_pic_name && <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>PIC: {task.motion_pic_name}</span>}
              </div>
            </div>
          )}

          {/* Revision History */}
          {task.revisions && task.revisions.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <h4 style={{ fontSize: '15px', fontWeight: '600', color: 'var(--text-primary)', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <RotateCcw style={{ width: '16px', height: '16px', color: 'var(--accent-amber)' }} />
                Revision History
              </h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {task.revisions.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).map(rev => (
                  <div key={rev.id} style={{ padding: '16px', background: 'var(--bg-tertiary)', borderRadius: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ fontWeight: '600', color: 'var(--text-primary)', fontSize: '13px' }}>{rev.stage} Rev #{rev.revision_number}</span>
                      <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{formatDisplayDate(rev.created_at)}</span>
                    </div>
                    <div>
                      <span className="badge" style={{ fontSize: '10px', padding: '2px 8px', background: 'rgba(217, 119, 6, 0.1)', color: 'var(--accent-amber)', borderColor: 'rgba(217, 119, 6, 0.2)' }}>{REASON_LABELS[rev.reason_category]}</span>
                    </div>
                    <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: 0, lineHeight: '1.5' }}>{rev.notes || (rev as any).revision_notes}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Audit Log */}
          {auditLogs.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', paddingTop: '24px', borderTop: '1px solid var(--border-secondary)' }}>
              <h4 style={{ fontSize: '14px', fontWeight: '600', color: 'var(--text-primary)', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <FileText style={{ width: '16px', height: '16px', color: 'var(--text-muted)' }} />
                Audit Trail
              </h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxHeight: '160px', overflowY: 'auto' }} className="custom-scrollbar">
                {auditLogs.map(log => (
                  <div key={log.id} style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', paddingBottom: '12px', borderBottom: '1px solid var(--border-secondary)' }}>
                    <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--accent-blue)', marginTop: '6px', flexShrink: 0 }} />
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                      <p style={{ fontSize: '13px', color: 'var(--text-primary)', margin: 0 }}>
                        <span style={{ fontWeight: '600' }}>{log.performer_name || 'System'}</span> — {log.action.replace(/_/g, ' ')}
                      </p>
                      <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: 0 }}>
                        {new Date(log.timestamp).toLocaleString('id-ID')}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>

        {/* Action Buttons Footer */}
        <div style={{ padding: '20px 24px', borderTop: '1px solid var(--border-primary)', display: 'flex', flexWrap: 'wrap', gap: '16px', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg-secondary)', borderBottomLeftRadius: '16px', borderBottomRightRadius: '16px' }}>
          
          {/* LEFT SIDE: Management Actions */}
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '12px' }}>
            {canEdit && (
              <button 
                onClick={onEdit} 
                style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 16px', borderRadius: '8px', fontWeight: '600', color: 'var(--text-primary)', background: 'var(--bg-tertiary)', border: '1px solid var(--border-secondary)', cursor: 'pointer' }}
              >
                <Edit3 style={{ width: '16px', height: '16px' }} /> Edit Request
              </button>
            )}
            {['ADMIN', 'TEAM_LEAD'].includes(user.role_name) && (
              <button 
                onClick={async () => { 
                  if (confirm('Are you sure you want to delete this task? This action cannot be undone.')) {
                    await deleteTask(task.id, user.id);
                    onRefresh();
                    onClose();
                  }
                }} 
                style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 16px', borderRadius: '8px', fontWeight: '600', color: 'var(--accent-red)', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)', cursor: 'pointer' }}
              >
                <Trash2 style={{ width: '16px', height: '16px' }} /> Delete
              </button>
            )}
            {/* ROLLBACK BUTTON */}
            {['ADMIN', 'TEAM_LEAD'].includes(user.role_name) && task.status_design !== 'DESIGN_UNASSIGNED' && task.status_design !== 'TASK_CLOSED' && (
              <button 
                onClick={async () => { 
                  const prevStatus = task.status_design === 'DESIGN_ASSIGNED' ? 'DESIGN_UNASSIGNED' :
                                     task.status_design === 'DESIGN_IN_PROGRESS' ? 'DESIGN_ASSIGNED' :
                                     task.status_design === 'DESIGN_SUBMITTED' ? 'DESIGN_IN_PROGRESS' :
                                     task.status_design === 'DESIGN_REVISION' ? 'DESIGN_SUBMITTED' :
                                     task.status_design === 'DESIGN_APPROVED' ? 'DESIGN_SUBMITTED' : null;
                  if (prevStatus) {
                    await updateTaskStatus(task.id, prevStatus, user.id);
                    onRefresh();
                  }
                }} 
                className="btn-secondary" 
                style={{ color: 'var(--text-secondary)', borderColor: 'var(--border-primary)', opacity: 0.9, display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 16px', borderRadius: '8px', fontWeight: '600', background: 'var(--bg-primary)' }}
              >
                <Undo2 style={{ width: '16px', height: '16px' }} /> Undo Status
              </button>
            )}
          </div>

          {/* RIGHT SIDE: Primary Flow Actions */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', justifyContent: 'flex-end', alignItems: 'center' }}>
            {/* Strategic Workflow Actions */}
            {task.status_design === 'STRAT_PENDING' && (
              <>
                {task.status_strat === 'PENDING' && task.strat_pic_id && (task.strat_pic_id === user.id || ['ADMIN', 'TEAM_LEAD'].includes(user.role_name)) && (
                  <button onClick={async () => { await updateStratStatus(task.id, 'IN_PROGRESS', user.id); onRefresh(); onClose(); }} className="btn-primary" style={{ background: 'var(--accent-cyan)' }}>
                    <Play className="w-4 h-4" /> Start Strat
                  </button>
                )}
                {(task.status_strat === 'IN_PROGRESS' || task.status_strat === 'REVISION') && (task.strat_pic_id === user.id || ['ADMIN', 'TEAM_LEAD'].includes(user.role_name)) && (
                  <button onClick={onSubmitStrat} className="btn-primary" style={{ background: 'var(--accent-blue)' }}>
                    <Presentation className="w-4 h-4" /> Submit Deck
                  </button>
                )}
                {task.status_strat === 'REVIEW' && ['ADMIN', 'TEAM_LEAD', 'REQUESTER'].includes(user.role_name) && (
                  <>
                    <button onClick={() => onRevise?.('STRATEGIC')} className="btn-secondary" style={{ color: 'var(--accent-amber)', borderColor: 'var(--accent-amber)' }}>
                      <RotateCcw className="w-4 h-4" /> Revise Strat
                    </button>
                    <button onClick={async () => { await updateStratStatus(task.id, 'APPROVED', user.id); onRefresh(); onClose(); }} className="btn-primary" style={{ background: 'var(--accent-emerald)' }}>
                      <CheckCircle2 className="w-4 h-4" /> Approve Strat
                    </button>
                  </>
                )}
              </>
            )}

            {/* Design Workflow Actions */}
            {task.status_design === 'DESIGN_UNASSIGNED' && ['ADMIN', 'TEAM_LEAD'].includes(user.role_name) && (
              <button onClick={onAssign} className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 20px', borderRadius: '8px', fontWeight: '600' }}>
                <User style={{ width: '16px', height: '16px' }} /> Assign PIC
              </button>
            )}
            
            {task.status_design === 'DESIGN_ASSIGNED' && (task.design_pic_id === user.id || ['ADMIN', 'TEAM_LEAD'].includes(user.role_name)) && (
              <button onClick={async () => { await updateTaskStatus(task.id, 'DESIGN_IN_PROGRESS', user.id); onRefresh(); onClose(); }} className="btn-primary" style={{ background: 'var(--accent-cyan)', display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 20px', borderRadius: '8px', fontWeight: '600' }}>
                <Play style={{ width: '16px', height: '16px' }} /> Start Work
              </button>
            )}

            {(task.status_design === 'DESIGN_IN_PROGRESS' || task.status_design === 'DESIGN_REVISION') && (task.design_pic_id === user.id || ['ADMIN', 'TEAM_LEAD'].includes(user.role_name)) && (
              <button onClick={onSubmit} className="btn-primary" style={{ background: 'var(--accent-emerald)', display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 20px', borderRadius: '8px', fontWeight: '600' }}>
                <Send style={{ width: '16px', height: '16px' }} /> Submit Output
              </button>
            )}

            {task.status_design === 'DESIGN_SUBMITTED' && ['ADMIN', 'TEAM_LEAD', 'REQUESTER'].includes(user.role_name) && (
              <>
                <button onClick={() => onRevise?.('DESIGN')} className="btn-secondary" style={{ color: 'var(--accent-amber)', borderColor: 'var(--accent-amber)', display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 20px', borderRadius: '8px', fontWeight: '600', background: 'rgba(245, 158, 11, 0.05)' }}>
                  <RotateCcw style={{ width: '16px', height: '16px' }} /> Request Revision
                </button>
                
                <button onClick={async () => { await updateTaskStatus(task.id, 'DESIGN_APPROVED', user.id); onRefresh(); onClose(); }} className="btn-primary" style={{ background: 'var(--accent-emerald)', display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 20px', borderRadius: '8px', fontWeight: '600', height: '42px' }}>
                  <CheckCircle2 style={{ width: '16px', height: '16px' }} /> Approve Design
                </button>
              </>
            )}

            {task.status_design === 'DESIGN_APPROVED' && !task.motion_task && (
              <button onClick={async () => { await setMotionReadyness(task.id, true, user.id); onRefresh(); onClose(); }} className="btn-primary" style={{ background: 'var(--accent-pink)', display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 20px', borderRadius: '8px', fontWeight: '600' }}>
                <Film style={{ width: '16px', height: '16px' }} /> Move to Motion
              </button>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

