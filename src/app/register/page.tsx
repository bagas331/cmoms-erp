'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { registerUser } from '@/lib/supabase-store';
import { Eye, EyeOff, UserPlus } from 'lucide-react';
import Link from 'next/link';

function RegisterForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState('');
  
  useEffect(() => {
    const inviteEmail = searchParams.get('email');
    if (inviteEmail) {
      setEmail(inviteEmail);
    }
  }, [searchParams]);

  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const registered = await registerUser(email, fullName, password);
      if (registered) {
        setSuccess(true);
        setTimeout(() => {
          router.push('/login');
        }, 1500);
      } else {
        setError('Pendaftaran gagal. Pastikan email sudah didaftarkan oleh Admin dan belum teraktivasi.');
        setIsLoading(false);
      }
    } catch (err: any) {
      setError(err?.message || 'Terjadi kesalahan sistem saat mendaftar.');
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex bg-[var(--bg-primary)]">
      {/* Left - Branding */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden items-center justify-center p-12 bg-[var(--bg-secondary)] border-r border-[var(--border-primary)]">
        <div className="relative z-10 max-w-lg">
          <div className="flex items-center gap-3 mb-8">
            <div className="w-12 h-12 rounded-xl flex items-center justify-center overflow-hidden">
              <img src="/logo.png" alt="Logo" className="w-full h-full object-contain" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-[var(--text-primary)] leading-none">ORBIZ</h1>
              <p className="text-xs text-[var(--text-muted)] mt-1">Desain Internal & External</p>
            </div>
          </div>

          <h2 className="text-4xl font-bold text-[var(--text-primary)] leading-tight mb-4">
            Setup <span className="text-[var(--accent-blue)]">Your Account</span>
          </h2>
          <p className="text-base mb-10 text-[var(--text-secondary)]">
            Selesaikan pendaftaran akun yang telah dibuatkan oleh Admin atau Team Lead.
          </p>
        </div>
      </div>

      {/* Right - Register Form */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-8 bg-[var(--bg-primary)]">
        <div className="w-full max-w-md animate-fade-in">
          {/* Mobile Logo */}
          <div className="lg:hidden flex items-center gap-3 mb-8 justify-center">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center overflow-hidden">
              <img src="/logo.png" alt="Logo" className="w-full h-full object-contain" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-[var(--text-primary)] leading-none">ORBIZ & ORCA</h1>
              <p className="text-[10px] text-[var(--text-muted)] mt-1">Desain Internal & External</p>
            </div>
          </div>

          <div className="mb-8">
            <h2 className="text-2xl font-bold text-[var(--text-primary)] mb-2">Setup Akun</h2>
            <p className="text-sm text-[var(--text-secondary)]">
              Masukkan email yang diundang untuk melengkapi data Anda.
            </p>
          </div>

          {error && (
            <div className="mb-4 p-3 rounded-lg text-sm animate-fade-in bg-red-500/10 border border-red-500/30 text-red-500">
              {error}
            </div>
          )}

          {success && (
            <div className="mb-4 p-3 rounded-lg text-sm animate-fade-in bg-green-500/10 border border-green-500/30 text-green-500">
              Pendaftaran berhasil! Mengalihkan ke halaman login...
            </div>
          )}

          <form onSubmit={handleRegister} className="space-y-4 mb-8">
            <div>
              <label className="label">Email Terdaftar</label>
              <input
                type="email"
                className="input"
                placeholder="email@orbiz.id"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={success}
              />
            </div>
            <div>
              <label className="label">Nama Lengkap</label>
              <input
                type="text"
                className="input"
                placeholder="Nama Anda"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
                disabled={success}
              />
            </div>
            <div>
              <label className="label">Password Baru</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  className="input"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  disabled={success}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <button type="submit" className="btn-primary w-full justify-center" disabled={isLoading || success}>
              {isLoading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  <UserPlus className="w-4 h-4" />
                  Buat Akun
                </>
              )}
            </button>
          </form>

          <p className="text-sm text-center" style={{ color: 'var(--text-secondary)' }}>
            Sudah punya akun?{' '}
            <Link href="/login" className="font-semibold hover:underline" style={{ color: 'var(--accent-blue)' }}>
              Sign In di sini
            </Link>
          </p>

          <p className="mt-8 text-center text-xs text-[var(--text-muted)]">
            Orbiz Creative Operations • © 2026
          </p>
        </div>
      </div>
    </div>
  );
}

export default function RegisterPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-[var(--bg-primary)]"><div className="w-8 h-8 border-4 border-[var(--accent-blue)] border-t-transparent rounded-full animate-spin"></div></div>}>
      <RegisterForm />
    </Suspense>
  );
}
