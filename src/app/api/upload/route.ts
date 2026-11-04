import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { resolveAuthenticatedUser } from '@/lib/server-auth';
import { verifyImageBufferServerSide, MAX_SECTION_IMAGES } from '@/lib/image-upload-utils';
import { TaskAttachment, AttachmentSection } from '@/lib/types';
import { supabase, supabaseAdmin, isSupabaseConfigured } from '@/lib/supabase';
import { getTasks, getMotionTasks, getTaskAttachments } from '@/lib/store';

// Ensure public upload directory exists (used in local development)
const UPLOAD_SUBDIR = path.join('uploads', 'tasks');
const UPLOAD_FULL_DIR = path.join(process.cwd(), 'public', UPLOAD_SUBDIR);

function trySaveToLocalDisk(destinationPath: string, buffer: Buffer): boolean {
  try {
    if (!fs.existsSync(UPLOAD_FULL_DIR)) {
      fs.mkdirSync(UPLOAD_FULL_DIR, { recursive: true });
    }
    fs.writeFileSync(destinationPath, buffer);
    return true;
  } catch (fsErr) {
    // Expected on serverless environments like Vercel (read-only filesystem)
    console.warn('[Upload] Local filesystem write skipped (serverless read-only mode):', fsErr);
    return false;
  }
}

/**
 * POST /api/upload
 * Handles secure image uploads for Brief & Notes and Detail sections.
 */
