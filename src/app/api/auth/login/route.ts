import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

const supabaseAdmin = supabaseUrl && serviceRoleKey 
  ? createClient(supabaseUrl, serviceRoleKey)
  : null;

/**
 * Constant-time string comparison to prevent timing attacks
 */
function timingSafePasswordMatch(a: string, b: string): boolean {
  try {
    const bufA = Buffer.from(a, 'utf-8');
    const bufB = Buffer.from(b, 'utf-8');
    if (bufA.length !== bufB.length) {
      crypto.timingSafeEqual(bufA, bufA);
      return false;
    }
    return crypto.timingSafeEqual(bufA, bufB);
  } catch {
    return false;
  }
}

export async function POST(req: Request) {
  try {
    if (!supabaseAdmin) {
      return NextResponse.json(
        { success: false, message: 'Layanan autentikasi belum terkonfigurasi' },
        { status: 503 }
      );
    }

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json(
        { success: false, message: 'Format permintaan tidak valid' },
        { status: 400 }
      );
    }

    const { email, password } = body;

    if (!email || !password || typeof email !== 'string' || typeof password !== 'string') {
      return NextResponse.json(
        { success: false, message: 'Email dan password wajib diisi' },
        { status: 400 }
      );
    }

    const cleanEmail = email.trim().toLowerCase();
    // Validate email format and length
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    if (!emailRegex.test(cleanEmail) || cleanEmail.length > 254 || password.length > 256) {
      return NextResponse.json(
        { success: false, message: 'Email atau kata sandi tidak valid' },
        { status: 401 }
      );
    }

    const { data: user, error } = await supabaseAdmin
      .from('users')
      .select('*')
      .ilike('email', cleanEmail)
      .single();

    // Prevent User Enumeration by using identical timing & message
    if (error || !user) {
      // Perform a dummy timing match to normalize response time
      timingSafePasswordMatch(password, 'dummy_password_hash_timing_safe');
      return NextResponse.json(
        { success: false, message: 'Email atau kata sandi tidak valid' },
        { status: 401 }
      );
    }

    const isMatch = timingSafePasswordMatch(user.password_hash || '', password);
    if (!isMatch) {
      return NextResponse.json(
        { success: false, message: 'Email atau kata sandi tidak valid' },
        { status: 401 }
      );
    }

    // Exclude password_hash from response
    const { password_hash, ...safeUser } = user;

    return NextResponse.json({
      success: true,
      user: safeUser,
    });
  } catch (err: any) {
    // Log internally, do not leak stack trace or internal details to client
    console.error('Authentication error:', err?.message || 'Unknown error');
    return NextResponse.json(
      { success: false, message: 'Terjadi kesalahan sistem pada proses login' },
      { status: 500 }
    );
  }
}

