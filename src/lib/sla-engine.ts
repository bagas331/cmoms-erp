// ============================================================
// CMOMS - SLA & Operational Excellence Engine
// Automated Business Day Calculator
// ============================================================

import { Holiday, OperationalExcellence } from './types';

/**
 * Check if a date falls on a weekend (Saturday or Sunday)
 */
export function isWeekend(date: Date): boolean {
  const day = date.getDay();
  return day === 0 || day === 6;
}

/**
 * Check if a date is a holiday
 */
export function isHoliday(date: Date, holidays: Holiday[]): boolean {
  const dateStr = formatDate(date);
  return holidays.some(h => h.holiday_date === dateStr);
}

/**
 * Format date to YYYY-MM-DD string
 */
export function formatDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Parse a YYYY-MM-DD or ISO date string into a Date object (local timezone)
 */
export function parseDate(dateStr: string): Date {
  if (!dateStr) return new Date(NaN);
  const cleanStr = dateStr.includes('T') ? dateStr.split('T')[0] : dateStr;
  const parts = cleanStr.split('-').map(Number);
  if (parts.length >= 3 && !isNaN(parts[0]) && !isNaN(parts[1]) && !isNaN(parts[2])) {
    return new Date(parts[0], parts[1] - 1, parts[2]);
  }
  return new Date(dateStr);
}

/**
 * Calculate the number of business days between two dates.
 * Excludes weekends (Saturday/Sunday) and holidays from the holiday calendar.
 * Both start and end dates are inclusive in the count only if they are business days,
 * but the standard approach: count working days from start to end.
 */
export function calculateBusinessDays(
  startDateStr: string | null | undefined,
  endDateStr: string | null | undefined,
  holidays: Holiday[]
): number | null {
  if (!startDateStr || !endDateStr) return null;
  
  const startDate = parseDate(startDateStr);
  const endDate = parseDate(endDateStr);

  if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) return null;
  if (endDate < startDate) return 0;

  let count = 0;
  const current = new Date(startDate);

  while (current <= endDate) {
    if (!isWeekend(current) && !isHoliday(current, holidays)) {
      count++;
    }
    current.setDate(current.getDate() + 1);
  }

  // Subtract 1 because we don't count the start date itself
  // (SLA is measured from request day, work starts next day)
  return Math.max(0, count - 1);
}

/**
 * Evaluate Operational Excellence based on SLA working days.
 * - ≤ 3 days → EXCELLENCE
 * - = 4 days → GOOD
 * - > 4 days → BAD
 */
export function evaluateOperationalExcellence(
  workingDaysSpent: number
): OperationalExcellence {
  if (workingDaysSpent <= 3) return 'EXCELLENCE';
  if (workingDaysSpent === 4) return 'GOOD';
  return 'BAD';
}

/**
 * Calculate SLA due date (3 business days from request date)
 */
export function calculateSLADueDate(
  reqDateStr: string,
  holidays: Holiday[],
  slaDays: number = 3
): string {
  const reqDate = parseDate(reqDateStr);
  let businessDaysAdded = 0;
  const current = new Date(reqDate);

  while (businessDaysAdded < slaDays) {
    current.setDate(current.getDate() + 1);
    if (!isWeekend(current) && !isHoliday(current, holidays)) {
      businessDaysAdded++;
    }
  }

  return formatDate(current);
}

/**
 * Check if a task is approaching SLA deadline (H-1)
 */
export function isApproachingDeadline(
  dueDateStr: string,
  holidays: Holiday[]
): boolean {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dueDate = parseDate(dueDateStr);
  
  // Calculate business days between today and due date
  const daysRemaining = calculateBusinessDays(formatDate(today), dueDateStr, holidays);
  
  return (daysRemaining ?? 0) <= 1 && dueDate >= today;
}

/**
 * Check if a task is overdue
 */
export function isOverdue(dueDateStr: string): boolean {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dueDate = parseDate(dueDateStr);
  return dueDate < today;
}

/**
 * Get relative time label
 */
export function getRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
}
