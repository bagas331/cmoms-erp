'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { getUsers } from '@/lib/supabase-store';
import { SEED_USERS } from '@/lib/seed-data';
import { ROLE_LABELS } from '@/lib/constants';
import { RoleName } from '@/lib/types';
import { getInitials } from '@/lib/utils';
import {
  Eye, EyeOff, LogIn, Shield, Users,
  AlertTriangle, Search, UserCheck,
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
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '36px 20px',
        background: 'var(--bg-primary)',
      }}
    >
      <div style={{ width: '100%', maxWidth: '560px' }} className="animate-fade-in">
        
        {/* Brand Header */}
        <div style={{ textAlign: 'center', marginBottom: '28px' }}>
          <div
            style={{
              width: '52px',
              height: '52px',
              borderRadius: '14px',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'hidden',
              boxShadow: '0 6px 16px rgba(0,0,0,0.08)',
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border-primary)',
              marginBottom: '12px',
            }}
          >
            <img src="/logo.png" alt="CMOS Logo" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
          </div>
          <h1 style={{ fontSize: '22px', fontWeight: '800', color: 'var(--text-primary)', margin: 0, lineHeight: 1.2 }}>
            CMOS ERP
          </h1>
          <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '4px 0 0' }}>
            Creative &amp; Motion Operations System
          </p>
        </div>

        {/* Main Card */}
        <div
          style={{
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border-primary)',
            borderRadius: '16px',
            boxShadow: 'var(--shadow-dropdown)',
            padding: '28px',
          }}
        >
          <div style={{ marginBottom: '20px' }}>
            <h2 style={{ fontSize: '18px', fontWeight: '700', color: 'var(--text-primary)', margin: 0 }}>
              Masuk ke Akun
            </h2>
            <p style={{ fontSize: '12.5px', color: 'var(--text-secondary)', margin: '3px 0 0' }}>
              Masukkan email dan kata sandi Anda atau gunakan akses instan demo di bawah.
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

          {/* Credentials Form */}
          <form onSubmit={handleLogin} className="space-y-3.5">
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
              style={{ width: '100%', justifyContent: 'center', padding: '10px 16px', fontWeight: '600', fontSize: '13px', marginTop: '6px' }}
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

          {/* Divider */}
          <div style={{ position: 'relative', margin: '24px 0 20px 0', textAlign: 'center' }}>
            <div style={{ position: 'absolute', inset: '0', display: 'flex', alignItems: 'center' }}>
              <div style={{ width: '100%', borderTop: '1px solid var(--border-primary)' }} />
            </div>
            <div style={{ position: 'relative', display: 'inline-block', padding: '0 12px', background: 'var(--bg-secondary)', fontSize: '11px', fontWeight: '600', color: 'var(--text-muted)' }}>
              atau akses demo instan (1-click)
            </div>
          </div>

          {/* ============================================================
              ALL ACCOUNTS QUICK ACCESS SECTION
              ============================================================ */}
          <div
            style={{
              padding: '16px',
              borderRadius: '12px',
              background: 'var(--bg-primary)',
              border: '1px solid var(--border-primary)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
                <Users style={{ width: '15px', height: '15px', color: 'var(--accent-blue)' }} />
                <span style={{ fontSize: '12px', fontWeight: '700', color: 'var(--text-primary)' }}>
                  Pilih Akun Demo ({allAccounts.length})
                </span>
              </div>
              <span
                style={{
                  fontSize: '10px',
                  fontWeight: '700',
                  padding: '2px 7px',
                  borderRadius: '999px',
                  background: 'color-mix(in srgb, var(--accent-blue) 12%, transparent)',
                  color: 'var(--accent-blue)',
                  border: '1px solid color-mix(in srgb, var(--accent-blue) 25%, transparent)',
                }}
              >
                1-Click Login
              </span>
            </div>

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
                      padding: '3px 8px',
                      fontSize: '10.5px',
                      fontWeight: isActive ? '700' : '500',
                      borderRadius: '5px',
                      border: '1px solid',
                      borderColor: isActive ? 'var(--accent-blue)' : 'var(--border-secondary)',
                      background: isActive ? 'var(--accent-blue)' : 'var(--bg-secondary)',
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
                gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))',
                gap: '8px',
                maxHeight: '230px',
                overflowY: 'auto',
                paddingRight: '4px',
              }}
              className="custom-scrollbar"
            >
              {filteredAccounts.length === 0 ? (
                <div style={{ gridColumn: '1 / -1', padding: '20px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: '11.5px' }}>
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
                        padding: '7px 9px',
                        borderRadius: '7px',
                        textAlign: 'left',
                        cursor: isLoggingIn ? 'not-allowed' : 'pointer',
                        background: 'var(--bg-secondary)',
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
                          e.currentTarget.style.boxShadow = '0 2px 6px rgba(0,0,0,0.06)';
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
                            width: '26px',
                            height: '26px',
                            borderRadius: '6px',
                            background: 'color-mix(in srgb, var(--accent-blue) 12%, transparent)',
                            color: 'var(--accent-blue)',
                            border: '1px solid color-mix(in srgb, var(--accent-blue) 25%, transparent)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '9.5px',
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
                              fontSize: '11px',
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
                            <RoleIcon style={{ width: '9px', height: '9px', color: 'var(--text-muted)', flexShrink: 0 }} />
                            <span
                              style={{
                                fontSize: '9.5px',
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
                              width: '13px',
                              height: '13px',
                              border: '2px solid var(--accent-blue)',
                              borderTopColor: 'transparent',
                              borderRadius: '50%',
                            }}
                            className="animate-spin"
                          />
                        ) : (
                          <span
                            style={{
                              fontSize: '9.5px',
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
        </div>

        {/* Footer */}
        <p style={{ marginTop: '20px', textAlign: 'center', fontSize: '11px', color: 'var(--text-muted)' }}>
          Orbiz Creative Operations • Monitoring Desain &amp; Motion © 2026
        </p>
      </div>
    </div>
  );
}

