import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://iaropwdmmishrcpxvlwt.supabase.co';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlhcm9wd2RtbWlzaHJjcHh2bHd0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4OTk2NzI2OSwiZXhwIjoyMTA1NTQzMjY5fQ.eyvBouw84AkMsh4e20eivJUnw-SNialaQHRqg_6m6HI';

const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { email, password } = body;

    if (!email || !password) {
      return NextResponse.json(
        { success: false, message: 'Email and password are required' },
        { status: 400 }
      );
    }

    const cleanEmail = email.trim().toLowerCase();

    const { data: user, error } = await supabaseAdmin
      .from('users')
      .select('*')
      .ilike('email', cleanEmail)
      .single();

    if (error || !user) {
      return NextResponse.json(
        { success: false, message: 'Akun tidak ditemukan' },
        { status: 401 }
      );
    }

    if (user.password_hash !== password) {
      return NextResponse.json(
        { success: false, message: 'Password salah' },
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
    return NextResponse.json(
      { success: false, message: err.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
