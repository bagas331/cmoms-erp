'use client';

import { useState, useCallback, useEffect } from 'react';

export interface ModalState<T extends string = string, P = any> {
  type: T;
  payload?: P;
}

export interface UseModalManagerOptions {
  lockScroll?: boolean;
  closeOnEscape?: boolean;
  onModalChange?: (current: ModalState | null, previous: ModalState | null) => void;
}

/**
 * Universal Modal Lifecycle Manager for CMOS ERP
 * Guarantees strict mutual exclusion (at most 1 active modal at any time).
 * Prevents modal stacking, orphan backdrops, and state race conditions.
 */
export function useModalManager<T extends string = string, P = any>(
  options: UseModalManagerOptions = { lockScroll: true, closeOnEscape: true }
) {
  const [activeModal, setActiveModal] = useState<ModalState<T, P> | null>(null);

  const openModal = useCallback((type: T, payload?: P) => {
    setActiveModal({ type, payload });
  }, []);

  const closeModal = useCallback(() => {
    setActiveModal(null);
  }, []);

  const switchModal = useCallback((type: T, payload?: P) => {
    // Atomically replaces active modal, ensuring the previous modal is unmounted
    // before the new modal is displayed
    setActiveModal({ type, payload });
  }, []);

  const isOpen = useCallback((type: T) => {
    return activeModal?.type === type;
  }, [activeModal]);

  const getPayload = useCallback(<TP = P>(type: T): TP | undefined => {
    return activeModal?.type === type ? (activeModal.payload as TP) : undefined;
  }, [activeModal]);

  // Body scroll lock management
  useEffect(() => {
    if (!options.lockScroll) return;

    if (activeModal !== null) {
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = originalOverflow || '';
      };
    }
  }, [activeModal, options.lockScroll]);

  // Global ESC key listener for modals
  useEffect(() => {
    if (!options.closeOnEscape) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && activeModal !== null) {
        closeModal();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeModal, closeModal, options.closeOnEscape]);

  return {
    activeModal,
    isOpen,
    getPayload,
    openModal,
    closeModal,
    switchModal,
  };
}
