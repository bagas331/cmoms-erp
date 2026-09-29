'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { Layers, Eye, EyeOff, LogIn, Zap, Shield, BarChart3, Users, AlertTriangle } from 'lucide-react';
import Link from 'next/link';

const QUICK_LOGIN = [
  { email: 'admin@orbiz.id', pass: 'admin123', role: 'Admin', desc: 'Full system access' },
  { email: 'alfie@orbiz.id', pass: 'alfie123', role: 'Team Lead', desc: 'Triage & assign tasks' },
  { email: 'nadya@orbiz.id', pass: 'nadya123', role: 'Designer', desc: 'Design production' },
  { email: 'jova@orbiz.id', pass: 'jova123', role: 'Motion PIC', desc: 'Motion graphics' },
  { email: 'ira@orbiz.id', pass: 'ira123', role: 'Strategic PIC', desc: 'Brief & concept' },
  { email: 'sarah@orbiz.id', pass: 'sarah123', role: 'Requester', desc: 'Submit requests' },
];

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const { login } = useAuth();
  const router = useRouter();
  
  useEffect(() => {
    const saved = localStorage.getItem('cmoms_saved_login');
    if (saved) {
      try {
        const { email: sEmail, password: sPass } = JSON.parse(saved);
        setEmail(sEmail);
        setPassword(sPass);
        setRememberMe(true);
      } catch {}
    }
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoggingIn(true);

    const success = await login(email, password);
    if (success) {
      if (rememberMe) {
        localStorage.setItem('cmoms_saved_login', JSON.stringify({ email, password }));
      } else {
        localStorage.removeItem('cmoms_saved_login');
      }
      router.push('/dashboard');
    } else {
      setError('Email atau password salah. Coba gunakan quick login di bawah.');
      setIsLoggingIn(false);
    }
  };

  const handleQuickLogin = async (qEmail: string, qPass: string) => {
    setEmail(qEmail);
    setPassword(qPass);
    setError('');
    setIsLoggingIn(true);

    const success = await login(qEmail, qPass);
    if (success) {
      if (rememberMe) {
        localStorage.setItem('cmoms_saved_login', JSON.stringify({ email: qEmail, password: qPass }));
      } else {
        localStorage.removeItem('cmoms_saved_login');
      }
      router.push('/dashboard');
    } else {
      setIsLoggingIn(false);
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
              <h1 className="text-2xl font-bold text-[var(--text-primary)] leading-none">Monitoring</h1>
              <p className="text-xs text-[var(--text-muted)] mt-1">Desain Internal & External</p>
            </div>
          </div>

          <h2 className="text-4xl font-bold text-[var(--text-primary)] leading-tight mb-4">
            Manage Your <span className="text-[var(--accent-blue)]">Creative Pipeline</span> With Precision
          </h2>
          <p className="text-base mb-10 text-[var(--text-secondary)]">
            Sistem terpadu untuk mengelola request desain, SLA tracking, motion graphics handoff,
            dan analitik operasional tim kreatif — semua dalam satu platform.
          </p>

          <div className="grid grid-cols-2 gap-4">
            {[
              { icon: Zap, label: 'Automated SLA', desc: 'Auto-tracking 3-day SLA' },
              { icon: Shield, label: 'RBAC Security', desc: '6 role-based access levels' },
              { icon: BarChart3, label: 'Live Analytics', desc: 'Real-time dashboards' },
              { icon: Users, label: 'Team Workload', desc: 'Capacity point scoring' },
            ].map((f, i) => (
              <div key={i} className="p-4 rounded-xl bg-[var(--bg-primary)] border border-[var(--border-primary)]">
                <f.icon className="w-5 h-5 mb-2 text-[var(--accent-blue)]" />
                <p className="font-semibold text-sm text-[var(--text-primary)]">{f.label}</p>
                <p className="text-xs text-[var(--text-muted)]">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right - Login Form */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-8 bg-[var(--bg-primary)]">
        <div className="w-full max-w-md animate-fade-in">
          {/* Mobile Logo */}
          <div className="lg:hidden flex items-center gap-3 mb-8 justify-center">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center overflow-hidden">
              <img src="/logo.png" alt="Logo" className="w-full h-full object-contain" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-[var(--text-primary)] leading-none">Monitoring</h1>
              <p className="text-[10px] text-[var(--text-muted)] mt-1">Desain Internal & External</p>
            </div>
          </div>

          <div className="mb-8">
            <h2 className="text-2xl font-bold text-[var(--text-primary)] mb-2">Selamat Datang</h2>
            <p className="text-sm text-[var(--text-secondary)]">
              Masuk ke sistem manajemen operasional kreatif
            </p>
          </div>

          {error && (
            <div className="mb-4 p-3 rounded-lg text-sm animate-fade-in bg-red-500/10 border border-red-500/30 text-red-500">
              {error}
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4 mb-8">
            <div>
              <label className="label">Email</label>
              <input
                type="email"
                className="input"
                placeholder="email@orbiz.id"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="label">Password</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  className="input"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
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
            <div className="flex items-center gap-2 mt-2">
              <input 
                type="checkbox" 
                id="remember" 
                className="rounded border-[var(--border-primary)]" 
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
              />
              <label htmlFor="remember" className="text-sm cursor-pointer" style={{ color: 'var(--text-secondary)' }}>
                Ingat akun saya
              </label>
            </div>
            <button type="submit" className="btn-primary w-full justify-center" disabled={isLoggingIn}>
              {isLoggingIn ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  <LogIn className="w-4 h-4" />
                  Sign In
                </>
              )}
            </button>
          </form>

          {/* Quick Login */}
          <div>
            <div className="flex flex-col gap-1.5 mb-4 p-3.5 rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" />
                <span className="text-xs font-bold uppercase tracking-wider">Demo Version Disclaimer</span>
              </div>
              <p className="text-[11px] leading-relaxed">
                Karena aplikasi masih dalam tahap purwarupa (demo), Anda dapat menggunakan tombol <strong>Quick Login</strong> di bawah ini untuk masuk dan mencoba berbagai peran (roles) tanpa memasukkan password. Fitur ini akan dinonaktifkan saat aplikasi rilis ke production.
              </p>
            </div>

            <p className="text-xs font-medium mb-3 text-[var(--text-muted)]">
              QUICK LOGIN (DEMO)
            </p>
            <div className="grid grid-cols-2 gap-2">
              {QUICK_LOGIN.map((q) => (
                <button
                  key={q.email}
                  onClick={() => handleQuickLogin(q.email, q.pass)}
                  disabled={isLoggingIn}
                  className="p-3 rounded-lg text-left transition-all hover:scale-[1.02] bg-[var(--bg-tertiary)] border border-[var(--border-primary)]"
                >
                  <p className="font-semibold text-sm text-[var(--text-primary)]">{q.role}</p>
                  <p className="text-xs text-[var(--text-muted)]">{q.desc}</p>
                </button>
              ))}
            </div>
          </div>

          <p className="mt-8 text-center text-sm" style={{ color: 'var(--text-secondary)' }}>
            Baru diundang oleh Admin?{' '}
            <Link href="/register" className="font-semibold hover:underline" style={{ color: 'var(--accent-blue)' }}>
              Setup Akun di sini
            </Link>
          </p>

          <p className="mt-6 text-center text-xs text-[var(--text-muted)]">
            Orbiz Creative Operations • © 2026
          </p>
        </div>
      </div>
    </div>
  );
}
