'use client';

import React, { useEffect, useState, useMemo, useCallback } from 'react';
import {
  Search,
  RotateCcw,
  RefreshCw,
  ExternalLink,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  ArrowUp,
  ArrowDown,
  CheckCircle2,
  AlertCircle,
  Clock,
  Layers,
  Compass,
  Film,
  Check,
  X,
  Info,
  CloudUpload,
  Send,
} from 'lucide-react';
import { useAuth } from '@/lib/auth';
import {
  CampaignDesignRecord,
  CampaignMotionRecord,
  CampaignTabType,
  CampaignUsageApiResponse,
  GoogleSheetsSyncOutboxItem,
  SyncOutboxSummary,
} from '@/lib/types';
import { sanitizeUrl, formatRelativeTime } from '@/lib/utils';
import { formatReadableDate, parseDateString } from '@/lib/google-sheets-adapter';

// Sort direction
type SortDirection = 'asc' | 'desc';

export default function CampaignUsagePage() {
  const { user } = useAuth();

  // --- STATE ---
  const [data, setData] = useState<CampaignUsageApiResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'warning' | 'error' } | null>(null);

  // Active tab
  const [activeTab, setActiveTab] = useState<CampaignTabType>('by-motion');

  // Search query
  const [searchQuery, setSearchQuery] = useState('');

  // Filters
  const [excellenceFilter, setExcellenceFilter] = useState<'ALL' | 'Excellence' | 'Good' | 'Bad'>('ALL');
  const [difficultyFilter, setDifficultyFilter] = useState<'ALL' | 'Low' | 'Medium' | 'High'>('ALL');
  const [sourceFilter, setSourceFilter] = useState<'ALL' | 'Ecommerce' | 'Orca'>('ALL');
  const [campaignFilter, setCampaignFilter] = useState<'ALL' | 'PayDay' | 'BaU' | 'DD' | 'Other'>('ALL');
  const [statusOpFilter, setStatusOpFilter] = useState<'ALL' | 'active' | 'upcoming' | 'ended'>('ALL');
  const [statusMockupFilter, setStatusMockupFilter] = useState<'ALL' | 'Done' | 'On Progress' | 'Waiting' | 'Blocked'>('ALL');
  const [brandFilter, setBrandFilter] = useState<string>('ALL');
  const [contentFilter, setContentFilter] = useState<string>('ALL');
  const [monthReqDueFilter, setMonthReqDueFilter] = useState<string>('ALL');
  const [monthApplyFilter, setMonthApplyFilter] = useState<string>('ALL');

  // Sorting
  const [sortKey, setSortKey] = useState<string>('default');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(25);

  // Modal Documentation
  const [showDocModal, setShowDocModal] = useState(false);

  // Modal Outbox Sync
  const [showOutboxModal, setShowOutboxModal] = useState(false);
  const [outboxSummary, setOutboxSummary] = useState<SyncOutboxSummary | null>(null);
  const [outboxItems, setOutboxItems] = useState<GoogleSheetsSyncOutboxItem[]>([]);
  const [outboxConfig, setOutboxConfig] = useState<{
    isConfigured: boolean;
    clientEmail: string | null;
    spreadsheetId: string;
    targetTabs: string[];
  } | null>(null);
  const [isLoadingOutbox, setIsLoadingOutbox] = useState(false);
  const [isProcessingQueue, setIsProcessingQueue] = useState(false);

  const fetchOutboxStatus = useCallback(async () => {
    setIsLoadingOutbox(true);
    try {
      const res = await fetch('/api/campaign/sync', {
        headers: { Accept: 'application/json' },
      });
      if (res.ok) {
        const d = await res.json();
        setOutboxSummary(d.summary);
        setOutboxItems(d.items || []);
        setOutboxConfig(d.config || null);
      }
    } catch {
      // Ignore
    } finally {
      setIsLoadingOutbox(false);
    }
  }, []);

  useEffect(() => {
    if (showOutboxModal) {
      void fetchOutboxStatus();
    }
  }, [showOutboxModal, fetchOutboxStatus]);

  const handleProcessQueue = async () => {
    setIsProcessingQueue(true);
    try {
      const res = await fetch('/api/campaign/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'PROCESS_QUEUE' }),
      });
      const d = await res.json();
      if (d.success) {
        triggerToast(d.message, 'success');
        await fetchOutboxStatus();
      } else {
        triggerToast(d.message, 'error');
      }
    } catch {
      triggerToast('Gagal memproses antrean sinkronisasi.', 'error');
    } finally {
      setIsProcessingQueue(false);
    }
  };

  const handleRetryItem = async (itemId: string) => {
    try {
      const res = await fetch('/api/campaign/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'RETRY_ITEM', itemId }),
      });
      const d = await res.json();
      if (d.success) {
        triggerToast(d.message, 'success');
        await fetchOutboxStatus();
      } else {
        triggerToast(d.message, 'error');
      }
    } catch {
      triggerToast('Gagal menjadwalkan ulang item.', 'error');
    }
  };

  // --- SHOW TOAST ---
  const triggerToast = useCallback((text: string, type: 'success' | 'warning' | 'error' = 'success') => {
    setToastMessage({ text, type });
    setTimeout(() => {
      setToastMessage((prev) => (prev?.text === text ? null : prev));
    }, 4000);
  }, []);

  // --- DATA FETCHING (READ-ONLY) ---
  useEffect(() => {
    let ignore = false;
    async function loadCampaignData() {
      try {
        const res = await fetch('/api/campaign', {
          method: 'GET',
          headers: {
            Accept: 'application/json',
            ...(user?.id ? { 'x-user-id': user.id } : {}),
          },
        });

        if (!res.ok) {
          throw new Error(`Server returned HTTP ${res.status}`);
        }

        const json: CampaignUsageApiResponse = await res.json();
        if (!ignore) {
          setData(json);
          setError(null);
        }
      } catch (err) {
        if (!ignore) {
          const msg = (err as Error).message || 'Gagal memuat data Campaign Usage.';
          setError(msg);
        }
      } finally {
        if (!ignore) {
          setIsLoading(false);
        }
      }
    }

    void loadCampaignData();
    return () => {
      ignore = true;
    };
  }, [user]);

  // Manual refresh callback
  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const res = await fetch('/api/campaign?refresh=true', {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          ...(user?.id ? { 'x-user-id': user.id } : {}),
        },
      });

      if (!res.ok) {
        if (res.status === 429) {
          const errData = await res.json();
          triggerToast(errData.message || 'Harap tunggu sebelum refresh lagi.', 'warning');
          return;
        }
        throw new Error(`Server returned HTTP ${res.status}`);
      }

      const json: CampaignUsageApiResponse = await res.json();
      setData(json);
      setError(null);
      triggerToast('Data berhasil disegarkan dari Google Sheets.', 'success');
    } catch (err) {
      const msg = (err as Error).message || 'Gagal menyegarkan data.';
      setError(msg);
      triggerToast(msg, 'error');
    } finally {
      setIsRefreshing(false);
    }
  }, [user, triggerToast]);

  // Reset page and sort when tab changes
  const handleTabChange = (newTab: CampaignTabType) => {
    setActiveTab(newTab);
    setCurrentPage(1);
    setSortKey('default');
    setSortDirection('asc');
  };

  // Reset all filters
  const resetFilters = () => {
    setSearchQuery('');
    setExcellenceFilter('ALL');
    setDifficultyFilter('ALL');
    setSourceFilter('ALL');
    setCampaignFilter('ALL');
    setStatusOpFilter('ALL');
    setStatusMockupFilter('ALL');
    setBrandFilter('ALL');
    setContentFilter('ALL');
    setMonthReqDueFilter('ALL');
    setMonthApplyFilter('ALL');
    setCurrentPage(1);
  };

  const isFiltered = useMemo(() => {
    return (
      searchQuery !== '' ||
      excellenceFilter !== 'ALL' ||
      difficultyFilter !== 'ALL' ||
      sourceFilter !== 'ALL' ||
      campaignFilter !== 'ALL' ||
      statusOpFilter !== 'ALL' ||
      statusMockupFilter !== 'ALL' ||
      brandFilter !== 'ALL' ||
      contentFilter !== 'ALL' ||
      monthReqDueFilter !== 'ALL' ||
      monthApplyFilter !== 'ALL'
    );
  }, [
    searchQuery,
    excellenceFilter,
    difficultyFilter,
    sourceFilter,
    campaignFilter,
    statusOpFilter,
    statusMockupFilter,
    brandFilter,
    contentFilter,
    monthReqDueFilter,
    monthApplyFilter,
  ]);

  // --- FILTER DROPDOWN OPTIONS ---
  const distinctBrands = useMemo(() => {
    const brands = new Set<string>();
    data?.designRecords.forEach((r) => {
      if (r.brand && r.brand !== '-') brands.add(r.brand.trim());
    });
    data?.motionRecords.forEach((r) => {
      if (r.brand && r.brand !== '-') brands.add(r.brand.trim());
    });
    return Array.from(brands).sort((a, b) => a.localeCompare(b));
  }, [data]);

  const distinctContentTypes = useMemo(() => {
    const types = new Set<string>();
    data?.designRecords.forEach((r) => {
      if (r.typeOfContent && r.typeOfContent !== '-') {
        types.add(r.typeOfContent.trim());
      }
    });
    return Array.from(types).sort((a, b) => a.localeCompare(b));
  }, [data]);

  const distinctMonthsReq = useMemo(() => {
    const months = new Set<string>();
    data?.designRecords.forEach((r) => {
      if (r.monthRequest && r.monthRequest !== '-') months.add(r.monthRequest.trim());
    });
    return Array.from(months);
  }, [data]);

  const distinctMonthsApply = useMemo(() => {
    const months = new Set<string>();
    data?.motionRecords.forEach((r) => {
      if (r.bulan && r.bulan !== '-') months.add(r.bulan.trim());
    });
    return Array.from(months);
  }, [data]);

  // --- FILTERED DATASETS ---
  const filteredDesignRecords = useMemo(() => {
    if (!data?.designRecords) return [];
    let records = data.designRecords;

    // Search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      records = records.filter(
        (r) =>
          r.brand.toLowerCase().includes(q) ||
          r.finalAssetName.toLowerCase().includes(q) ||
          r.designPIC.toLowerCase().includes(q) ||
          r.stratPIC.toLowerCase().includes(q) ||
          r.typeOfContent.toLowerCase().includes(q) ||
          r.campaign.toLowerCase().includes(q) ||
          r.remark.toLowerCase().includes(q)
      );
    }

    // Excellence filter
    if (excellenceFilter !== 'ALL') {
      records = records.filter(
        (r) => (r.operationalExcellence || '').trim().toLowerCase() === excellenceFilter.toLowerCase()
      );
    }

    // Difficulty filter
    if (difficultyFilter !== 'ALL') {
      records = records.filter(
        (r) => (r.designDifficulty || '').trim().toLowerCase() === difficultyFilter.toLowerCase()
      );
    }

    // Source filter
    if (sourceFilter !== 'ALL') {
      records = records.filter(
        (r) => (r.taksSource || '').trim().toLowerCase() === sourceFilter.toLowerCase()
      );
    }

    // Campaign filter
    if (campaignFilter !== 'ALL') {
      records = records.filter((r) => {
        const raw = `${r.campaign} ${r.typeOfCampaign}`.toLowerCase();
        if (campaignFilter === 'PayDay') return raw.includes('payday');
        if (campaignFilter === 'BaU') return raw.includes('bau');
        if (campaignFilter === 'DD') return raw.includes('dd');
        return !raw.includes('payday') && !raw.includes('bau') && !raw.includes('dd');
      });
    }

    // Status Mockup filter
    if (statusMockupFilter !== 'ALL') {
      records = records.filter((r) => {
        const status = `${r.statusDesign} ${r.statusMotion}`.toLowerCase();
        if (statusMockupFilter === 'Done') return status.includes('done') || status.includes('selesai');
        if (statusMockupFilter === 'On Progress') return status.includes('progress');
        if (statusMockupFilter === 'Waiting') return status.includes('wait') || status.includes('approval');
        if (statusMockupFilter === 'Blocked') return status.includes('block') || status.includes('hold');
        return true;
      });
    }

    // Brand filter
    if (brandFilter !== 'ALL') {
      records = records.filter((r) => r.brand.trim().toLowerCase() === brandFilter.toLowerCase());
    }

    // Content filter
    if (contentFilter !== 'ALL') {
      records = records.filter(
        (r) => r.typeOfContent.trim().toLowerCase() === contentFilter.toLowerCase()
      );
    }

    // Month Req/Due filter
    if (monthReqDueFilter !== 'ALL') {
      records = records.filter(
        (r) => r.monthRequest.trim().toLowerCase() === monthReqDueFilter.toLowerCase()
      );
    }

    return records;
  }, [
    data,
    searchQuery,
    excellenceFilter,
    difficultyFilter,
    sourceFilter,
    campaignFilter,
    statusMockupFilter,
    brandFilter,
    contentFilter,
    monthReqDueFilter,
  ]);

  const filteredMotionRecords = useMemo(() => {
    if (!data?.motionRecords) return [];
    let records = data.motionRecords;

    // Search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      records = records.filter(
        (r) =>
          r.namaAset.toLowerCase().includes(q) ||
          r.brand.toLowerCase().includes(q) ||
          r.platform.toLowerCase().includes(q) ||
          r.typeOfCampaign.toLowerCase().includes(q) ||
          r.motionPIC.toLowerCase().includes(q) ||
          r.studio.toLowerCase().includes(q) ||
          r.catatan.toLowerCase().includes(q)
      );
    }

    // Difficulty filter
    if (difficultyFilter !== 'ALL') {
      records = records.filter(
        (r) => (r.complexity || r.motionDifficulty || '').trim().toLowerCase() === difficultyFilter.toLowerCase()
      );
    }

    // Campaign filter
    if (campaignFilter !== 'ALL') {
      records = records.filter((r) => {
        const raw = (r.typeOfCampaign || '').toLowerCase();
        if (campaignFilter === 'PayDay') return raw.includes('payday');
        if (campaignFilter === 'BaU') return raw.includes('bau');
        if (campaignFilter === 'DD') return raw.includes('dd');
        return !raw.includes('payday') && !raw.includes('bau') && !raw.includes('dd');
      });
    }

    // Status OP filter (active, upcoming, ended)
    if (statusOpFilter !== 'ALL') {
      records = records.filter((r) => r.activeStatus === statusOpFilter);
    }

    // Status Mockup filter
    if (statusMockupFilter !== 'ALL') {
      records = records.filter((r) => {
        const status = (r.statusMotion || '').toLowerCase();
        if (statusMockupFilter === 'Done') return status.includes('done') || status.includes('selesai') || status.includes('ready');
        if (statusMockupFilter === 'On Progress') return status.includes('progress');
        if (statusMockupFilter === 'Waiting') return status.includes('wait') || status.includes('approval');
        if (statusMockupFilter === 'Blocked') return status.includes('block') || status.includes('hold');
        return true;
      });
    }

    // Brand filter
    if (brandFilter !== 'ALL') {
      records = records.filter((r) => r.brand.trim().toLowerCase() === brandFilter.toLowerCase());
    }

    // Month Apply filter
    if (monthApplyFilter !== 'ALL') {
      records = records.filter(
        (r) => r.bulan.trim().toLowerCase() === monthApplyFilter.toLowerCase()
      );
    }

    return records;
  }, [
    data,
    searchQuery,
    difficultyFilter,
    campaignFilter,
    statusOpFilter,
    statusMockupFilter,
    brandFilter,
    monthApplyFilter,
  ]);

  // Tab By Strategic records are derived from Design records that have strategic concept
  const filteredStrategicRecords = useMemo(() => {
    return filteredDesignRecords.filter(
      (r) =>
        r.withStrategic?.toLowerCase().includes('yes') ||
        (r.stratPIC && r.stratPIC !== '-' && r.stratPIC.toLowerCase() !== 'no strat')
    );
  }, [filteredDesignRecords]);

  // Active records based on tab
  const activeRecords = useMemo(() => {
    if (activeTab === 'by-design') return filteredDesignRecords;
    if (activeTab === 'by-strategic') return filteredStrategicRecords;
    return filteredMotionRecords;
  }, [activeTab, filteredDesignRecords, filteredStrategicRecords, filteredMotionRecords]);

  // --- SORTING ---
  const sortedRecords = useMemo(() => {
    const list = [...activeRecords];

    if (sortKey === 'default') {
      // Default sort according to reference:
      // Req. Date (By Design/Strategic) or Periode Mulai (By Motion to OP) ascending
      if (activeTab === 'by-motion') {
        return list.sort((a, b) => {
          const mA = a as CampaignMotionRecord;
          const mB = b as CampaignMotionRecord;
          const dA = parseDateString(mA.periodeMulai)?.getTime() || 0;
          const dB = parseDateString(mB.periodeMulai)?.getTime() || 0;
          return sortDirection === 'asc' ? dA - dB : dB - dA;
        });
      } else {
        return list.sort((a, b) => {
          const dA = parseDateString((a as CampaignDesignRecord).reqDate)?.getTime() || 0;
          const dB = parseDateString((b as CampaignDesignRecord).reqDate)?.getTime() || 0;
          return sortDirection === 'asc' ? dA - dB : dB - dA;
        });
      }
    }

    return list.sort((a, b) => {
      const recA = a as unknown as Record<string, unknown>;
      const recB = b as unknown as Record<string, unknown>;
      const valA = recA[sortKey] ?? '';
      const valB = recB[sortKey] ?? '';

      // Check if date
      const dateA = parseDateString(String(valA));
      const dateB = parseDateString(String(valB));
      if (dateA && dateB) {
        return sortDirection === 'asc'
          ? dateA.getTime() - dateB.getTime()
          : dateB.getTime() - dateA.getTime();
      }

      // Check numeric
      const numA = Number(valA);
      const numB = Number(valB);
      if (!isNaN(numA) && !isNaN(numB) && valA !== '' && valB !== '') {
        return sortDirection === 'asc' ? numA - numB : numB - numA;
      }

      return sortDirection === 'asc'
        ? String(valA).localeCompare(String(valB))
        : String(valB).localeCompare(String(valA));
    });
  }, [activeRecords, sortKey, sortDirection, activeTab]);

  // --- PAGINATION ---
  const totalPages = Math.max(1, Math.ceil(sortedRecords.length / pageSize));
  const paginatedRecords = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return sortedRecords.slice(start, start + pageSize);
  }, [sortedRecords, currentPage, pageSize]);

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDirection('asc');
    }
  };

  // Helper for status badge styling
  const getStatusBadge = (rawStatus: string) => {
    const s = (rawStatus || '').toLowerCase();
    if (s.includes('done') || s.includes('selesai') || s.includes('ready')) {
      return 'bg-emerald-100 text-emerald-900 border border-emerald-300 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-700 font-semibold';
    }
    if (s.includes('progress')) {
      return 'bg-blue-100 text-blue-900 border border-blue-300 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-700 font-semibold';
    }
    if (s.includes('wait') || s.includes('approval') || s.includes('pending')) {
      return 'bg-amber-100 text-amber-950 border border-amber-300 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-700 font-semibold';
    }
    if (s.includes('block') || s.includes('hold') || s.includes('missing') || s.includes('issue')) {
      return 'bg-rose-100 text-rose-900 border border-rose-300 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-700 font-semibold';
    }
    return 'bg-slate-200/80 text-slate-800 border border-slate-300 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700 font-medium';
  };

  // Helper for active status (Motion to OP)
  const getActiveStatusBadge = (status?: string) => {
    switch (status) {
      case 'active':
        return {
          label: 'Aktif',
          className: 'bg-emerald-100 text-emerald-900 border-emerald-300 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-700 font-semibold',
        };
      case 'upcoming':
        return {
          label: 'Akan Datang',
          className: 'bg-blue-100 text-blue-900 border-blue-300 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-700 font-semibold',
        };
      case 'ended':
        return {
          label: 'Selesai',
          className: 'bg-slate-200/80 text-slate-800 border-slate-300 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700 font-semibold',
        };
      default:
        return {
          label: 'Tidak Diketahui',
          className: 'bg-slate-200/80 text-slate-800 border-slate-300 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700 font-medium',
        };
    }
  };

  // Open safe URL
  const handleOpenAssetUrl = (url?: string) => {
    const clean = sanitizeUrl(url);
    if (!clean) {
      triggerToast('Link aset tidak valid atau tidak tersedia.', 'warning');
      return;
    }
    window.open(clean, '_blank', 'noopener,noreferrer');
  };

  // Dynamic Excellence counts from current dataset
  const excellenceSummary = useMemo(() => {
    return data?.summary || { excellence: 0, good: 0, bad: 0, unclassified: 0 };
  }, [data]);

  return (
    <div className="min-h-screen p-4 md:p-6 space-y-6" style={{ background: 'var(--bg-primary)' }}>
      {/* Toast Notification */}
      {toastMessage && (
        <div
          className={`fixed bottom-5 right-5 z-50 px-4 py-3 rounded-lg shadow-lg flex items-center gap-3 border text-sm animate-in fade-in slide-in-from-bottom-2 ${
            toastMessage.type === 'success'
              ? 'bg-emerald-950/90 text-emerald-200 border-emerald-700/60'
              : toastMessage.type === 'warning'
              ? 'bg-amber-950/90 text-amber-200 border-amber-700/60'
              : 'bg-rose-950/90 text-rose-200 border-rose-700/60'
          }`}
        >
          {toastMessage.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
          )}
          <span>{toastMessage.text}</span>
          <button
            onClick={() => setToastMessage(null)}
            className="ml-2 hover:opacity-75 transition-opacity"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Error Alert */}
      {error && !isLoading && (
        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-between text-rose-300 text-sm">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-rose-400 shrink-0" />
            <span>{error}</span>
          </div>
          <button
            onClick={handleRefresh}
            className="text-xs px-3 py-1 rounded bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 transition-colors"
          >
            Coba Lagi
          </button>
        </div>
      )}

      {/* --- HEADER --- */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b" style={{ borderColor: 'var(--border-primary)' }}>
        <div>
          <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-purple-400">
            <span>KOMPONEN 08</span>
            <span>•</span>
            <span>CAMPAIGN USAGE MANAGEMENT</span>
          </div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight mt-1" style={{ color: 'var(--text-primary)' }}>
            Jadwal Penggunaan Mockup
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
            Daftar request Design, Strategic, dan Motion beserta status pengerjaannya. Data dikelola tim internal via Google Sheets.
          </p>

          {/* Source & Sync indicator */}
          <div className="flex flex-wrap items-center gap-2 mt-2 text-xs">
            {data?.source === 'live' ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Live Data (Google Sheets Read-Only)
              </span>
            ) : data?.source === 'cached' ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/30">
                <Clock className="w-3 h-3" />
                Cached (Read-Only)
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/30">
                <AlertCircle className="w-3 h-3" />
                Fallback Data
              </span>
            )}

            {data?.lastSyncedAt && (
              <span style={{ color: 'var(--text-muted)' }}>
                Terakhir disinkronkan: {formatRelativeTime(data.lastSyncedAt)}
              </span>
            )}

            {data?.error && (
              <span className="text-amber-400/90 italic">
                ({data.error})
              </span>
            )}
          </div>
        </div>
      </div>

      {/* --- SUMMARY CARDS --- */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {/* Card 1: Excellence */}
        <div
          className="p-3.5 rounded-xl border flex items-center justify-between transition-all"
          style={{ background: 'var(--bg-card)', borderColor: 'var(--border-primary)' }}
        >
          <div>
            <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-700 dark:text-emerald-400">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              <span>Excellence</span>
            </div>
            <div className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
              SLA &amp; Quality standar tertinggi
            </div>
          </div>
          <div className="text-2xl font-extrabold tracking-tight text-emerald-700 dark:text-emerald-400">
            {isLoading ? '...' : excellenceSummary.excellence}
          </div>
        </div>

        {/* Card 2: Good */}
        <div
          className="p-3.5 rounded-xl border flex items-center justify-between transition-all"
          style={{ background: 'var(--bg-card)', borderColor: 'var(--border-primary)' }}
        >
          <div>
            <div className="flex items-center gap-1.5 text-xs font-bold text-blue-700 dark:text-blue-400">
              <span className="w-2 h-2 rounded-full bg-blue-500" />
              <span>Good</span>
            </div>
            <div className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
              Sesuai toleransi operasional
            </div>
          </div>
          <div className="text-2xl font-extrabold tracking-tight text-blue-700 dark:text-blue-400">
            {isLoading ? '...' : excellenceSummary.good}
          </div>
        </div>

        {/* Card 3: Bad */}
        <div
          className="p-3.5 rounded-xl border flex items-center justify-between transition-all"
          style={{ background: 'var(--bg-card)', borderColor: 'var(--border-primary)' }}
        >
          <div>
            <div className="flex items-center gap-1.5 text-xs font-bold text-rose-700 dark:text-rose-400">
              <span className="w-2 h-2 rounded-full bg-rose-500" />
              <span>Bad</span>
            </div>
            <div className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
              Melebihi SLA batas waktu
            </div>
          </div>
          <div className="text-2xl font-extrabold tracking-tight text-rose-700 dark:text-rose-400">
            {isLoading ? '...' : excellenceSummary.bad}
          </div>
        </div>
      </div>

      {/* --- FILTER SECTION --- */}
      <div
        className="p-3.5 rounded-xl border space-y-3"
        style={{ background: 'var(--bg-card)', borderColor: 'var(--border-primary)' }}
      >
        {/* Search Bar + Reset Button */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
          <div className="relative flex-1">
            {!searchQuery && (
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none transition-opacity duration-150" style={{ color: 'var(--text-muted)' }} />
            )}
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
              placeholder="Cari nama aset, brand, campaign, atau PIC..."
              className="w-full h-8 text-xs rounded-lg border focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all font-medium"
              style={{
                background: 'var(--bg-primary)',
                borderColor: 'var(--border-primary)',
                color: 'var(--text-primary)',
                paddingLeft: searchQuery ? '10px' : '32px',
                paddingRight: searchQuery ? '28px' : '10px',
              }}
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 hover:opacity-75 transition-opacity"
                title="Clear search"
              >
                <X className="w-3.5 h-3.5" style={{ color: 'var(--text-muted)' }} />
              </button>
            )}
          </div>

          {isFiltered && (
            <button
              onClick={resetFilters}
              className="h-8 flex items-center justify-center gap-1.5 px-3 rounded-lg text-xs font-semibold text-rose-700 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 border border-rose-300 dark:border-rose-700/60 hover:bg-rose-100 dark:hover:bg-rose-900/40 transition-colors shrink-0"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Reset Filter</span>
            </button>
          )}
        </div>

        {/* Primary Filter Dropdowns in a Responsive 4-Column Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 pt-1 border-t border-[var(--border-secondary)]">
          {/* BRAND */}
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-bold tracking-wider uppercase text-[var(--text-muted)]">Brand</span>
            <select
              value={brandFilter}
              onChange={(e) => {
                setBrandFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="h-8 px-2 rounded-md text-xs border focus:outline-none w-full bg-[var(--bg-secondary)] border-[var(--border-primary)] text-[var(--text-primary)] font-medium"
            >
              <option value="ALL">Semua Brand</option>
              {distinctBrands.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </div>

          {/* KONTEN */}
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-bold tracking-wider uppercase text-[var(--text-muted)]">Konten</span>
            <select
              value={contentFilter}
              onChange={(e) => {
                setContentFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="h-8 px-2 rounded-md text-xs border focus:outline-none w-full bg-[var(--bg-secondary)] border-[var(--border-primary)] text-[var(--text-primary)] font-medium"
            >
              <option value="ALL">Semua Konten</option>
              {distinctContentTypes.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          {/* BULAN REQ/DUE */}
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-bold tracking-wider uppercase text-[var(--text-muted)]">Bulan Req/Due</span>
            <select
              value={monthReqDueFilter}
              onChange={(e) => {
                setMonthReqDueFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="h-8 px-2 rounded-md text-xs border focus:outline-none w-full bg-[var(--bg-secondary)] border-[var(--border-primary)] text-[var(--text-primary)] font-medium"
            >
              <option value="ALL">Semua Bulan</option>
              {distinctMonthsReq.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>

          {/* BULAN APPLY */}
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-bold tracking-wider uppercase text-[var(--text-muted)]">Bulan Apply</span>
            <select
              value={monthApplyFilter}
              onChange={(e) => {
                setMonthApplyFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="h-8 px-2 rounded-md text-xs border focus:outline-none w-full bg-[var(--bg-secondary)] border-[var(--border-primary)] text-[var(--text-primary)] font-medium"
            >
              <option value="ALL">Semua Bulan</option>
              {distinctMonthsApply.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Grouped Segmented Chip Filters */}
        <div className="space-y-2 pt-1 border-t border-[var(--border-secondary)] text-xs">
          {/* Row A: Excellence & Difficulty */}
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            {/* Excellence */}
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold tracking-wider uppercase text-[var(--text-muted)] shrink-0 w-20">Excellence:</span>
              <div className="flex flex-wrap items-center gap-1">
                {(['ALL', 'Excellence', 'Good', 'Bad'] as const).map((opt) => (
                  <button
                    key={opt}
                    onClick={() => {
                      setExcellenceFilter(opt);
                      setCurrentPage(1);
                    }}
                    className={`px-2.5 py-0.5 rounded text-[11px] font-medium transition-all ${
                      excellenceFilter === opt
                        ? 'bg-purple-600 text-white font-semibold shadow-xs border border-purple-600'
                        : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] border border-[var(--border-primary)] shadow-xs'
                    }`}
                  >
                    {opt === 'ALL' ? `Semua (${data?.designRecords.length || 0})` : opt}
                  </button>
                ))}
              </div>
            </div>

            {/* Difficulty */}
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold tracking-wider uppercase text-[var(--text-muted)] shrink-0">Difficulty:</span>
              <div className="flex flex-wrap items-center gap-1">
                {(['ALL', 'Low', 'Medium', 'High'] as const).map((opt) => (
                  <button
                    key={opt}
                    onClick={() => {
                      setDifficultyFilter(opt);
                      setCurrentPage(1);
                    }}
                    className={`px-2.5 py-0.5 rounded text-[11px] font-medium transition-all ${
                      difficultyFilter === opt
                        ? 'bg-purple-600 text-white font-semibold shadow-xs border border-purple-600'
                        : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] border border-[var(--border-primary)] shadow-xs'
                    }`}
                  >
                    {opt === 'ALL' ? 'Semua' : opt}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Row B: Source & Campaign */}
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            {/* Source */}
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold tracking-wider uppercase text-[var(--text-muted)] shrink-0 w-20">Source:</span>
              <div className="flex flex-wrap items-center gap-1">
                {(['ALL', 'Ecommerce', 'Orca'] as const).map((opt) => (
                  <button
                    key={opt}
                    onClick={() => {
                      setSourceFilter(opt);
                      setCurrentPage(1);
                    }}
                    className={`px-2.5 py-0.5 rounded text-[11px] font-medium transition-all ${
                      sourceFilter === opt
                        ? 'bg-purple-600 text-white font-semibold shadow-xs border border-purple-600'
                        : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] border border-[var(--border-primary)] shadow-xs'
                    }`}
                  >
                    {opt === 'ALL' ? 'Semua' : opt}
                  </button>
                ))}
              </div>
            </div>

            {/* Campaign */}
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold tracking-wider uppercase text-[var(--text-muted)] shrink-0">Campaign:</span>
              <div className="flex flex-wrap items-center gap-1">
                {(['ALL', 'PayDay', 'BaU', 'DD', 'Other'] as const).map((opt) => (
                  <button
                    key={opt}
                    onClick={() => {
                      setCampaignFilter(opt);
                      setCurrentPage(1);
                    }}
                    className={`px-2.5 py-0.5 rounded text-[11px] font-medium transition-all ${
                      campaignFilter === opt
                        ? 'bg-purple-600 text-white font-semibold shadow-xs border border-purple-600'
                        : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] border border-[var(--border-primary)] shadow-xs'
                    }`}
                  >
                    {opt === 'ALL' ? 'Semua' : opt}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Row C: Status Mockup & Status (Motion) */}
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            {/* Status Mockup */}
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold tracking-wider uppercase text-[var(--text-muted)] shrink-0 w-20">Status Mockup:</span>
              <div className="flex flex-wrap items-center gap-1">
                {(['ALL', 'Done', 'On Progress', 'Waiting', 'Blocked'] as const).map((opt) => (
                  <button
                    key={opt}
                    onClick={() => {
                      setStatusMockupFilter(opt);
                      setCurrentPage(1);
                    }}
                    className={`px-2.5 py-0.5 rounded text-[11px] font-medium transition-all ${
                      statusMockupFilter === opt
                        ? 'bg-purple-600 text-white font-semibold shadow-xs border border-purple-600'
                        : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] border border-[var(--border-primary)] shadow-xs'
                    }`}
                  >
                    {opt === 'ALL' ? 'Semua' : opt}
                  </button>
                ))}
              </div>
            </div>

            {/* Status (Motion) */}
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold tracking-wider uppercase text-[var(--text-muted)] shrink-0">Status OP:</span>
              <div className="flex flex-wrap items-center gap-1">
                {(['ALL', 'active', 'upcoming', 'ended'] as const).map((opt) => (
                  <button
                    key={opt}
                    onClick={() => {
                      setStatusOpFilter(opt);
                      setCurrentPage(1);
                    }}
                    className={`px-2.5 py-0.5 rounded text-[11px] font-medium transition-all ${
                      statusOpFilter === opt
                        ? 'bg-purple-600 text-white font-semibold shadow-xs border border-purple-600'
                        : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] border border-[var(--border-primary)] shadow-xs'
                    }`}
                  >
                    {opt === 'ALL'
                      ? 'Semua'
                      : opt === 'active'
                      ? 'Aktif'
                      : opt === 'upcoming'
                      ? 'Akan Datang'
                      : 'Selesai'}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* --- TABS --- */}
      <div className="flex items-center gap-2 border-b pb-1" style={{ borderColor: 'var(--border-primary)' }}>
        <button
          onClick={() => handleTabChange('by-design')}
          className={`flex items-center gap-2 px-4 py-2 rounded-t-lg text-sm font-semibold transition-all border-b-2 ${
            activeTab === 'by-design'
              ? 'border-purple-600 text-purple-700 dark:text-purple-400 bg-purple-50 dark:bg-purple-950/30'
              : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]'
          }`}
        >
          <Layers className="w-4 h-4" />
          <span>By Design</span>
          <span
            className="ml-1 px-1.5 py-0.2 rounded-full text-xs font-semibold border"
            style={{
              background: 'var(--bg-tertiary)',
              borderColor: 'var(--border-primary)',
              color: 'var(--text-secondary)',
            }}
          >
            {filteredDesignRecords.length}
          </span>
        </button>

        <button
          onClick={() => handleTabChange('by-strategic')}
          className={`flex items-center gap-2 px-4 py-2 rounded-t-lg text-sm font-semibold transition-all border-b-2 ${
            activeTab === 'by-strategic'
              ? 'border-purple-600 text-purple-700 dark:text-purple-400 bg-purple-50 dark:bg-purple-950/30'
              : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]'
          }`}
        >
          <Compass className="w-4 h-4" />
          <span>By Strategic</span>
          <span
            className="ml-1 px-1.5 py-0.2 rounded-full text-xs font-semibold border"
            style={{
              background: 'var(--bg-tertiary)',
              borderColor: 'var(--border-primary)',
              color: 'var(--text-secondary)',
            }}
          >
            {filteredStrategicRecords.length}
          </span>
        </button>

        <button
          onClick={() => handleTabChange('by-motion')}
          className={`flex items-center gap-2 px-4 py-2 rounded-t-lg text-sm font-semibold transition-all border-b-2 ${
            activeTab === 'by-motion'
              ? 'border-purple-600 text-purple-700 dark:text-purple-400 bg-purple-50 dark:bg-purple-950/30'
              : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]'
          }`}
        >
          <Film className="w-4 h-4" />
          <span>By Motion to OP</span>
          <span
            className="ml-1 px-1.5 py-0.2 rounded-full text-xs font-semibold border"
            style={{
              background: 'var(--bg-tertiary)',
              borderColor: 'var(--border-primary)',
              color: 'var(--text-secondary)',
            }}
          >
            {filteredMotionRecords.length}
          </span>
        </button>
      </div>

      {/* --- DATA TABLE --- */}
      <div
        className="rounded-xl border overflow-hidden shadow-sm"
        style={{ background: 'var(--bg-card)', borderColor: 'var(--border-primary)' }}
      >
        <div className="overflow-x-auto">
          {isLoading ? (
            <div className="py-20 flex flex-col items-center justify-center space-y-3">
              <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
              <p className="text-xs text-zinc-400">Mengambil data read-only dari Google Sheets...</p>
            </div>
          ) : paginatedRecords.length === 0 ? (
            <div className="py-16 text-center space-y-2">
              <AlertCircle className="w-8 h-8 text-zinc-500 mx-auto" />
              <p className="text-sm font-medium text-zinc-300">Tidak ada data yang cocok dengan filter aktif</p>
              <p className="text-xs text-zinc-500">Coba ubah filter atau klik Reset Filter di atas.</p>
            </div>
          ) : activeTab === 'by-motion' ? (
            /* TAB: BY MOTION TO OP */
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b text-[11px] font-bold uppercase tracking-wider" style={{ background: 'var(--bg-tertiary)', borderColor: 'var(--border-primary)', color: 'var(--text-secondary)' }}>
                  <th className="py-3 px-3 cursor-pointer hover:text-[var(--text-primary)] transition-colors" onClick={() => handleSort('activeStatus')}>
                    <div className="flex items-center gap-1">STATUS {sortKey === 'activeStatus' && (sortDirection === 'asc' ? <ArrowUp className="w-3 h-3 text-purple-600 dark:text-purple-400" /> : <ArrowDown className="w-3 h-3 text-purple-600 dark:text-purple-400" />)}</div>
                  </th>
                  <th className="py-3 px-3 cursor-pointer hover:text-[var(--text-primary)] transition-colors" onClick={() => handleSort('namaAset')}>
                    <div className="flex items-center gap-1">NAMA ASET {sortKey === 'namaAset' && (sortDirection === 'asc' ? <ArrowUp className="w-3 h-3 text-purple-600 dark:text-purple-400" /> : <ArrowDown className="w-3 h-3 text-purple-600 dark:text-purple-400" />)}</div>
                  </th>
                  <th className="py-3 px-3 cursor-pointer hover:text-[var(--text-primary)] transition-colors" onClick={() => handleSort('brand')}>
                    <div className="flex items-center gap-1">BRAND {sortKey === 'brand' && (sortDirection === 'asc' ? <ArrowUp className="w-3 h-3 text-purple-600 dark:text-purple-400" /> : <ArrowDown className="w-3 h-3 text-purple-600 dark:text-purple-400" />)}</div>
                  </th>
                  <th className="py-3 px-3">PLATFORM</th>
                  <th className="py-3 px-3">TIPE</th>
                  <th className="py-3 px-3">CAMPAIGN</th>
                  <th className="py-3 px-3 cursor-pointer hover:text-[var(--text-primary)] transition-colors" onClick={() => handleSort('periodeMulai')}>
                    <div className="flex items-center gap-1">PERIODE MULAI {sortKey === 'periodeMulai' && (sortDirection === 'asc' ? <ArrowUp className="w-3 h-3 text-purple-600 dark:text-purple-400" /> : <ArrowDown className="w-3 h-3 text-purple-600 dark:text-purple-400" />)}</div>
                  </th>
                  <th className="py-3 px-3">PERIODE SELESAI</th>
                  <th className="py-3 px-3">JAM TAYANG</th>
                  <th className="py-3 px-3">MOTION PIC</th>
                  <th className="py-3 px-3">DIFFICULTY</th>
                  <th className="py-3 px-3">STATUS MOCKUP</th>
                  <th className="py-3 px-3">FILE</th>
                  <th className="py-3 px-3">CATATAN</th>
                  <th className="py-3 px-3">STUDIO</th>
                </tr>
              </thead>
              <tbody className="divide-y" style={{ borderColor: 'var(--border-secondary)' }}>
                {(paginatedRecords as CampaignMotionRecord[]).map((row) => {
                  const statusInfo = getActiveStatusBadge(row.activeStatus);
                  const isDone = row.statusMotion.toLowerCase().includes('done') || row.statusMotion.toLowerCase().includes('ready') || row.statusMotion.toLowerCase().includes('selesai');

                  return (
                    <tr
                      key={row.id}
                      className={`hover:bg-[var(--bg-hover)] transition-colors ${
                        isDone ? 'border-l-2 border-l-emerald-500' : ''
                      }`}
                    >
                      {/* Active Status */}
                      <td className="py-3 px-3">
                        <span className={`px-2 py-0.5 rounded text-[11px] font-semibold border ${statusInfo.className}`}>
                          {statusInfo.label}
                        </span>
                      </td>

                      {/* Nama Aset */}
                      <td className="py-3 px-3 font-semibold text-xs" style={{ color: 'var(--text-primary)' }}>
                        <span>{row.namaAset}</span>
                      </td>

                      {/* Brand */}
                      <td className="py-3 px-3">
                        <span
                          className="px-2 py-0.5 rounded text-[11px] font-semibold border"
                          style={{
                            background: 'var(--bg-secondary)',
                            borderColor: 'var(--border-primary)',
                            color: 'var(--text-primary)',
                          }}
                        >
                          {row.brand}
                        </span>
                      </td>

                      {/* Platform */}
                      <td className="py-3 px-3 font-medium" style={{ color: 'var(--text-secondary)' }}>{row.platform || '-'}</td>

                      {/* Tipe */}
                      <td className="py-3 px-3 font-medium" style={{ color: 'var(--text-secondary)' }}>{row.tipe || '-'}</td>

                      {/* Campaign */}
                      <td className="py-3 px-3 font-semibold" style={{ color: 'var(--text-primary)' }}>{row.typeOfCampaign || '-'}</td>

                      {/* Periode Mulai */}
                      <td className="py-3 px-3 whitespace-nowrap font-medium" style={{ color: 'var(--text-secondary)' }}>{formatReadableDate(row.periodeMulai)}</td>

                      {/* Periode Selesai */}
                      <td className="py-3 px-3 whitespace-nowrap font-medium" style={{ color: 'var(--text-secondary)' }}>{formatReadableDate(row.periodeSelesai)}</td>

                      {/* Jam Tayang */}
                      <td className="py-3 px-3 font-semibold" style={{ color: 'var(--text-primary)' }}>{row.jamTayang || '-'}</td>

                      {/* Motion PIC */}
                      <td className="py-3 px-3 font-semibold" style={{ color: 'var(--text-primary)' }}>{row.motionPIC || '-'}</td>

                      {/* Difficulty */}
                      <td className="py-3 px-3 font-medium" style={{ color: 'var(--text-secondary)' }}>{row.complexity || row.motionDifficulty || '-'}</td>

                      {/* Status Mockup */}
                      <td className="py-3 px-3">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${getStatusBadge(row.statusMotion)}`}>
                          {row.statusMotion || '-'}
                        </span>
                      </td>

                      {/* File */}
                      <td className="py-3 px-3">
                        {row.linkMotion ? (
                          <button
                            onClick={() => handleOpenAssetUrl(row.linkMotion)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 dark:bg-blue-950/50 dark:text-blue-300 dark:border-blue-800/60 dark:hover:bg-blue-900/50 transition-colors font-semibold text-[11px] shadow-xs"
                          >
                            <ExternalLink className="w-3 h-3" />
                            <span>Buka</span>
                          </button>
                        ) : (
                          <span style={{ color: 'var(--text-muted)' }}>-</span>
                        )}
                      </td>

                      {/* Catatan */}
                      <td className="py-3 px-3 max-w-xs truncate font-medium" style={{ color: 'var(--text-secondary)' }} title={row.catatan}>
                        {row.catatan || '-'}
                      </td>

                      {/* Studio */}
                      <td className="py-3 px-3">
                        <span
                          className="px-2 py-0.5 rounded text-[11px] font-medium border"
                          style={{
                            background: 'var(--bg-tertiary)',
                            borderColor: 'var(--border-primary)',
                            color: 'var(--text-secondary)',
                          }}
                        >
                          {row.studio || '-'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : activeTab === 'by-design' ? (
            /* TAB: BY DESIGN */
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b text-[11px] font-bold uppercase tracking-wider" style={{ background: 'var(--bg-tertiary)', borderColor: 'var(--border-primary)', color: 'var(--text-secondary)' }}>
                  <th className="py-3 px-3">MONTH</th>
                  <th className="py-3 px-3 cursor-pointer hover:text-[var(--text-primary)] transition-colors" onClick={() => handleSort('reqDate')}>
                    <div className="flex items-center gap-1">REQ. DATE {sortKey === 'reqDate' && (sortDirection === 'asc' ? <ArrowUp className="w-3 h-3 text-purple-600 dark:text-purple-400" /> : <ArrowDown className="w-3 h-3 text-purple-600 dark:text-purple-400" />)}</div>
                  </th>
                  <th className="py-3 px-3 cursor-pointer hover:text-[var(--text-primary)] transition-colors" onClick={() => handleSort('brand')}>
                    <div className="flex items-center gap-1">BRAND {sortKey === 'brand' && (sortDirection === 'asc' ? <ArrowUp className="w-3 h-3 text-purple-600 dark:text-purple-400" /> : <ArrowDown className="w-3 h-3 text-purple-600 dark:text-purple-400" />)}</div>
                  </th>
                  <th className="py-3 px-3">DESIGN PIC</th>
                  <th className="py-3 px-3">TYPE OF CONTENT</th>
                  <th className="py-3 px-3">SOURCE</th>
                  <th className="py-3 px-3 text-center">REQ. QTY</th>
                  <th className="py-3 px-3 text-center">OUTPUT QTY</th>
                  <th className="py-3 px-3">DUE DATE</th>
                  <th className="py-3 px-3">SUBMISSION</th>
                  <th className="py-3 px-3">SLA</th>
                  <th className="py-3 px-3">EXCELLENCE</th>
                  <th className="py-3 px-3">DIFFICULTY</th>
                  <th className="py-3 px-3">STATUS</th>
                  <th className="py-3 px-3">FINAL ASSET NAME</th>
                  <th className="py-3 px-3">REMARK</th>
                </tr>
              </thead>
              <tbody className="divide-y" style={{ borderColor: 'var(--border-secondary)' }}>
                {(paginatedRecords as CampaignDesignRecord[]).map((row) => {
                  const isDone = row.statusDesign.toLowerCase().includes('done') || row.statusDesign.toLowerCase().includes('selesai');

                  return (
                    <tr
                      key={row.id}
                      className={`hover:bg-[var(--bg-hover)] transition-colors ${
                        isDone ? 'border-l-2 border-l-emerald-500' : ''
                      }`}
                    >
                      <td className="py-3 px-3 font-medium" style={{ color: 'var(--text-secondary)' }}>{row.monthRequest || '-'}</td>
                      <td className="py-3 px-3 whitespace-nowrap font-medium" style={{ color: 'var(--text-primary)' }}>{row.reqDate || '-'}</td>
                      <td className="py-3 px-3">
                        <span
                          className="px-2 py-0.5 rounded text-[11px] font-semibold border"
                          style={{
                            background: 'var(--bg-secondary)',
                            borderColor: 'var(--border-primary)',
                            color: 'var(--text-primary)',
                          }}
                        >
                          {row.brand}
                        </span>
                      </td>
                      <td className="py-3 px-3 font-semibold" style={{ color: 'var(--text-primary)' }}>{row.designPIC || '-'}</td>
                      <td className="py-3 px-3 font-medium" style={{ color: 'var(--text-secondary)' }}>{row.typeOfContent || '-'}</td>
                      <td className="py-3 px-3">
                        <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-purple-100 text-purple-900 border border-purple-300 dark:bg-purple-950/50 dark:text-purple-300 dark:border-purple-800/60">
                          {row.taksSource || '-'}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-center font-medium" style={{ color: 'var(--text-secondary)' }}>{row.reqQty || '1'}</td>
                      <td className="py-3 px-3 text-center font-medium" style={{ color: 'var(--text-secondary)' }}>{row.outputQty || '1'}</td>
                      <td className="py-3 px-3 whitespace-nowrap font-medium" style={{ color: 'var(--text-secondary)' }}>{formatReadableDate(row.dueDate)}</td>
                      <td className="py-3 px-3 whitespace-nowrap font-medium" style={{ color: 'var(--text-secondary)' }}>{formatReadableDate(row.submissionDate)}</td>
                      <td className="py-3 px-3 font-semibold" style={{ color: 'var(--text-primary)' }}>{row.workingDay || '-'}</td>
                      <td className="py-3 px-3">
                        {row.operationalExcellence ? (
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${
                              row.operationalExcellence === 'Excellence'
                                ? 'bg-emerald-100 text-emerald-900 border-emerald-300 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-700/60'
                                : row.operationalExcellence === 'Good'
                                ? 'bg-blue-100 text-blue-900 border-blue-300 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-700/60'
                                : 'bg-rose-100 text-rose-900 border-rose-300 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-700/60'
                            }`}
                          >
                            {row.operationalExcellence}
                          </span>
                        ) : (
                          <span style={{ color: 'var(--text-muted)' }}>-</span>
                        )}
                      </td>
                      <td className="py-3 px-3 font-medium" style={{ color: 'var(--text-secondary)' }}>{row.designDifficulty || '-'}</td>
                      <td className="py-3 px-3">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${getStatusBadge(row.statusDesign)}`}>
                          {row.statusDesign || '-'}
                        </span>
                      </td>
                      <td className="py-3 px-3 font-mono text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>{row.finalAssetName || '-'}</td>
                      <td className="py-3 px-3 max-w-xs truncate font-medium" style={{ color: 'var(--text-secondary)' }} title={row.remark}>
                        {row.remark || '-'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            /* TAB: BY STRATEGIC */
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b text-[11px] font-bold uppercase tracking-wider" style={{ background: 'var(--bg-tertiary)', borderColor: 'var(--border-primary)', color: 'var(--text-secondary)' }}>
                  <th className="py-3 px-3">MONTH</th>
                  <th className="py-3 px-3 cursor-pointer hover:text-[var(--text-primary)] transition-colors" onClick={() => handleSort('reqDate')}>
                    <div className="flex items-center gap-1">REQ. DATE {sortKey === 'reqDate' && (sortDirection === 'asc' ? <ArrowUp className="w-3 h-3 text-purple-600 dark:text-purple-400" /> : <ArrowDown className="w-3 h-3 text-purple-600 dark:text-purple-400" />)}</div>
                  </th>
                  <th className="py-3 px-3 cursor-pointer hover:text-[var(--text-primary)] transition-colors" onClick={() => handleSort('brand')}>
                    <div className="flex items-center gap-1">BRAND {sortKey === 'brand' && (sortDirection === 'asc' ? <ArrowUp className="w-3 h-3 text-purple-600 dark:text-purple-400" /> : <ArrowDown className="w-3 h-3 text-purple-600 dark:text-purple-400" />)}</div>
                  </th>
                  <th className="py-3 px-3">CAMPAIGN</th>
                  <th className="py-3 px-3">WITH CONCEPT</th>
                  <th className="py-3 px-3">STRAT PIC</th>
                  <th className="py-3 px-3 text-center">REVISION</th>
                  <th className="py-3 px-3">STATUS</th>
                  <th className="py-3 px-3">REMARK</th>
                </tr>
              </thead>
              <tbody className="divide-y" style={{ borderColor: 'var(--border-secondary)' }}>
                {(paginatedRecords as CampaignDesignRecord[]).map((row) => {
                  const isDone = row.statusStrat.toLowerCase().includes('done') || row.statusStrat.toLowerCase().includes('selesai');

                  return (
                    <tr
                      key={row.id}
                      className={`hover:bg-[var(--bg-hover)] transition-colors ${
                        isDone ? 'border-l-2 border-l-emerald-500' : ''
                      }`}
                    >
                      <td className="py-3 px-3 font-medium" style={{ color: 'var(--text-secondary)' }}>{row.monthRequest || '-'}</td>
                      <td className="py-3 px-3 whitespace-nowrap font-medium" style={{ color: 'var(--text-primary)' }}>{row.reqDate || '-'}</td>
                      <td className="py-3 px-3">
                        <span
                          className="px-2 py-0.5 rounded text-[11px] font-semibold border"
                          style={{
                            background: 'var(--bg-secondary)',
                            borderColor: 'var(--border-primary)',
                            color: 'var(--text-primary)',
                          }}
                        >
                          {row.brand}
                        </span>
                      </td>
                      <td className="py-3 px-3 font-semibold" style={{ color: 'var(--text-primary)' }}>{row.campaign || '-'}</td>
                      <td className="py-3 px-3 font-medium" style={{ color: 'var(--text-secondary)' }}>{row.withStrategic || '-'}</td>
                      <td className="py-3 px-3 font-semibold text-purple-700 dark:text-purple-400">{row.stratPIC || '-'}</td>
                      <td className="py-3 px-3 text-center font-medium" style={{ color: 'var(--text-secondary)' }}>{row.stratRevision || '-'}</td>
                      <td className="py-3 px-3">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${getStatusBadge(row.statusStrat)}`}>
                          {row.statusStrat || '-'}
                        </span>
                      </td>
                      <td className="py-3 px-3 max-w-sm truncate font-medium" style={{ color: 'var(--text-secondary)' }} title={row.remark}>
                        {row.remark || '-'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* --- PAGINATION & COUNTERS --- */}
        {!isLoading && sortedRecords.length > 0 && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 border-t text-xs" style={{ borderColor: 'var(--border-primary)' }}>
            <div style={{ color: 'var(--text-secondary)' }}>
              Menampilkan {(currentPage - 1) * pageSize + 1} -{' '}
              {Math.min(currentPage * pageSize, sortedRecords.length)} dari{' '}
              <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>{sortedRecords.length}</span> request
            </div>

            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5">
                <span style={{ color: 'var(--text-muted)' }}>Baris per halaman:</span>
                <select
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setCurrentPage(1);
                  }}
                  className="px-2 py-1 rounded text-xs border focus:outline-none font-medium"
                  style={{
                    background: 'var(--bg-secondary)',
                    borderColor: 'var(--border-primary)',
                    color: 'var(--text-primary)',
                  }}
                >
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
              </div>

              <div className="flex items-center gap-1">
                <button
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="p-1.5 rounded border disabled:opacity-40 hover:bg-[var(--bg-hover)] transition-colors"
                  style={{ borderColor: 'var(--border-primary)', color: 'var(--text-primary)' }}
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="px-2 font-semibold" style={{ color: 'var(--text-primary)' }}>
                  {currentPage} / {totalPages}
                </span>
                <button
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="p-1.5 rounded border disabled:opacity-40 hover:bg-[var(--bg-hover)] transition-colors"
                  style={{ borderColor: 'var(--border-primary)', color: 'var(--text-primary)' }}
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* --- REFERENCE DOCUMENTATION SECTION --- */}
      <div className="space-y-4 pt-4 border-t" style={{ borderColor: 'var(--border-primary)' }}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
            <Info className="w-4 h-4 text-purple-600 dark:text-purple-400" />
            <span>Dokumentasi Aturan &amp; Mapping Data</span>
          </div>
          <button
            onClick={() => setShowDocModal(true)}
            className="text-xs text-purple-600 dark:text-purple-400 hover:text-purple-700 dark:hover:text-purple-300 font-medium flex items-center gap-1"
          >
            <span>Buka Selengkapnya</span>
            <ExternalLink className="w-3 h-3" />
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
          <div className="p-3 rounded-lg border shadow-xs" style={{ background: 'var(--bg-card)', borderColor: 'var(--border-primary)' }}>
            <div className="font-semibold mb-1" style={{ color: 'var(--text-primary)' }}># Tab Segregation</div>
            <p className="leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
              <strong>By Design</strong> dan <strong>By Strategic</strong> menampilkan request dari tab sheet 2026 (Design/Strategic).
              <strong> By Motion to OP</strong> bersumber dari tab terpisah (Motion Status) untuk operasional live streaming mockup.
            </p>
          </div>

          <div className="p-3 rounded-lg border shadow-xs" style={{ background: 'var(--bg-card)', borderColor: 'var(--border-primary)' }}>
            <div className="font-semibold mb-1" style={{ color: 'var(--text-primary)' }}># Status Color Coding</div>
            <p className="leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
              Status diwarnai otomatis: Hijau (Done / Selesai / Ready), Biru (On Progress), Kuning (Waiting / Approval), Merah (Blocked / Issue). Baris selesai ditandai border hijau.
            </p>
          </div>

          <div className="p-3 rounded-lg border shadow-xs" style={{ background: 'var(--bg-card)', borderColor: 'var(--border-primary)' }}>
            <div className="font-semibold mb-1" style={{ color: 'var(--text-primary)' }}># Operational Excellence</div>
            <p className="leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
              Stat card ringkasan di atas menghitung klasifikasi Excellence, Good, dan Bad secara aktual dari sheet tanpa penetapan otomatis sepihak.
            </p>
          </div>

          <div className="p-3 rounded-lg border shadow-xs" style={{ background: 'var(--bg-card)', borderColor: 'var(--border-primary)' }}>
            <div className="font-semibold mb-1" style={{ color: 'var(--text-primary)' }}># Setup Sheets &amp; Read-Only Guarantee</div>
            <p className="leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
              Integrasi Google Sheets berjalan 100% <strong>Read-Only</strong> via server adapter. Tidak ada izin write, tidak ada perubahan sel atau baris spreadsheet.
            </p>
          </div>
        </div>
      </div>

      {/* --- DOCUMENTATION MODAL --- */}
      {showDocModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in">
          <div
            className="w-full max-w-2xl max-h-[85vh] rounded-2xl border shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95"
            style={{ background: 'var(--bg-card)', borderColor: 'var(--border-primary)' }}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between p-4 border-b" style={{ borderColor: 'var(--border-primary)' }}>
              <div className="flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                <h3 className="font-bold text-base" style={{ color: 'var(--text-primary)' }}>
                  Dokumentasi Campaign Usage Management
                </h3>
              </div>
              <button
                onClick={() => setShowDocModal(false)}
                className="p-1 rounded-md hover:bg-[var(--bg-hover)] transition-colors"
                style={{ color: 'var(--text-muted)' }}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 overflow-y-auto space-y-4 text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
              <div className="space-y-1">
                <h4 className="font-bold text-sm" style={{ color: 'var(--text-primary)' }}>1. Arsitektur &amp; Sumber Data</h4>
                <p>
                  Modul ini mengintegrasikan data permohonan aset dan jadwal penayangan mockup dari Google Sheets spreadsheet ID <code>1aXZ2STMDwPa-zFeZj37aa_Ko4-IE5WYzIKKe3EMm8rs</code>.
                  Sistem beroperasi dalam mode <strong>STRICTLY READ-ONLY</strong>. Tidak ada sel, baris, maupun formula yang diedit oleh ERP.
                </p>
              </div>

              <div className="space-y-1">
                <h4 className="font-bold text-sm" style={{ color: 'var(--text-primary)' }}>2. Tiga Tab Tampilan</h4>
                <ul className="list-disc pl-4 space-y-1">
                  <li>
                    <strong>By Design:</strong> Menampilkan permohonan desain grafis, quantity, SLA, tanggal due date, status pengerjaan, dan klasifikasi kesulitan.
                  </li>
                  <li>
                    <strong>By Strategic:</strong> Khusus menyaring request yang membutuhkan konsep strategis (With Strategic Concept = Yes), PIC Strategic, dan catatan revisi strategi.
                  </li>
                  <li>
                    <strong>By Motion to OP:</strong> Mengambil dari tab <em>Motion Status</em> yang memetakan aset animasi mockup siap tayang untuk operator live streaming (jadwal penayangan, platform TikTok/Shopee, link Google Drive aman, dan studio).
                  </li>
                </ul>
              </div>

              <div className="space-y-1">
                <h4 className="font-bold text-sm" style={{ color: 'var(--text-primary)' }}>3. Kartu Ringkasan (Excellence, Good, Bad)</h4>
                <p>
                  Angka pada kartu merujuk langsung pada kolom <em>Operational Exellence</em>. Nilai tidak dimanipulasi atau di-default secara sepihak menjadi Excellence.
                </p>
              </div>

              <div className="space-y-1">
                <h4 className="font-bold text-sm" style={{ color: 'var(--text-primary)' }}>4. Keamanan Link Aset</h4>
                <p>
                  Semua link file Google Drive dan file eksternal divalidasi dengan fungsi sanitasi URL server &amp; client untuk mencegah skema berbahaya (XSS, javascript:, file://). Tombol &quot;Buka&quot; hanya aktif jika URL sah.
                </p>
              </div>

              <div className="space-y-1">
                <h4 className="font-bold text-sm" style={{ color: 'var(--text-primary)' }}>5. Rencana Sinkronisasi Masa Depan</h4>
                <p>
                  Saat ini penulisan balik request selesai ke Google Sheets belum diaktifkan. Jika di masa depan dibutuhkan fitur write-back dua arah, hal tersebut membutuhkan otorisasi Google Service Account dengan write scope dan persetujuan formal terpisah.
                </p>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t flex justify-end" style={{ borderColor: 'var(--border-primary)' }}>
              <button
                onClick={() => setShowDocModal(false)}
                className="px-4 py-2 rounded-lg text-xs font-semibold text-white bg-purple-600 hover:bg-purple-700 transition-colors shadow-xs"
              >
                Tutup Dokumentasi
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- OUTBOX SYNC MODAL --- */}
      {showOutboxModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in">
          <div
            className="w-full max-w-4xl max-h-[90vh] rounded-2xl border shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95"
            style={{ background: 'var(--bg-card)', borderColor: 'var(--border-primary)' }}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between p-4 border-b" style={{ borderColor: 'var(--border-primary)' }}>
              <div className="flex items-center gap-2">
                <CloudUpload className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                <h3 className="font-bold text-base" style={{ color: 'var(--text-primary)' }}>
                  Antrean Sinkronisasi Real-Time (Google Sheets Outbox)
                </h3>
              </div>
              <button
                onClick={() => setShowOutboxModal(false)}
                className="p-1 rounded-md hover:bg-[var(--bg-hover)] transition-colors"
                style={{ color: 'var(--text-muted)' }}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 overflow-y-auto space-y-5 text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
              {/* Target & Config Info */}
              <div className="p-3.5 rounded-xl border flex flex-col md:flex-row md:items-center justify-between gap-3" style={{ background: 'var(--bg-tertiary)', borderColor: 'var(--border-primary)' }}>
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>Target Spreadsheet:</span>
                    <a
                      href="https://docs.google.com/spreadsheets/d/1zdjgN5v9QOtgkspkNgMbIkejK6N4py1IOtSmnlvG2G4/edit?usp=sharing"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 font-mono text-[11px] font-medium"
                    >
                      1zdjgN5v9QOtgkspkNgMbIkejK6N4py1IOtSmnlvG2G4
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                  <div className="flex items-center gap-2">
                    <span style={{ color: 'var(--text-muted)' }}>Destinasi Tab:</span>
                    <span className="px-1.5 py-0.5 rounded border text-[11px] font-semibold" style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-primary)', color: 'var(--text-primary)' }}>Mockup</span>
                    <span className="px-1.5 py-0.5 rounded border text-[11px] font-semibold" style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-primary)', color: 'var(--text-primary)' }}>By Strategic</span>
                    <span className="px-1.5 py-0.5 rounded border text-[11px] font-semibold" style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-primary)', color: 'var(--text-primary)' }}>Motion</span>
                  </div>
                </div>

                <div>
                  {outboxConfig?.isConfigured ? (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-300 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-700/60 font-medium">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                      Google Service Account Terhubung ({outboxConfig.clientEmail})
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-50 text-amber-800 border border-amber-300 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-700/60 font-medium">
                      <AlertCircle className="w-3.5 h-3.5" />
                      Kredensial Belum Dikonfigurasi di .env.local
                    </span>
                  )}
                </div>
              </div>

              {/* Summary Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3 rounded-xl border flex flex-col justify-between shadow-xs" style={{ background: 'var(--bg-tertiary)', borderColor: 'var(--border-primary)' }}>
                  <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>Total Event Outbox</span>
                  <span className="text-xl font-bold mt-1" style={{ color: 'var(--text-primary)' }}>{outboxSummary?.total || 0}</span>
                </div>
                <div className="p-3 rounded-xl border bg-emerald-50 dark:bg-emerald-950/20 border-emerald-300 dark:border-emerald-800/40 flex flex-col justify-between shadow-xs">
                  <span className="text-emerald-700 dark:text-emerald-400 text-[11px] font-semibold">Berhasil Disinkronkan</span>
                  <span className="text-xl font-bold text-emerald-800 dark:text-emerald-300 mt-1">{outboxSummary?.synced || 0}</span>
                </div>
                <div className="p-3 rounded-xl border bg-blue-50 dark:bg-blue-950/20 border-blue-300 dark:border-blue-800/40 flex flex-col justify-between shadow-xs">
                  <span className="text-blue-700 dark:text-blue-400 text-[11px] font-semibold">Menunggu / Pending</span>
                  <span className="text-xl font-bold text-blue-800 dark:text-blue-300 mt-1">{outboxSummary?.pending || 0}</span>
                </div>
                <div className="p-3 rounded-xl border bg-rose-50 dark:bg-rose-950/20 border-rose-300 dark:border-rose-800/40 flex flex-col justify-between shadow-xs">
                  <span className="text-rose-700 dark:text-rose-400 text-[11px] font-semibold">Gagal (Retrying)</span>
                  <span className="text-xl font-bold text-rose-800 dark:text-rose-300 mt-1">{outboxSummary?.failed || 0}</span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-between pt-2">
                <div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                  {outboxSummary?.lastSyncedAt && (
                    <span>Sinkronisasi terakhir: {formatRelativeTime(outboxSummary.lastSyncedAt)}</span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={fetchOutboxStatus}
                    disabled={isLoadingOutbox}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs hover:bg-[var(--bg-hover)] transition-colors font-medium shadow-xs"
                    style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-primary)', color: 'var(--text-primary)' }}
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isLoadingOutbox ? 'animate-spin' : ''}`} />
                    <span>Muat Ulang</span>
                  </button>
                  <button
                    onClick={handleProcessQueue}
                    disabled={isProcessingQueue}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 transition-colors shadow-xs disabled:opacity-50"
                  >
                    <Send className={`w-3.5 h-3.5 ${isProcessingQueue ? 'animate-spin' : ''}`} />
                    <span>{isProcessingQueue ? 'Memproses...' : 'Proses Antrean Sekarang'}</span>
                  </button>
                </div>
              </div>

              {/* Items Table */}
              <div className="rounded-xl border overflow-hidden shadow-xs" style={{ borderColor: 'var(--border-primary)' }}>
                <div className="max-h-60 overflow-y-auto">
                  <table className="w-full text-left border-collapse text-[11px]">
                    <thead className="sticky top-0 border-b" style={{ background: 'var(--bg-tertiary)', borderColor: 'var(--border-primary)' }}>
                      <tr>
                        <th className="p-2.5 font-semibold" style={{ color: 'var(--text-muted)' }}>Request Code</th>
                        <th className="p-2.5 font-semibold" style={{ color: 'var(--text-muted)' }}>Tab Target</th>
                        <th className="p-2.5 font-semibold" style={{ color: 'var(--text-muted)' }}>Event</th>
                        <th className="p-2.5 font-semibold" style={{ color: 'var(--text-muted)' }}>Status</th>
                        <th className="p-2.5 font-semibold" style={{ color: 'var(--text-muted)' }}>Percobaan</th>
                        <th className="p-2.5 font-semibold" style={{ color: 'var(--text-muted)' }}>Keterangan / Error</th>
                        <th className="p-2.5 font-semibold text-right" style={{ color: 'var(--text-muted)' }}>Aksi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y" style={{ borderColor: 'var(--border-secondary)' }}>
                      {outboxItems.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="p-4 text-center font-medium" style={{ color: 'var(--text-muted)' }}>
                            Belum ada request dalam antrean outbox.
                          </td>
                        </tr>
                      ) : (
                        outboxItems.map((item) => (
                          <tr key={item.id} className="hover:bg-[var(--bg-hover)] transition-colors">
                            <td className="p-2.5 font-mono font-semibold" style={{ color: 'var(--text-primary)' }}>{item.task_code}</td>
                            <td className="p-2.5">
                              <span className="px-1.5 py-0.5 rounded border text-[10px] font-semibold" style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-primary)', color: 'var(--text-primary)' }}>{item.target_tab}</span>
                            </td>
                            <td className="p-2.5" style={{ color: 'var(--text-secondary)' }}>{item.event_type}</td>
                            <td className="p-2.5">
                              <span
                                className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
                                  item.status === 'SYNCED'
                                    ? 'bg-emerald-50 text-emerald-700 border-emerald-300 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-700/60'
                                    : item.status === 'PENDING' || item.status === 'PROCESSING'
                                    ? 'bg-blue-50 text-blue-700 border-blue-300 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-700/60'
                                    : 'bg-rose-50 text-rose-700 border-rose-300 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-700/60'
                                }`}
                              >
                                {item.status}
                              </span>
                            </td>
                            <td className="p-2.5" style={{ color: 'var(--text-secondary)' }}>{item.attempts} / {item.max_attempts}</td>
                            <td className="p-2.5 max-w-xs truncate" style={{ color: 'var(--text-secondary)' }} title={item.error_message || ''}>
                              {item.error_message ? (
                                <span className="text-rose-600 dark:text-rose-400 font-medium">{item.error_message}</span>
                              ) : item.synced_at ? (
                                <span className="text-emerald-600 dark:text-emerald-400 font-medium">Tersinkronisasi {formatRelativeTime(item.synced_at)}</span>
                              ) : (
                                '-'
                              )}
                            </td>
                            <td className="p-2.5 text-right">
                              {item.status === 'FAILED' && (
                                <button
                                  onClick={() => handleRetryItem(item.id)}
                                  className="px-2 py-1 rounded border text-[10px] font-semibold hover:bg-[var(--bg-hover)] transition-colors"
                                  style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-primary)', color: 'var(--text-primary)' }}
                                >
                                  Coba Ulang
                                </button>
                              )}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
