'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth';
import { getNotifications, markNotificationsRead, markNotificationAsRead } from '@/lib/supabase-store';
import { Notification } from '@/lib/types';
import { ROLE_LABELS, ROLE_COLORS } from '@/lib/constants';
import {
  Layers, LayoutDashboard, ClipboardList, Film, Users, BarChart3,
  Settings, Database, Calendar, LogOut, Bell, ChevronDown,
  Building2, FileType, X, Menu,
} from 'lucide-react';
import { ThemeToggle } from '@/components/theme-toggle';

const NAV_ITEMS = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, roles: ['ADMIN', 'TEAM_LEAD', 'STRATEGIC_PIC', 'DESIGNER', 'MOTION_PIC', 'REQUESTER'] },
  { href: '/dashboard/tasks', label: 'Task Management', icon: ClipboardList, roles: ['ADMIN', 'TEAM_LEAD', 'STRATEGIC_PIC', 'DESIGNER', 'REQUESTER'] },
  { href: '/dashboard/motion', label: 'Motion Pipeline', icon: Film, roles: ['ADMIN', 'TEAM_LEAD', 'MOTION_PIC', 'REQUESTER', 'STRATEGIC_PIC'] },
  { href: '/dashboard/capacity', label: 'Workload & Capacity', icon: Users, roles: ['ADMIN', 'TEAM_LEAD', 'STRATEGIC_PIC', 'DESIGNER', 'MOTION_PIC'] },
  { href: '/dashboard/reports', label: 'Reports & Analytics', icon: BarChart3, roles: ['ADMIN', 'TEAM_LEAD'] },
];


