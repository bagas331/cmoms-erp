'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { Eye, EyeOff, LogIn, Zap, Shield, BarChart3, Users, AlertTriangle } from 'lucide-react';
import Link from 'next/link';

const QUICK_LOGIN = [
  { email: 'admin@orbiz.id', pass: 'admin123', role: 'Admin', desc: 'Full system access' },
  { email: 'alfie@orbiz.id', pass: 'alfie123', role: 'Team Lead', desc: 'Triage & assign tasks' },
  { email: 'ira@orbiz.id', pass: 'ira123', role: 'Strategic', desc: 'Concept & visual brief' },
  { email: 'nadya@orbiz.id', pass: 'nadya123', role: 'GD', desc: 'Design production & QA' },
  { email: 'jova@orbiz.id', pass: 'jova123', role: 'Motion', desc: 'Motion graphics & render' },
  { email: 'sarah@orbiz.id', pass: 'sarah123', role: 'AE', desc: 'Brief & client liaison' },
  { email: 'sam@orbiz.id', pass: 'sam123', role: 'OP', desc: 'Live checkpoint & stream' },
];

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const { login, user, isAuthenticated, isLoading } = useAuth();
  const router = useRouter();
  
  useEffect(() => {
    // Prefetch dashboard routes for instant navigation upon login
    router.prefetch('/dashboard');
    router.prefetch('/dashboard/tasks');
    router.prefetch('/dashboard/capacity');

    const savedEmail = localStorage.getItem('cmoms_saved_email');
    if (savedEmail) {
      setEmail(savedEmail);
      setRememberMe(true);
    }
  }, [router]);

  useEffect(() => {
    if (!isLoading && isAuthenticated && user) {
      router.replace('/dashboard');
    }
  }, [isAuthenticated, isLoading, user, router]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoggingIn(true);

    const success = await login(email, password);
    if (success) {
      if (rememberMe) {
        localStorage.setItem('cmoms_saved_email', email.trim());
      } else {
        localStorage.removeItem('cmoms_saved_email');
      }
      router.replace('/dashboard');
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
        localStorage.setItem('cmoms_saved_email', qEmail.trim());
      } else {
        localStorage.removeItem('cmoms_saved_email');
      }
      router.replace('/dashboard');
    } else {
      setIsLoggingIn(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', background: 'var(--bg-primary)' }}>
      {/* Left - Branding */}
      <div className="hidden lg:flex" style={{
        width: '50%', position: 'relative', overflow: 'hidden', alignItems: 'center',
        justifyContent: 'center', padding: '48px',
        background: 'var(--bg-secondary)', borderRight: '1px solid var(--border-primary)'
      }}>
        <div style={{ maxWidth: '420px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '32px' }}>
            <div style={{ width: '36px', height: '36px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
              <img src="/logo.png" alt="Logo" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
            </div>
            <div>
              <h1 style={{ fontSize: '16px', fontWeight: '700', color: 'var(--text-primary)', lineHeight: 1.2, margin: 0 }}>Monitoring</h1>
              <p style={{ fontSize: '10px', color: 'var(--text-muted)', margin: '1px 0 0' }}>Desain Internal & External</p>
            </div>
          </div>

          <h2 style={{ fontSize: '28px', fontWeight: '700', color: 'var(--text-primary)', lineHeight: 1.2, marginBottom: '12px' }}>
            Manage Your <span style={{ color: 'var(--accent-blue)' }}>Creative Pipeline</span> With Precision
          </h2>
          <p style={{ fontSize: '14px', marginBottom: '32px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            Sistem terpadu untuk mengelola request desain, SLA tracking, motion graphics handoff,
            dan analitik operasional tim kreatif — semua dalam satu platform.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            {[
              { icon: Zap, label: 'Automated SLA', desc: 'Auto-tracking 3-day SLA' },
              { icon: Shield, label: 'RBAC Security', desc: '6 role-based access levels' },
              { icon: BarChart3, label: 'Live Analytics', desc: 'Real-time dashboards' },
              { icon: Users, label: 'Team Workload', desc: 'Capacity point scoring' },
            ].map((f, i) => (
              <div key={i} style={{
                padding: '14px', borderRadius: '8px',
                background: 'var(--bg-primary)', border: '1px solid var(--border-primary)'
              }}>
                <f.icon style={{ width: '16px', height: '16px', marginBottom: '8px', color: 'var(--accent-blue)' }} />
                <p style={{ fontWeight: '600', fontSize: '12px', color: 'var(--text-primary)', margin: 0 }}>{f.label}</p>
                <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: '2px 0 0' }}>{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right - Login Form */}
      <div style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '32px' }}
        className="lg:w-1/2">
        <div style={{ width: '100%', maxWidth: '400px' }} className="animate-fade-in">
          {/* Mobile Logo */}
          <div className="lg:hidden" style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '32px', justifyContent: 'center' }}>
            <div style={{ width: '32px', height: '32px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
              <img src="/logo.png" alt="Logo" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
            </div>
            <div>
              <h1 style={{ fontSize: '16px', fontWeight: '700', color: 'var(--text-primary)', lineHeight: 1.2, margin: 0 }}>Monitoring</h1>
              <p style={{ fontSize: '10px', color: 'var(--text-muted)', margin: 0 }}>Desain Internal & External</p>
            </div>
          </div>

          <div style={{ marginBottom: '24px' }}>
            <h2 style={{ fontSize: '20px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '4px' }}>Selamat Datang</h2>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
              Masuk ke sistem manajemen operasional kreatif
            </p>
          </div>

          {error && (
            <div style={{
              marginBottom: '16px', padding: '10px 12px', borderRadius: '6px', fontSize: '12px',
              background: 'color-mix(in srgb, var(--accent-red) 8%, transparent)',
              border: '1px solid color-mix(in srgb, var(--accent-red) 25%, transparent)',
              color: 'var(--accent-red)'
            }} className="animate-fade-in">
              {error}
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4" style={{ marginBottom: '24px' }}>
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
              <div style={{ position: 'relative' }}>
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
                  style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '2px' }}
                >
                  {showPassword ? <EyeOff style={{ width: '15px', height: '15px' }} /> : <Eye style={{ width: '15px', height: '15px' }} />}
                </button>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <input 
                type="checkbox" 
                id="remember" 
                style={{ accentColor: 'var(--accent-blue)' }}
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
              />
              <label htmlFor="remember" style={{ fontSize: '12px', cursor: 'pointer', color: 'var(--text-secondary)' }}>
                Ingat akun saya
              </label>
            </div>
            <button type="submit" className="btn-primary" style={{ width: '100%', justifyContent: 'center', padding: '9px 16px' }} disabled={isLoggingIn}>
              {isLoggingIn ? (
                <div style={{ width: '16px', height: '16px', border: '2px solid rgba(255,255,255,0.3)', borderTopColor: 'white', borderRadius: '50%' }} className="animate-spin" />
              ) : (
                <>
                  <LogIn style={{ width: '14px', height: '14px' }} />
                  Sign In
                </>
              )}
            </button>
          </form>

          {/* Quick Login */}
          <div>
            <div style={{
              display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '12px',
              padding: '10px 12px', borderRadius: '6px',
              border: '1px solid color-mix(in srgb, var(--accent-amber) 30%, transparent)',
              background: 'color-mix(in srgb, var(--accent-amber) 6%, transparent)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <AlertTriangle style={{ width: '13px', height: '13px', color: 'var(--accent-amber)' }} />
                <span style={{ fontSize: '10px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--accent-amber)' }}>Demo Version</span>
              </div>
              <p style={{ fontSize: '11px', lineHeight: 1.5, color: 'var(--text-secondary)' }}>
                Gunakan tombol <strong>Quick Login</strong> di bawah untuk mencoba berbagai peran tanpa memasukkan password.
              </p>
            </div>

            <p style={{ fontSize: '10px', fontWeight: '600', marginBottom: '8px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Quick Login (Demo)
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
              {QUICK_LOGIN.map((q) => (
                <button
                  key={q.email}
                  onClick={() => handleQuickLogin(q.email, q.pass)}
                  disabled={isLoggingIn}
                  style={{
                    padding: '8px 10px', borderRadius: '6px', textAlign: 'left',
                    transition: 'border-color 0.1s ease', cursor: 'pointer',
                    background: 'var(--bg-secondary)', border: '1px solid var(--border-primary)',
                    display: 'block', width: '100%'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.borderColor = 'var(--text-muted)'}
                  onMouseLeave={(e) => e.currentTarget.style.borderColor = 'var(--border-primary)'}
                >
                  <p style={{ fontWeight: '600', fontSize: '12px', color: 'var(--text-primary)', margin: 0 }}>{q.role}</p>
                  <p style={{ fontSize: '10px', color: 'var(--text-muted)', margin: '2px 0 0' }}>{q.desc}</p>
                </button>
              ))}
            </div>
          </div>

          <p style={{ marginTop: '24px', textAlign: 'center', fontSize: '12px', color: 'var(--text-secondary)' }}>
            Baru diundang oleh Admin?{' '}
            <Link href="/register" style={{ fontWeight: '600', color: 'var(--accent-blue)', textDecoration: 'none' }}>
              Setup Akun di sini
            </Link>
          </p>

          <p style={{ marginTop: '16px', textAlign: 'center', fontSize: '10px', color: 'var(--text-muted)' }}>
            Orbiz Creative Operations • © 2026
          </p>
        </div>
      </div>
    </div>
  );
}
