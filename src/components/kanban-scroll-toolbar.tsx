'use client';

import React from 'react';
import { ChevronLeft, ChevronRight, Columns3, ChevronsLeftRight, MousePointer } from 'lucide-react';

export interface KanbanColumnInfo {
  status: string;
  label: string;
  color?: string;
  count?: number;
}

export interface KanbanScrollToolbarProps {
  columns: KanbanColumnInfo[];
  canScrollLeft?: boolean;
  canScrollRight?: boolean;
  onScrollLeft: () => void;
  onScrollRight: () => void;
  onScrollToColumn: (status: string) => void;
  columnWidthMode?: 'normal' | 'compact';
  onToggleWidthMode?: () => void;
  activeStatus?: string;
  showHelpTip?: boolean;
  className?: string;
}

export function KanbanScrollToolbar({
  columns,
  canScrollLeft = true,
  canScrollRight = true,
  onScrollLeft,
  onScrollRight,
  onScrollToColumn,
  columnWidthMode = 'normal',
  onToggleWidthMode,
  activeStatus,
  showHelpTip = true,
  className = '',
}: KanbanScrollToolbarProps) {
  return (
    <div 
      className={`flex flex-wrap items-center justify-between gap-2.5 p-2 px-3 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-primary)] shadow-sm mb-3 select-none text-xs transition-all ${className}`}
    >
      {/* LEFT: Column quick-jump pills */}
      <div className="flex items-center gap-1.5 overflow-x-auto py-0.5 no-scrollbar max-w-full md:max-w-[70%]">
        <span className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider shrink-0 mr-1 hidden sm:inline-flex items-center gap-1">
          <ChevronsLeftRight className="w-3.5 h-3.5" />
          Lompat ke:
        </span>
        <div className="flex items-center gap-1.5 flex-nowrap">
          {columns.map((col) => {
            const isActive = activeStatus === col.status;
            return (
              <button
                key={col.status}
                type="button"
                onClick={() => onScrollToColumn(col.status)}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-all shrink-0 cursor-pointer ${
                  isActive
                    ? 'bg-[var(--accent-blue)] text-white shadow-sm ring-1 ring-[var(--accent-blue)]'
                    : 'bg-[var(--bg-tertiary)] hover:bg-[var(--bg-tertiary)]/80 text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-[var(--border-secondary)]'
                }`}
                title={`Lompat langsung ke kolom ${col.label}`}
              >
                {col.color && (
                  <span
                    className="w-2 h-2 rounded-full shrink-0 shadow-xs"
                    style={{ backgroundColor: col.color }}
                  />
                )}
                <span className="truncate max-w-[110px]">{col.label}</span>
                {typeof col.count === 'number' && (
                  <span 
                    className={`text-[10px] font-bold px-1.5 py-0.2 rounded-full ${
                      isActive 
                        ? 'bg-white/20 text-white' 
                        : 'bg-[var(--bg-secondary)] text-[var(--text-muted)]'
                    }`}
                  >
                    {col.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* RIGHT: Navigation arrows + width mode toggle */}
      <div className="flex items-center gap-2 shrink-0 ml-auto">
        {/* Navigation hint */}
        {showHelpTip && (
          <span 
            className="hidden xl:inline-flex items-center gap-1 text-[11px] text-[var(--text-muted)] px-2 py-0.5 rounded bg-[var(--bg-tertiary)]/50 border border-[var(--border-secondary)]"
            title="Gunakan tombol panah navigasi, tombol kolom, atau Shift + Scroll mouse untuk menggeser board"
          >
            <ChevronsLeftRight className="w-3 h-3 text-[var(--accent-blue)]" />
            <span>Shift + Scroll / Panah</span>
          </span>
        )}

        {/* Column Width Mode Toggle */}
        {onToggleWidthMode && (
          <button
            type="button"
            onClick={onToggleWidthMode}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border transition-all cursor-pointer ${
              columnWidthMode === 'compact'
                ? 'bg-[var(--accent-blue)]/15 border-[var(--accent-blue)] text-[var(--accent-blue)] font-semibold'
                : 'bg-[var(--bg-tertiary)] border-[var(--border-secondary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
            title="Ubah lebar kolom: Normal (320px) vs Kompak (260px) agar muat lebih banyak kolom di layar"
          >
            <Columns3 className="w-3.5 h-3.5" />
            <span>{columnWidthMode === 'compact' ? 'Lebar: Kompak' : 'Lebar: Normal'}</span>
          </button>
        )}

        {/* Scroll Left & Right buttons */}
        <div className="flex items-center gap-1 border-l border-[var(--border-primary)] pl-2">
          <button
            type="button"
            onClick={onScrollLeft}
            disabled={!canScrollLeft}
            className={`p-1.5 rounded-lg border transition-all flex items-center justify-center cursor-pointer ${
              canScrollLeft
                ? 'bg-[var(--bg-tertiary)] hover:bg-[var(--bg-tertiary)]/90 border-[var(--border-secondary)] text-[var(--text-primary)] hover:border-[var(--accent-blue)] active:scale-95'
                : 'bg-[var(--bg-tertiary)]/40 border-transparent text-[var(--text-muted)] opacity-40 cursor-not-allowed'
            }`}
            title="Geser ke kiri (1 kolom)"
            aria-label="Geser ke kiri"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={onScrollRight}
            disabled={!canScrollRight}
            className={`p-1.5 rounded-lg border transition-all flex items-center justify-center cursor-pointer ${
              canScrollRight
                ? 'bg-[var(--bg-tertiary)] hover:bg-[var(--bg-tertiary)]/90 border-[var(--border-secondary)] text-[var(--text-primary)] hover:border-[var(--accent-blue)] active:scale-95'
                : 'bg-[var(--bg-tertiary)]/40 border-transparent text-[var(--text-muted)] opacity-40 cursor-not-allowed'
            }`}
            title="Geser ke kanan (1 kolom)"
            aria-label="Geser ke kanan"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Floating side arrows that sit on the left and right edges of the kanban board container
 */
export function KanbanFloatingArrows({
  canScrollLeft,
  canScrollRight,
  onScrollLeft,
  onScrollRight,
}: {
  canScrollLeft: boolean;
  canScrollRight: boolean;
  onScrollLeft: () => void;
  onScrollRight: () => void;
}) {
  return (
    <>
      {canScrollLeft && (
        <button
          type="button"
          onClick={onScrollLeft}
          className="absolute left-2 top-1/2 -translate-y-1/2 z-20 w-9 h-9 rounded-full bg-[var(--bg-secondary)]/90 hover:bg-[var(--bg-secondary)] text-[var(--text-primary)] border border-[var(--border-primary)] shadow-xl backdrop-blur-sm flex items-center justify-center transition-all hover:scale-110 active:scale-95 cursor-pointer group"
          title="Geser ke kiri"
          aria-label="Geser ke kiri"
        >
          <ChevronLeft className="w-5 h-5 group-hover:-translate-x-0.5 transition-transform" />
        </button>
      )}
      {canScrollRight && (
        <button
          type="button"
          onClick={onScrollRight}
          className="absolute right-2 top-1/2 -translate-y-1/2 z-20 w-9 h-9 rounded-full bg-[var(--bg-secondary)]/90 hover:bg-[var(--bg-secondary)] text-[var(--text-primary)] border border-[var(--border-primary)] shadow-xl backdrop-blur-sm flex items-center justify-center transition-all hover:scale-110 active:scale-95 cursor-pointer group"
          title="Geser ke kanan"
          aria-label="Geser ke kanan"
        >
          <ChevronRight className="w-5 h-5 group-hover:translate-x-0.5 transition-transform" />
        </button>
      )}
    </>
  );
}
