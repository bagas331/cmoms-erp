import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "@/lib/auth";
import { ThemeProvider } from "@/components/theme-provider";

export const metadata: Metadata = {
  title: "CMOMS - Creative & Motion Operations Management System",
  description: "Internal Creative Operations Management System untuk tim Creative Content, Graphic Design, Strategic Concept, dan Motion Graphics.",
  icons: {
    icon: "/logo.png",
  }
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="id" suppressHydrationWarning>
      <body className="relative min-h-screen bg-[var(--bg-primary)] overflow-x-hidden">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          {/* Ambient Background Mesh */}
          <div className="fixed inset-0 z-[-1] overflow-hidden pointer-events-none">
            <div className="absolute -top-[20%] -left-[10%] w-[50%] h-[50%] rounded-full bg-[var(--accent-purple)]/20 blur-[120px] mix-blend-multiply dark:mix-blend-screen animate-blob" />
            <div className="absolute top-[20%] -right-[10%] w-[40%] h-[40%] rounded-full bg-[var(--accent-blue)]/20 blur-[120px] mix-blend-multiply dark:mix-blend-screen animate-blob animation-delay-2000" />
            <div className="absolute -bottom-[20%] left-[20%] w-[60%] h-[60%] rounded-full bg-[var(--accent-cyan)]/20 blur-[120px] mix-blend-multiply dark:mix-blend-screen animate-blob animation-delay-4000" />
          </div>
          
          <AuthProvider>
            {children}
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
