// ============================================================
// CMOS - Utility Functions
// ============================================================

/**
 * Generate UUID v4
 */
export function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Generate Task Code (REQ-YYYY-XXXX)
 */
export function generateTaskCode(year: number, sequence: number): string {
  return `REQ-${year}-${String(sequence).padStart(4, '0')}`;
}

/**
 * Format date for display (Indonesian locale) without timezone shifting
 */
export function formatDisplayDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '-';
  if (typeof dateStr === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    const [y, m, d] = dateStr.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    return date.toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  }
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return typeof dateStr === 'string' ? dateStr : '-';
  return date.toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

/**
 * Format datetime for display
 */
export function formatDisplayDateTime(dateStr: string | null | undefined): string {
  if (!dateStr) return '-';
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return typeof dateStr === 'string' ? dateStr : '-';
  return date.toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Format time only for chat bubbles (e.g. "10:23")
 */
export function formatChatTime(dateStr: string | null | undefined): string {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return '';
  return date.toLocaleTimeString('id-ID', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).replace('.', ':');
}

/**
 * Format date divider for chat messages ("Hari ini", "Kemarin", or "7 Okt 2026")
 */
export function formatChatDateDivider(dateStr: string | null | undefined): string {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return '';

  const now = new Date();
  const isToday = 
    date.getDate() === now.getDate() &&
    date.getMonth() === now.getMonth() &&
    date.getFullYear() === now.getFullYear();

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday = 
    date.getDate() === yesterday.getDate() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getFullYear() === yesterday.getFullYear();

  if (isToday) return 'Hari ini';
  if (isYesterday) return 'Kemarin';

  return date.toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  });
}

/**
 * Format relative timestamp for notifications (e.g. "Baru saja", "5 menit lalu", "2 jam lalu", "Kemarin")
 */
export function formatRelativeTime(dateStr: string | null | undefined): string {
  if (!dateStr) return '-';
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return typeof dateStr === 'string' ? dateStr : '-';

  const diffMs = Date.now() - date.getTime();
  if (diffMs < 0) return 'Baru saja';
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHours = Math.floor(diffMin / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSec < 45) return 'Baru saja';
  if (diffMin < 60) return `${diffMin} mnt lalu`;
  if (diffHours < 24) return `${diffHours} jam lalu`;
  if (diffDays === 1) return 'Kemarin';
  if (diffDays < 7) return `${diffDays} hr lalu`;

  return date.toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit'
  });
}

/**
 * Calculate Week of Month (1-5) for a given date in Indonesian context (WIB / UTC+7)
 * Week 1: 1st - 7th
 * Week 2: 8th - 14th
 * Week 3: 15th - 21st
 * Week 4: 22nd - 28th
 * Week 5: 29th - end of month
 */
export function getWeekOfMonth(dateInput: string | Date | null | undefined): number {
  if (!dateInput) return 1;
  const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  if (isNaN(date.getTime())) return 1;
  const day = date.getDate();
  return Math.min(5, Math.ceil(day / 7));
}

/**
 * Get ISO 8601 Week Number (1-53)
 */
export function getISOWeekNumber(dateInput: string | Date | null | undefined): number {
  if (!dateInput) return 1;
  const date = typeof dateInput === 'string' ? new Date(dateInput) : new Date(dateInput.getTime());
  if (isNaN(date.getTime())) return 1;
  
  // Thursday in current week decides the year.
  date.setDate(date.getDate() + 3 - (date.getDay() + 6) % 7);
  // January 4 is always in week 1.
  const week1 = new Date(date.getFullYear(), 0, 4);
  // Adjust to Thursday in week 1 and count number of weeks from date to week1.
  return 1 + Math.round(((date.getTime() - week1.getTime()) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7);
}

/**
 * Get human-readable label for a week of month in Indonesian
 */
export function getWeekRangeLabel(month: number, week: number): string {
  const monthNames = [
    'Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun',
    'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'
  ];
  const mName = monthNames[month - 1] || '';
  switch (week) {
    case 1: return `Minggu 1 (1 - 7 ${mName})`;
    case 2: return `Minggu 2 (8 - 14 ${mName})`;
    case 3: return `Minggu 3 (15 - 21 ${mName})`;
    case 4: return `Minggu 4 (22 - 28 ${mName})`;
    case 5: return `Minggu 5 (29 - 31 ${mName})`;
    default: return `Minggu ${week}`;
  }
}

/**
 * Get current ISO timestamp
 */
export function now(): string {
  return new Date().toISOString();
}

/**
 * Get today's date as YYYY-MM-DD
 */
export function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Get initials from a full name (e.g. "Alfie Rahman" -> "AR")
 */
export function getInitials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

/**
 * Clamp a number between min and max
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * CN utility for conditional class names
 */
export function cn(...classes: (string | boolean | undefined | null)[]): string {
  return classes.filter(Boolean).join(' ');
}

/**
 * Truncate text with ellipsis
 */
export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength) + '...';
}

