'use client';

import { useRef, useState, useCallback, useEffect } from 'react';
import { usePersistedState } from './use-persistent-state';

export interface UseKanbanScrollOptions {
  storageKey?: string;
  defaultWidthMode?: 'normal' | 'compact';
}

export function useKanbanScroll(options?: UseKanbanScrollOptions) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  
  const [columnWidthMode, setColumnWidthMode] = usePersistedState<'normal' | 'compact'>(
    options?.storageKey || 'cmos_kanban_width_mode',
    options?.defaultWidthMode || 'normal'
  );

  // Check scroll boundary
  const checkScroll = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const threshold = 15;
    setCanScrollLeft(el.scrollLeft > threshold);
    setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - threshold);
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    checkScroll();

    el.addEventListener('scroll', checkScroll, { passive: true });
    window.addEventListener('resize', checkScroll);

    // Initial check after render
    const t = setTimeout(checkScroll, 300);

    return () => {
      clearTimeout(t);
      el.removeEventListener('scroll', checkScroll);
      window.removeEventListener('resize', checkScroll);
    };
  }, [checkScroll]);

  // Scroll smooth by offset
  const scrollBy = useCallback((offset: number) => {
    const el = containerRef.current;
    if (el) {
      el.scrollBy({ left: offset, behavior: 'smooth' });
      setTimeout(checkScroll, 350);
    }
  }, [checkScroll]);

  const scrollLeft = useCallback(() => {
    const step = columnWidthMode === 'compact' ? -280 : -340;
    scrollBy(step);
  }, [scrollBy, columnWidthMode]);

  const scrollRight = useCallback(() => {
    const step = columnWidthMode === 'compact' ? 280 : 340;
    scrollBy(step);
  }, [scrollBy, columnWidthMode]);

  // Jump directly to a column by status ID
  const scrollToColumn = useCallback((columnStatus: string) => {
    const container = containerRef.current;
    if (!container) return;

    const col = container.querySelector(`[data-column-status="${columnStatus}"]`) as HTMLElement | null;
    if (col) {
      col.scrollIntoView({ behavior: 'smooth', inline: 'start', block: 'nearest' });
      setTimeout(checkScroll, 350);
    }
  }, [checkScroll]);

  // Mouse wheel: only scroll horizontally when user deliberately holds Shift
  const handleWheel = useCallback((e: React.WheelEvent<HTMLDivElement>) => {
    if (e.shiftKey && e.deltaY !== 0) {
      const el = containerRef.current;
      if (el) {
        el.scrollLeft += e.deltaY;
        checkScroll();
      }
    }
  }, [checkScroll]);

  // No-op mouse drag handlers to prevent accidental board dragging while moving cursor
  const handleMouseDown = useCallback(() => {}, []);
  const handleMouseMove = useCallback(() => {}, []);
  const handleMouseUp = useCallback(() => {}, []);

  const toggleWidthMode = useCallback(() => {
    setColumnWidthMode(prev => prev === 'normal' ? 'compact' : 'normal');
    setTimeout(checkScroll, 150);
  }, [setColumnWidthMode, checkScroll]);

  return {
    containerRef,
    canScrollLeft,
    canScrollRight,
    scrollLeft,
    scrollRight,
    scrollToColumn,
    handleWheel,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    isDragging: false,
    columnWidthMode,
    setColumnWidthMode,
    toggleWidthMode,
    checkScroll,
  };
}
