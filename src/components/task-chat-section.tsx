'use client';

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  TaskComment, 
  User as UserType, 
  TaskWithRelations 
} from '@/lib/types';
import { 
  getComments, 
  addComment, 
  editComment, 
  deleteComment, 
  markCommentsAsRead,
  unpackCommentData
} from '@/lib/supabase-store';
import * as localStore from '@/lib/store';
import { 
  canUserAccessTaskChat, 
  canUserEditComment, 
  canUserDeleteComment 
} from '@/lib/chat-auth';
import { 
  sanitizeChatMessage, 
  validateChatAttachment, 
  sanitizeChatMediaUrl, 
  formatDisplayDateTime,
  formatChatTime,
  formatChatDateDivider,
  MAX_ATTACHMENT_SIZE_BYTES
} from '@/lib/utils';
import { supabase } from '@/lib/supabase';
import {
  MessageSquare,
  Send,
  Paperclip,
  Trash2,
  Edit2,
  X,
  Check,
  Loader2,
  Maximize2,
  FileVideo,
  Download,
  AlertTriangle,
  RotateCcw,
  User,
  Clock,
  Film,
  CheckCheck,
  Info
} from 'lucide-react';

interface TaskChatSectionProps {
  task: TaskWithRelations | any;
  user: UserType;
  isActiveTab?: boolean;
  onCommentsUpdated?: (count: number, unreadCount: number) => void;
}

