'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth';
import { useClickOutside } from '@/lib/use-click-outside';
import { getNotifications, markNotificationsRead, markNotificationAsRead } from '@/lib/supabase-store';
import { supabase } from '@/lib/supabase';
import { Notification } from '@/lib/types';
import { ROLE_LABELS, ROLE_COLORS } from '@/lib/constants';
import {
  LayoutDashboard, ClipboardList, Film, Users, BarChart3,
  Settings, Database, Calendar, LogOut, Bell,
  Building2, FileType, X, CheckCheck,
  MessageSquare, RefreshCw, AlertTriangle, CheckCircle2,
  PanelLeftClose, PanelLeftOpen
} from 'lucide-react';
import { formatRelativeTime } from '@/lib/utils';
import { ThemeToggle } from '@/components/theme-toggle';

const NAV_ITEMS = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, roles: ['ADMIN', 'TEAM_LEAD', 'STRATEGIC_PIC', 'DESIGNER', 'MOTION_PIC', 'REQUESTER'] },
  { href: '/dashboard/tasks', label: 'Mockup Pipeline', icon: ClipboardList, roles: ['ADMIN', 'TEAM_LEAD', 'STRATEGIC_PIC', 'DESIGNER', 'REQUESTER'] },
  { href: '/dashboard/motion', label: 'Motion Pipeline', icon: Film, roles: ['ADMIN', 'TEAM_LEAD', 'MOTION_PIC', 'REQUESTER', 'STRATEGIC_PIC'] },
  { href: '/dashboard/capacity', label: 'Workload & Capacity', icon: Users, roles: ['ADMIN', 'TEAM_LEAD', 'STRATEGIC_PIC', 'DESIGNER', 'MOTION_PIC'] },
  { href: '/dashboard/reports', label: 'Reports & Analytics', icon: BarChart3, roles: ['ADMIN', 'TEAM_LEAD'] },
];