/**
 * Get month name from month number (1-12)
 */
export function getMonthName(month: number): string {
  const months = [
    'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
    'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
  ];
  return months[month - 1] || '';
}

/**
 * Get current month number (1-12)
 */
export function getCurrentMonth(): number {
  return new Date().getMonth() + 1;
}

/**
 * Get current year
 */
export function getCurrentYear(): number {
  return new Date().getFullYear();
}

/**
 * Debounce a function
 */
export function debounce<T extends (...args: unknown[]) => unknown>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout;
  return (...args: Parameters<T>) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}

/**
 * Sanitize URLs to prevent XSS (blocks javascript:, data:, vbscript:, etc.)
 */
export function sanitizeUrl(url: string | null | undefined, fallback: string = '#'): string {
  if (!url || typeof url !== 'string') return fallback;
  const trimmed = url.trim();
  if (!trimmed) return fallback;

  // Allow safe anchor/relative paths
  if (trimmed === '#' || trimmed.startsWith('/') || trimmed.startsWith('./')) {
    return trimmed;
  }

  try {
    const parsed = new URL(trimmed);
    const protocol = parsed.protocol.toLowerCase();
    // Only permit standard HTTP, HTTPS, or mailto protocols
    if (protocol === 'http:' || protocol === 'https:' || protocol === 'mailto:') {
      return trimmed;
    }
    return fallback;
  } catch {
    // If not a valid absolute URL, check if it's a safe relative path without scheme
    if (/^[a-zA-Z0-9_\-\./]+$/.test(trimmed) && !trimmed.includes(':')) {
      return trimmed;
    }
    return fallback;
  }
}

/**
 * Safe JSON parse with prototype pollution protection
 */
export function safeJsonParse<T>(jsonStr: string | null | undefined, fallback: T): T {
  if (!jsonStr || typeof jsonStr !== 'string') return fallback;
  try {
    const parsed = JSON.parse(jsonStr);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      // Strip dangerous prototype keys
      delete (parsed as any).__proto__;
      delete (parsed as any).constructor;
      delete (parsed as any).prototype;
    }
    return parsed as T;
  } catch {
    return fallback;
  }
}

/**
 * Format user ID / UUID for compact display (e.g. short ID or prefix)
 */
export function formatUserId(id: string | null | undefined): string {
  if (!id) return '-';
  // If it's a UUID or long hash string > 10 chars, shorten to 8 chars
  if (id.length > 10) {
    return id.slice(0, 8);
  }
  return id;
}

/**
 * Whitelist for chat attachments
 */
export const ALLOWED_CHAT_IMAGE_MIMES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/gif'
];

export const ALLOWED_CHAT_VIDEO_MIMES = [
  'video/mp4',
  'video/webm'
];

export const MAX_ATTACHMENT_SIZE_BYTES = 25 * 1024 * 1024; // 25 MB

/**
 * Strictly sanitize chat media URLs (supports safe data URLs & https/http, blocks SVG/HTML/JS)
 */
