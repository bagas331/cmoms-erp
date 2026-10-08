'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';

export default function Home() {
  const router = useRouter();
  const { isAuthenticated, isLoading } = useAuth();

  useEffect(() => {
    if (!isLoading) {
      router.replace(isAuthenticated ? '/dashboard' : '/login');
    }
  }, [isAuthenticated, isLoading, router]);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-[var(--bg-primary)] overflow-hidden relative">
      <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none flex items-center justify-center">
        <div className="w-[300px] h-[300px] rounded-full bg-[var(--accent-blue)]/20 blur-[80px] animate-pulse" />
      </div>

      <div className="z-10 flex flex-col items-center animate-in fade-in zoom-in duration-500">
        <div className="relative w-32 h-20 mb-6">
          <div className="absolute inset-0 rounded-2xl bg-[var(--accent-blue)]/10 blur-xl animate-pulse" />
          <div className="relative w-full h-full flex items-center justify-center">
            <img src="/logo.png" alt="CMOS Logo" className="w-full h-full object-contain drop-shadow-xl" />
          </div>
        </div>
        <h1 className="text-2xl font-bold text-[var(--text-primary)] mb-2 tracking-tight">CMOS</h1>
        <p className="text-sm text-[var(--text-secondary)] mb-8">Memuat ruang kerja kreatif Anda...</p>
        
        <div className="flex gap-2">
          <div className="w-2 h-2 rounded-full bg-[var(--accent-blue)] animate-bounce" style={{ animationDelay: '0ms' }} />
          <div className="w-2 h-2 rounded-full bg-[var(--accent-purple)] animate-bounce" style={{ animationDelay: '150ms' }} />
          <div className="w-2 h-2 rounded-full bg-[var(--accent-cyan)] animate-bounce" style={{ animationDelay: '300ms' }} />
        </div>
      </div>
    </div>
  );
}