const ADMIN_ITEMS = [
  { href: '/dashboard/admin/clients', label: 'Clients / Brands', icon: Building2, roles: ['ADMIN', 'TEAM_LEAD'] },
  { href: '/dashboard/admin/content-types', label: 'Content Types', icon: FileType, roles: ['ADMIN', 'TEAM_LEAD'] },
  { href: '/dashboard/admin/holidays', label: 'Holiday Calendar', icon: Calendar, roles: ['ADMIN', 'TEAM_LEAD'] },
  { href: '/dashboard/admin/users', label: 'User Management', icon: Settings, roles: ['ADMIN', 'TEAM_LEAD'] },
  { href: '/dashboard/admin/audit', label: 'Audit Trail', icon: Database, roles: ['ADMIN'] },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, logout, isAuthenticated, isLoading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [showNotif, setShowNotif] = useState(false);
  const [notifCategory, setNotifCategory] = useState<'all' | 'messages' | 'status' | 'revisions'>('all');
  const [showMobileSidebar, setShowMobileSidebar] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);

  const notifRef = useRef<HTMLDivElement>(null);
  useClickOutside(notifRef, () => setShowNotif(false), showNotif);

  useEffect(() => {
    const saved = localStorage.getItem('cmos_sidebar_collapsed');
    if (saved !== null) {
      setIsCollapsed(saved === 'true');
    }
  }, []);

  const toggleSidebar = () => {
    setIsCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem('cmos_sidebar_collapsed', String(next));
      return next;
    });
  };

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace('/login');
    }
  }, [isAuthenticated, isLoading, router]);

  useEffect(() => {
    if (!user) return;

    let isMounted = true;

    const fetchNotifs = async () => {
      try {
        const data = await getNotifications(user.id);
        if (isMounted) {
          setNotifications(data || []);
        }
      } catch (err) {
        console.warn('Failed to load notifications:', err);
      }
    };

    fetchNotifs();

    let channel: any = null;
    if (supabase) {
      channel = supabase
        .channel(`user-notifications:${user.id}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'notifications',
            filter: `user_id=eq.${user.id}`,
          },
          () => {
            fetchNotifs();
          }
        )
        .subscribe();
    }

    const interval = setInterval(fetchNotifs, 15000);
    const handleFocus = () => { fetchNotifs(); };
    window.addEventListener('focus', handleFocus);

    return () => {
      isMounted = false;
      if (channel && supabase) {
        supabase.removeChannel(channel);
      }
      clearInterval(interval);
      window.removeEventListener('focus', handleFocus);
    };
  }, [user?.id]);

  if (isLoading || !user) {
    return (
      <div className="flex items-center justify-center h-screen" style={{ background: 'var(--bg-primary)' }}>
        <div className="w-8 h-8 border-2 rounded-full animate-spin" style={{ borderColor: 'var(--border-primary)', borderTopColor: 'var(--accent-blue)' }} />
      </div>
    );
  }

  const unreadCount = notifications.filter(n => !n.read).length;
  const filteredNav = NAV_ITEMS.filter(item => item.roles.includes(user.role_name));
  const filteredAdmin = ADMIN_ITEMS.filter(item => item.roles.includes(user.role_name));

  const handleLogout = () => {
    logout();
    router.push('/login');
  };

  const handleMarkRead = async () => {
    await markNotificationsRead(user.id);
    const updated = await getNotifications(user.id);
    setNotifications(updated);
  };

  const SidebarContent = ({ isMini = false }: { isMini?: boolean }) => (
    <>
      {/* Logo Header */}
      <div
        style={{
          padding: isMini ? '12px 0' : '12px 16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: isMini ? 'center' : 'flex-start',
          borderBottom: '1px solid var(--border-primary)',
          height: '52px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
          <div
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              overflow: 'hidden',
            }}
            title="CMOS ERP"
          >
            <img src="/logo.png" alt="CMOS Logo" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
          </div>
          {!isMini && (
            <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
              <h1 style={{ fontWeight: '700', color: 'var(--text-primary)', fontSize: '14px', letterSpacing: '-0.3px', margin: 0, lineHeight: '1.2' }}>
                CMOS ERP
              </h1>
              <p style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: '500', margin: 0, lineHeight: '1.2' }}>
                Creative &amp; Motion
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Navigation */}
      <nav style={{ padding: '12px 0', flex: 1, display: 'flex', flexDirection: 'column', gap: '4px', overflowY: 'auto' }} className="custom-scrollbar">
        {!isMini ? (
          <div style={{ padding: '0 16px', marginBottom: '4px' }}>
            <p style={{ fontSize: '10px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', margin: 0 }}>
              Main Menu
            </p>
          </div>
        ) : (
          <div style={{ padding: '0 12px', marginBottom: '4px' }}>
            <div style={{ borderTop: '1px solid var(--border-primary)', margin: '4px 0' }} />
          </div>
        )}
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1px', padding: isMini ? '0 6px' : '0 8px' }}>
          {filteredNav.map(item => {
            const isActive = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`sidebar-link ${isActive ? 'active' : ''}`}
                title={isMini ? item.label : undefined}
                onClick={() => setShowMobileSidebar(false)}
              >
                <item.icon style={{ width: '16px', height: '16px', strokeWidth: isActive ? '2.5' : '2', flexShrink: 0 }} />
                {!isMini && <span>{item.label}</span>}
              </Link>
            );
          })}
        </div>

        {filteredAdmin.length > 0 && (
          <>
            {!isMini ? (
              <div style={{ padding: '0 16px', marginTop: '16px', marginBottom: '4px' }}>
                <p style={{ fontSize: '10px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', margin: 0 }}>
                  Administration
                </p>
              </div>
            ) : (
              <div style={{ padding: '0 12px', margin: '8px 0 4px 0' }}>
                <div style={{ borderTop: '1px solid var(--border-primary)' }} />
              </div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1px', padding: isMini ? '0 6px' : '0 8px' }}>
              {filteredAdmin.map(item => {
                const isActive = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`sidebar-link ${isActive ? 'active' : ''}`}
                    title={isMini ? item.label : undefined}
                    onClick={() => setShowMobileSidebar(false)}
                  >
                    <item.icon style={{ width: '16px', height: '16px', strokeWidth: isActive ? '2.5' : '2', flexShrink: 0 }} />
                    {!isMini && <span>{item.label}</span>}
                  </Link>
                );
              })}
            </div>
          </>
        )}
      </nav>

      {/* User Profile Footer */}
      <div
        style={{
          padding: isMini ? '12px 6px' : '12px 12px',
          borderTop: '1px solid var(--border-primary)',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: isMini ? 'center' : 'space-between',
            gap: isMini ? '0' : '10px',
            padding: isMini ? '4px 0' : '8px',
            borderRadius: '6px',
          }}
        >
          <div
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '6px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '11px',
              fontWeight: '700',
              color: '#fff',
              background: 'var(--accent-blue)',
              flexShrink: 0,
            }}
            title={`${user.full_name} (${ROLE_LABELS[user.role_name]})`}
          >
            {user.avatar_initials}
          </div>
          {!isMini && (
            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '2px' }}>
              <p style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text-primary)', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', lineHeight: 1.2 }}>
                {user.full_name}
              </p>
              <span className={`badge ${ROLE_COLORS[user.role_name]}`} style={{ fontSize: '10px', padding: '1px 5px', alignSelf: 'flex-start' }}>
                {ROLE_LABELS[user.role_name]}
              </span>
            </div>
          )}
          {!isMini ? (
            <button onClick={handleLogout} className="btn-ghost" style={{ padding: '6px', borderRadius: '6px' }} title="Logout">
              <LogOut style={{ width: '16px', height: '16px' }} />
            </button>
          ) : null}
        </div>
        {isMini && (
          <div style={{ display: 'flex', justifyContent: 'center', marginTop: '4px' }}>
            <button onClick={handleLogout} className="btn-ghost" style={{ padding: '6px', borderRadius: '6px' }} title="Logout">
              <LogOut style={{ width: '15px', height: '15px' }} />
            </button>
          </div>
        )}
      </div>
    </>
  );

  return (
    <div style={{ background: 'var(--bg-primary)' }}>
      {/* Desktop Sidebar */}
      <aside className={`sidebar hidden lg:flex flex-col ${isCollapsed ? 'collapsed' : ''}`}>
        <SidebarContent isMini={isCollapsed} />
      </aside>

      {/* Mobile Sidebar Overlay */}
      {showMobileSidebar && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowMobileSidebar(false)} />
          <aside className="absolute left-0 top-0 bottom-0 w-[248px] flex flex-col" style={{ background: 'var(--bg-secondary)', borderRight: '1px solid var(--border-primary)' }}>
            <button onClick={() => setShowMobileSidebar(false)} className="absolute top-3 right-3 btn-ghost p-1">
              <X className="w-4 h-4" />
            </button>
            <SidebarContent isMini={false} />
          </aside>
        </div>
      )}

      {/* Topbar */}
      <header className={`topbar ${isCollapsed ? 'sidebar-collapsed' : ''}`}>
        <div className="flex items-center gap-2.5">
          {/* Sidebar collapse/expand toggle */}
          <button
            type="button"
            onClick={() => {
              if (typeof window !== 'undefined' && window.innerWidth < 1024) {
                setShowMobileSidebar(true);
              } else {
                toggleSidebar();
              }
            }}
            className="btn-ghost p-1.5 rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] transition-colors"
            title={isCollapsed ? "Buka Sidebar" : "Ciutkan Sidebar"}
          >
            {isCollapsed ? <PanelLeftOpen className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
          </button>

          <h2 style={{ fontSize: '14px', fontWeight: '600', color: 'var(--text-primary)', margin: 0 }}>
            {filteredNav.find(n => pathname === n.href || (n.href !== '/dashboard' && pathname.startsWith(n.href)))?.label
              || filteredAdmin.find(n => pathname === n.href)?.label
              || 'Dashboard'}
          </h2>
        </div>

        <div className="flex items-center gap-2">
          {/* Theme Toggle */}
          <ThemeToggle />

          {/* Notifications */}
          <div className="relative" ref={notifRef}>
            <button 
              onClick={() => setShowNotif(!showNotif)} 
              className="btn-ghost p-2 relative rounded-lg hover:bg-[var(--bg-tertiary)] transition-colors"
              title="Notifikasi"
            >
              <Bell className="w-[18px] h-[18px] text-[var(--text-secondary)]" />
              {unreadCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full flex items-center justify-center text-[10px] font-bold text-white shadow-sm ring-2 ring-[var(--bg-secondary)] animate-pulse"
                  style={{ background: 'var(--accent-red)' }}>
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>

            {showNotif && (
              <div className="absolute right-0 top-11 w-84 sm:w-96 max-h-[500px] flex flex-col rounded-xl animate-slide-up z-30 shadow-2xl overflow-hidden"
                style={{ background: 'var(--bg-card)', border: '1px solid var(--border-primary)' }}>
                
                {/* Header */}
                <div className="p-3.5 px-4 flex flex-col gap-2.5" style={{ borderBottom: '1px solid var(--border-primary)', background: 'var(--bg-secondary)' }}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <p className="font-bold text-xs text-[var(--text-primary)]">Notifikasi</p>
                      {unreadCount > 0 && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-500">
                          {unreadCount} baru
                        </span>
                      )}
                    </div>
                    {unreadCount > 0 && (
                      <button 
                        onClick={handleMarkRead} 
                        className="text-xs font-semibold flex items-center gap-1 hover:underline transition-colors" 
                        style={{ color: 'var(--accent-blue)' }}
                      >
                        <CheckCheck className="w-3.5 h-3.5" />
                        Tandai semua dibaca
                      </button>
                    )}
                  </div>

                  {/* Filter Pills */}
                  <div className="flex items-center gap-1 overflow-x-auto pb-0.5 custom-scrollbar">
                    {[
                      { id: 'all', label: 'Semua' },
                      { id: 'messages', label: 'Pesan' },
                      { id: 'status', label: 'Status' },
                      { id: 'revisions', label: 'Revisi' },
                    ].map(tab => {
                      const isActive = notifCategory === tab.id;
                      return (
                        <button
                          key={tab.id}
                          onClick={() => setNotifCategory(tab.id as any)}
                          className={`text-[11px] font-medium px-2.5 py-1 rounded-md transition-all whitespace-nowrap ${
                            isActive 
                              ? 'bg-[var(--accent-blue)] text-white shadow-xs' 
                              : 'text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)]'
                          }`}
                        >
                          {tab.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Body / List */}
                <div className="overflow-y-auto flex-1 custom-scrollbar max-h-[380px]">
                  {(() => {
                    const filteredList = notifications.filter(n => {
                      if (notifCategory === 'all') return true;
                      if (notifCategory === 'messages') {
                        return n.notification_type === 'NEW_MESSAGE' || n.link?.includes('tab=chat');
                      }
                      if (notifCategory === 'status') {
                        return (
                          n.notification_type === 'REQUEST_STATUS_UPDATED' || 
                          n.notification_type === 'MOTION_STATUS_UPDATED' ||
                          n.notification_type === 'REQUEST_APPROVED' ||
                          n.notification_type === 'MOTION_APPROVED' ||
                          n.notification_type === 'REQUEST_ASSIGNED'
                        );
                      }
                      if (notifCategory === 'revisions') {
                        return (
                          n.notification_type === 'REQUEST_REVISION' || 
                          n.notification_type === 'MOTION_REVISION' ||
                          n.type === 'warning'
                        );
                      }
                      return true;
                    });

                    if (filteredList.length === 0) {
                      return (
                        <div className="p-8 text-center flex flex-col items-center justify-center gap-2">
                          <div className="w-10 h-10 rounded-full flex items-center justify-center bg-[var(--bg-tertiary)] text-[var(--text-muted)]">
                            <Bell className="w-5 h-5 opacity-40" />
                          </div>
                          <p className="text-xs font-medium text-[var(--text-muted)]">
                            {notifCategory === 'all' ? 'Belum ada notifikasi baru' : 'Tidak ada notifikasi dalam kategori ini'}
                          </p>
                        </div>
                      );
                    }

                    return filteredList.slice(0, 25).map(n => {
                      const isUnread = !n.read && !n.is_read;
                      const isMessage = n.notification_type === 'NEW_MESSAGE' || n.link?.includes('tab=chat');
                      const isRevision = n.notification_type === 'REQUEST_REVISION' || n.notification_type === 'MOTION_REVISION' || n.type === 'warning';
                      const isApproval = n.notification_type === 'REQUEST_APPROVED' || n.notification_type === 'MOTION_APPROVED' || n.type === 'success';

                      return (
                        <div key={n.id} 
                          onClick={async () => {
                            await markNotificationAsRead(n.id);
                            const updated = await getNotifications(user.id);
                            setNotifications(updated);
                            setShowNotif(false);
                            if (n.link) {
                              router.push(n.link);
                            }
                          }}
                          className="p-3 px-4 flex gap-3 transition-colors cursor-pointer relative items-start hover:bg-[var(--bg-hover)]"
                          style={{ 
                            borderBottom: '1px solid var(--border-secondary)', 
                            background: !isUnread ? 'transparent' : 'rgba(59, 130, 246, 0.07)'
                          }}
                        >
                          {/* Type Icon Badge */}
                          <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5"
                            style={{
                              background: isRevision ? 'rgba(245, 158, 11, 0.12)' :
                                         isApproval ? 'rgba(16, 185, 129, 0.12)' :
                                         isMessage ? 'rgba(59, 130, 246, 0.12)' : 'rgba(100, 116, 139, 0.12)',
                              color: isRevision ? 'var(--accent-amber)' :
                                     isApproval ? 'var(--accent-emerald)' :
                                     isMessage ? 'var(--accent-blue)' : 'var(--text-muted)'
                            }}
                          >
                            {isRevision ? <AlertTriangle className="w-3.5 h-3.5" /> :
                             isApproval ? <CheckCircle2 className="w-3.5 h-3.5" /> :
                             isMessage ? <MessageSquare className="w-3.5 h-3.5" /> :
                             <RefreshCw className="w-3.5 h-3.5" />}
                          </div>

                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-1">
                              <p className={`text-xs ${!isUnread ? 'font-medium text-[var(--text-primary)]' : 'font-bold text-[var(--text-primary)]'}`}>
                                {n.title}
                              </p>
                              {isUnread && (
                                <span className="w-1.5 h-1.5 rounded-full bg-blue-500 flex-shrink-0" />
                              )}
                            </div>
                            <p className="text-xs mt-0.5 line-clamp-2" style={{ color: 'var(--text-secondary)', lineHeight: '1.4' }}>
                              {n.message}
                            </p>
                            <div className="flex items-center gap-2 mt-1.5">
                              {n.sender_name && (
                                <span className="text-[10px] font-semibold text-[var(--accent-blue)]">
                                  {n.sender_name}
                                </span>
                              )}
                              <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                                {formatRelativeTime(n.created_at)}
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    });
                  })()}
                </div>
              </div>
            )}
          </div>

          {/* User avatar (mobile) */}
          <div className="lg:hidden flex items-center gap-2">
            <div className="w-7 h-7 rounded-md flex items-center justify-center text-[10px] font-bold text-white"
              style={{ background: 'var(--accent-blue)' }}>
              {user.avatar_initials}
            </div>
          </div>
        </div>
      </header>

      {/* Close notification on outside click */}
      {showNotif && <div className="fixed inset-0 z-20" onClick={() => setShowNotif(false)} />}

      {/* Main Content */}
      <main className={`main-content ${isCollapsed ? 'sidebar-collapsed' : ''}`}>
        <div className="animate-fade-in">
          {children}
        </div>
      </main>
    </div>
  );
}