export function sanitizeChatMediaUrl(url: string | null | undefined): string {
  if (!url || typeof url !== 'string') return '';
  const trimmed = url.trim();
  if (!trimmed) return '';

  // Safe HTTP/HTTPS
  if (trimmed.startsWith('https://') || trimmed.startsWith('http://')) {
    try {
      const parsed = new URL(trimmed);
      if (['http:', 'https:'].includes(parsed.protocol)) {
        return trimmed;
      }
    } catch {
      return '';
    }
  }

  // Safe relative paths
  if (trimmed.startsWith('/')) {
    return trimmed;
  }

  // Safe data URLs with strict MIME whitelist
  if (trimmed.startsWith('data:')) {
    const isAllowedImage = ALLOWED_CHAT_IMAGE_MIMES.some(mime => 
      trimmed.startsWith(`data:${mime};base64,`)
    );
    const isAllowedVideo = ALLOWED_CHAT_VIDEO_MIMES.some(mime => 
      trimmed.startsWith(`data:${mime};base64,`)
    );
    // Explicitly reject data:image/svg+xml and other arbitrary data formats
    if (isAllowedImage || isAllowedVideo) {
      return trimmed;
    }
    return '';
  }

  return '';
}

/**
 * Validate and sanitize chat message text
 */
export function sanitizeChatMessage(text: string | null | undefined): {
  valid: boolean;
  content: string;
  error?: string;
} {
  if (text === null || text === undefined) {
    return { valid: false, content: '', error: 'Pesan tidak boleh kosong' };
  }
  let trimmed = typeof text === 'string' ? text.trim() : '';
  if (!trimmed) {
    return { valid: false, content: '', error: 'Pesan tidak boleh hanya berisi spasi' };
  }
  if (trimmed.length > 2000) {
    return { valid: false, content: '', error: 'Pesan maksimal 2000 karakter' };
  }

  // Strip script tags and dangerous HTML event handlers to protect against stored XSS
  trimmed = trimmed
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/\bon\w+\s*=\s*(?:'[^']*'|"[^"]*"|[^\s>]+)/gi, '')
    .trim();

  if (!trimmed) {
    return { valid: false, content: '', error: 'Pesan mengandung konten tidak valid' };
  }

  return { valid: true, content: trimmed };
}

/**
 * Validate and sanitize attachment metadata
 */
export function validateChatAttachment(file: {
  name?: string;
  type?: string;
  size?: number;
  url?: string;
}): {
  valid: boolean;
  cleanName: string;
  mediaType: 'image' | 'video';
  cleanUrl: string;
  error?: string;
} {
  const fileName = (file.name || '').toLowerCase().trim();
  const fileExt = fileName.split('.').pop() || '';

  // Explicit extension denylist (executables, scripts, vector graphics)
  const FORBIDDEN_EXTS = ['exe', 'bat', 'cmd', 'sh', 'php', 'phtml', 'html', 'htm', 'js', 'vbs', 'svg', 'dll'];
  if (FORBIDDEN_EXTS.includes(fileExt)) {
    return {
      valid: false,
      cleanName: '',
      mediaType: 'image',
      cleanUrl: '',
      error: `Format file .${fileExt} tidak diizinkan demi alasan keamanan.`
    };
  }

  // Determine MIME from file.type, data URL, or file extension
  let resolvedMime = (file.type || '').toLowerCase().trim();
  if (!resolvedMime || resolvedMime === 'image' || resolvedMime === 'video') {
    if (file.url?.startsWith('data:')) {
      const match = file.url.match(/^data:([^;]+);/);
      if (match) resolvedMime = match[1].toLowerCase();
    }
  }

  if (!resolvedMime || resolvedMime === 'image' || resolvedMime === 'video') {
    // Derive from extension
    if (['png'].includes(fileExt)) resolvedMime = 'image/png';
    else if (['jpg', 'jpeg'].includes(fileExt)) resolvedMime = 'image/jpeg';
    else if (['webp'].includes(fileExt)) resolvedMime = 'image/webp';
    else if (['gif'].includes(fileExt)) resolvedMime = 'image/gif';
    else if (['mp4'].includes(fileExt)) resolvedMime = 'video/mp4';
    else if (['webm'].includes(fileExt)) resolvedMime = 'video/webm';
  }

  const isImage = ALLOWED_CHAT_IMAGE_MIMES.includes(resolvedMime);
  const isVideo = ALLOWED_CHAT_VIDEO_MIMES.includes(resolvedMime);

  if (!isImage && !isVideo) {
    return {
      valid: false,
      cleanName: '',
      mediaType: 'image',
      cleanUrl: '',
      error: 'Format lampiran tidak didukung. Harap gunakan gambar (JPG, PNG, WebP, GIF) atau video (MP4, WebM).'
    };
  }

  if (file.size && file.size > MAX_ATTACHMENT_SIZE_BYTES) {
    return {
      valid: false,
      cleanName: '',
      mediaType: isImage ? 'image' : 'video',
      cleanUrl: '',
      error: 'Ukuran file melebihi batas maksimal 25MB.'
    };
  }

  // Sanitize filename to prevent directory traversal and injection
  const rawName = file.name || (isImage ? 'gambar' : 'video');
  const cleanName = rawName
    .replace(/[/\\]/g, '') // remove slashes
    .replace(/\.\.+/g, '.') // remove double dots
    .replace(/[\x00-\x1f\x80-\x9f]/g, '') // remove control chars
    .trim()
    .slice(0, 100);

  const cleanUrl = sanitizeChatMediaUrl(file.url);
  if (file.url && !cleanUrl) {
    return {
      valid: false,
      cleanName: '',
      mediaType: isImage ? 'image' : 'video',
      cleanUrl: '',
      error: 'URL lampiran tidak valid atau tidak aman.'
    };
  }

  return {
    valid: true,
    cleanName: cleanName || 'attachment',
    mediaType: isImage ? 'image' : 'video',
    cleanUrl
  };
}

