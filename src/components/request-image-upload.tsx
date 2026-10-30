'use client';

import React, { useState, useRef, useCallback } from 'react';
import { 
  UploadCloud, 
  X, 
  Eye, 
  Trash2, 
  Image as ImageIcon, 
  Loader2, 
  AlertCircle, 
  Maximize2 
} from 'lucide-react';
import { TaskAttachment, AttachmentSection } from '@/lib/types';
import { 
  validateImageClientSide, 
  formatFileSize, 
  MAX_SECTION_IMAGES,
  MAX_IMAGE_SIZE_BYTES 
} from '@/lib/image-upload-utils';

export interface RequestImageUploadProps {
  section?: AttachmentSection;
  sectionTitle?: string;
  title?: string;
  sectionDescription?: string;
  subtitle?: string;
  attachments: TaskAttachment[];
  onChange?: (updatedAttachments: TaskAttachment[]) => void;
  onDirectUpload?: (newAttachment: TaskAttachment) => Promise<void>;
  onDirectDelete?: (attachmentId: string) => Promise<void>;
  readOnly?: boolean;
  maxFiles?: number;
  compact?: boolean;
  headerExtra?: React.ReactNode;
  children?: React.ReactNode;
}

export function RequestImageUpload({
  section = 'brief',
  sectionTitle,
  title,
  sectionDescription,
  subtitle,
  attachments = [],
  onChange,
  onDirectUpload,
  onDirectDelete,
  readOnly = false,
  maxFiles = MAX_SECTION_IMAGES,
  compact = false,
  headerExtra,
  children
}: RequestImageUploadProps) {
  const displayTitle = sectionTitle || title;
  const displayDescription = sectionDescription || subtitle;
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [previewModalUrl, setPreviewModalUrl] = useState<string | null>(null);
  const [previewModalName, setPreviewModalName] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // All attachments for this request
  const sectionAttachments = attachments.filter(a => a.section === section || !a.section);
  const remainingSlots = Math.max(0, maxFiles - sectionAttachments.length);

  const handleFiles = useCallback(async (files: FileList | File[]) => {
    if (readOnly) return;
    setUploadError(null);

    const fileList = Array.from(files);
    if (fileList.length === 0) return;

    if (fileList.length > remainingSlots) {
      setUploadError(
        `Batas tersisa: ${remainingSlots} foto lagi (maksimal ${maxFiles} foto per bagian).`
      );
      return;
    }

    // Client-side validation
    for (const f of fileList) {
      const val = validateImageClientSide({
        name: f.name,
        size: f.size,
        type: f.type
      });
      if (!val.valid) {
        setUploadError(val.error || `File "${f.name}" tidak valid.`);
        return;
      }
    }

    // Upload via API
    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append('section', section);
      fileList.forEach(file => {
        formData.append('files', file);
      });

      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.message || 'Gagal mengunggah foto ke server');
      }

      const newUploaded: TaskAttachment[] = json.data || [];

      if (onDirectUpload) {
        for (const item of newUploaded) {
          await onDirectUpload(item);
        }
      }

      if (onChange) {
        // Replace or append
        const updatedAll = [...attachments, ...newUploaded];
        onChange(updatedAll);
      }
    } catch (err: any) {
      console.error('Image upload failed:', err);
      setUploadError(err?.message || 'Gagal mengunggah foto. Silakan coba lagi.');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  }, [attachments, maxFiles, onChange, onDirectUpload, readOnly, remainingSlots, section]);

  const handleDelete = useCallback(async (attachment: TaskAttachment) => {
    if (readOnly) return;
    try {
      // If direct delete handler is provided (e.g. view modal)
      if (onDirectDelete) {
        await onDirectDelete(attachment.id);
      }

      // Best effort backend deletion
      if (attachment.url.startsWith('/uploads/tasks/')) {
        void fetch('/api/upload', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: attachment.url })
        }).catch(() => {
          // Non-critical background cleanup
        });
      }

      if (onChange) {
        const remaining = attachments.filter(a => a.id !== attachment.id);
        onChange(remaining);
      }
    } catch (err: any) {
      console.error('Failed to delete attachment:', err);
      setUploadError(err?.message || 'Gagal menghapus foto.');
    }
  }, [attachments, onChange, onDirectDelete, readOnly]);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (!readOnly && remainingSlots > 0) {
      setIsDragging(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (!readOnly && e.dataTransfer.files) {
      handleFiles(e.dataTransfer.files);
    }
  };

  const hasChildren = Boolean(children);

  return (
    <div 
      className={`space-y-1.5 transition-all ${isDragging ? 'ring-2 ring-blue-500/50 rounded-lg p-1 bg-blue-500/5' : ''}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept=".jpg,.jpeg,.png,.webp"
        className="hidden"
        onChange={e => {
          if (e.target.files) handleFiles(e.target.files);
        }}
      />

      {/* Section Header with Small Icon Trigger */}
      {(displayTitle || headerExtra || (!readOnly && remainingSlots > 0)) && (
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            {displayTitle && (
              <span className="text-xs font-bold text-[var(--text-primary)] flex items-center gap-1.5 truncate">
                <ImageIcon className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                <span>{displayTitle}</span>
              </span>
            )}
            {displayDescription && (
              <p className="text-[11px] text-[var(--text-muted)] mt-0.5 m-0">
                {displayDescription}
              </p>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {headerExtra}

            {/* Small Icon Button on Notes Column */}
            {!readOnly && remainingSlots > 0 && (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-[var(--bg-tertiary)] hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-blue-400 border border-[var(--border-secondary)] transition-all cursor-pointer shadow-xs"
                title="Lampirkan foto/gambar referensi (JPG, PNG, WebP maks 5MB)"
              >
                <ImageIcon className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                <span>Foto</span>
                {sectionAttachments.length > 0 && (
                  <span className="ml-0.5 px-1.5 py-0.2 rounded-full bg-blue-500/15 text-blue-400 text-[10px] font-bold">
                    {sectionAttachments.length}
                  </span>
                )}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Embedded Children (e.g. Textarea or Note text) */}
      {children}

      {/* Uploading progress indicator */}
      {isUploading && (
        <div className="flex items-center gap-2 text-xs font-semibold text-blue-500 py-1 px-1">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          <span>Mengunggah foto...</span>
        </div>
      )}

      {/* Fallback Standalone Dropzone only when explicitly no children and not compact */}
      {!hasChildren && !compact && !readOnly && remainingSlots > 0 && (
        <div
          onClick={() => fileInputRef.current?.click()}
          className="relative border border-dashed rounded-lg p-2.5 transition-all cursor-pointer flex items-center justify-center gap-2 text-center border-[var(--border-primary)] hover:border-blue-400 bg-[var(--bg-tertiary)] hover:bg-[var(--bg-hover)]"
        >
          <UploadCloud className="w-4 h-4 text-blue-500" />
          <span className="text-xs text-[var(--text-secondary)] font-medium">
            Pilih atau Drag &amp; Drop Foto (Maks 5MB)
          </span>
        </div>
      )}

      {/* Error Alert */}
      {uploadError && (
        <div className="p-2 rounded-md bg-rose-500/10 border border-rose-500/30 flex items-center justify-between text-xs text-rose-300">
          <div className="flex items-center gap-1.5">
            <AlertCircle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
            <span>{uploadError}</span>
          </div>
          <button
            type="button"
            onClick={() => setUploadError(null)}
            className="p-1 hover:opacity-75"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      )}

      {/* Thumbnails Grid */}
      {sectionAttachments.length > 0 ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 pt-1">
          {sectionAttachments.map(att => (
            <AttachmentThumbnailItem
              key={att.id}
              attachment={att}
              readOnly={readOnly}
              onPreview={(url, name) => {
                setPreviewModalUrl(url);
                setPreviewModalName(name);
              }}
              onDelete={handleDelete}
            />
          ))}
        </div>
      ) : readOnly ? (
        <div className="p-2.5 rounded-lg border border-dashed border-[var(--border-secondary)] bg-[var(--bg-tertiary)]/50 text-center">
          <p className="text-[11px] text-[var(--text-muted)] m-0 italic">
            Belum ada foto referensi yang dilampirkan pada bagian ini.
          </p>
        </div>
      ) : null}

      {/* Lightbox Modal (Enlarged Preview) */}
      {previewModalUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in"
          onClick={() => setPreviewModalUrl(null)}
        >
          <div
            className="relative max-w-4xl max-h-[90vh] bg-[var(--bg-secondary)] rounded-xl border border-[var(--border-primary)] overflow-hidden shadow-2xl flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="p-3 px-4 flex items-center justify-between border-b border-[var(--border-primary)] bg-[var(--bg-tertiary)]">
              <div className="flex items-center gap-2 min-w-0">
                <ImageIcon className="w-4 h-4 text-blue-500 shrink-0" />
                <span className="text-xs font-bold text-[var(--text-primary)] truncate">
                  {previewModalName || 'Preview Foto'}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <a
                  href={previewModalUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-2 py-1 rounded text-xs font-semibold bg-[var(--bg-secondary)] hover:bg-[var(--bg-hover)] border border-[var(--border-primary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors flex items-center gap-1"
                >
                  <Eye className="w-3 h-3" />
                  <span>Buka Tab Baru</span>
                </a>
                <button
                  type="button"
                  onClick={() => setPreviewModalUrl(null)}
                  className="p-1 rounded-full hover:bg-[var(--bg-hover)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Large Image Preview */}
            <div className="p-2 flex items-center justify-center max-h-[calc(90vh-60px)] overflow-auto bg-black/20">
              <img
                src={previewModalUrl}
                alt={previewModalName}
                className="max-h-[calc(90vh-80px)] w-auto object-contain rounded-lg"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function AttachmentThumbnailItem({
  attachment,
  readOnly,
  onPreview,
  onDelete
}: {
  attachment: TaskAttachment;
  readOnly: boolean;
  onPreview: (url: string, name: string) => void;
  onDelete: (att: TaskAttachment) => void;
}) {
  const [imgError, setImgError] = useState(false);
  const normalizedUrl = attachment.url.startsWith('http://') || attachment.url.startsWith('https://') || attachment.url.startsWith('/')
    ? attachment.url
    : `/${attachment.url}`;

  return (
    <div className="group relative rounded-lg border border-[var(--border-primary)] bg-[var(--bg-secondary)] overflow-hidden shadow-xs hover:border-blue-400 transition-all flex flex-col">
      {/* Image Preview Container */}
      <div
        className="relative w-full h-24 bg-[var(--bg-tertiary)] flex items-center justify-center cursor-pointer overflow-hidden"
        onClick={() => onPreview(normalizedUrl, attachment.name)}
      >
        {!imgError ? (
          <img
            src={normalizedUrl}
            alt={attachment.name}
            className="w-full h-full object-cover transition-transform group-hover:scale-105"
            loading="lazy"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="flex flex-col items-center justify-center p-2 text-center text-[var(--text-muted)] gap-1">
            <ImageIcon className="w-6 h-6 text-blue-400/70" />
            <span className="text-[9px] font-mono leading-tight truncate max-w-[90px]">{attachment.name}</span>
          </div>
        )}

        {/* Hover overlay with zoom icon */}
        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
          <button
            type="button"
            className="p-1.5 rounded-full bg-white/20 hover:bg-white/40 text-white backdrop-blur-xs transition-colors"
            title="Perbesar foto"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Bottom Meta Bar */}
      <div className="p-1.5 flex items-center justify-between gap-1 text-[10px]">
        <div className="min-w-0 flex-1">
          <p
            className="font-medium text-[var(--text-primary)] truncate m-0"
            title={attachment.name}
          >
            {attachment.name}
          </p>
          <span className="text-[var(--text-muted)] font-mono">
            {formatFileSize(attachment.size)}
          </span>
        </div>

        {!readOnly && (
          <button
            type="button"
            onClick={e => {
              e.stopPropagation();
              onDelete(attachment);
            }}
            className="p-1 rounded text-rose-500 hover:bg-rose-500/10 transition-colors shrink-0"
            title="Hapus foto"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}