const ADMIN_ITEMS = [
  { href: '/dashboard/admin/clients', label: 'Clients / Brands', icon: Building2, roles: ['ADMIN', 'TEAM_LEAD'] },
  { href: '/dashboard/admin/content-types', label: 'Content Types', icon: FileType, roles: ['ADMIN', 'TEAM_LEAD'] },
  { href: '/dashboard/admin/holidays', label: 'Holiday Calendar', icon: Calendar, roles: ['ADMIN', 'TEAM_LEAD'] },
  { href: '/dashboard/admin/users', label: 'User Management', icon: Settings, roles: ['ADMIN', 'TEAM_LEAD'] },
  { href: '/dashboard/admin/audit', label: 'Audit Trail', icon: Database, roles: ['ADMIN', 'TEAM_LEAD'] },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, logout, isAuthenticated, isLoading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [showNotif, setShowNotif] = useState(false);
  const [showMobileSidebar, setShowMobileSidebar] = useState(false);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace('/login');
    }
  }, [isAuthenticated, isLoading, router]);

  useEffect(() => {
    if (user) {
      getNotifications(user.id).then(setNotifications).catch(console.error);
    }
  }, [user, pathname]);

  if (isLoading || !user) {
    return (
      <div className="flex items-center justify-center h-screen" style={{ background: 'var(--bg-primary)' }}>
        <div className="w-10 h-10 border-3 border-t-blue-500 rounded-full animate-spin" style={{ borderColor: 'var(--border-primary)', borderTopColor: 'var(--accent-blue)' }} />
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

  const SidebarContent = () => (
    <>
      {/* Logo */}
      <div style={{ padding: '24px 20px', display: 'flex', alignItems: 'center', gap: '14px', borderBottom: '1px solid var(--border-primary)' }}>
        <div style={{ width: '42px', height: '42px', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, overflow: 'hidden' }}>
          <img src="/logo.png" alt="Logo" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
          <h1 style={{ fontWeight: '800', color: 'var(--text-primary)', fontSize: '16px', letterSpacing: '-0.5px', margin: 0, lineHeight: '1' }}>Monitoring</h1>
          <p style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: '500', margin: 0, lineHeight: '1.2' }}>Desain Internal & External</p>
        </div>
      </div>

      {/* Navigation */}
      <nav style={{ padding: '24px 0', flex: 1, display: 'flex', flexDirection: 'column', gap: '8px', overflowY: 'auto' }} className="custom-scrollbar">
        <div style={{ padding: '0 24px', marginBottom: '8px' }}>
          <p style={{ fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-muted)', margin: 0 }}>
            Main Menu
          </p>
        </div>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', padding: '0 16px' }}>
          {filteredNav.map(item => {
            const isActive = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href));
            return (
              <Link key={item.href} href={item.href}
                className={`sidebar-link ${isActive ? 'active' : ''}`}
                style={{ 
                  display: 'flex', alignItems: 'center', gap: '14px', padding: '10px 16px', borderRadius: '10px', 
                  fontWeight: isActive ? '600' : '500', margin: 0,
                  textDecoration: 'none', transition: 'all 0.2s ease'
                }}
                onClick={() => setShowMobileSidebar(false)}>
                <item.icon style={{ width: '20px', height: '20px', strokeWidth: isActive ? '2.5' : '2' }} />
                <span style={{ fontSize: '14px' }}>{item.label}</span>
              </Link>
            );
          })}
        </div>

        {filteredAdmin.length > 0 && (
          <>
            <div style={{ padding: '0 24px', marginTop: '20px', marginBottom: '8px' }}>
              <p style={{ fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-muted)', margin: 0 }}>
                Administration
              </p>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', padding: '0 16px' }}>
              {filteredAdmin.map(item => {
                const isActive = pathname === item.href;
                return (
                  <Link key={item.href} href={item.href}
                    className={`sidebar-link ${isActive ? 'active' : ''}`}
                    style={{ 
                      display: 'flex', alignItems: 'center', gap: '14px', padding: '10px 16px', borderRadius: '10px', 
                      fontWeight: isActive ? '600' : '500', margin: 0,
                      textDecoration: 'none', transition: 'all 0.2s ease'
                    }}
                    onClick={() => setShowMobileSidebar(false)}>
                    <item.icon style={{ width: '20px', height: '20px', strokeWidth: isActive ? '2.5' : '2' }} />
                    <span style={{ fontSize: '14px' }}>{item.label}</span>
                  </Link>
                );
              })}
            </div>
          </>
        )}
      </nav>

      {/* User Profile */}
      <div style={{ padding: '20px 16px', borderTop: '1px solid var(--border-primary)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px', borderRadius: '12px', background: 'var(--bg-tertiary)', border: '1px solid var(--border-secondary)' }}>
          <div style={{ width: '40px', height: '40px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyItems: 'center', justifyContent: 'center', fontSize: '14px', fontWeight: 'bold', color: '#fff', background: 'var(--gradient-1)' }}>
            {user.avatar_initials}
          </div>
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <p style={{ fontSize: '14px', fontWeight: '700', color: 'var(--text-primary)', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', lineHeight: 1 }}>{user.full_name}</p>
            <div>
              <span className={`badge ${ROLE_COLORS[user.role_name]}`} style={{ fontSize: '10px', padding: '2px 6px' }}>
                {ROLE_LABELS[user.role_name]}
              </span>
            </div>
          </div>
          <button onClick={handleLogout} className="btn-ghost" style={{ padding: '8px', borderRadius: '8px' }} title="Logout">
            <LogOut style={{ width: '18px', height: '18px' }} />
          </button>
        </div>
      </div>
    </>
  );

  return (
    <div style={{ background: 'var(--bg-primary)' }}>
      {/* Desktop Sidebar */}
      <aside className="sidebar hidden lg:flex flex-col">
        <SidebarContent />
      </aside>

      {/* Mobile Sidebar Overlay */}
      {showMobileSidebar && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowMobileSidebar(false)} />
          <aside className="absolute left-0 top-0 bottom-0 w-64 flex flex-col" style={{ background: 'var(--bg-secondary)', borderRight: '1px solid var(--border-primary)' }}>
            <button onClick={() => setShowMobileSidebar(false)} className="absolute top-4 right-4 btn-ghost p-1">
              <X className="w-5 h-5" />
            </button>
            <SidebarContent />
          </aside>
        </div>
      )}

      {/* Topbar */}
      <header className="topbar">
        <div className="flex items-center gap-4">
          <button onClick={() => setShowMobileSidebar(true)} className="lg:hidden btn-ghost p-2">
            <Menu className="w-5 h-5" />
          </button>
          <h2 className="text-lg font-semibold text-[var(--text-primary)] hidden sm:block">
            {filteredNav.find(n => pathname === n.href || (n.href !== '/dashboard' && pathname.startsWith(n.href)))?.label
              || filteredAdmin.find(n => pathname === n.href)?.label
              || 'Dashboard'}
          </h2>
        </div>

        <div className="flex items-center gap-3">
          {/* Theme Toggle */}
          <ThemeToggle />

          {/* Notifications */}
          <div className="relative">
            <button onClick={() => setShowNotif(!showNotif)} className="btn-ghost p-2 relative">
              <Bell className="w-5 h-5" />
              {unreadCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-[var(--text-primary)]"
                  style={{ background: 'var(--accent-red)' }}>
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>

            {showNotif && (
              <div className="absolute right-0 top-12 w-80 max-h-96 overflow-y-auto rounded-xl animate-slide-up"
                style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-primary)', boxShadow: '0 12px 40px rgba(0,0,0,0.5)' }}>
                <div className="p-3 flex items-center justify-between" style={{ borderBottom: '1px solid var(--border-primary)' }}>
                  <p className="font-semibold text-sm text-[var(--text-primary)]">Notifications</p>
                  {unreadCount > 0 && (
                    <button onClick={handleMarkRead} className="text-xs" style={{ color: 'var(--accent-blue)' }}>
                      Mark all read
                    </button>
                  )}
                </div>
                {notifications.length === 0 ? (
                  <p className="p-4 text-sm text-center" style={{ color: 'var(--text-muted)' }}>No notifications</p>
                ) : (
                  notifications.slice(0, 10).map(n => (
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
                      className="p-3 flex gap-3 transition-colors cursor-pointer hover:bg-black/5 dark:hover:bg-white/5"
                      style={{ borderBottom: '1px solid var(--border-secondary)', background: n.read ? 'transparent' : 'rgba(59,130,246,0.05)' }}>
                      <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${n.type === 'warning' ? 'bg-amber-500' : n.type === 'success' ? 'bg-emerald-500' : n.type === 'error' ? 'bg-red-500' : 'bg-blue-500'}`} />
                      <div>
                        <p className="text-xs font-semibold text-[var(--text-primary)]">{n.title}</p>
                        <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>{n.message}</p>
                        <p className="text-[10px] mt-1" style={{ color: 'var(--text-muted)' }}>
                          {new Date(n.created_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>

          {/* User avatar (mobile) */}
          <div className="lg:hidden flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold text-[var(--text-primary)]"
              style={{ background: 'var(--gradient-1)' }}>
              {user.avatar_initials}
            </div>
          </div>
        </div>
      </header>

      {/* Close notification on outside click */}
      {showNotif && <div className="fixed inset-0 z-20" onClick={() => setShowNotif(false)} />}

      {/* Main Content */}
      <main className="main-content">
        <div className="animate-fade-in">
          {children}
        </div>
      </main>
    </div>
  );
}