/**
 * ============================================================
 * KANBAN CARD REDESIGN HELPER UTILITIES
 * ============================================================
 */

export interface DueDateSemantic {
  formattedDate: string;
  badge: 'OVERDUE' | 'TODAY' | 'TOMORROW' | null;
  label: string;
  isOverdue: boolean;
  overdueDays: number;
  status: 'overdue' | 'today' | 'tomorrow' | 'soon' | 'normal' | 'none';
  textClass: string;
  badgeClass: string;
}

/**
 * Get rich semantic status for a task's due date
 */
export function getDueDateSemanticStatus(
  dueDateStr: string | null | undefined,
  isFinished: boolean = false
): DueDateSemantic {
  if (!dueDateStr) {
    return {
      formattedDate: '-',
      badge: null,
      label: '-',
      isOverdue: false,
      overdueDays: 0,
      status: 'none',
      textClass: 'text-[var(--text-muted)]',
      badgeClass: '',
    };
  }

  const formattedDate = formatDisplayDate(dueDateStr);
  if (isFinished) {
    return {
      formattedDate,
      badge: null,
      label: formattedDate,
      isOverdue: false,
      overdueDays: 0,
      status: 'normal',
      textClass: 'text-[var(--text-primary)]',
      badgeClass: '',
    };
  }

  // Parse YYYY-MM-DD or ISO string safely
  let targetDate: Date;
  if (typeof dueDateStr === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dueDateStr)) {
    const [y, m, d] = dueDateStr.split('-').map(Number);
    targetDate = new Date(y, m - 1, d);
  } else {
    targetDate = new Date(dueDateStr);
  }

  if (isNaN(targetDate.getTime())) {
    return {
      formattedDate: dueDateStr,
      badge: null,
      label: dueDateStr,
      isOverdue: false,
      overdueDays: 0,
      status: 'normal',
      textClass: 'text-[var(--text-primary)]',
      badgeClass: '',
    };
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  targetDate.setHours(0, 0, 0, 0);

  const diffTime = targetDate.getTime() - today.getTime();
  const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays < 0) {
    const overdueDays = Math.abs(diffDays);
    return {
      formattedDate,
      badge: 'OVERDUE',
      label: formattedDate,
      isOverdue: true,
      overdueDays,
      status: 'overdue',
      textClass: 'text-rose-500 font-bold',
      badgeClass: 'bg-rose-500/10 text-rose-500 border border-rose-500/20 font-black',
    };
  } else if (diffDays === 0) {
    return {
      formattedDate: 'Hari Ini',
      badge: 'TODAY',
      label: 'Hari Ini',
      isOverdue: false,
      overdueDays: 0,
      status: 'today',
      textClass: 'text-amber-500 font-bold',
      badgeClass: 'bg-amber-500/10 text-amber-500 border border-amber-500/20 font-black',
    };
  } else if (diffDays === 1) {
    return {
      formattedDate: 'Besok',
      badge: 'TOMORROW',
      label: 'Besok',
      isOverdue: false,
      overdueDays: 0,
      status: 'tomorrow',
      textClass: 'text-amber-400 font-semibold',
      badgeClass: 'bg-amber-500/10 text-amber-400 border border-amber-500/20 font-semibold',
    };
  } else if (diffDays <= 3) {
    return {
      formattedDate,
      badge: null,
      label: formattedDate,
      isOverdue: false,
      overdueDays: 0,
      status: 'soon',
      textClass: 'text-[var(--text-primary)] font-semibold',
      badgeClass: '',
    };
  } else {
    return {
      formattedDate,
      badge: null,
      label: formattedDate,
      isOverdue: false,
      overdueDays: 0,
      status: 'normal',
      textClass: 'text-[var(--text-primary)] font-medium',
      badgeClass: '',
    };
  }
}

