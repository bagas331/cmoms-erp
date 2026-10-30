'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import { 
  getHolidays, 
  addHoliday, 
  deleteHoliday, 
  syncOfficialHolidays, 
  getHolidaySyncMeta,
  HolidaySyncMeta 
} from '@/lib/supabase-store';
import { Holiday } from '@/lib/types';
import { formatDisplayDate, formatDisplayDateTime } from '@/lib/utils';
import { 
  Calendar as CalendarIcon, 
  Plus, 
  Trash2, 
  X, 
  RefreshCw, 
  Search, 
  CheckCircle2, 
  Sparkles, 
  ShieldCheck, 
  Clock, 
  Filter,
  Globe,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  LayoutGrid,
  List,
  CalendarDays,
  Info
} from 'lucide-react';

const MONTH_NAMES = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
];

const DAY_NAMES = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'];
const SHORT_DAY_NAMES = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'];

type ViewMode = 'MONTH_GRID' | 'YEAR_GRID' | 'TABLE';

export default function HolidaysPage() {
  const today = new Date();
  const currentYear = today.getFullYear();
  const currentMonth = today.getMonth(); // 0-11
  const todayDateStr = `${currentYear}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncMeta, setSyncMeta] = useState<HolidaySyncMeta>({ lastSync: null, totalHolidays: 0, years: [] });
  const [syncNotice, setSyncNotice] = useState<string | null>(null);

  // View Mode: 'MONTH_GRID' | 'YEAR_GRID' | 'TABLE'
  const [viewMode, setViewMode] = useState<ViewMode>('MONTH_GRID');

  // Calendar Navigation
  const [activeYear, setActiveYear] = useState<number>(currentYear);
  const [activeMonth, setActiveMonth] = useState<number>(currentMonth);

  // Filters
  const [typeFilter, setTypeFilter] = useState<'ALL' | 'NATIONAL' | 'CUTI_BERSAMA' | 'CUSTOM'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Selected Day Modal
  const [selectedDay, setSelectedDay] = useState<{ dateStr: string; holidays: Holiday[] } | null>(null);

  // Add Modal State
  const [showAdd, setShowAdd] = useState(false);
  const [date, setDate] = useState('');
  const [desc, setDesc] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const fetchHolidays = useCallback(async () => {
    try {
      const data = await getHolidays();
      setHolidays(data);
      const meta = getHolidaySyncMeta();
      setSyncMeta(meta);
    } catch (err) {
      console.error('Failed to fetch holidays:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { 
    fetchHolidays(); 
  }, [fetchHolidays]);

  // Handle Manual Official Holiday Sync
  const handleManualSync = async () => {
    setSyncing(true);
    setSyncNotice(null);
    try {
      const result = await syncOfficialHolidays([activeYear - 1, activeYear, activeYear + 1]);
      setHolidays(result.holidays);
      setSyncMeta({
        lastSync: result.syncedAt,
        totalHolidays: result.totalCount,
        years: result.years,
      });
      setSyncNotice(`Sukses: ${result.message} (Sumber: ${result.source})`);
      setTimeout(() => setSyncNotice(null), 6000);
    } catch (err: any) {
      console.error('Failed to sync holidays:', err);
      setSyncNotice(`Gagal sinkronisasi: ${err?.message || err}`);
      setTimeout(() => setSyncNotice(null), 6000);
    } finally {
      setSyncing(false);
    }
  };

  useEffect(() => {
    if (showAdd || selectedDay) {
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          setShowAdd(false);
          setSelectedDay(null);
        }
      };
      window.addEventListener('keydown', handleKeyDown);
      return () => {
        document.body.style.overflow = originalOverflow;
        window.removeEventListener('keydown', handleKeyDown);
      };
    }
  }, [showAdd, selectedDay]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!date || !desc) return;
    setSubmitting(true);
    try {
      await addHoliday(date, desc);
      await fetchHolidays();
      setDate('');
      setDesc('');
      setShowAdd(false);
    } catch (err) {
      console.error('Failed to add holiday:', err);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (h: Holiday) => {
    if (!confirm(`Hapus hari libur "${h.description}" (${h.holiday_date})?`)) return;
    try {
      if (h.id !== undefined) {
        await deleteHoliday(h.id);
      } else {
        await deleteHoliday(h.holiday_date);
      }
      await fetchHolidays();
      if (selectedDay) {
        setSelectedDay(prev => prev ? {
          ...prev,
          holidays: prev.holidays.filter(item => item.holiday_date !== h.holiday_date || item.description !== h.description)
        } : null);
      }
    } catch (err) {
      console.error('Failed to delete holiday:', err);
    }
  };

  // Month navigation helpers
  const handlePrevMonth = () => {
    if (activeMonth === 0) {
      setActiveMonth(11);
      setActiveYear(y => y - 1);
    } else {
      setActiveMonth(m => m - 1);
    }
  };

  const handleNextMonth = () => {
    if (activeMonth === 11) {
      setActiveMonth(0);
      setActiveYear(y => y + 1);
    } else {
      setActiveMonth(m => m + 1);
    }
  };

  const handleGoToToday = () => {
    setActiveYear(currentYear);
    setActiveMonth(currentMonth);
  };

  // Available Years
  const availableYears = useMemo(() => {
    const set = new Set<number>();
    set.add(currentYear - 1);
    set.add(currentYear);
    set.add(currentYear + 1);
    set.add(currentYear + 2);
    holidays.forEach(h => {
      if (h.holiday_date && h.holiday_date.length >= 4) {
        const y = parseInt(h.holiday_date.substring(0, 4), 10);
        if (!isNaN(y)) set.add(y);
      }
    });
    return Array.from(set).sort();
  }, [holidays, currentYear]);

  // Map of holidays by date: "YYYY-MM-DD" -> Holiday[]
  const holidaysByDate = useMemo(() => {
    const map = new Map<string, Holiday[]>();
    for (const h of holidays) {
      const arr = map.get(h.holiday_date) || [];
      arr.push(h);
      map.set(h.holiday_date, arr);
    }
    return map;
  }, [holidays]);

  // Statistics for Selected Year
  const stats = useMemo(() => {
    const list = holidays.filter(h => h.holiday_date.startsWith(String(activeYear)));

    let national = 0;
    let cutiBersama = 0;
    let custom = 0;

    list.forEach(h => {
      const isCuti = h.is_cuti_bersama !== undefined
        ? h.is_cuti_bersama
        : /cuti bersama/i.test(h.description);
      const isOfficial = h.is_official !== undefined ? h.is_official : true;

      if (!isOfficial) {
        custom++;
      } else if (isCuti) {
        cutiBersama++;
      } else {
        national++;
      }
    });

    return {
      total: list.length,
      national,
      cutiBersama,
      custom
    };
  }, [holidays, activeYear]);

  // Month Grid Calculation (Monday to Sunday)
  const monthGridDays = useMemo(() => {
    const year = activeYear;
    const month = activeMonth;

    const firstDayOfMonth = new Date(year, month, 1);
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    // Monday is index 0 (Sunday is 0 in JS -> (0+6)%7 = 6)
    const startDayOfWeek = (firstDayOfMonth.getDay() + 6) % 7;
    const prevMonthDays = new Date(year, month, 0).getDate();

    interface GridCell {
      dateStr: string;
      dayNum: number;
      isCurrentMonth: boolean;
      isWeekend: boolean;
      isToday: boolean;
      holidays: Holiday[];
    }

    const cells: GridCell[] = [];

    // 1. Leading days from previous month
    for (let i = startDayOfWeek - 1; i >= 0; i--) {
      const dayNum = prevMonthDays - i;
      const d = new Date(year, month - 1, dayNum);
      const dYear = d.getFullYear();
      const dMonth = String(d.getMonth() + 1).padStart(2, '0');
      const dDay = String(dayNum).padStart(2, '0');
      const dateStr = `${dYear}-${dMonth}-${dDay}`;
      const dayOfWeek = d.getDay();
      const cellHolidays = holidaysByDate.get(dateStr) || [];

      cells.push({
        dateStr,
        dayNum,
        isCurrentMonth: false,
        isWeekend: dayOfWeek === 0 || dayOfWeek === 6,
        isToday: dateStr === todayDateStr,
        holidays: cellHolidays
      });
    }

    // 2. Days of current month
    for (let d = 1; d <= daysInMonth; d++) {
      const dt = new Date(year, month, d);
      const dMonth = String(month + 1).padStart(2, '0');
      const dDay = String(d).padStart(2, '0');
      const dateStr = `${year}-${dMonth}-${dDay}`;
      const dayOfWeek = dt.getDay();
      const cellHolidays = holidaysByDate.get(dateStr) || [];

      cells.push({
        dateStr,
        dayNum: d,
        isCurrentMonth: true,
        isWeekend: dayOfWeek === 0 || dayOfWeek === 6,
        isToday: dateStr === todayDateStr,
        holidays: cellHolidays
      });
    }

    // 3. Trailing days from next month to complete 7-column rows
    const totalCurrentCells = cells.length;
    const targetTotal = totalCurrentCells <= 35 ? 35 : 42;
    const trailingCount = targetTotal - totalCurrentCells;

    for (let d = 1; d <= trailingCount; d++) {
      const dt = new Date(year, month + 1, d);
      const dYear = dt.getFullYear();
      const dMonth = String(dt.getMonth() + 1).padStart(2, '0');
      const dDay = String(d).padStart(2, '0');
      const dateStr = `${dYear}-${dMonth}-${dDay}`;
      const dayOfWeek = dt.getDay();
      const cellHolidays = holidaysByDate.get(dateStr) || [];

      cells.push({
        dateStr,
        dayNum: d,
        isCurrentMonth: false,
        isWeekend: dayOfWeek === 0 || dayOfWeek === 6,
        isToday: dateStr === todayDateStr,
        holidays: cellHolidays
      });
    }

    return cells;
  }, [activeYear, activeMonth, holidaysByDate, todayDateStr]);

  // Filtered Holidays for Table & Search
  const filteredHolidaysForTable = useMemo(() => {
    return holidays.filter(h => {
      if (!h.holiday_date.startsWith(String(activeYear))) return false;

      const isCuti = h.is_cuti_bersama !== undefined
        ? h.is_cuti_bersama
        : /cuti bersama/i.test(h.description);
      const isOfficial = h.is_official !== undefined ? h.is_official : true;

      if (typeFilter === 'NATIONAL' && (isCuti || !isOfficial)) return false;
      if (typeFilter === 'CUTI_BERSAMA' && !isCuti) return false;
      if (typeFilter === 'CUSTOM' && isOfficial) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        if (!h.description.toLowerCase().includes(q) && !h.holiday_date.includes(q)) return false;
      }

      return true;
    });
  }, [holidays, activeYear, typeFilter, searchQuery]);

  return (
    <div className="space-y-5">
      
      {/* ================= HEADER SECTION ================= */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 p-5 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-primary)] shadow-xs">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-lg bg-amber-500/10 text-amber-500 border border-amber-500/20">
              <CalendarIcon className="w-5 h-5" />
            </span>
            <h1 className="text-xl font-bold text-[var(--text-primary)] tracking-tight">
              Holiday Calendar (Kalender Resmi Indonesia)
            </h1>
          </div>
          <p className="text-xs text-[var(--text-secondary)] max-w-2xl">
            Sistem otomatis terhubung dan tersinkronisasi dengan kalender resmi Republik Indonesia (Libur Nasional & Cuti Bersama SKB 3 Menteri) yang otomatis terupdate setiap tahun.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button 
            type="button"
            onClick={handleManualSync} 
            disabled={syncing}
            className="btn-outline flex items-center gap-2 text-xs font-semibold px-3 py-2 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10 transition-colors"
            title="Sinkronkan dengan Kalender Resmi Indonesia"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin text-emerald-400' : ''}`} />
            <span>{syncing ? 'Menyinkronkan...' : 'Sinkronkan Resmi RI'}</span>
          </button>

          <button 
            type="button"
            onClick={() => {
              setDate(todayDateStr);
              setShowAdd(true);
            }} 
            className="btn-primary flex items-center gap-1.5 text-xs font-semibold px-3.5 py-2"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Tambah Libur Khusus</span>
          </button>
        </div>
      </div>

      {/* Sync Status Banner */}
      {syncNotice && (
        <div className={`p-3 rounded-lg border text-xs flex items-center justify-between gap-2 ${
          syncNotice.startsWith('Gagal') 
            ? 'bg-rose-500/10 border-rose-500/30 text-rose-300' 
            : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
        }`}>
          <div className="flex items-center gap-2">
            {syncNotice.startsWith('Gagal') ? <AlertCircle className="w-4 h-4 shrink-0" /> : <CheckCircle2 className="w-4 h-4 shrink-0" />}
            <span>{syncNotice}</span>
          </div>
          <button onClick={() => setSyncNotice(null)} className="btn-ghost p-1">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* KPI Overview Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Card 1: Total */}
        <div className="p-3.5 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-primary)] space-y-1">
          <span className="text-[10px] uppercase font-bold text-[var(--text-muted)] tracking-wider block">
            Total Hari Libur ({activeYear})
          </span>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-extrabold text-[var(--text-primary)]">{stats.total}</span>
            <span className="text-xs text-[var(--text-muted)]">Hari</span>
          </div>
        </div>

        {/* Card 2: Libur Nasional */}
        <div className="p-3.5 rounded-lg bg-amber-500/5 border border-amber-500/20 space-y-1">
          <span className="text-[10px] uppercase font-bold text-amber-400 tracking-wider flex items-center gap-1">
            <ShieldCheck className="w-3.5 h-3.5" /> Libur Nasional
          </span>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-extrabold text-amber-400">{stats.national}</span>
            <span className="text-xs text-[var(--text-muted)]">Hari</span>
          </div>
        </div>

        {/* Card 3: Cuti Bersama */}
        <div className="p-3.5 rounded-lg bg-blue-500/5 border border-blue-500/20 space-y-1">
          <span className="text-[10px] uppercase font-bold text-blue-400 tracking-wider flex items-center gap-1">
            <Globe className="w-3.5 h-3.5" /> Cuti Bersama
          </span>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-extrabold text-blue-400">{stats.cutiBersama}</span>
            <span className="text-xs text-[var(--text-muted)]">Hari</span>
          </div>
        </div>

        {/* Card 4: Status Auto-Sync */}
        <div className="p-3.5 rounded-lg bg-emerald-500/5 border border-emerald-500/20 space-y-1">
          <span className="text-[10px] uppercase font-bold text-emerald-400 tracking-wider flex items-center gap-1">
            <Sparkles className="w-3.5 h-3.5" /> Auto-Update
          </span>
          <div className="flex flex-col text-xs text-[var(--text-secondary)]">
            <span className="font-semibold text-emerald-400">Aktif Setiap Tahun</span>
            <span className="text-[10px] text-[var(--text-muted)] truncate">
              {syncMeta.lastSync ? `Sync: ${formatDisplayDateTime(syncMeta.lastSync)}` : 'Live Google Calendar & SKB 3 Menteri'}
            </span>
          </div>
        </div>
      </div>

      {/* ================= CALENDAR CONTROLS & VIEW TOGGLE ================= */}
      <div className="p-3 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-primary)] flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs">
        
        {/* Left: View Mode Switcher */}
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-lg border border-[var(--border-secondary)] bg-[var(--bg-tertiary)] p-0.5">
            <button
              type="button"
              onClick={() => setViewMode('MONTH_GRID')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                viewMode === 'MONTH_GRID'
                  ? 'bg-[var(--accent-blue)] text-white shadow-xs'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              <CalendarDays className="w-3.5 h-3.5" />
              <span>Kalender Kotak (Bulan)</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('YEAR_GRID')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                viewMode === 'YEAR_GRID'
                  ? 'bg-[var(--accent-blue)] text-white shadow-xs'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span>12 Bulan (Tahun)</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('TABLE')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                viewMode === 'TABLE'
                  ? 'bg-[var(--accent-blue)] text-white shadow-xs'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              <List className="w-3.5 h-3.5" />
              <span>Daftar Tabel</span>
            </button>
          </div>
        </div>

        {/* Center: Navigation Controls (Month / Year) */}
        <div className="flex items-center gap-2">
          {viewMode === 'MONTH_GRID' && (
            <>
              <button
                type="button"
                onClick={handlePrevMonth}
                className="btn-outline h-8 w-8 p-0 flex items-center justify-center rounded-lg"
                title="Bulan Sebelumnya"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>

              {/* Month Dropdown */}
              <select
                value={activeMonth}
                onChange={e => setActiveMonth(Number(e.target.value))}
                className="select h-8 text-xs font-bold py-0 pl-2.5 pr-8 bg-[var(--bg-tertiary)] border-[var(--border-primary)]"
              >
                {MONTH_NAMES.map((name, idx) => (
                  <option key={idx} value={idx}>
                    {name}
                  </option>
                ))}
              </select>
            </>
          )}

          {/* Year Dropdown */}
          <select
            value={activeYear}
            onChange={e => setActiveYear(Number(e.target.value))}
            className="select h-8 text-xs font-bold py-0 pl-2.5 pr-8 bg-[var(--bg-tertiary)] border-[var(--border-primary)]"
          >
            {availableYears.map(yr => (
              <option key={yr} value={yr}>
                Tahun {yr} {yr === currentYear ? '(Tahun Ini)' : ''}
              </option>
            ))}
          </select>

          {viewMode === 'MONTH_GRID' && (
            <>
              <button
                type="button"
                onClick={handleNextMonth}
                className="btn-outline h-8 w-8 p-0 flex items-center justify-center rounded-lg"
                title="Bulan Berikutnya"
              >
                <ChevronRight className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={handleGoToToday}
                className="btn-secondary h-8 px-2.5 text-[11px] font-semibold rounded-lg"
              >
                Bulan Ini
              </button>
            </>
          )}
        </div>

        {/* Right: Legend Indicator */}
        <div className="hidden lg:flex items-center gap-3 text-[11px] font-medium text-[var(--text-secondary)]">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
            <span>Libur Nasional</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-blue-500" />
            <span>Cuti Bersama</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-purple-500" />
            <span>Khusus Kantor</span>
          </div>
        </div>
      </div>

      {/* ================= VIEW 1: MONTHLY CALENDAR GRID (KOTAK DETAIL) ================= */}
      {viewMode === 'MONTH_GRID' && (
        <div className="space-y-2">
          {/* Calendar Header with Active Month Banner */}
          <div className="p-3.5 rounded-t-xl bg-[var(--bg-secondary)] border border-[var(--border-primary)] border-b-0 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-base font-extrabold text-[var(--text-primary)]">
                {MONTH_NAMES[activeMonth]} {activeYear}
              </span>
              <span className="text-xs text-[var(--text-muted)]">•</span>
              <span className="text-xs text-amber-400 font-semibold">
                {holidays.filter(h => h.holiday_date.startsWith(`${activeYear}-${String(activeMonth + 1).padStart(2, '0')}`)).length} Hari Libur di Bulan Ini
              </span>
            </div>

            <div className="text-[11px] text-[var(--text-muted)] italic">
              Klik pada kotak tanggal untuk melihat detail libur
            </div>
          </div>

          {/* 7 Columns Days of Week Header */}
          <div className="grid grid-cols-7 gap-1 bg-[var(--bg-secondary)] p-1.5 border-x border-[var(--border-primary)] text-center text-xs font-bold text-[var(--text-secondary)]">
            {DAY_NAMES.map((name, i) => {
              const isWeekend = i >= 5; // Sabtu & Minggu
              return (
                <div 
                  key={name} 
                  className={`py-2 rounded-md ${isWeekend ? 'text-rose-400 bg-rose-500/5 font-extrabold' : 'text-[var(--text-secondary)]'}`}
                >
                  <span className="hidden sm:inline">{name}</span>
                  <span className="sm:hidden">{SHORT_DAY_NAMES[i]}</span>
                </div>
              );
            })}
          </div>

          {/* 7 Columns Day Cells Grid */}
          <div className="grid grid-cols-7 gap-1.5 p-1.5 rounded-b-xl bg-[var(--bg-secondary)] border border-[var(--border-primary)] border-t-0 min-h-[500px]">
            {loading ? (
              <div className="col-span-7 flex flex-col items-center justify-center py-24 text-xs text-[var(--text-muted)] gap-2">
                <RefreshCw className="w-5 h-5 animate-spin text-amber-500" />
                <span>Memuat kalender kotak...</span>
              </div>
            ) : (
              monthGridDays.map((cell) => {
                const hasHoliday = cell.holidays.length > 0;
                const primaryHoliday = cell.holidays[0];
                const isCuti = primaryHoliday?.is_cuti_bersama !== undefined
                  ? primaryHoliday.is_cuti_bersama
                  : /cuti bersama/i.test(primaryHoliday?.description || '');
                const isOfficial = primaryHoliday?.is_official !== undefined ? primaryHoliday.is_official : true;

                // Box Styling based on holiday status
                let boxClass = 'bg-[var(--bg-tertiary)] border-[var(--border-secondary)] hover:border-[var(--border-primary)]';
                if (!cell.isCurrentMonth) {
                  boxClass = 'opacity-35 bg-[var(--bg-primary)]/40 border-transparent hover:opacity-70';
                } else if (hasHoliday) {
                  if (!isOfficial) {
                    boxClass = 'bg-purple-500/10 border-purple-500/40 hover:border-purple-500/70 shadow-2xs';
                  } else if (isCuti) {
                    boxClass = 'bg-blue-500/10 border-blue-500/40 hover:border-blue-500/70 shadow-2xs';
                  } else {
                    boxClass = 'bg-amber-500/10 border-amber-500/40 hover:border-amber-500/70 shadow-2xs';
                  }
                } else if (cell.isWeekend) {
                  boxClass = 'bg-[var(--bg-primary)]/30 border-[var(--border-secondary)]/50';
                }

                return (
                  <div
                    key={cell.dateStr}
                    onClick={() => {
                      if (hasHoliday) {
                        setSelectedDay({ dateStr: cell.dateStr, holidays: cell.holidays });
                      } else {
                        setDate(cell.dateStr);
                        setShowAdd(true);
                      }
                    }}
                    className={`group min-h-[96px] sm:min-h-[110px] p-2 rounded-lg border transition-all flex flex-col justify-between cursor-pointer ${boxClass} ${
                      cell.isToday ? 'ring-2 ring-blue-500/80 shadow-md' : ''
                    }`}
                  >
                    {/* Top Row: Day Number & Today/Weekend Badge */}
                    <div className="flex items-center justify-between gap-1 w-full">
                      <span className={`text-xs sm:text-sm font-extrabold ${
                        cell.isToday
                          ? 'text-blue-400 font-black'
                          : hasHoliday
                          ? isCuti ? 'text-blue-400' : isOfficial ? 'text-amber-400' : 'text-purple-400'
                          : cell.isWeekend
                          ? 'text-rose-400'
                          : cell.isCurrentMonth
                          ? 'text-[var(--text-primary)]'
                          : 'text-[var(--text-muted)]'
                      }`}>
                        {cell.dayNum}
                      </span>

                      <div className="flex items-center gap-1">
                        {cell.isToday && (
                          <span className="text-[9px] font-bold px-1.5 py-0.2 rounded-md bg-blue-500 text-white shrink-0">
                            Hari Ini
                          </span>
                        )}
                        {hasHoliday && (
                          <span className={`w-2 h-2 rounded-full shrink-0 ${
                            !isOfficial ? 'bg-purple-400' : isCuti ? 'bg-blue-400' : 'bg-amber-400'
                          }`} />
                        )}
                      </div>
                    </div>

                    {/* Middle / Bottom: Holiday Name Badges in Box */}
                    <div className="space-y-1 mt-1 flex-1 flex flex-col justify-end">
                      {cell.holidays.map((h, hIdx) => {
                        const hIsCuti = h.is_cuti_bersama !== undefined
                          ? h.is_cuti_bersama
                          : /cuti bersama/i.test(h.description);
                        const hIsOfficial = h.is_official !== undefined ? h.is_official : true;

                        return (
                          <div
                            key={hIdx}
                            className={`p-1 sm:p-1.5 rounded-md text-[9.5px] sm:text-[10px] font-bold leading-tight transition-all border ${
                              !hIsOfficial
                                ? 'bg-purple-500/20 text-purple-300 border-purple-500/30'
                                : hIsCuti
                                ? 'bg-blue-500/20 text-blue-300 border-blue-500/30'
                                : 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                            }`}
                            title={`${h.description} (${hIsCuti ? 'Cuti Bersama' : hIsOfficial ? 'Libur Nasional' : 'Khusus'})`}
                          >
                            <span className="line-clamp-2 block font-semibold">{h.description}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* ================= VIEW 2: 12-MONTH YEARLY MATRIX (12 BULAN KOTAK) ================= */}
      {viewMode === 'YEAR_GRID' && (
        <div className="space-y-4">
          <div className="p-3.5 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-primary)] flex items-center justify-between">
            <span className="text-base font-extrabold text-[var(--text-primary)]">
              Kalender Lengkap 12 Bulan ({activeYear})
            </span>
            <span className="text-xs text-[var(--text-muted)]">
              Klik pada bulan untuk membuka kalender bulanan detail
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {MONTH_NAMES.map((mName, mIdx) => {
              const monthHolidays = holidays.filter(h => h.holiday_date.startsWith(`${activeYear}-${String(mIdx + 1).padStart(2, '0')}`));
              const firstDay = new Date(activeYear, mIdx, 1);
              const totalDays = new Date(activeYear, mIdx + 1, 0).getDate();
              const startDay = (firstDay.getDay() + 6) % 7; // Monday = 0

              const miniCells = [];
              for (let i = 0; i < startDay; i++) {
                miniCells.push({ d: null, isWeekend: false, dateStr: '' });
              }
              for (let d = 1; d <= totalDays; d++) {
                const dt = new Date(activeYear, mIdx, d);
                const dateStr = `${activeYear}-${String(mIdx + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
                miniCells.push({
                  d,
                  isWeekend: dt.getDay() === 0 || dt.getDay() === 6,
                  dateStr,
                  holidays: holidaysByDate.get(dateStr) || []
                });
              }

              return (
                <div
                  key={mName}
                  onClick={() => {
                    setActiveMonth(mIdx);
                    setViewMode('MONTH_GRID');
                  }}
                  className="p-3.5 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-primary)] hover:border-blue-500/50 hover:shadow-md transition-all cursor-pointer flex flex-col justify-between"
                >
                  {/* Month Card Header */}
                  <div className="flex items-center justify-between pb-2 mb-2 border-b border-[var(--border-secondary)]">
                    <span className="text-sm font-bold text-[var(--text-primary)]">
                      {mName}
                    </span>
                    {monthHolidays.length > 0 ? (
                      <span className="text-[10px] font-extrabold px-1.5 py-0.5 rounded-md bg-amber-500/10 text-amber-400 border border-amber-500/20">
                        {monthHolidays.length} Libur
                      </span>
                    ) : (
                      <span className="text-[10px] text-[var(--text-muted)]">
                        0 Libur
                      </span>
                    )}
                  </div>

                  {/* 7-Day Header */}
                  <div className="grid grid-cols-7 gap-1 text-center text-[9px] font-bold text-[var(--text-muted)] mb-1">
                    {SHORT_DAY_NAMES.map((sn, idx) => (
                      <span key={idx} className={idx >= 5 ? 'text-rose-400' : ''}>{sn[0]}</span>
                    ))}
                  </div>

                  {/* Days Matrix */}
                  <div className="grid grid-cols-7 gap-1 text-center text-[10px]">
                    {miniCells.map((mc, cIdx) => {
                      if (!mc.d) {
                        return <div key={cIdx} className="h-6" />;
                      }
                      const hasH = mc.holidays && mc.holidays.length > 0;
                      const isCuti = hasH && /cuti bersama/i.test(mc.holidays[0].description);
                      const isToday = mc.dateStr === todayDateStr;

                      let cellBg = 'text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)]';
                      if (hasH) {
                        cellBg = isCuti
                          ? 'bg-blue-500 text-white font-extrabold rounded-md shadow-xs'
                          : 'bg-amber-500 text-black font-extrabold rounded-md shadow-xs';
                      } else if (isToday) {
                        cellBg = 'ring-1 ring-blue-500 font-bold text-blue-400 rounded-md';
                      } else if (mc.isWeekend) {
                        cellBg = 'text-rose-400';
                      }

                      return (
                        <div
                          key={cIdx}
                          className={`h-6 flex items-center justify-center rounded transition-colors ${cellBg}`}
                          title={hasH ? `${mc.holidays[0].description} (${mc.dateStr})` : mc.dateStr}
                        >
                          {mc.d}
                        </div>
                      );
                    })}
                  </div>

                  {/* Month Highlights List */}
                  {monthHolidays.length > 0 && (
                    <div className="mt-3 pt-2 border-t border-[var(--border-secondary)] space-y-1">
                      {monthHolidays.slice(0, 2).map((h, idx) => (
                        <div key={idx} className="flex items-center gap-1.5 text-[9.5px] text-[var(--text-secondary)] truncate">
                          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                            /cuti bersama/i.test(h.description) ? 'bg-blue-400' : 'bg-amber-400'
                          }`} />
                          <span className="font-mono font-bold text-[var(--text-primary)] shrink-0">
                            {h.holiday_date.substring(8, 10)}:
                          </span>
                          <span className="truncate">{h.description}</span>
                        </div>
                      ))}
                      {monthHolidays.length > 2 && (
                        <span className="text-[9px] text-[var(--text-muted)] italic block">
                          +{monthHolidays.length - 2} hari libur lainnya...
                        </span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ================= VIEW 3: TABULAR LIST VIEW (TABEL) ================= */}
      {viewMode === 'TABLE' && (
        <div className="space-y-4">
          {/* Table Filters */}
          <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-primary)] text-xs">
            <div className="inline-flex rounded-lg border border-[var(--border-secondary)] bg-[var(--bg-tertiary)] p-0.5">
              <button
                type="button"
                onClick={() => setTypeFilter('ALL')}
                className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                  typeFilter === 'ALL'
                    ? 'bg-[var(--accent-blue)] text-white shadow-xs'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                Semua
              </button>
              <button
                type="button"
                onClick={() => setTypeFilter('NATIONAL')}
                className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                  typeFilter === 'NATIONAL'
                    ? 'bg-amber-500 text-black font-bold shadow-xs'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                Libur Nasional
              </button>
              <button
                type="button"
                onClick={() => setTypeFilter('CUTI_BERSAMA')}
                className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                  typeFilter === 'CUTI_BERSAMA'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                Cuti Bersama
              </button>
              <button
                type="button"
                onClick={() => setTypeFilter('CUSTOM')}
                className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                  typeFilter === 'CUSTOM'
                    ? 'bg-purple-600 text-white shadow-xs'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                Khusus Kantor
              </button>
            </div>

            <div className="relative w-full md:w-64">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
              <input
                type="text"
                className="input w-full h-8 pl-8 pr-2.5 text-xs bg-[var(--bg-tertiary)]"
                placeholder="Cari hari libur..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
              />
            </div>
          </div>

          {/* Table Container */}
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th className="w-28">Tanggal</th>
                  <th className="w-48">Hari & Kalender</th>
                  <th>Nama Libur Resmi / Keterangan</th>
                  <th className="w-36 text-center">Kategori</th>
                  <th className="w-36 text-center">Sumber</th>
                  <th className="w-16 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={6} className="text-center py-10 text-xs text-[var(--text-muted)]">
                      <div className="flex items-center justify-center gap-2">
                        <RefreshCw className="w-4 h-4 animate-spin text-amber-500" />
                        <span>Memuat data...</span>
                      </div>
                    </td>
                  </tr>
                ) : filteredHolidaysForTable.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center py-10 text-xs text-[var(--text-muted)]">
                      Tidak ada hari libur yang cocok dengan filter tahun {activeYear}.
                    </td>
                  </tr>
                ) : (
                  filteredHolidaysForTable.map((h, index) => {
                    const isCuti = h.is_cuti_bersama !== undefined
                      ? h.is_cuti_bersama
                      : /cuti bersama/i.test(h.description);
                    const isOfficial = h.is_official !== undefined ? h.is_official : true;
                    const key = h.id !== undefined ? `holiday-${h.id}` : `${h.holiday_date}-${index}`;

                    return (
                      <tr key={key} className="hover:bg-[var(--bg-tertiary)]/50 transition-colors">
                        <td className="font-mono text-xs font-bold text-[var(--accent-blue)]">
                          {h.holiday_date}
                        </td>
                        <td className="text-xs">
                          <span className="font-medium text-[var(--text-primary)]">
                            {formatDisplayDate(h.holiday_date)}
                          </span>
                        </td>
                        <td className="text-xs font-semibold text-[var(--text-primary)]">
                          {h.description}
                        </td>
                        <td className="text-center">
                          {isCuti ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-blue-500/10 text-blue-400 border border-blue-500/20">
                              <Globe className="w-2.5 h-2.5" />
                              <span>Cuti Bersama</span>
                            </span>
                          ) : isOfficial ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                              <ShieldCheck className="w-2.5 h-2.5" />
                              <span>Libur Nasional</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-purple-500/10 text-purple-400 border border-purple-500/20">
                              <Sparkles className="w-2.5 h-2.5" />
                              <span>Khusus Kantor</span>
                            </span>
                          )}
                        </td>
                        <td className="text-center">
                          {isOfficial ? (
                            <span className="text-[10px] text-emerald-400 font-medium inline-flex items-center gap-1">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
                              <span>Resmi RI</span>
                            </span>
                          ) : (
                            <span className="text-[10px] text-[var(--text-muted)] font-medium inline-flex items-center gap-1">
                              <span className="w-1.5 h-1.5 rounded-full bg-purple-400 shrink-0" />
                              <span>Manual</span>
                            </span>
                          )}
                        </td>
                        <td className="text-right">
                          <button
                            onClick={() => handleDelete(h)}
                            title="Hapus hari libur ini"
                            className="btn-ghost p-1 text-[var(--accent-red)] hover:text-red-300 transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ================= MODAL: DETAIL DAY POPOVER ================= */}
      {selectedDay && (
        <div className="modal-overlay" onClick={() => setSelectedDay(null)}>
          <div className="modal-content max-w-md w-full" onClick={e => e.stopPropagation()}>
            <div className="p-5 flex items-center justify-between border-b border-[var(--border-primary)]">
              <div className="flex items-center gap-2">
                <CalendarIcon className="w-5 h-5 text-amber-500" />
                <div>
                  <h3 className="text-base font-bold text-[var(--text-primary)]">
                    Detail Hari Libur
                  </h3>
                  <span className="text-xs text-[var(--text-secondary)] font-mono">
                    {formatDisplayDate(selectedDay.dateStr)} ({selectedDay.dateStr})
                  </span>
                </div>
              </div>
              <button onClick={() => setSelectedDay(null)} className="btn-ghost p-1.5 rounded-full">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-3">
              {selectedDay.holidays.length === 0 ? (
                <p className="text-xs text-[var(--text-muted)] italic">
                  Tidak ada hari libur resmi pada tanggal ini (Hari Kerja).
                </p>
              ) : (
                selectedDay.holidays.map((h, idx) => {
                  const isCuti = h.is_cuti_bersama !== undefined
                    ? h.is_cuti_bersama
                    : /cuti bersama/i.test(h.description);
                  const isOfficial = h.is_official !== undefined ? h.is_official : true;

                  return (
                    <div 
                      key={idx} 
                      className={`p-3.5 rounded-xl border flex flex-col gap-2 ${
                        !isOfficial
                          ? 'bg-purple-500/10 border-purple-500/30'
                          : isCuti
                          ? 'bg-blue-500/10 border-blue-500/30'
                          : 'bg-amber-500/10 border-amber-500/30'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className={`text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-md ${
                          !isOfficial
                            ? 'bg-purple-500/20 text-purple-300'
                            : isCuti
                            ? 'bg-blue-500/20 text-blue-300'
                            : 'bg-amber-500/20 text-amber-300'
                        }`}>
                          {isCuti ? 'Cuti Bersama' : isOfficial ? 'Libur Nasional Resmi RI' : 'Khusus Kantor'}
                        </span>

                        <button
                          type="button"
                          onClick={() => handleDelete(h)}
                          className="text-xs text-rose-400 hover:text-rose-300 flex items-center gap-1 font-semibold"
                        >
                          <Trash2 className="w-3.5 h-3.5" /> Hapus
                        </button>
                      </div>

                      <p className="text-sm font-bold text-[var(--text-primary)] m-0">
                        {h.description}
                      </p>

                      <div className="text-[11px] text-[var(--text-muted)] flex items-center gap-1.5 pt-1 border-t border-[var(--border-secondary)]">
                        <Info className="w-3 h-3" />
                        <span>Hari ini dikecualikan dari perhitungan hari kerja SLA sistem.</span>
                      </div>
                    </div>
                  );
                })
              )}

              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setDate(selectedDay.dateStr);
                    setSelectedDay(null);
                    setShowAdd(true);
                  }}
                  className="btn-outline w-full text-xs font-semibold py-2 flex items-center justify-center gap-1.5"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Tambah Libur Khusus Pada Tanggal Ini</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ================= MODAL: ADD MANUAL HOLIDAY ================= */}
      {showAdd && (
        <div className="modal-overlay" onClick={() => setShowAdd(false)}>
          <div className="modal-content max-w-md w-full" onClick={e => e.stopPropagation()}>
            <div className="p-5 flex items-center justify-between border-b border-[var(--border-primary)]">
              <div className="flex items-center gap-2">
                <CalendarIcon className="w-4 h-4 text-amber-500" />
                <h2 className="text-base font-bold text-[var(--text-primary)]">Tambah Hari Libur Khusus</h2>
              </div>
              <button onClick={() => setShowAdd(false)} className="btn-ghost p-1.5 rounded-full">
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleAdd} className="p-5 space-y-4">
              <p className="text-xs text-[var(--text-muted)]">
                Gunakan form ini untuk hari libur khusus internal kantor atau libur opsional perusahaan yang ingin dikecualikan dari perhitungan SLA.
              </p>
              <div className="space-y-1.5">
                <label className="label">Tanggal Libur *</label>
                <input 
                  className="input w-full text-xs font-mono" 
                  type="date" 
                  required 
                  value={date} 
                  onChange={e => setDate(e.target.value)} 
                />
              </div>
              <div className="space-y-1.5">
                <label className="label">Keterangan / Nama Libur *</label>
                <input 
                  className="input w-full text-xs" 
                  required 
                  value={desc} 
                  onChange={e => setDesc(e.target.value)} 
                  placeholder="e.g. Hari Ulang Tahun Perusahaan / Libur Kantor" 
                />
              </div>
              <div className="pt-4 flex justify-end gap-2 border-t border-[var(--border-primary)]">
                <button type="button" onClick={() => setShowAdd(false)} className="btn-secondary text-xs">
                  Batal
                </button>
                <button type="submit" disabled={submitting} className="btn-primary text-xs flex items-center gap-1.5">
                  <Plus className="w-3.5 h-3.5" />
                  <span>{submitting ? 'Menyimpan...' : 'Simpan Hari Libur'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
