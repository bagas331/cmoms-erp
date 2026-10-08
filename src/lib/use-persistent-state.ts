'use client';

import { useState, useEffect, Dispatch, SetStateAction } from 'react';

export const RESET_FILTERS_EVENT = 'cmos:reset_filters';

/**
 * A custom React hook for persisting component state in sessionStorage.
 * Ensures filters, active tabs, and view modes stay preserved when navigating between dashboard pages,
 * but automatically resets to initial default values when the user switches accounts or logs out.
 */
export function usePersistedState<T>(key: string, initialValue: T): [T, Dispatch<SetStateAction<T>>] {
  const [state, setState] = useState<T>(() => {
    if (typeof window === 'undefined') return initialValue;
    try {
      const item = window.sessionStorage.getItem(key);
      if (item !== null) {
        return JSON.parse(item) as T;
      }
    } catch (err) {
      console.warn(`Error reading persisted state for key "${key}":`, err);
    }
    return initialValue;
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.sessionStorage.setItem(key, JSON.stringify(state));
    } catch (err) {
      console.warn(`Error persisting state for key "${key}":`, err);
    }
  }, [key, state]);

  // Listen for reset events (e.g. on logout, login, or account switch)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleReset = () => {
      setState(initialValue);
    };
    window.addEventListener(RESET_FILTERS_EVENT, handleReset);
    return () => window.removeEventListener(RESET_FILTERS_EVENT, handleReset);
  }, [initialValue]);

  return [state, setState];
}

/**
 * Clears all filter and navigation states persisted in sessionStorage and notifies active hooks.
 * Called when a user logs out, logs in, or switches accounts.
 */
export function clearPersistedFilterState() {
  if (typeof window === 'undefined') return;
  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < window.sessionStorage.length; i++) {
      const k = window.sessionStorage.key(i);
      if (k && (k.startsWith('cmos_') || k.startsWith('cmoms_'))) {
        keysToRemove.push(k);
      }
    }
    keysToRemove.forEach(k => window.sessionStorage.removeItem(k));
    window.dispatchEvent(new Event(RESET_FILTERS_EVENT));
  } catch (err) {
    console.warn('Error clearing persisted filter state:', err);
  }
}