export interface PriorityDetails {
  level: 'HIGH' | 'MEDIUM' | 'LOW';
  label: string;
  badgeClass: string;
  dotClass: string;
}

/**
 * Resolve priority badge, dot and styling
 */
export function getPriorityDetails(
  priority?: string | null,
  difficulty?: string | null,
  isOverdue?: boolean
): PriorityDetails {
  let level: 'HIGH' | 'MEDIUM' | 'LOW' = 'MEDIUM';

  if (priority) {
    const p = priority.toUpperCase();
    if (p.includes('HIGH')) level = 'HIGH';
    else if (p.includes('LOW')) level = 'LOW';
    else level = 'MEDIUM';
  } else if (isOverdue || difficulty === 'VERY_HARD' || difficulty === 'HARD') {
    level = 'HIGH';
  } else if (difficulty === 'LIGHT') {
    level = 'LOW';
  } else {
    level = 'MEDIUM';
  }

  switch (level) {
    case 'HIGH':
      return {
        level: 'HIGH',
        label: 'HIGH',
        badgeClass: 'bg-rose-500/10 text-rose-500 border-rose-500/20',
        dotClass: 'bg-rose-500',
      };
    case 'LOW':
      return {
        level: 'LOW',
        label: 'LOW',
        badgeClass: 'bg-slate-500/10 text-slate-400 border-slate-500/20',
        dotClass: 'bg-slate-400',
      };
    case 'MEDIUM':
    default:
      return {
        level: 'MEDIUM',
        label: 'MEDIUM',
        badgeClass: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
        dotClass: 'bg-amber-500',
      };
  }
}

/**
 * Format SLA working days vs overdue days cleanly
 */
export function getSLAFormatted(
  slaDays: number | null | undefined,
  isOverdue?: boolean,
  overdueDays?: number
): { text: string; isWarning: boolean; isCalculated: boolean } {
  if (isOverdue && overdueDays && overdueDays > 0) {
    return {
      text: `+${overdueDays}d overdue`,
      isWarning: true,
      isCalculated: true,
    };
  }

  if (slaDays !== null && slaDays !== undefined && !isNaN(slaDays)) {
    return {
      text: `${slaDays} working days`,
      isWarning: false,
      isCalculated: true,
    };
  }

  return {
    text: 'Not calculated',
    isWarning: false,
    isCalculated: false,
  };
}

/**
 * Format request vs output quantity and check for discrepancies
 */
export function getQuantityStatus(reqQty?: number | null, outputQty?: number | null) {
  const req = reqQty || 1;
  const out = outputQty !== null && outputQty !== undefined ? outputQty : req;
  const hasDiscrepancy = out < req && outputQty !== null && outputQty !== undefined;
  const remaining = Math.max(0, req - out);

  return {
    req,
    out,
    display: `${out} / ${req}`,
    hasDiscrepancy,
    remaining,
    label: hasDiscrepancy ? `${out}/${req} (${remaining} remaining)` : `${out}/${req}`
  };
}


