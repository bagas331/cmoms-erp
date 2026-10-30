'use client';

import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth';
import { usePersistedState } from '@/lib/use-persistent-state';
import {
  getWeeklyIssues,
  createWeeklyIssue,
  updateWeeklyIssue,
  deleteWeeklyIssue,
  getAllTasksWithRelations,
  getClients
} from '@/lib/supabase-store';
import {
  WeeklyIssue,
  CreateWeeklyIssueInput,
  IssueCategory,
  IssueSeverity,
  IssueStatus,
  TaskWithRelations,
  Client
} from '@/lib/types';
import { getMonthName, formatDisplayDate } from '@/lib/utils';
import { downloadCSV } from '@/lib/export';
import { determineTaskPipeline } from '@/lib/pipeline-router';
import {
  AlertTriangle, CheckCircle2, Calendar, Plus, Trash2, Edit3,
  ShieldAlert, ShieldCheck, ArrowLeft, Download, Filter, Search,
  Layers, Compass, ShoppingBag, Film, Clock, Check, X, FileText,
  AlertCircle, ChevronRight, BarChart3, Info, Sparkles
} from 'lucide-react';

const CATEGORY_LABELS: Record<IssueCategory, string> = {
  CAMPAIGN: 'Kendala Campaign & Promo',
  ASSET_DELAY: 'Keterlambatan Asset',
  BRIEF_MISMATCH: 'Perubahan Brief / Campaign',
  REVISION_OVERFLOW: 'Revisi Berlebih (>2x)',
  FAILED: 'Task Gagal / Batal',
  POSTPONE: 'Task Ditunda (Postpone)',
  RESOURCE: 'Kapasitas Tim / Resource',
  CLIENT_REQUEST: 'Permintaan Khusus Klien',
  OTHER: 'Kendala Operasional Lain',
  AMAN: 'Kondisi Aman / Lancar'
};

const CATEGORY_COLORS: Record<IssueCategory, { bg: string; text: string; border: string }> = {
  CAMPAIGN: { bg: 'bg-indigo-500/15', text: 'text-indigo-400', border: 'border-indigo-500/30' },
  ASSET_DELAY: { bg: 'bg-amber-500/15', text: 'text-amber-400', border: 'border-amber-500/30' },
  BRIEF_MISMATCH: { bg: 'bg-blue-500/15', text: 'text-blue-400', border: 'border-blue-500/30' },
  REVISION_OVERFLOW: { bg: 'bg-orange-500/15', text: 'text-orange-400', border: 'border-orange-500/30' },
  FAILED: { bg: 'bg-rose-500/15', text: 'text-rose-400', border: 'border-rose-500/30' },
  POSTPONE: { bg: 'bg-yellow-500/15', text: 'text-yellow-400', border: 'border-yellow-500/30' },
  RESOURCE: { bg: 'bg-purple-500/15', text: 'text-purple-400', border: 'border-purple-500/30' },
  CLIENT_REQUEST: { bg: 'bg-indigo-500/15', text: 'text-indigo-400', border: 'border-indigo-500/30' },
  OTHER: { bg: 'bg-slate-500/15', text: 'text-slate-300', border: 'border-slate-500/30' },
  AMAN: { bg: 'bg-emerald-500/15', text: 'text-emerald-400', border: 'border-emerald-500/30' }
};

const SEVERITY_COLORS: Record<IssueSeverity, { bg: string; text: string }> = {
  LOW: { bg: 'bg-slate-500/20', text: 'text-slate-300' },
  MEDIUM: { bg: 'bg-amber-500/20', text: 'text-amber-400' },
  HIGH: { bg: 'bg-orange-500/20', text: 'text-orange-400' },
  CRITICAL: { bg: 'bg-rose-500/20', text: 'text-rose-400' }
};

interface WeekDefinition {
  weekKey: 'W1' | 'W2' | 'W3' | 'W4' | 'W5';
  title: string;
  startDay: number;
  endDay: number;
  dateRange: string;
}