export async function POST(req: Request) {
  try {
    const user = await resolveAuthenticatedUser(req);
    if (!user) {
      return NextResponse.json(
        { success: false, message: 'Autentikasi diperlukan untuk mengunggah gambar' },
        { status: 401 }
      );
    }

    const formData = await req.formData().catch(() => null);
    if (!formData) {
      return NextResponse.json(
        { success: false, message: 'Payload form-data tidak valid' },
        { status: 400 }
      );
    }

    const rawSection = formData.get('section');
    const section: AttachmentSection = rawSection === 'detail' ? 'detail' : 'brief';

    // Collect all files from formData
    const rawFiles: File[] = [];
    const filesFromGetAll = formData.getAll('files');
    if (filesFromGetAll && filesFromGetAll.length > 0) {
      for (const item of filesFromGetAll) {
        if (item instanceof File && item.size > 0) {
          rawFiles.push(item);
        }
      }
    }
    const singleFile = formData.get('file');
    if (singleFile instanceof File && singleFile.size > 0 && !rawFiles.includes(singleFile)) {
      rawFiles.push(singleFile);
    }

    if (rawFiles.length === 0) {
      return NextResponse.json(
        { success: false, message: 'Tidak ada file gambar yang diunggah' },
        { status: 400 }
      );
    }

    if (rawFiles.length > MAX_SECTION_IMAGES) {
      return NextResponse.json(
        {
          success: false,
          message: `Maksimal ${MAX_SECTION_IMAGES} foto yang dapat diunggah sekaligus per bagian`
        },
        { status: 400 }
      );
    }

    const uploadedAttachments: TaskAttachment[] = [];

    for (const file of rawFiles) {
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      // 1. Authoritative Server-side Verification (Magic Bytes Signature & Size)
      const verification = verifyImageBufferServerSide(buffer, file.name);
      if (!verification.valid) {
        return NextResponse.json(
          {
            success: false,
            message: `Gagal memvalidasi "${file.name}": ${verification.error}`
          },
          { status: 400 }
        );
      }

      // 2. Generate Safe, Unique Filename
      const uniqueSuffix = `${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;
      const safeFileName = `req_${section}_${uniqueSuffix}.${verification.ext}`;
      const destinationPath = path.join(UPLOAD_FULL_DIR, safeFileName);

      let publicUrl = '';
      let storageUploaded = false;

      // 3. Primary Storage: Supabase Storage Bucket (Persistent across serverless deploys & multi-instance)
      const storageClient = supabaseAdmin || supabase;
      if (storageClient) {
        try {
          const { data: uploadData, error: sbError } = await storageClient.storage
            .from('task-attachments')
            .upload(`${section}/${safeFileName}`, buffer, {
              contentType: verification.mimeType,
              upsert: true
            });

          if (!sbError && uploadData?.path) {
            const { data: pubData } = storageClient.storage
              .from('task-attachments')
              .getPublicUrl(uploadData.path);
            if (pubData?.publicUrl) {
              publicUrl = pubData.publicUrl;
              storageUploaded = true;
            }
          } else if (sbError) {
            console.warn('[Upload] Supabase storage upload failed:', sbError.message);
          }
        } catch (sbErr) {
          console.warn('[Upload] Supabase storage upload exception:', sbErr);
        }
      }

      // 4. Fallback / Local Development: Save to local public disk if possible
      const localSaved = trySaveToLocalDisk(destinationPath, buffer);
      if (!storageUploaded) {
        if (localSaved) {
          publicUrl = `/${UPLOAD_SUBDIR.replace(/\\/g, '/')}/${safeFileName}`;
        } else {
          // If neither Supabase storage nor local disk succeeded (e.g. Vercel without storage configured)
          return NextResponse.json(
            {
              success: false,
              message: 'Gagal menyimpan file: Penyimpanan cloud Supabase tidak dapat diakses dan filesystem serverless bersifat read-only.'
            },
            { status: 500 }
          );
        }
      }

      const attachment: TaskAttachment = {
        id: `att_${uniqueSuffix}`,
        url: publicUrl,
        name: verification.cleanName || file.name,
        size: buffer.length,
        type: verification.mimeType || 'image/jpeg',
        section,
        uploaded_at: new Date().toISOString(),
        uploaded_by: user.id
      };

      uploadedAttachments.push(attachment);
    }

    return NextResponse.json({
      success: true,
      message: `Berhasil mengunggah ${uploadedAttachments.length} foto`,
      data: uploadedAttachments
    });
  } catch (err: any) {
    console.error('API POST /api/upload error:', err);
    return NextResponse.json(
      { success: false, message: err?.message || 'Terjadi kesalahan saat mengunggah foto' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/upload
 * Safely deletes an uploaded image file from storage.
 */
export async function DELETE(req: Request) {
  try {
    const user = await resolveAuthenticatedUser(req);
    if (!user) {
      return NextResponse.json(
        { success: false, message: 'Autentikasi diperlukan untuk menghapus foto' },
        { status: 401 }
      );
    }

    const urlObj = new URL(req.url);
    let targetUrl = urlObj.searchParams.get('url');
    let attachmentId = urlObj.searchParams.get('attachmentId');
    let uploadedBy = urlObj.searchParams.get('uploadedBy');

    if (!targetUrl) {
      const body = await req.json().catch(() => null);
      if (body?.url) {
        targetUrl = body.url;
      }
      if (body?.attachmentId) {
        attachmentId = body.attachmentId;
      }
      if (body?.uploadedBy) {
        uploadedBy = body.uploadedBy;
      }
    }

    if (!targetUrl || typeof targetUrl !== 'string') {
      return NextResponse.json(
        { success: false, message: 'URL foto yang akan dihapus wajib disertakan' },
        { status: 400 }
      );
    }

    // Security check: Authorization & IDOR Protection
    const isAdminOrLead = ['ADMIN', 'TEAM_LEAD'].includes(user.role_name);
    if (!isAdminOrLead) {
      // Find if attachment belongs to an existing task in store
      const allTasks = getTasks();
      const allMotion = getMotionTasks();
      
      let foundAttachment: TaskAttachment | null = null;
      let associatedTask: any = null;

      for (const t of [...allTasks, ...allMotion]) {
        const atts: TaskAttachment[] = (t as any).attachments || getTaskAttachments(t.id);
        const match = atts.find(a => (attachmentId && a.id === attachmentId) || a.url === targetUrl);
        if (match) {
          foundAttachment = match;
          associatedTask = t;
          break;
        }
      }

      if (foundAttachment) {
        const isOwner = foundAttachment.uploaded_by === user.id;
        const isTaskCreator = associatedTask?.created_by === user.id;
        const isTaskPic = associatedTask?.design_pic_id === user.id || associatedTask?.strat_pic_id === user.id || associatedTask?.motion_pic_id === user.id;
        if (!isOwner && !isTaskCreator && !isTaskPic) {
          return NextResponse.json(
            { success: false, message: 'Akses ditolak: Anda tidak memiliki wewenang untuk menghapus foto ini' },
            { status: 403 }
          );
        }
      } else if (uploadedBy && uploadedBy !== user.id) {
        // If not attached to a persisted task yet, check declared uploader
        return NextResponse.json(
          { success: false, message: 'Akses ditolak: Anda tidak memiliki wewenang untuk menghapus foto ini' },
          { status: 403 }
        );
      }
    }

    // Security check: Path traversal prevention
    const cleanUrl = targetUrl.split('?')[0];
    if (cleanUrl.startsWith('/uploads/tasks/')) {
      const fileName = path.basename(cleanUrl);
      const filePath = path.join(UPLOAD_FULL_DIR, fileName);

      // Verify resolved path is strictly inside UPLOAD_FULL_DIR
      if (!filePath.startsWith(UPLOAD_FULL_DIR)) {
        return NextResponse.json(
          { success: false, message: 'Akses path tidak valid' },
          { status: 403 }
        );
      }

      if (fs.existsSync(filePath)) {
        try {
          fs.unlinkSync(filePath);
        } catch (fsUnlinkErr) {
          console.warn('[Upload] Failed to unlink local file (read-only filesystem):', fsUnlinkErr);
        }
      }
    } else {
      const storageClient = supabaseAdmin || supabase;
      if (storageClient && cleanUrl.includes('task-attachments')) {
        try {
          const parts = cleanUrl.split('task-attachments/');
          if (parts[1]) {
            await storageClient.storage.from('task-attachments').remove([parts[1]]);
          }
        } catch (sbDelErr) {
          console.warn('Failed to delete from Supabase storage:', sbDelErr);
        }
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Foto berhasil dihapus'
    });
  } catch (err: any) {
    console.error('API DELETE /api/upload error:', err);
    return NextResponse.json(
      { success: false, message: err?.message || 'Gagal menghapus foto' },
      { status: 500 }
    );
  }
}
