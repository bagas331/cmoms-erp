import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { resolveAuthenticatedUser } from '@/lib/server-auth';
import { verifyImageBufferServerSide, MAX_SECTION_IMAGES } from '@/lib/image-upload-utils';
import { TaskAttachment, AttachmentSection } from '@/lib/types';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';

// Ensure public upload directory exists
const UPLOAD_SUBDIR = path.join('uploads', 'tasks');
const UPLOAD_FULL_DIR = path.join(process.cwd(), 'public', UPLOAD_SUBDIR);

function ensureUploadDirExists() {
  if (!fs.existsSync(UPLOAD_FULL_DIR)) {
    fs.mkdirSync(UPLOAD_FULL_DIR, { recursive: true });
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

    ensureUploadDirExists();

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

      // 3. Save to local public storage
      fs.writeFileSync(destinationPath, buffer);

      let publicUrl = `/${UPLOAD_SUBDIR.replace(/\\/g, '/')}/${safeFileName}`;

      // 4. If Supabase Storage is configured, sync to bucket as well (graceful fallback)
      if (isSupabaseConfigured() && supabase) {
        try {
          const { data: uploadData, error: sbError } = await supabase.storage
            .from('task-attachments')
            .upload(`${section}/${safeFileName}`, buffer, {
              contentType: verification.mimeType,
              upsert: true
            });

          if (!sbError && uploadData?.path) {
            const { data: pubData } = supabase.storage
              .from('task-attachments')
              .getPublicUrl(uploadData.path);
            if (pubData?.publicUrl) {
              publicUrl = pubData.publicUrl;
            }
          }
        } catch (sbErr) {
          console.warn('Supabase storage upload skipped, using local filesystem:', sbErr);
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

    if (!targetUrl) {
      const body = await req.json().catch(() => null);
      if (body?.url) {
        targetUrl = body.url;
      }
    }

    if (!targetUrl || typeof targetUrl !== 'string') {
      return NextResponse.json(
        { success: false, message: 'URL foto yang akan dihapus wajib disertakan' },
        { status: 400 }
      );
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
        fs.unlinkSync(filePath);
      }
    } else if (isSupabaseConfigured() && supabase && cleanUrl.includes('task-attachments')) {
      try {
        const parts = cleanUrl.split('task-attachments/');
        if (parts[1]) {
          await supabase.storage.from('task-attachments').remove([parts[1]]);
        }
      } catch (sbDelErr) {
        console.warn('Failed to delete from Supabase storage:', sbDelErr);
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
