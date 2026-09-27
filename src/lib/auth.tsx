'use client';
// ============================================================
// CMOMS - Authentication Context
// ============================================================

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { User } from './types';
import { supabase } from './supabase';

interface AuthContextType {
  user: User | null;
  login: (email: string, password: string) => Promise<boolean>;
  logout: () => void;
  isAuthenticated: boolean;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  login: async () => false,
  logout: () => {},
  isAuthenticated: false,
  isLoading: true,
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const storedUser = localStorage.getItem('cmoms_current_user');
    if (storedUser) {
      try {
        setUser(JSON.parse(storedUser));
      } catch {
        localStorage.removeItem('cmoms_current_user');
      }
    }
    setIsLoading(false);
  }, []);

  const login = useCallback(async (email: string, password: string): Promise<boolean> => {
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const result = await res.json();
      if (result.success && result.user) {
        setUser(result.user);
        localStorage.setItem('cmoms_current_user', JSON.stringify(result.user));
        return true;
      }
    } catch (err) {
      console.error("Login error:", err);
    }
    return false;
  }, []);

  const logout = useCallback(() => {
    setUser(null);
    localStorage.removeItem('cmoms_current_user');
  }, []);

  return (
    <AuthContext.Provider value={{ user, login, logout, isAuthenticated: !!user, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}

// Permission checker
export function hasPermission(
  roleName: string,
  action: string
): boolean {
  const permissions: Record<string, string[]> = {
    ADMIN: ['*'],
    TEAM_LEAD: ['view_all', 'create_task', 'assign_task', 'approve', 'revision', 'view_reports', 'view_audit', 'manage_master'],
    STRATEGIC_PIC: ['view_all', 'create_task', 'edit_brief', 'view_capacity'],
    DESIGNER: ['view_own', 'update_status', 'submit_task', 'view_own_capacity'],
    MOTION_PIC: ['view_own', 'update_motion', 'view_own_capacity'],
    REQUESTER: ['create_task', 'view_own', 'request_revision'],
  };

  const rolePerms = permissions[roleName] || [];
  return rolePerms.includes('*') || rolePerms.includes(action);
}
