'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { getUsers } from '@/lib/supabase-store';
import { SEED_USERS } from '@/lib/seed-data';
import { ROLE_LABELS, ROLE_COLORS } from '@/lib/constants';
import { User, RoleName } from '@/lib/types';
import { getInitials } from '@/lib/utils';
import {
  Eye, EyeOff, LogIn, Zap, Shield, BarChart3, Users,
  AlertTriangle, Search, CheckCircle2, UserCheck, Sparkles,
  Palette, Video, Lightbulb, Crown, Radio
} from 'lucide-react';
import Link from 'next/link';

interface QuickAccount {
  email: string;
  pass: string;
  name: string;
  role_name: RoleName;
  initials: string;
}

const ROLE_ICONS: Record<RoleName, any> = {
  ADMIN: Shield,
  TEAM_LEAD: Crown,
  STRATEGIC_PIC: Lightbulb,
  DESIGNER: Palette,
  MOTION_PIC: Video,
  REQUESTER: UserCheck,
  OPERATOR: Radio,
};

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [loggingInEmail, setLoggingInEmail] = useState<string | null>(null);

  // Quick Access state
  const [allAccounts, setAllAccounts] = useState<QuickAccount[]>([]);
  const [selectedRoleTab, setSelectedRoleTab] = useState<string>('ALL');
  const [searchAccountQuery, setSearchAccountQuery] = useState('');

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

    // Load all accounts (from dynamic store & fallback seed users)
    const loadAccounts = async () => {
      try {
        const dynamicUsers = await getUsers();
        const accountMap = new Map<string, QuickAccount>();

        // 1. Add seed users as baseline with known demo passwords
        SEED_USERS.forEach((u) => {
          const prefix = u.email.split('@')[0];
          accountMap.set(u.email.toLowerCase(), {
            email: u.email,
            pass: u.password_hash || `${prefix}123`,
            name: u.full_name,
            role_name: u.role_name,
            initials: u.avatar_initials || getInitials(u.full_name),
          });
        });

        // 2. Add / merge dynamic users
        if (dynamicUsers && dynamicUsers.length > 0) {
          dynamicUsers.forEach((u) => {
            const clean = u.email.toLowerCase();
            const existing = accountMap.get(clean);
            const prefix = u.email.split('@')[0];
            accountMap.set(clean, {
              email: u.email,
              pass: u.password_hash || (existing ? existing.pass : `${prefix}123`),
              name: u.full_name || (existing ? existing.name : u.email),
              role_name: u.role_name || (existing ? existing.role_name : 'REQUESTER'),
              initials: u.avatar_initials || getInitials(u.full_name || u.email),
            });
          });
        }

        setAllAccounts(Array.from(accountMap.values()));
      } catch (err) {
        console.warn('Failed to load accounts dynamically, falling back to seed:', err);
        setAllAccounts(
          SEED_USERS.map((u) => ({
            email: u.email,
            pass: u.password_hash || `${u.email.split('@')[0]}123`,
            name: u.full_name,
            role_name: u.role_name,
            initials: u.avatar_initials || getInitials(u.full_name),
          }))
        );
      }
    };

    loadAccounts();
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
      setError('Email atau password salah. Coba pilih akun pada panel Quick Access di bawah.');
      setIsLoggingIn(false);
      setLoggingInEmail(null);
    }
  };

  const handleQuickLogin = async (account: QuickAccount) => {
    setEmail(account.email);
    setPassword(account.pass);
    setError('');
    setIsLoggingIn(true);
    setLoggingInEmail(account.email);

    const success = await login(account.email, account.pass);
    if (success) {
      if (rememberMe) {
        localStorage.setItem('cmoms_saved_email', account.email.trim());
      } else {
        localStorage.removeItem('cmoms_saved_email');
      }
      router.replace('/dashboard');
    } else {
      setIsLoggingIn(false);
      setLoggingInEmail(null);
      setError(`Gagal login otomatis sebagai ${account.name}.`);
    }
  };

  // Filtered accounts for Quick Access
  const filteredAccounts = useMemo(() => {
    return allAccounts.filter((acc) => {
      // Role filter
      if (selectedRoleTab !== 'ALL') {
        if (selectedRoleTab === 'LEAD' && acc.role_name !== 'ADMIN' && acc.role_name !== 'TEAM_LEAD') return false;
        if (selectedRoleTab === 'STRATEGIC' && acc.role_name !== 'STRATEGIC_PIC') return false;
        if (selectedRoleTab === 'DESIGN' && acc.role_name !== 'DESIGNER') return false;
        if (selectedRoleTab === 'MOTION' && acc.role_name !== 'MOTION_PIC') return false;
        if (selectedRoleTab === 'AE' && acc.role_name !== 'REQUESTER') return false;
        if (selectedRoleTab === 'OP' && acc.role_name !== 'OPERATOR') return false;
      }

      // Search query filter
      if (searchAccountQuery.trim()) {
        const q = searchAccountQuery.toLowerCase();
        const matchesName = acc.name.toLowerCase().includes(q);
        const matchesEmail = acc.email.toLowerCase().includes(q);
        const matchesRole = (ROLE_LABELS[acc.role_name] || '').toLowerCase().includes(q);
        return matchesName || matchesEmail || matchesRole;
      }

      return true;
    });
  }, [allAccounts, selectedRoleTab, searchAccountQuery]);

  return (
    <div style={{ minHeight: '100vh', display: 'flex', background: 'var(--bg-primary)' }}>
      {/* Left - Branding & Feature Overview */}
      <div
        className="hidden lg:flex"
        style={{
          width: '45%',
          position: 'relative',
          overflow: 'hidden',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '48px',
          background: 'var(--bg-secondary)',
          borderRight: '1px solid var(--border-primary)',
        }}
      >
        <div style={{ maxWidth: '440px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '32px' }}>
            <div
              style={{
                width: '42px',
                height: '42px',
                borderRadius: '10px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden',
                boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
              }}
            >
              <img src="/logo.png" alt="Logo" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
            </div>
            <div>
              <h1 style={{ fontSize: '18px', fontWeight: '800', color: 'var(--text-primary)', lineHeight: 1.2, margin: 0 }}>
                CMOMS ERP
              </h1>
              <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: '2px 0 0' }}>
                Creative &amp; Motion Operations System
              </p>
            </div>
          </div>

          <h2 style={{ fontSize: '30px', fontWeight: '800', color: 'var(--text-primary)', lineHeight: 1.2, marginBottom: '14px' }}>
            Manage Your <span style={{ color: 'var(--accent-blue)' }}>Creative Pipeline</span> With SOP RACI
          </h2>
          <p style={{ fontSize: '13.5px', marginBottom: '28px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            Sistem terpadu operasional tim kreatif yang menyelaraskan alur kerja <strong>AE</strong>, <strong>Strategic</strong>, <strong>GD</strong>, <strong>Motion</strong>, dan <strong>OP</strong> dengan standar SLA &amp; pelacakan kapasitas otomatis.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            {[
              { icon: Zap, label: 'Automated SLA', desc: 'Auto-tracking 3-day SLA' },
              { icon: Shield, label: 'SOP RACI Roles', desc: 'AE, Strat, GD, Motion & OP' },
              { icon: BarChart3, label: 'Live Analytics', desc: 'Real-time pipeline metrics' },
              { icon: Users, label: 'Capacity Engine', desc: 'Daily workload points scoring' },
            ].map((f, i) => (
              <div
                key={i}
                style={{
                  padding: '14px',
                  borderRadius: '10px',
                  background: 'var(--bg-primary)',
                  border: '1px solid var(--border-primary)',
                }}
              >
                <f.icon style={{ width: '18px', height: '18px', marginBottom: '8px', color: 'var(--accent-blue)' }} />
                <p style={{ fontWeight: '700', fontSize: '12px', color: 'var(--text-primary)', margin: 0 }}>{f.label}</p>
                <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: '2px 0 0' }}>{f.desc}</p>
              </div>
            ))}
          </div>

          <div
            style={{
              marginTop: '28px',
              padding: '14px 16px',
              borderRadius: '10px',
              background: 'color-mix(in srgb, var(--accent-blue) 6%, transparent)',
              border: '1px solid color-mix(in srgb, var(--accent-blue) 20%, transparent)',
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
            }}
          >
            <Sparkles style={{ width: '20px', height: '20px', color: 'var(--accent-blue)', flexShrink: 0 }} />
            <p style={{ fontSize: '11.5px', margin: 0, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              Tersedia <strong>{allAccounts.length} Akun Demo Lengkap</strong> untuk semua divisi &amp; role. Klik akun mana saja di sisi kanan untuk langsung login.
            </p>
          </div>
        </div>
      </div>

      {/* Right - Login Form & All Accounts Quick Access */}
      <div
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '24px 20px',
          overflowY: 'auto',
          maxHeight: '100vh',
        }}
        className="lg:w-[55%]"
      >
        <div style={{ width: '100%', maxWidth: '520px' }} className="animate-fade-in">
          {/* Mobile Header */}
          <div className="lg:hidden" style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '24px', justifyContent: 'center' }}>
            <div style={{ width: '36px', height: '36px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
              <img src="/logo.png" alt="Logo" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
            </div>
            <div>
              <h1 style={{ fontSize: '16px', fontWeight: '800', color: 'var(--text-primary)', lineHeight: 1.2, margin: 0 }}>CMOMS ERP</h1>
              <p style={{ fontSize: '10px', color: 'var(--text-muted)', margin: 0 }}>Monitoring Desain &amp; Motion</p>
            </div>
          </div>

          <div style={{ marginBottom: '20px' }}>
            <h2 style={{ fontSize: '22px', fontWeight: '800', color: 'var(--text-primary)', marginBottom: '4px' }}>
              Masuk ke Akun
            </h2>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
              Silakan masuk dengan email atau pilih akun dari daftar di bawah
            </p>
          </div>

          {error && (
            <div
              style={{
                marginBottom: '16px',
                padding: '10px 14px',
                borderRadius: '8px',
                fontSize: '12px',
                background: 'color-mix(in srgb, var(--accent-red) 10%, transparent)',
                border: '1px solid color-mix(in srgb, var(--accent-red) 25%, transparent)',
                color: 'var(--accent-red)',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
              className="animate-fade-in"
            >
              <AlertTriangle style={{ width: '14px', height: '14px', flexShrink: 0 }} />
              <span>{error}</span>
            </div>
          )}

          {/* Direct Credentials Form */}
          <form onSubmit={handleLogin} className="space-y-3.5" style={{ marginBottom: '24px' }}>
            <div>
              <label className="label" style={{ fontSize: '12px', fontWeight: '600' }}>Email Pengguna</label>
              <input
                type="email"
                className="input"
                placeholder="nama@orbiz.id"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                style={{ fontSize: '13px', padding: '9px 12px' }}
              />
            </div>
            <div>
              <label className="label" style={{ fontSize: '12px', fontWeight: '600' }}>Kata Sandi</label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showPassword ? 'text' : 'password'}
                  className="input"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  style={{ fontSize: '13px', padding: '9px 12px' }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  style={{
                    position: 'absolute',
                    right: '10px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: 'var(--text-muted)',
                    padding: '4px',
                  }}
                >
                  {showPassword ? <EyeOff style={{ width: '15px', height: '15px' }} /> : <Eye style={{ width: '15px', height: '15px' }} />}
                </button>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', cursor: 'pointer', color: 'var(--text-secondary)' }}>
                <input
                  type="checkbox"
                  style={{ accentColor: 'var(--accent-blue)' }}
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                />
                Ingat akun saya
              </label>

              <Link href="/register" style={{ fontSize: '11.5px', fontWeight: '600', color: 'var(--accent-blue)', textDecoration: 'none' }}>
                Setup Akun Baru →
              </Link>
            </div>

            <button
              type="submit"
              className="btn-primary"
              style={{ width: '100%', justifyContent: 'center', padding: '10px 16px', fontWeight: '600', fontSize: '13px' }}
              disabled={isLoggingIn}
            >
              {isLoggingIn && !loggingInEmail ? (
                <div style={{ width: '16px', height: '16px', border: '2px solid rgba(255,255,255,0.3)', borderTopColor: 'white', borderRadius: '50%' }} className="animate-spin" />
              ) : (
                <>
                  <LogIn style={{ width: '15px', height: '15px' }} />
                  Masuk Sekarang
                </>
              )}
            </button>
          </form>

          {/* ============================================================
              ALL ACCOUNTS QUICK ACCESS SECTION
              ============================================================ */}
          <div
            style={{
              padding: '16px',
              borderRadius: '12px',
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border-primary)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Users style={{ width: '16px', height: '16px', color: 'var(--accent-blue)' }} />
                <span style={{ fontSize: '12.5px', fontWeight: '700', color: 'var(--text-primary)' }}>
                  Quick Access Semua Akun ({allAccounts.length})
                </span>
              </div>
              <span
                style={{
                  fontSize: '10px',
                  fontWeight: '700',
                  padding: '2px 8px',
                  borderRadius: '999px',
                  background: 'color-mix(in srgb, var(--accent-amber) 15%, transparent)',
                  color: 'var(--accent-amber)',
                  border: '1px solid color-mix(in srgb, var(--accent-amber) 30%, transparent)',
                }}
              >
                1-Click Login
              </span>
            </div>

            <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: '0 0 12px 0', lineHeight: 1.4 }}>
              Pilih profil pengguna di bawah untuk langsung masuk sesuai role masing-masing tanpa mengetik manual.
            </p>

            {/* Search Input */}
            <div style={{ position: 'relative', marginBottom: '10px' }}>
              <Search
                style={{
                  position: 'absolute',
                  left: '10px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  width: '13px',
                  height: '13px',
                  color: 'var(--text-muted)',
                }}
              />
              <input
                type="text"
                className="input"
                placeholder="Cari nama, email, atau peran..."
                value={searchAccountQuery}
                onChange={(e) => setSearchAccountQuery(e.target.value)}
                style={{
                  paddingLeft: '30px',
                  paddingRight: '10px',
                  paddingTop: '6px',
                  paddingBottom: '6px',
                  fontSize: '11.5px',
                  height: '32px',
                  borderRadius: '6px',
                }}
              />
            </div>

            {/* Role Filter Tabs */}
            <div
              style={{
                display: 'flex',
                gap: '4px',
                overflowX: 'auto',
                paddingBottom: '6px',
                marginBottom: '10px',
              }}
              className="custom-scrollbar"
            >
              {[
                { id: 'ALL', label: 'Semua' },
                { id: 'LEAD', label: 'Admin/Lead' },
                { id: 'AE', label: 'AE' },
                { id: 'STRATEGIC', label: 'Strategic' },
                { id: 'DESIGN', label: 'GD' },
                { id: 'MOTION', label: 'Motion' },
                { id: 'OP', label: 'OP' },
              ].map((tab) => {
                const isActive = selectedRoleTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setSelectedRoleTab(tab.id)}
                    style={{
                      padding: '4px 9px',
                      fontSize: '10.5px',
                      fontWeight: isActive ? '700' : '500',
                      borderRadius: '6px',
                      border: '1px solid',
                      borderColor: isActive ? 'var(--accent-blue)' : 'var(--border-primary)',
                      background: isActive ? 'var(--accent-blue)' : 'var(--bg-primary)',
                      color: isActive ? '#ffffff' : 'var(--text-secondary)',
                      cursor: 'pointer',
                      whiteSpace: 'nowrap',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>

            {/* Scrollable Accounts Grid */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
                gap: '8px',
                maxHeight: '260px',
                overflowY: 'auto',
                paddingRight: '4px',
              }}
              className="custom-scrollbar"
            >
              {filteredAccounts.length === 0 ? (
                <div style={{ gridColumn: '1 / -1', padding: '24px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: '11.5px' }}>
                  Tidak ada akun yang cocok dengan pencarian "{searchAccountQuery}"
                </div>
              ) : (
                filteredAccounts.map((acc) => {
                  const RoleIcon = ROLE_ICONS[acc.role_name] || UserCheck;
                  const isCurrentLoggingIn = isLoggingIn && loggingInEmail === acc.email;

                  return (
                    <button
                      key={acc.email}
                      type="button"
                      onClick={() => handleQuickLogin(acc)}
                      disabled={isLoggingIn}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '8px 10px',
                        borderRadius: '8px',
                        textAlign: 'left',
                        cursor: isLoggingIn ? 'not-allowed' : 'pointer',
                        background: 'var(--bg-primary)',
                        border: '1px solid var(--border-primary)',
                        transition: 'all 0.15s ease',
                        position: 'relative',
                        overflow: 'hidden',
                        opacity: isLoggingIn && !isCurrentLoggingIn ? 0.6 : 1,
                      }}
                      onMouseEnter={(e) => {
                        if (!isLoggingIn) {
                          e.currentTarget.style.borderColor = 'var(--accent-blue)';
                          e.currentTarget.style.transform = 'translateY(-1px)';
                          e.currentTarget.style.boxShadow = '0 3px 8px rgba(0,0,0,0.06)';
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!isLoggingIn) {
                          e.currentTarget.style.borderColor = 'var(--border-primary)';
                          e.currentTarget.style.transform = 'translateY(0)';
                          e.currentTarget.style.boxShadow = 'none';
                        }
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                        {/* Avatar Initials */}
                        <div
                          style={{
                            width: '28px',
                            height: '28px',
                            borderRadius: '7px',
                            background: 'color-mix(in srgb, var(--accent-blue) 12%, transparent)',
                            color: 'var(--accent-blue)',
                            border: '1px solid color-mix(in srgb, var(--accent-blue) 25%, transparent)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '10px',
                            fontWeight: '800',
                            flexShrink: 0,
                          }}
                        >
                          {acc.initials}
                        </div>

                        {/* Name & Role */}
                        <div style={{ minWidth: 0 }}>
                          <p
                            style={{
                              fontWeight: '700',
                              fontSize: '11.5px',
                              color: 'var(--text-primary)',
                              margin: 0,
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                            }}
                          >
                            {acc.name}
                          </p>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '1px' }}>
                            <RoleIcon style={{ width: '10px', height: '10px', color: 'var(--text-muted)', flexShrink: 0 }} />
                            <span
                              style={{
                                fontSize: '10px',
                                fontWeight: '600',
                                color: 'var(--text-muted)',
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                              }}
                            >
                              {ROLE_LABELS[acc.role_name] || acc.role_name}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Action indicator */}
                      <div style={{ flexShrink: 0, marginLeft: '6px' }}>
                        {isCurrentLoggingIn ? (
                          <div
                            style={{
                              width: '14px',
                              height: '14px',
                              border: '2px solid var(--accent-blue)',
                              borderTopColor: 'transparent',
                              borderRadius: '50%',
                            }}
                            className="animate-spin"
                          />
                        ) : (
                          <span
                            style={{
                              fontSize: '10px',
                              fontWeight: '700',
                              color: 'var(--accent-blue)',
                              opacity: 0.8,
                            }}
                          >
                            Masuk →
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          <p style={{ marginTop: '20px', textAlign: 'center', fontSize: '11px', color: 'var(--text-muted)' }}>
            Orbiz Creative Operations • Monitoring Desain &amp; Motion © 2026
          </p>
        </div>
      </div>
    </div>
  );
}