export default function WeeklyIssuesReportingPage() {
  const { user } = useAuth();
  const [issues, setIssues] = useState<WeeklyIssue[]>([]);
  const [tasks, setTasks] = useState<TaskWithRelations[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);

  // Month & Year Filter
  const now = new Date();
  const [selectedYear, setSelectedYear] = usePersistedState<string>('cmos_issues_filter_year', String(now.getFullYear()));
  const [selectedMonth, setSelectedMonth] = usePersistedState<string>('cmos_issues_filter_month', String(now.getMonth() + 1).padStart(2, '0'));

  // Pipeline Filter
  const [selectedPipeline, setSelectedPipeline] = useState<string>('ALL');

  // Modal State
  const [showIssueModal, setShowIssueModal] = useState(false);
  const [editingIssue, setEditingIssue] = useState<WeeklyIssue | null>(null);

  // Form State
  const [formWeek, setFormWeek] = useState<'W1' | 'W2' | 'W3' | 'W4' | 'W5'>('W1');
  const [formTitle, setFormTitle] = useState('');
  const [formCategory, setFormCategory] = useState<IssueCategory>('ASSET_DELAY');
  const [formSeverity, setFormSeverity] = useState<IssueSeverity>('MEDIUM');
  const [formStatus, setFormStatus] = useState<IssueStatus>('ACTIVE');
  const [formDescription, setFormDescription] = useState('');
  const [formPipeline, setFormPipeline] = useState<'ALL' | 'STRATEGIC' | 'GD_MOCKUP' | 'GD_NON_MOCKUP' | 'MOTION'>('ALL');
  const [formRelatedTaskCode, setFormRelatedTaskCode] = useState('');
  const [formResolutionNotes, setFormResolutionNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Load Data
  const loadData = async () => {
    try {
      setLoading(true);
      const [issueList, allTasks, allClients] = await Promise.all([
        getWeeklyIssues(Number(selectedYear), Number(selectedMonth)),
        getAllTasksWithRelations(),
        getClients()
      ]);
      setIssues(issueList);
      setTasks(allTasks);
      setClients(allClients);
    } catch (err) {
      console.error('Failed to load issues reporting data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [selectedYear, selectedMonth]);

  // Available Years
  const availableYears = useMemo(() => {
    const years = new Set<string>();
    issues.forEach(i => years.add(String(i.year)));
    tasks.forEach(t => {
      const y = (t.req_date || t.created_at || '').substring(0, 4);
      if (y) years.add(y);
    });
    years.add(String(new Date().getFullYear()));
    return Array.from(years).sort().reverse();
  }, [issues, tasks]);

  // Days in selected month
  const daysInSelectedMonth = useMemo(() => {
    const y = parseInt(selectedYear, 10) || now.getFullYear();
    const m = parseInt(selectedMonth, 10) || now.getMonth() + 1;
    return new Date(y, m, 0).getDate();
  }, [selectedYear, selectedMonth, now]);

  // 4 Week Definitions (W1, W2, W3, W4)
  const weeksList: WeekDefinition[] = useMemo(() => {
    const mName = getMonthName(Number(selectedMonth));
    return [
      {
        weekKey: 'W1',
        title: 'Week 1',
        startDay: 1,
        endDay: 7,
        dateRange: `1 - 7 ${mName}`
      },
      {
        weekKey: 'W2',
        title: 'Week 2',
        startDay: 8,
        endDay: 14,
        dateRange: `8 - 14 ${mName}`
      },
      {
        weekKey: 'W3',
        title: 'Week 3',
        startDay: 15,
        endDay: 21,
        dateRange: `15 - 21 ${mName}`
      },
      {
        weekKey: 'W4',
        title: 'Week 4',
        startDay: 22,
        endDay: daysInSelectedMonth,
        dateRange: `22 - ${daysInSelectedMonth} ${mName}`
      }
    ];
  }, [selectedMonth, daysInSelectedMonth]);

  // Filtered issues
  const filteredIssues = useMemo(() => {
    return issues.filter(i => {
      if (selectedPipeline !== 'ALL' && i.affected_pipeline !== 'ALL' && i.affected_pipeline !== selectedPipeline) {
        return false;
      }
      return true;
    });
  }, [issues, selectedPipeline]);

  // Accumulated Monthly Metrics
  const monthlyMetrics = useMemo(() => {
    const totalIssues = filteredIssues.filter(i => i.category !== 'AMAN').length;
    const criticalOrFailed = filteredIssues.filter(i => i.severity === 'CRITICAL' || i.category === 'FAILED').length;
    const resolvedIssues = filteredIssues.filter(i => i.status === 'RESOLVED').length;
    const activeIssues = filteredIssues.filter(i => i.status === 'ACTIVE' && i.category !== 'AMAN').length;

    // Determine safe weeks
    const safeWeeksCount = weeksList.filter(w => {
      const wIssues = filteredIssues.filter(i => i.week === w.weekKey);
      if (wIssues.length === 0) return true; // clean
      const hasBlockers = wIssues.some(i => i.status === 'ACTIVE' && i.category !== 'AMAN');
      return !hasBlockers;
    }).length;

    return {
      totalIssues,
      criticalOrFailed,
      resolvedIssues,
      activeIssues,
      safeWeeksCount
    };
  }, [filteredIssues, weeksList]);

  // Detect Task Blockers for a specific week based on real system tasks
  const getDetectedTaskBlockers = (week: WeekDefinition) => {
    const yStr = selectedYear;
    const mStr = selectedMonth;

    return tasks.filter(t => {
      const dateStr = t.req_date || t.created_at || '';
      if (!dateStr.startsWith(`${yStr}-${mStr}`)) return false;
      const day = parseInt(dateStr.substring(8, 10), 10);
      if (day < week.startDay || day > week.endDay) return false;

      // Filter by pipeline if active
      if (selectedPipeline !== 'ALL') {
        const pipe = determineTaskPipeline(t);
        if (pipe !== selectedPipeline) return false;
      }

      // Check if task has obvious blockers
      const isFailedOrCancelled = ['CANCEL', 'DESIGN_CANCEL', 'POSTPONE', 'DESIGN_POSTPONE'].includes(t.status_design);
      const isOverRevisions = (t.design_revision_count || 0) >= 3 || (t.strat_revision_count || 0) >= 3;
      const isBadExcellence = t.operational_excellence === 'BAD';

      return isFailedOrCancelled || isOverRevisions || isBadExcellence;
    });
  };

  // Open modal for new issue
  const handleOpenCreateModal = (defaultWeek?: 'W1' | 'W2' | 'W3' | 'W4' | 'W5') => {
    setEditingIssue(null);
    setFormWeek(defaultWeek || 'W1');
    setFormTitle('');
    setFormCategory('ASSET_DELAY');
    setFormSeverity('MEDIUM');
    setFormStatus('ACTIVE');
    setFormDescription('');
    setFormPipeline('ALL');
    setFormRelatedTaskCode('');
    setFormResolutionNotes('');
    setShowIssueModal(true);
  };

  // Open modal for editing
  const handleOpenEditModal = (issue: WeeklyIssue) => {
    setEditingIssue(issue);
    setFormWeek(issue.week as 'W1' | 'W2' | 'W3' | 'W4' | 'W5');
    setFormTitle(issue.title);
    setFormCategory(issue.category);
    setFormSeverity(issue.severity);
    setFormStatus(issue.status);
    setFormDescription(issue.description);
    setFormPipeline(issue.affected_pipeline);
    setFormRelatedTaskCode(issue.related_task_code || '');
    setFormResolutionNotes(issue.resolution_notes || '');
    setShowIssueModal(true);
  };

  // Quick action: Mark Week as Aman (No Blockers)
  const handleMarkWeekAman = async (weekKey: 'W1' | 'W2' | 'W3' | 'W4' | 'W5', weekDateRange: string) => {
    if (!user) return;
    const confirm = window.confirm(`Tandai ${weekKey} (${weekDateRange}) sebagai AMAN (tanpa kendala operasional)?`);
    if (!confirm) return;

    try {
      const input: CreateWeeklyIssueInput = {
        year: Number(selectedYear),
        month: Number(selectedMonth),
        week: weekKey,
        title: `Siklus Kerja ${weekKey} Aman & Sesuai Target`,
        category: 'AMAN',
        severity: 'LOW',
        status: 'AMAN',
        description: `Seluruh pengerjaan dan delivery aset pada ${weekKey} berjalan lancar tanpa kendala atau blocker.`,
        affected_pipeline: 'ALL',
        reported_by: user.id,
        reported_by_name: user.full_name || 'Team PIC'
      };
      await createWeeklyIssue(input, user.id);
      await loadData();
    } catch (err: any) {
      alert(`Gagal mencatat status aman: ${err?.message || err}`);
    }
  };

  // Submit issue modal
  const handleSubmitIssue = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!formTitle.trim()) {
      alert('Judul kendala harus diisi.');
      return;
    }
    if (!formDescription.trim()) {
      alert('Deskripsi kendala harus diisi.');
      return;
    }

    try {
      setSubmitting(true);
      if (editingIssue) {
        await updateWeeklyIssue(editingIssue.id, {
          title: formTitle.trim(),
          category: formCategory,
          severity: formSeverity,
          status: formStatus,
          description: formDescription.trim(),
          affected_pipeline: formPipeline,
          related_task_code: formRelatedTaskCode.trim() || null,
          resolution_notes: formResolutionNotes.trim() || null
        });
      } else {
        const input: CreateWeeklyIssueInput = {
          year: Number(selectedYear),
          month: Number(selectedMonth),
          week: formWeek,
          title: formTitle.trim(),
          category: formCategory,
          severity: formSeverity,
          status: formStatus,
          description: formDescription.trim(),
          affected_pipeline: formPipeline,
          related_task_code: formRelatedTaskCode.trim() || null,
          reported_by: user.id,
          reported_by_name: user.full_name || 'Team PIC'
        };
        await createWeeklyIssue(input, user.id);
      }
      setShowIssueModal(false);
      await loadData();
    } catch (err: any) {
      alert(`Gagal menyimpan kendala: ${err?.message || err}`);
    } finally {
      setSubmitting(false);
    }
  };

  // Delete issue
  const handleDeleteIssue = async (id: string, title: string) => {
    if (!window.confirm(`Hapus catatan kendala "${title}"?`)) return;
    try {
      await deleteWeeklyIssue(id);
      await loadData();
    } catch (err: any) {
      alert(`Gagal menghapus kendala: ${err?.message || err}`);
    }
  };

  // Export CSV
  const handleExportCSV = () => {
    const data: Record<string, unknown>[] = [];

    // 1. Manual reported issues
    filteredIssues.forEach(i => {
      data.push({
        'Tipe Data': 'Kendala Tercatat',
        'Tahun': i.year,
        'Bulan': getMonthName(i.month),
        'Minggu': i.week,
        'Judul / Nama Kendala': i.title,
        'Kategori': CATEGORY_LABELS[i.category] || i.category,
        'Tingkat Severity': i.severity,
        'Status': i.status,
        'Pipeline Terdampak': i.affected_pipeline,
        'Terkait Task Code': i.related_task_code || '-',
        'Pelapor': i.reported_by_name || '-',
        'Deskripsi / Detail': i.description,
        'Solusi / Mitigasi': i.resolution_notes || '-',
        'Tanggal': formatDisplayDate(i.created_at)
      });
    });

    // 2. System detected task blockers
    weeksList.forEach(w => {
      const blockers = getDetectedTaskBlockers(w);
      blockers.forEach(b => {
        const isFailedOrCancelled = ['CANCEL', 'DESIGN_CANCEL', 'POSTPONE', 'DESIGN_POSTPONE'].includes(b.status_design);
        const isOverRevisions = (b.design_revision_count || 0) >= 3 || (b.strat_revision_count || 0) >= 3;
        const isBadExcellence = b.operational_excellence === 'BAD';

        let cat = 'Bottleneck Operasional';
        if (isBadExcellence) cat = 'SLA Breach (Bad)';
        else if (isOverRevisions) cat = 'Revisi Berlebih (>2x)';
        else if (isFailedOrCancelled) cat = 'Task Batal / Ditunda';

        data.push({
          'Tipe Data': 'Detected Blocker (Sistem)',
          'Tahun': selectedYear,
          'Bulan': getMonthName(Number(selectedMonth)),
          'Minggu': w.weekKey,
          'Judul / Nama Kendala': `Task Bermasalah: ${b.task_code || '-'} (${b.campaign_name || b.client_name || 'Design'})`,
          'Kategori': cat,
          'Tingkat Severity': isBadExcellence || isFailedOrCancelled ? 'CRITICAL' : 'HIGH',
          'Status': 'ACTIVE',
          'Pipeline Terdampak': determineTaskPipeline(b),
          'Terkait Task Code': b.task_code || '-',
          'Pelapor': 'System Audit',
          'Deskripsi / Detail': `Status: ${b.status_design || b.status_strat || '-'} • Revisi: ${b.design_revision_count || b.strat_revision_count || 0}x • SLA: ${b.operational_excellence || '-'}`,
          'Solusi / Mitigasi': 'Perlu evaluasi tim dan tindak lanjut lead',
          'Tanggal': formatDisplayDate(b.req_date || b.created_at)
        });
      });
    });

    // 3. Fallback if no issues and no blockers
    if (data.length === 0) {
      data.push({
        'Tipe Data': 'Status Operasional',
        'Tahun': selectedYear,
        'Bulan': getMonthName(Number(selectedMonth)),
        'Minggu': 'All Weeks (W1 - W4)',
        'Judul / Nama Kendala': `Operasional Bulan ${getMonthName(Number(selectedMonth))} ${selectedYear} Aman`,
        'Kategori': 'Kondisi Aman / Lancar',
        'Tingkat Severity': 'LOW',
        'Status': 'AMAN',
        'Pipeline Terdampak': selectedPipeline,
        'Terkait Task Code': '-',
        'Pelapor': user?.full_name || 'System',
        'Deskripsi / Detail': 'Seluruh siklus pengerjaan dan delivery aset berjalan lancar tanpa kendala atau blocker.',
        'Solusi / Mitigasi': 'Target pengerjaan terpenuhi',
        'Tanggal': formatDisplayDate(new Date().toISOString())
      });
    }

    downloadCSV(data, `Laporan_Kendala_Mingguan_${selectedYear}_${selectedMonth}.csv`);
  };

  return (
    <div className="space-y-6">
      {/* Top Header & Navigation */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-[var(--border-secondary)]">
        <div>
          <div className="flex items-center gap-2 text-xs text-[var(--text-secondary)] mb-1">
            <Link href="/dashboard/reports" className="hover:text-[var(--text-primary)] flex items-center gap-1">
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Kembali ke Reports &amp; Analytics</span>
            </Link>
            <span>/</span>
            <span className="text-[var(--text-primary)] font-medium">Reporting Kendala</span>
          </div>

          <h1 className="text-xl font-bold text-[var(--text-primary)] flex items-center gap-2.5">
            <AlertTriangle className="w-5 h-5 text-amber-400" />
            <span>Reporting Kendala Mingguan &amp; Akumulasi Bulanan</span>
          </h1>
          <p className="text-xs text-[var(--text-secondary)] mt-0.5">
            Dokumentasi evaluasi hambatan operasional tim per minggu (Week 1 - Week 4) serta akumulasi kesehatan bulanan.
          </p>
        </div>

        {/* Global Controls: Month, Year, and Actions */}
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={handleExportCSV}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg btn-outline border-[var(--border-primary)] hover:bg-[var(--bg-tertiary)] shadow-xs"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Download CSV</span>
          </button>

          <button
            type="button"
            onClick={() => handleOpenCreateModal()}
            className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-[var(--accent-blue)] text-white hover:bg-blue-600 transition-colors shadow-xs"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Catat Kendala Baru</span>
          </button>

          {/* Period Selector */}
          <div className="flex items-center gap-2 bg-[var(--bg-card)] p-1.5 rounded-lg border border-[var(--border-primary)] shadow-sm">
            <Calendar className="w-3.5 h-3.5 text-[var(--accent-blue)] shrink-0 ml-1" />
            
            <select 
              className="select border-none bg-transparent py-1 text-xs focus:ring-0 min-w-[110px] cursor-pointer" 
              value={selectedMonth} 
              onChange={(e) => setSelectedMonth(e.target.value)}
            >
              {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                <option key={m} value={String(m).padStart(2, '0')}>{getMonthName(m)}</option>
              ))}
            </select>

            <div className="w-px h-3.5 bg-[var(--border-primary)]"></div>

            <select 
              className="select border-none bg-transparent py-1 text-xs focus:ring-0 min-w-[90px] cursor-pointer" 
              value={selectedYear} 
              onChange={(e) => setSelectedYear(e.target.value)}
            >
              {availableYears.map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Pipeline Filter Bar */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        <span className="text-xs font-medium text-[var(--text-muted)] mr-1 flex items-center gap-1">
          <Filter className="w-3.5 h-3.5" />
          Filter Pipeline:
        </span>
        {[
          { key: 'ALL', label: 'Semua Pipeline' },
          { key: 'STRATEGIC', label: 'Strategic' },
          { key: 'GD_MOCKUP', label: 'GD Mockup' },
          { key: 'GD_NON_MOCKUP', label: 'GD E-Commerce' },
          { key: 'MOTION', label: 'Motion' }
        ].map(p => (
          <button
            key={p.key}
            onClick={() => setSelectedPipeline(p.key)}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-all ${
              selectedPipeline === p.key
                ? 'bg-[var(--accent-blue)] text-white border-transparent shadow-xs'
                : 'border-[var(--border-primary)] bg-[var(--bg-card)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)]'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* MONTHLY ACCUMULATED HEALTH ROLLUP CARD */}
      <div className="p-4 rounded-xl border border-[var(--border-primary)] bg-[var(--bg-card)] space-y-4 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[var(--border-secondary)]">
          <div className="flex items-center gap-3">
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
              monthlyMetrics.criticalOrFailed > 0 ? 'bg-rose-500/20 text-rose-400' :
              monthlyMetrics.activeIssues > 0 ? 'bg-amber-500/20 text-amber-400' :
              'bg-emerald-500/20 text-emerald-400'
            }`}>
              {monthlyMetrics.criticalOrFailed > 0 ? <AlertCircle className="w-5 h-5" /> :
               monthlyMetrics.activeIssues > 0 ? <AlertTriangle className="w-5 h-5" /> :
               <ShieldCheck className="w-5 h-5" />}
            </div>

            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-sm text-[var(--text-primary)]">
                  Akumulasi Kesehatan Operasional: {getMonthName(Number(selectedMonth))} {selectedYear}
                </h3>
                <span className={`badge text-[10px] font-bold px-2 py-0.5 ${
                  monthlyMetrics.criticalOrFailed > 0 ? 'bg-rose-500/20 text-rose-400 border border-rose-500/40' :
                  monthlyMetrics.activeIssues > 0 ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40' :
                  'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                }`}>
                  {monthlyMetrics.criticalOrFailed > 0 ? 'TERDAPAT KENDALA KRITIS' :
                   monthlyMetrics.activeIssues > 0 ? 'DALAM PENANGANAN / AKTIF' :
                   'SECARA UMUM AMAN'}
                </span>
              </div>
              <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                Ringkasan akumulasi seluruh laporan mingguan tim. {monthlyMetrics.safeWeeksCount} dari 4 minggu berstatus aman tanpa kendala.
              </p>
            </div>
          </div>
        </div>

        {/* 4 Summary Metric Columns */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="p-3 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-secondary)]">
            <span className="text-[11px] text-[var(--text-secondary)]">Total Kendala Terakumulasi</span>
            <p className="text-xl font-bold text-[var(--text-primary)] mt-0.5">{monthlyMetrics.totalIssues}</p>
            <p className="text-[10px] text-[var(--text-muted)]">Hambatan operasional dilaporkan</p>
          </div>

          <div className="p-3 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-secondary)]">
            <span className="text-[11px] text-[var(--text-secondary)]">Kategori Failed / Kritis</span>
            <p className="text-xl font-bold text-rose-400 mt-0.5">{monthlyMetrics.criticalOrFailed}</p>
            <p className="text-[10px] text-[var(--text-muted)]">Perlu evaluasi SOP khusus</p>
          </div>

          <div className="p-3 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-secondary)]">
            <span className="text-[11px] text-[var(--text-secondary)]">Kendala Selesai (Mitigasi)</span>
            <p className="text-xl font-bold text-blue-400 mt-0.5">{monthlyMetrics.resolvedIssues}</p>
            <p className="text-[10px] text-[var(--text-muted)]">Solusi berhasil diterapkan</p>
          </div>

          <div className="p-3 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-secondary)]">
            <span className="text-[11px] text-[var(--text-secondary)]">Minggu Berstatus Aman</span>
            <p className="text-xl font-bold text-emerald-400 mt-0.5">{monthlyMetrics.safeWeeksCount} / 4</p>
            <p className="text-[10px] text-[var(--text-muted)]">Penyelesaian on-time tanpa hambatan</p>
          </div>
        </div>
      </div>

      {/* 4-WEEK ACCUMULATION & BREAKDOWN CARDS (Week 1, Week 2, Week 3, Week 4) */}
      <div className="space-y-4">
        {weeksList.map((week) => {
          const weekIssues = filteredIssues.filter(i => i.week === week.weekKey);
          const detectedBlockers = getDetectedTaskBlockers(week);

          const hasCriticalOrFailed = weekIssues.some(i => i.severity === 'CRITICAL' || i.category === 'FAILED');
          const hasActiveIssues = weekIssues.some(i => i.status === 'ACTIVE' && i.category !== 'AMAN');
          const isExplicitlyAman = weekIssues.some(i => i.category === 'AMAN');

          // Week overall status badge
          let weekBadge = { text: 'Aman & Lancar', bg: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' };
          if (hasCriticalOrFailed) {
            weekBadge = { text: 'Terdapat Kendala / Failed', bg: 'bg-rose-500/15 text-rose-400 border-rose-500/30' };
          } else if (hasActiveIssues) {
            weekBadge = { text: 'Hambatan Operasional', bg: 'bg-amber-500/15 text-amber-400 border-amber-500/30' };
          } else if (weekIssues.length > 0 && !isExplicitlyAman) {
            weekBadge = { text: 'Kendala Selesai', bg: 'bg-blue-500/15 text-blue-400 border-blue-500/30' };
          }

          return (
            <div
              key={week.weekKey}
              className="card-static p-4 space-y-3.5 border border-[var(--border-primary)]"
            >
              {/* Week Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[var(--border-secondary)]">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs bg-[var(--bg-secondary)] border border-[var(--border-primary)] text-[var(--text-primary)]">
                    {week.weekKey}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="font-bold text-sm text-[var(--text-primary)]">
                        {week.title} ({week.dateRange})
                      </h4>
                      <span className={`badge text-[10px] font-semibold px-2 py-0.5 border ${weekBadge.bg}`}>
                        {weekBadge.text}
                      </span>
                    </div>
                    <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                      {weekIssues.filter(i => i.category !== 'AMAN').length} kendala dilaporkan • {detectedBlockers.length} request berpotensi bottleneck
                    </p>
                  </div>
                </div>

                {/* Week Action Buttons */}
                <div className="flex items-center gap-2 self-start sm:self-auto">
                  <button
                    type="button"
                    onClick={() => handleMarkWeekAman(week.weekKey, week.dateRange)}
                    className="flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-md bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/25 transition-all"
                    title="Tandai minggu ini aman tanpa kendala"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Tandai Aman</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleOpenCreateModal(week.weekKey)}
                    className="flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-md btn-outline border-[var(--border-primary)] hover:bg-[var(--bg-tertiary)]"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Catat Kendala</span>
                  </button>
                </div>
              </div>

              {/* List of Reported Issues */}
              <div className="space-y-2.5">
                {weekIssues.map((issue) => {
                  const catStyle = CATEGORY_COLORS[issue.category] || CATEGORY_COLORS.OTHER;
                  const sevStyle = SEVERITY_COLORS[issue.severity] || SEVERITY_COLORS.MEDIUM;

                  return (
                    <div
                      key={issue.id}
                      className="p-3 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-secondary)] hover:border-[var(--border-primary)] transition-all space-y-2"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`badge text-[10px] font-bold px-2 py-0.5 border ${catStyle.bg} ${catStyle.text} ${catStyle.border}`}>
                            {CATEGORY_LABELS[issue.category]}
                          </span>

                          {issue.category !== 'AMAN' && (
                            <span className={`badge text-[10px] font-semibold px-1.5 py-0.2 ${sevStyle.bg} ${sevStyle.text}`}>
                              {issue.severity}
                            </span>
                          )}

                          <span className={`badge text-[10px] font-semibold px-2 py-0.2 ${
                            issue.status === 'RESOLVED' ? 'bg-blue-500/20 text-blue-400' :
                            issue.status === 'AMAN' ? 'bg-emerald-500/20 text-emerald-400' :
                            'bg-amber-500/20 text-amber-400'
                          }`}>
                            {issue.status}
                          </span>

                          <h5 className="font-semibold text-xs text-[var(--text-primary)]">
                            {issue.title}
                          </h5>
                        </div>

                        {/* Issue Actions */}
                        <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-auto">
                          {issue.related_task_code && (
                            <span className="text-[11px] font-mono font-medium text-[var(--accent-blue)] bg-[var(--bg-card)] px-1.5 py-0.5 rounded border border-[var(--border-primary)]">
                              {issue.related_task_code}
                            </span>
                          )}

                          <button
                            type="button"
                            onClick={() => handleOpenEditModal(issue)}
                            className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-card)] transition-colors"
                            title="Edit Catatan Kendala"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>

                          <button
                            type="button"
                            onClick={() => handleDeleteIssue(issue.id, issue.title)}
                            className="p-1 rounded text-[var(--text-muted)] hover:text-rose-400 hover:bg-[var(--bg-card)] transition-colors"
                            title="Hapus Catatan"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                        {issue.description}
                      </p>

                      {issue.resolution_notes && (
                        <div className="p-2 rounded bg-blue-500/10 border border-blue-500/20 text-blue-300 text-xs">
                          <strong className="font-semibold text-blue-200">Solusi / Mitigasi:</strong> {issue.resolution_notes}
                        </div>
                      )}

                      <div className="flex items-center justify-between text-[10px] text-[var(--text-muted)] pt-1 border-t border-[var(--border-secondary)]">
                        <span>Dilaporkan oleh: {issue.reported_by_name || 'Team Member'}</span>
                        <span>Pipeline: {issue.affected_pipeline} • {formatDisplayDate(issue.created_at)}</span>
                      </div>
                    </div>
                  );
                })}

                {weekIssues.length === 0 && (
                  <div className="flex items-center justify-between p-3 rounded-lg bg-[var(--bg-secondary)]/50 border border-dashed border-[var(--border-primary)] text-xs text-[var(--text-muted)]">
                    <span>Belum ada catatan kendala manual pada {week.title}. Seluruh alur kerja dianggap aman kecuali dilaporkan.</span>
                    <button
                      type="button"
                      onClick={() => handleMarkWeekAman(week.weekKey, week.dateRange)}
                      className="text-emerald-400 hover:underline font-semibold text-[11px]"
                    >
                      + Konfirmasi Aman
                    </button>
                  </div>
                )}
              </div>

              {/* Detected Bottleneck Alerts from Real Project Tasks */}
              {detectedBlockers.length > 0 && (
                <div className="mt-2 p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 space-y-2">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-rose-400">
                    <AlertCircle className="w-3.5 h-3.5" />
                    <span>Sistem mendeteksi {detectedBlockers.length} request berisiko / bermasalah pada rentang {week.title}:</span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
                    {detectedBlockers.slice(0, 4).map(t => (
                      <div key={t.id} className="p-2 rounded bg-[var(--bg-card)] border border-rose-500/30 flex items-center justify-between gap-2">
                        <div>
                          <span className="font-mono font-bold text-rose-400">{t.task_code}</span>
                          <span className="text-[var(--text-secondary)] ml-1.5 truncate max-w-[160px] inline-block align-bottom">{t.campaign_name || t.client_name}</span>
                        </div>
                        <span className="badge text-[9px] bg-rose-500/20 text-rose-400">
                          {t.status_design.replace('DESIGN_', '')} • {t.design_revision_count || 0} rev
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* CREATE / EDIT ISSUE MODAL */}
      {showIssueModal && (
        <div className="modal-overlay">
          <div className="modal-container max-w-lg p-5">
            <div className="flex items-center justify-between pb-3 border-b border-[var(--border-primary)]">
              <h3 className="font-bold text-sm text-[var(--text-primary)] flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-400" />
                <span>{editingIssue ? 'Edit Catatan Kendala' : 'Catat Kendala Mingguan Baru'}</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowIssueModal(false)}
                className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmitIssue} className="space-y-3.5 mt-3">
              {/* Week Selector */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                    Pilihan Minggu (Week)
                  </label>
                  <select
                    value={formWeek}
                    onChange={(e) => setFormWeek(e.target.value as any)}
                    className="w-full text-xs p-2 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-primary)] text-[var(--text-primary)]"
                  >
                    <option value="W1">Week 1 (Tgl 1 - 7)</option>
                    <option value="W2">Week 2 (Tgl 8 - 14)</option>
                    <option value="W3">Week 3 (Tgl 15 - 21)</option>
                    <option value="W4">Week 4 (Tgl 22 - 28)</option>
                    <option value="W5">Week 5 (Tgl 29 - Akhir)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                    Pipeline Terdampak
                  </label>
                  <select
                    value={formPipeline}
                    onChange={(e) => setFormPipeline(e.target.value as any)}
                    className="w-full text-xs p-2 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-primary)] text-[var(--text-primary)]"
                  >
                    <option value="ALL">Semua Pipeline</option>
                    <option value="STRATEGIC">Strategic Pipeline</option>
                    <option value="GD_MOCKUP">GD Mockup Pipeline</option>
                    <option value="GD_NON_MOCKUP">GD E-Commerce Pipeline</option>
                    <option value="MOTION">Motion Graphics Pipeline</option>
                  </select>
                </div>
              </div>

              {/* Category & Severity */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                    Kategori Kendala
                  </label>
                  <select
                    value={formCategory}
                    onChange={(e) => setFormCategory(e.target.value as IssueCategory)}
                    className="w-full text-xs p-2 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-primary)] text-[var(--text-primary)]"
                  >
                    {Object.entries(CATEGORY_LABELS).map(([cat, label]) => (
                      <option key={cat} value={cat}>{label}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                    Tingkat Keparahan (Severity)
                  </label>
                  <select
                    value={formSeverity}
                    onChange={(e) => setFormSeverity(e.target.value as IssueSeverity)}
                    className="w-full text-xs p-2 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-primary)] text-[var(--text-primary)]"
                  >
                    <option value="LOW">LOW (Dampak Ringan)</option>
                    <option value="MEDIUM">MEDIUM (Perlu Perhatian)</option>
                    <option value="HIGH">HIGH (Menghambat Produksi)</option>
                    <option value="CRITICAL">CRITICAL (Gagal / Blocker)</option>
                  </select>
                </div>
              </div>

              {/* Title */}
              <div>
                <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                  Judul Kendala / Hambatan <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  placeholder="Contoh: Keterlambatan asset brief dari brand marketing"
                  className="w-full text-xs p-2 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-primary)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-blue)]"
                  required
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                  Deskripsi Lengkap Kendala <span className="text-rose-400">*</span>
                </label>
                <textarea
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  rows={3}
                  placeholder="Jelaskan apa yang terjadi (misal: di week 1 ada yang failed karena asset telat 3 hari, brief berubah, dll)..."
                  className="w-full text-xs p-2 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-primary)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-blue)]"
                  required
                />
              </div>

              {/* Task Code & Status */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                    Terkait Task Code (Opsional)
                  </label>
                  <input
                    type="text"
                    value={formRelatedTaskCode}
                    onChange={(e) => setFormRelatedTaskCode(e.target.value)}
                    placeholder="Contoh: REQ-2026-0042"
                    className="w-full text-xs p-2 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-primary)] text-[var(--text-primary)]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                    Status Penanganan
                  </label>
                  <select
                    value={formStatus}
                    onChange={(e) => setFormStatus(e.target.value as IssueStatus)}
                    className="w-full text-xs p-2 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-primary)] text-[var(--text-primary)]"
                  >
                    <option value="ACTIVE">ACTIVE (Masih Berlangsung)</option>
                    <option value="RESOLVED">RESOLVED (Telah Dimitigasi / Selesai)</option>
                    <option value="AMAN">AMAN (Tanpa Masalah)</option>
                  </select>
                </div>
              </div>

              {/* Resolution Notes */}
              <div>
                <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                  Catatan Solusi / Mitigasi
                </label>
                <textarea
                  value={formResolutionNotes}
                  onChange={(e) => setFormResolutionNotes(e.target.value)}
                  rows={2}
                  placeholder="Tindakan yang telah diambil untuk mengatasi kendala ini..."
                  className="w-full text-xs p-2 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-primary)] text-[var(--text-primary)]"
                />
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--border-primary)]">
                <button
                  type="button"
                  onClick={() => setShowIssueModal(false)}
                  className="px-3 py-1.5 text-xs font-semibold rounded-lg btn-outline border-[var(--border-primary)] hover:bg-[var(--bg-tertiary)]"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-1.5 text-xs font-semibold rounded-lg bg-[var(--accent-blue)] text-white hover:bg-blue-600 transition-colors disabled:opacity-50"
                >
                  {submitting ? 'Menyimpan...' : (editingIssue ? 'Perbarui Kendala' : 'Simpan Kendala')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