export function TaskChatSection({
  task,
  user,
  isActiveTab = true,
  onCommentsUpdated
}: TaskChatSectionProps) {
  const taskId = task?.id;

  // 1. Instant local-first cache hydration (0ms render)
  const [comments, setComments] = useState<TaskComment[]>(() => {
    if (typeof window !== 'undefined' && task?.id) {
      try {
        const local = localStore.getComments().filter((c: any) => c.task_id === task.id || c.request_id === task.id);
        if (local.length > 0) return local.map(unpackCommentData);
      } catch {}
    }
    return [];
  });

  // Only show full loading spinner if we literally have 0 comments in memory or cache
  const [loading, setLoading] = useState<boolean>(() => {
    if (typeof window !== 'undefined' && task?.id) {
      try {
        const local = localStore.getComments().filter((c: any) => c.task_id === task.id || c.request_id === task.id);
        return local.length === 0;
      } catch {}
    }
    return true;
  });

  const [chatError, setChatError] = useState<string | null>(null);

  // Form input states
  const [commentText, setCommentText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedAttachment, setSelectedAttachment] = useState<{
    url: string;
    type: 'image' | 'video';
    name: string;
    size: number;
  } | null>(null);
  const [isReadingFile, setIsReadingFile] = useState(false);

  // Failed message retry queue
  const [failedMessage, setFailedMessage] = useState<{
    content: string;
    attachment?: { url: string; type: 'image' | 'video'; name: string; size: number } | null;
  } | null>(null);

  // Inline edit state
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  // Media preview Lightbox
  const [lightboxMedia, setLightboxMedia] = useState<{
    url: string;
    type: 'image' | 'video';
    name?: string;
  } | null>(null);

  // Pagination / Load older
  const [displayLimit, setDisplayLimit] = useState(50);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const chatBottomRef = useRef<HTMLDivElement | null>(null);
  const isInitialLoadRef = useRef(true);

  // Role style badges
  const getRoleStyle = (roleName?: string) => {
    switch (roleName) {
      case 'ADMIN': return { bg: 'rgba(168, 85, 247, 0.12)', text: '#a855f7', border: 'rgba(168, 85, 247, 0.25)', label: 'Admin' };
      case 'TEAM_LEAD': return { bg: 'rgba(245, 158, 11, 0.12)', text: '#f59e0b', border: 'rgba(245, 158, 11, 0.25)', label: 'Team Lead' };
      case 'STRATEGIC_PIC': return { bg: 'rgba(59, 130, 246, 0.12)', text: '#3b82f6', border: 'rgba(59, 130, 246, 0.25)', label: 'Strategic' };
      case 'DESIGNER': return { bg: 'rgba(16, 185, 129, 0.12)', text: '#10b981', border: 'rgba(16, 185, 129, 0.25)', label: 'GD' };
      case 'MOTION_PIC': return { bg: 'rgba(236, 72, 153, 0.12)', text: '#ec4899', border: 'rgba(236, 72, 153, 0.25)', label: 'Motion' };
      case 'REQUESTER': return { bg: 'rgba(99, 102, 241, 0.12)', text: '#6366f1', border: 'rgba(99, 102, 241, 0.25)', label: 'AE' };
      case 'OPERATOR': return { bg: 'rgba(100, 116, 139, 0.12)', text: '#64748b', border: 'rgba(100, 116, 139, 0.25)', label: 'OP' };
      default: return { bg: 'rgba(100, 116, 139, 0.12)', text: '#64748b', border: 'rgba(100, 116, 139, 0.25)', label: roleName || 'Member' };
    }
  };

  // Participant authorization check
  const canPostChat = useMemo(() => {
    return canUserAccessTaskChat(task, user);
  }, [task, user]);

  const isTaskClosed = task?.status_design === 'TASK_CLOSED';

  // Load comments with non-blocking background revalidation
  const loadCommentsData = useCallback(async (targetId: string, silent: boolean = false) => {
    if (!targetId) return;
    try {
      if (!silent) {
        setLoading(prev => prev && comments.length === 0);
      }
      const data = await getComments(targetId);
      setComments(prev => {
        const map = new Map<string, TaskComment>();
        (data || []).forEach(c => map.set(c.id, c));
        return Array.from(map.values()).sort(
          (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        );
      });
      setChatError(null);

      // Auto mark read if active tab
      if (isActiveTab && user?.id) {
        markCommentsAsRead(targetId, user.id);
      }
    } catch (err: any) {
      console.error('Failed to load comments:', err);
      if (!silent && comments.length === 0) {
        setChatError('Gagal memuat pesan diskusi.');
      }
    } finally {
      setLoading(false);
    }
  }, [isActiveTab, user?.id, comments.length]);

  // Sync unread & comment count
  useEffect(() => {
    if (onCommentsUpdated && comments) {
      const unread = comments.filter(c => 
        c.user_id !== user.id && 
        !c.is_deleted && 
        !(c.read_by || []).includes(user.id)
      ).length;
      onCommentsUpdated(comments.length, unread);
    }
  }, [comments, user.id, onCommentsUpdated]);

  // Initial load & Realtime channel
  useEffect(() => {
    if (!taskId) return;
    isInitialLoadRef.current = true;
    loadCommentsData(taskId, false);

    // 1. Supabase Realtime Subscription
    let channel: any = null;
    if (supabase) {
      channel = supabase
        .channel(`chat_room_${taskId}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'task_comments',
            filter: `task_id=eq.${taskId}`,
          },
          () => {
            loadCommentsData(taskId, true);
          }
        )
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'task_comments',
            filter: `task_id=eq.${taskId}`,
          },
          () => {
            loadCommentsData(taskId, true);
          }
        )
        .on(
          'postgres_changes',
          {
            event: 'DELETE',
            schema: 'public',
            table: 'task_comments',
            filter: `task_id=eq.${taskId}`,
          },
          (payload) => {
            const deletedId = (payload.old as any)?.id;
            if (deletedId) {
              setComments(prev => prev.filter(c => c.id !== deletedId));
            }
          }
        )
        .subscribe();
    }

    // 2. Periodic poll fallback (every 8 seconds) while active
    const interval = setInterval(() => {
      loadCommentsData(taskId, true);
    }, 8000);

    const handleFocus = () => {
      loadCommentsData(taskId, true);
    };
    window.addEventListener('focus', handleFocus);

    return () => {
      if (channel && supabase) {
        supabase.removeChannel(channel);
      }
      clearInterval(interval);
      window.removeEventListener('focus', handleFocus);
    };
  }, [taskId, loadCommentsData]);

  // Auto scroll to bottom
  useEffect(() => {
    if (isActiveTab && chatBottomRef.current) {
      if (isInitialLoadRef.current) {
        chatBottomRef.current.scrollIntoView({ behavior: 'auto' });
        isInitialLoadRef.current = false;
      } else {
        chatBottomRef.current.scrollIntoView({ behavior: 'smooth' });
      }
    }
  }, [comments, isActiveTab]);

  // Handle Mark as Read when user switches to chat tab
  useEffect(() => {
    if (isActiveTab && taskId && user?.id) {
      markCommentsAsRead(taskId, user.id);
    }
  }, [isActiveTab, taskId, user?.id]);

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  // Attachment processor with strict whitelist
  const processFile = (file: File) => {
    const val = validateChatAttachment({
      name: file.name,
      type: file.type,
      size: file.size
    });

    if (!val.valid) {
      setChatError(val.error || 'Format file tidak didukung.');
      return;
    }

    setIsReadingFile(true);
    setChatError(null);

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const cleanUrl = sanitizeChatMediaUrl(dataUrl);

      if (!cleanUrl) {
        setChatError('Konten file tidak aman atau tidak didukung.');
        setIsReadingFile(false);
        return;
      }

      setSelectedAttachment({
        url: cleanUrl,
        type: val.mediaType,
        name: val.cleanName,
        size: file.size
      });
      setIsReadingFile(false);
    };
    reader.onerror = () => {
      setChatError('Gagal membaca file. Silakan coba file lain.');
      setIsReadingFile(false);
    };
    reader.readAsDataURL(file);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      processFile(files[0]);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData?.items;
    if (items) {
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.includes('image') || items[i].type.includes('video')) {
          const file = items[i].getAsFile();
          if (file) {
            e.preventDefault();
            processFile(file);
            break;
          }
        }
      }
    }
  };

  // Send comment
  const handlePostComment = async (
    textToSend: string, 
    attachment?: { url: string; type: 'image' | 'video'; name: string; size: number } | null
  ) => {
    if ((!textToSend.trim() && !attachment) || isSubmitting || !canPostChat) return;

    const trimmed = textToSend.trim();
    setIsSubmitting(true);
    setChatError(null);
    setFailedMessage(null);

    try {
      const created = await addComment(
        task.id,
        user.id,
        trimmed,
        {
          full_name: user.full_name,
          avatar_initials: user.avatar_initials,
          role_name: user.role_name
        },
        attachment ? {
          url: attachment.url,
          type: attachment.type,
          name: attachment.name
        } : undefined
      );

      setComments(prev => {
        if (prev.some(c => c.id === created.id)) return prev;
        const next = [...prev, created];
        return next.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
      });

      setCommentText('');
      setSelectedAttachment(null);

      setTimeout(() => {
        if (chatBottomRef.current) {
          chatBottomRef.current.scrollIntoView({ behavior: 'smooth' });
        }
      }, 100);
    } catch (err: any) {
      console.error('Failed to post comment:', err);
      // Save to retry state
      setFailedMessage({ content: trimmed, attachment });
      setChatError('Gagal mengirim pesan: ' + (err?.message || 'Terjadi kesalahan sistem'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const onSubmitForm = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    handlePostComment(commentText, selectedAttachment);
  };

  // Edit comment
  const startEdit = (cmt: TaskComment) => {
    setEditingCommentId(cmt.id);
    setEditContent(cmt.content);
  };

  const saveEdit = async (commentId: string) => {
    if (!editContent.trim() || isSavingEdit) return;
    setIsSavingEdit(true);
    setChatError(null);

    try {
      const updated = await editComment(commentId, user.id, editContent.trim());
      setComments(prev => prev.map(c => c.id === commentId ? updated : c));
      setEditingCommentId(null);
      setEditContent('');
    } catch (err: any) {
      console.error('Failed to edit comment:', err);
      setChatError('Gagal mengedit pesan: ' + (err?.message || 'Terjadi kesalahan'));
    } finally {
      setIsSavingEdit(false);
    }
  };

  // Soft delete comment
  const handleDelete = async (commentId: string) => {
    if (!confirm('Apakah Anda yakin ingin menghapus pesan ini?')) return;
    try {
      await deleteComment(commentId, user.id, user.role_name);
      setComments(prev => prev.map(c => {
        if (c.id === commentId) {
          return {
            ...c,
            is_deleted: true,
            deleted_at: new Date().toISOString(),
            deleted_by: user.id,
            content: 'Pesan ini telah dihapus',
            attachment_url: null,
            attachment_name: null,
            attachment_type: null
          };
        }
        return c;
      }));
    } catch (err: any) {
      console.error('Failed to delete comment:', err);
      setChatError('Gagal menghapus pesan: ' + (err?.message || 'Terjadi kesalahan'));
    }
  };

  // Visible comments respecting pagination
  const visibleComments = comments.slice(-displayLimit);
  const hasMoreComments = comments.length > displayLimit;

  return (
    <div className="flex flex-col space-y-3 rounded-xl border border-[var(--border-primary)] bg-[var(--bg-secondary)] p-4 h-full min-h-[440px]">
      
      {/* Header Info Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-[var(--border-secondary)]">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="w-7 h-7 rounded-lg bg-blue-500/10 text-blue-500 flex items-center justify-center font-bold">
            <MessageSquare className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-primary)] m-0">
                Kolom Chat &amp; Diskusi Tim
              </h3>
              <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300">
                {comments.length} Pesan
              </span>
            </div>
            <p className="text-[11px] text-[var(--text-muted)] m-0 flex items-center gap-1.5 flex-wrap">
              <span>Peserta: AE ({task.created_by_name || 'AE'})</span>
              {task.design_pic_name && <span>• GD ({task.design_pic_name})</span>}
              {task.strat_pic_names && task.strat_pic_names.length > 0 ? (
                <span>• Strategic ({task.strat_pic_names.join(', ')})</span>
              ) : task.strat_pic_name ? (
                <span>• Strategic ({task.strat_pic_name})</span>
              ) : null}
              {task.motion_pic_name && <span>• Motion ({task.motion_pic_name})</span>}
            </p>
          </div>
        </div>

        {/* Closed status badge if applicable */}
        {isTaskClosed && (
          <span className="text-[11px] px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-500 border border-amber-500/20 font-medium flex items-center gap-1">
            <Info className="w-3 h-3" /> Status Selesai (Closed)
          </span>
        )}
      </div>

      {/* Error & Retry Banner */}
      {chatError && (
        <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-500 text-xs flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{chatError}</span>
          </div>
          <div className="flex items-center gap-2">
            {failedMessage && (
              <button
                type="button"
                onClick={() => handlePostComment(failedMessage.content, failedMessage.attachment)}
                className="px-2.5 py-1 rounded bg-red-500 text-white font-semibold hover:bg-red-600 transition-colors flex items-center gap-1 text-[11px]"
              >
                <RotateCcw className="w-3 h-3" /> Coba Lagi
              </button>
            )}
            <button 
              type="button" 
              onClick={() => setChatError(null)} 
              className="text-red-500 hover:text-red-700 p-1"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Load Earlier Messages Button */}
      {hasMoreComments && (
        <div className="text-center pt-1">
          <button
            type="button"
            onClick={() => setDisplayLimit(prev => prev + 50)}
            className="text-[11px] text-blue-500 hover:underline font-semibold"
          >
            Muat {comments.length - displayLimit} pesan sebelumnya...
          </button>
        </div>
      )}

      {/* Message List */}
      <div 
        className="flex-1 overflow-y-auto pr-1 space-y-3.5 custom-scrollbar" 
        style={{ minHeight: '280px', maxHeight: '440px' }}
      >
        {loading ? (
          <div className="flex flex-col items-center justify-center py-10 text-[var(--text-muted)]">
            <Loader2 className="w-6 h-6 animate-spin mb-2 text-blue-500" />
            <span className="text-xs">Memuat pesan diskusi...</span>
          </div>
        ) : comments.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center p-6 rounded-xl border border-dashed border-[var(--border-secondary)] bg-[var(--bg-card)]">
            <div className="w-10 h-10 rounded-full bg-blue-500/10 text-blue-500 flex items-center justify-center mb-2.5">
              <MessageSquare className="w-5 h-5" />
            </div>
            <h4 className="text-xs font-bold text-[var(--text-primary)] mb-1">Belum Ada Diskusi</h4>
            <p className="text-[11px] text-[var(--text-muted)] max-w-sm m-0">
              Gunakan kolom chat ini untuk koordinasi, mengirim feedback, melampirkan gambar/video hasil review, atau update pengerjaan tiket pada status apa pun.
            </p>
          </div>
        ) : (
          (() => {
            let lastDateLabel = '';
            return visibleComments.map((cmt) => {
              const isOwnMessage = Boolean(user?.id && (cmt.user_id === user.id || (cmt as any).sender_id === user.id));
              const roleStyle = getRoleStyle(cmt.user_role);
              const senderDisplayName = cmt.user_name || (cmt as any).sender_name || (isOwnMessage ? user.full_name : 'Pengguna');
              const isEditing = editingCommentId === cmt.id;
              const canEdit = canUserEditComment(cmt.user_id, user.id) && !cmt.is_deleted;
              const canDelete = canUserDeleteComment(cmt.user_id, user) && !cmt.is_deleted;
              const isReadByOthers = (cmt.read_by || []).some(id => id !== cmt.user_id);
              
              const dateLabel = formatChatDateDivider(cmt.created_at);
              const showDateDivider = dateLabel && dateLabel !== lastDateLabel;
              if (showDateDivider) {
                lastDateLabel = dateLabel;
              }

              return (
                <React.Fragment key={cmt.id}>
                  {showDateDivider && (
                    <div className="flex items-center justify-center my-3 select-none">
                      <span className="px-3 py-0.5 text-[10px] font-semibold tracking-wide rounded-full bg-[var(--bg-tertiary)] border border-[var(--border-secondary)] text-[var(--text-muted)] shadow-xs">
                        {dateLabel}
                      </span>
                    </div>
                  )}

                  <div 
                    className={`chat-message w-full flex ${
                      isOwnMessage 
                        ? 'chat-message-own justify-end' 
                        : 'chat-message-other justify-start'
                    } items-end gap-2 group mb-2.5`}
                  >
                    {/* If other user, show Avatar on the left */}
                    {!isOwnMessage && (
                      <div 
                        className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0 mb-1 shadow-xs"
                        style={{ background: roleStyle.bg, color: roleStyle.text, border: `1.5px solid ${roleStyle.border}` }}
                        title={`${senderDisplayName} (${roleStyle.label})`}
                      >
                        {cmt.user_avatar || senderDisplayName.substring(0, 2).toUpperCase()}
                      </div>
                    )}

                    {/* Action buttons on hover for OWN message (placed on the LEFT of bubble) */}
                    {isOwnMessage && !cmt.is_deleted && !isEditing && (canEdit || canDelete) && (
                      <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 mb-1 shrink-0">
                        {canEdit && (
                          <button
                            type="button"
                            onClick={() => startEdit(cmt)}
                            className="text-[var(--text-muted)] hover:text-blue-500 p-1 rounded hover:bg-[var(--bg-tertiary)] transition-colors"
                            title="Edit pesan"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {canDelete && (
                          <button
                            type="button"
                            onClick={() => handleDelete(cmt.id)}
                            className="text-[var(--text-muted)] hover:text-red-500 p-1 rounded hover:bg-[var(--bg-tertiary)] transition-colors"
                            title="Hapus pesan"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    )}

                    {/* Chat Bubble container */}
                    <div 
                      className={`chat-bubble max-w-[85%] sm:max-w-[75%] md:max-w-[70%] flex flex-col ${
                        isOwnMessage ? 'items-end' : 'items-start'
                      }`}
                    >
                      {/* Bubble Card */}
                      <div 
                        className={`relative px-3.5 py-2.5 shadow-sm text-xs leading-relaxed transition-all ${
                          cmt.is_deleted
                            ? (isOwnMessage
                                ? 'bg-blue-900/20 dark:bg-blue-950/40 text-[var(--text-muted)] border border-blue-500/20 rounded-2xl rounded-tr-xs italic'
                                : 'bg-[var(--bg-tertiary)] text-[var(--text-muted)] border border-[var(--border-secondary)] rounded-2xl rounded-tl-xs italic')
                            : (isOwnMessage
                                ? 'bg-blue-600 dark:bg-blue-600 text-white rounded-2xl rounded-tr-xs border border-blue-500/30'
                                : 'bg-[var(--bg-card)] text-[var(--text-primary)] border border-[var(--border-secondary)] rounded-2xl rounded-tl-xs')
                        }`}
                        style={{ wordBreak: 'break-word' }}
                      >
                        {/* Sender Name & Role Header (ONLY for other users' messages) */}
                        {!isOwnMessage && (
                          <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
                            <span className="text-[11px] font-bold text-[var(--text-primary)]">
                              {senderDisplayName}
                            </span>
                            <span 
                              className="text-[9px] px-1.5 py-0.2 rounded font-medium border"
                              style={{ background: roleStyle.bg, color: roleStyle.text, borderColor: roleStyle.border }}
                            >
                              {roleStyle.label}
                            </span>
                          </div>
                        )}

                        {/* Message Content & Editing */}
                        {isEditing ? (
                          <div className="space-y-2 min-w-[220px]">
                            <textarea
                              rows={2}
                              value={editContent}
                              onChange={e => setEditContent(e.target.value)}
                              className="w-full text-xs p-2 rounded-lg border border-blue-400 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none resize-none"
                            />
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                type="button"
                                onClick={() => setEditingCommentId(null)}
                                className="px-2 py-0.5 text-[11px] rounded bg-white/20 hover:bg-white/30 text-white"
                              >
                                Batal
                              </button>
                              <button
                                type="button"
                                disabled={!editContent.trim() || isSavingEdit}
                                onClick={() => saveEdit(cmt.id)}
                                className="px-2.5 py-0.5 text-[11px] rounded bg-white text-blue-600 font-bold hover:bg-gray-100 flex items-center gap-1"
                              >
                                {isSavingEdit ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />} Simpan
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div>
                            {/* Content Text */}
                            {cmt.is_deleted ? (
                              <p className={`m-0 italic text-xs ${isOwnMessage ? 'text-blue-200/70' : 'text-[var(--text-muted)]'}`}>
                                {cmt.content}
                              </p>
                            ) : (
                              <p className={`whitespace-pre-wrap break-words m-0 text-xs leading-relaxed ${
                                isOwnMessage ? 'text-white' : 'text-[var(--text-primary)]'
                              }`}>
                                {cmt.content}
                              </p>
                            )}

                            {/* Attachments rendering */}
                            {!cmt.is_deleted && cmt.attachment_url && (
                              <div className="mt-2">
                                {cmt.attachment_type === 'video' ? (
                                  <div className="rounded-xl overflow-hidden bg-black/90 border border-[var(--border-secondary)] shadow-sm max-w-sm">
                                    <video 
                                      src={sanitizeChatMediaUrl(cmt.attachment_url)} 
                                      controls 
                                      playsInline 
                                      preload="metadata"
                                      className="w-full max-h-56 object-contain bg-black"
                                    />
                                    {cmt.attachment_name && (
                                      <div className={`p-1.5 flex items-center justify-between text-[10px] border-t ${
                                        isOwnMessage 
                                          ? 'bg-blue-700/80 text-blue-100 border-blue-500/40' 
                                          : 'bg-[var(--bg-tertiary)] text-[var(--text-muted)] border-[var(--border-secondary)]'
                                      }`}>
                                        <span className="truncate flex items-center gap-1">
                                          <FileVideo className="w-3 h-3 text-pink-400 shrink-0" />
                                          {cmt.attachment_name}
                                        </span>
                                        <a 
                                          href={sanitizeChatMediaUrl(cmt.attachment_url)} 
                                          download={cmt.attachment_name || 'video.mp4'} 
                                          className={`hover:underline flex items-center gap-0.5 shrink-0 ml-1 font-semibold ${
                                            isOwnMessage ? 'text-white' : 'text-blue-500'
                                          }`}
                                        >
                                          <Download className="w-3 h-3" /> Unduh
                                        </a>
                                      </div>
                                    )}
                                  </div>
                                ) : (
                                  <div 
                                    className="relative group/img inline-block max-w-xs rounded-xl overflow-hidden border border-black/10 shadow-sm bg-black/5 cursor-pointer" 
                                    onClick={() => setLightboxMedia({ url: sanitizeChatMediaUrl(cmt.attachment_url!), type: 'image', name: cmt.attachment_name || 'gambar.jpg' })}
                                  >
                                    <img 
                                      src={sanitizeChatMediaUrl(cmt.attachment_url)} 
                                      alt={cmt.attachment_name || 'Lampiran Gambar'} 
                                      className="max-h-52 w-auto object-cover rounded-xl transition-transform duration-200 group-hover/img:scale-[1.02]"
                                      loading="lazy"
                                    />
                                    <div className="absolute inset-0 bg-black/30 opacity-0 group-hover/img:opacity-100 transition-opacity flex items-center justify-center gap-1 text-white">
                                      <span className="p-1.5 rounded-full bg-black/60 flex items-center gap-1 text-[10px] font-semibold backdrop-blur-xs">
                                        <Maximize2 className="w-3.5 h-3.5" /> Perbesar
                                      </span>
                                    </div>
                                    {cmt.attachment_name && (
                                      <div className={`p-1 text-[9px] truncate border-t ${
                                        isOwnMessage 
                                          ? 'bg-blue-700/80 text-blue-100 border-blue-500/40' 
                                          : 'bg-[var(--bg-tertiary)]/90 text-[var(--text-muted)] border-[var(--border-secondary)]'
                                      }`}>
                                        {cmt.attachment_name}
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            )}

                            {/* Footer Time & Status */}
                            <div className={`flex items-center justify-end gap-1 mt-1 text-[10px] select-none ${
                              isOwnMessage ? 'text-blue-100/80 font-medium' : 'text-[var(--text-muted)]'
                            }`}>
                              {cmt.is_edited && !cmt.is_deleted && (
                                <span className={`text-[9px] italic mr-0.5 ${isOwnMessage ? 'text-blue-200' : 'text-amber-500'}`}>
                                  (Diedit)
                                </span>
                              )}
                              <span>{formatChatTime(cmt.created_at) || formatDisplayDateTime(cmt.created_at)}</span>
                              {isOwnMessage && !cmt.is_deleted && (
                                <span className="ml-0.5" title={isReadByOthers ? 'Dibaca oleh anggota tim' : 'Terkirim'}>
                                  {isReadByOthers ? (
                                    <CheckCheck className="w-3.5 h-3.5 text-blue-200 inline" />
                                  ) : (
                                    <Check className="w-3 h-3 text-blue-200/70 inline" />
                                  )}
                                </span>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Action button on hover for OTHER user's message (for Admin/Lead only, placed on the RIGHT of bubble) */}
                    {!isOwnMessage && !cmt.is_deleted && !isEditing && canDelete && (
                      <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 mb-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleDelete(cmt.id)}
                          className="text-[var(--text-muted)] hover:text-red-500 p-1 rounded hover:bg-[var(--bg-tertiary)] transition-colors"
                          title="Hapus pesan (Admin / Lead)"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                </React.Fragment>
              );
            });
          })()
        )}
        <div ref={chatBottomRef} />
      </div>

      {/* Input composer dock */}
      {canPostChat ? (
        <form onSubmit={onSubmitForm} className="pt-2.5 border-t border-[var(--border-secondary)] space-y-2">
          <div className="flex items-center justify-between text-[11px] text-[var(--text-secondary)] px-1 font-medium">
            <span className="flex items-center gap-1.5">
              <User className="w-3.5 h-3.5 text-blue-500" />
              Kirim pesan sebagai: <strong className="text-[var(--text-primary)]">{user.full_name}</strong>
              <span className="text-[9px] px-1.5 py-0.2 rounded font-medium border ml-1" style={{ background: getRoleStyle(user.role_name).bg, color: getRoleStyle(user.role_name).text, borderColor: getRoleStyle(user.role_name).border }}>
                {getRoleStyle(user.role_name).label}
              </span>
            </span>
            <span className="text-[var(--text-muted)]">Notifikasi otomatis dikirim ke PIC terkait</span>
          </div>

          {/* Attachment Preview Card */}
          {selectedAttachment && (
            <div className="p-2.5 rounded-xl bg-[var(--bg-tertiary)] border border-blue-500/30 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                {selectedAttachment.type === 'image' ? (
                  <div className="w-12 h-12 rounded-lg overflow-hidden border border-[var(--border-secondary)] shrink-0 bg-black/10">
                    <img src={selectedAttachment.url} alt="Preview" className="w-full h-full object-cover" />
                  </div>
                ) : (
                  <div className="w-12 h-12 rounded-lg bg-pink-500/10 text-pink-500 flex items-center justify-center shrink-0 border border-pink-500/20">
                    <Film className="w-6 h-6" />
                  </div>
                )}
                <div className="min-w-0">
                  <p className="text-xs font-bold text-[var(--text-primary)] truncate m-0">
                    {selectedAttachment.name}
                  </p>
                  <span className="text-[11px] text-[var(--text-muted)]">
                    {selectedAttachment.type === 'image' ? 'Gambar' : 'Video'} • {formatFileSize(selectedAttachment.size)}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedAttachment(null)}
                className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-red-500 hover:bg-red-500/10 transition-colors"
                title="Hapus lampiran"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {isReadingFile && (
            <div className="p-2.5 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center gap-2 text-xs text-blue-500">
              <Loader2 className="w-4 h-4 animate-spin shrink-0" />
              <span>Memproses media...</span>
            </div>
          )}

          <div className="relative">
            <textarea
              rows={2}
              value={commentText}
              disabled={isSubmitting || isReadingFile}
              onChange={e => setCommentText(e.target.value)}
              onPaste={handlePaste}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  onSubmitForm();
                }
              }}
              placeholder="Tulis pesan atau tempel (paste) gambar/video... (Enter untuk kirim, Shift+Enter untuk baris baru)"
              className="w-full text-xs p-3 pr-28 rounded-xl border border-[var(--border-secondary)] bg-[var(--bg-card)] text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-blue-500/30 resize-none transition-all disabled:opacity-60"
            />

            {/* Hidden file input with whitelist */}
            <input 
              type="file" 
              ref={fileInputRef} 
              accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm" 
              onChange={handleFileChange} 
              className="hidden" 
            />

            <div className="absolute right-2.5 bottom-3 flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isSubmitting || isReadingFile}
                className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-blue-500 hover:bg-blue-500/10 transition-colors"
                title="Lampirkan Gambar atau Video (Maks 25MB)"
              >
                <Paperclip className="w-4 h-4" />
              </button>

              <button
                type="submit"
                disabled={(!commentText.trim() && !selectedAttachment) || isSubmitting || isReadingFile}
                className="btn-primary py-1.5 px-3.5 text-xs rounded-lg flex items-center gap-1.5 shadow-sm disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {isSubmitting ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Send className="w-3.5 h-3.5" />
                )}
                Kirim
              </button>
            </div>
          </div>
        </form>
      ) : (
        <div className="p-3 text-center rounded-xl bg-[var(--bg-tertiary)] border border-[var(--border-primary)] text-xs text-[var(--text-muted)]">
          Anda hanya memiliki akses melihat (read-only) riwayat diskusi pada request ini.
        </div>
      )}

      {/* Lightbox Modal */}
      <AnimatePresence>
        {lightboxMedia && (
          <motion.div 
            initial={{ opacity: 0 }} 
            animate={{ opacity: 1 }} 
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[9999] bg-black/90 backdrop-blur-md flex flex-col items-center justify-center p-4"
            onClick={() => setLightboxMedia(null)}
          >
            <div className="absolute top-4 right-4 flex items-center gap-3 text-white z-10" onClick={e => e.stopPropagation()}>
              <a 
                href={lightboxMedia.url} 
                download={lightboxMedia.name || 'lampiran'} 
                className="p-2 rounded-lg bg-white/10 hover:bg-white/20 transition-colors flex items-center gap-1.5 text-xs font-medium"
              >
                <Download className="w-4 h-4" /> Unduh
              </a>
              <button 
                onClick={() => setLightboxMedia(null)}
                className="p-2 rounded-lg bg-white/10 hover:bg-white/20 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="max-w-4xl max-h-[85vh] flex items-center justify-center p-2" onClick={e => e.stopPropagation()}>
              <img 
                src={lightboxMedia.url} 
                alt={lightboxMedia.name || 'Preview'} 
                className="max-h-[80vh] max-w-full object-contain rounded-lg shadow-2xl" 
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}
