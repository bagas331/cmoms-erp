// ============================================================
// CMOS - Creative & Motion Operations System
// Image Upload Security & Validation Utilities
// ============================================================

export const ALLOWED_IMAGE_MIMES = [
  'image/jpeg',
  'image/png',
  'image/webp'
] as const;

export type AllowedImageMime = typeof ALLOWED_IMAGE_MIMES[number];

export const ALLOWED_IMAGE_EXTS = ['jpg', 'jpeg', 'png', 'webp'] as const;

export const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB per image
export const MAX_SECTION_IMAGES = 10; // Max 10 images per section

export interface ImageValidationResult {
  valid: boolean;
  error?: string;
  cleanName?: string;
  mimeType?: string;
  ext?: string;
}

/**
 * Validates an image file client-side before uploading.
 */
export function validateImageClientSide(file: {
  name: string;
  size: number;
  type?: string;
}): ImageValidationResult {
  const rawName = (file.name || '').trim();
  const ext = (rawName.split('.').pop() || '').toLowerCase();

  // 1. Explicit extension check
  if (!ALLOWED_IMAGE_EXTS.includes(ext as any)) {
    return {
      valid: false,
      error: `Format file .${ext || 'unknown'} tidak didukung. Harap gunakan format JPG, PNG, atau WebP.`
    };
  }

  // 2. MIME type check if present
  const declaredMime = (file.type || '').toLowerCase().trim();
  if (declaredMime && !ALLOWED_IMAGE_MIMES.includes(declaredMime as any)) {
    return {
      valid: false,
      error: `Tipe file ${declaredMime} tidak diizinkan. Hanya file gambar (JPG, PNG, WebP) yang diperbolehkan.`
    };
  }

  // 3. File size check (<= 5MB)
  if (file.size > MAX_IMAGE_SIZE_BYTES) {
    return {
      valid: false,
      error: `Ukuran file melebihi batas maksimal 5 MB (${formatFileSize(file.size)}).`
    };
  }

  // 4. Sanitize file name (remove path traversal and injection risks)
  const cleanBase = rawName
    .replace(/[/\\]/g, '') // remove slashes
    .replace(/\.\.+/g, '.') // remove double dots
    .replace(/[\x00-\x1f\x80-\x9f]/g, '') // remove control chars
    .replace(/[^\w\s.-]/gi, '_') // sanitize unsafe characters
    .trim()
    .slice(0, 80);

  const cleanName = cleanBase || `image_${Date.now()}.${ext}`;

  return {
    valid: true,
    cleanName,
    ext,
    mimeType: declaredMime || (ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg')
  };
}

/**
 * Authoritatively verifies image buffer on server-side using magic byte signatures.
 * Blocks spoofed extensions, executable binaries, and non-image payloads.
 */
export function verifyImageBufferServerSide(
  buffer: Buffer,
  declaredName?: string
): ImageValidationResult {
  if (!buffer || buffer.length === 0) {
    return { valid: false, error: 'File kosong atau tidak terbaca.' };
  }

  if (buffer.length > MAX_IMAGE_SIZE_BYTES) {
    return {
      valid: false,
      error: `Ukuran file (${formatFileSize(buffer.length)}) melebihi batas maksimal 5 MB.`
    };
  }

  // Check Magic Bytes
  // 1. JPEG: FF D8 FF
  const isJpeg =
    buffer.length >= 3 &&
    buffer[0] === 0xFF &&
    buffer[1] === 0xD8 &&
    buffer[2] === 0xFF;

  // 2. PNG: 89 50 4E 47 0D 0A 1A 0A
  const isPng =
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4E &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0D &&
    buffer[5] === 0x0A &&
    buffer[6] === 0x1A &&
    buffer[7] === 0x0A;

  // 3. WebP: RIFF (bytes 0-3: 52 49 46 46) and WEBP (bytes 8-11: 57 45 42 50)
  const isWebp =
    buffer.length >= 12 &&
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50;

  if (!isJpeg && !isPng && !isWebp) {
    return {
      valid: false,
      error: 'File bukan gambar valid (signature binary tidak cocok dengan JPG, PNG, atau WebP).'
    };
  }

  const detectedMime: AllowedImageMime = isJpeg
    ? 'image/jpeg'
    : isPng
    ? 'image/png'
    : 'image/webp';

  const ext = isJpeg ? 'jpg' : isPng ? 'png' : 'webp';

  // Sanitize original filename
  const rawName = (declaredName || '').trim();
  const cleanBase = rawName
    .replace(/[/\\]/g, '')
    .replace(/\.\.+/g, '.')
    .replace(/[\x00-\x1f\x80-\x9f]/g, '')
    .replace(/[^\w\s.-]/gi, '_')
    .trim()
    .slice(0, 60);

  const cleanName = cleanBase ? `${cleanBase.replace(/\.[^/.]+$/, '')}.${ext}` : `image_${Date.now()}.${ext}`;

  return {
    valid: true,
    cleanName,
    mimeType: detectedMime,
    ext
  };
}

/**
 * Formats bytes to human-readable size
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}
