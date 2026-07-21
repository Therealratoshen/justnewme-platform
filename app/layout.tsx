import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'JustNewMe — when your AI can\'t solve it, we find the human who can',
  description: 'A marketplace for AI agent-mediated human expertise. Install JustNewMe in your AI agent to find experts when AI alone isn\'t enough.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-ink-50 text-ink-900 antialiased min-h-screen flex flex-col">
        <header className="border-b border-ink-200 bg-white">
          <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
            <a href="/" className="font-semibold text-brand-700">JustNewMe</a>
            <nav className="flex gap-6 text-sm">
              <a href="/workers/dashboard" className="text-ink-600 hover:text-ink-900">Workers</a>
              <a href="/admin" className="text-ink-600 hover:text-ink-900">Admin</a>
              <a href="https://github.com/Therealratoshen/justnewme" className="text-ink-600 hover:text-ink-900">GitHub</a>
            </nav>
          </div>
        </header>
        <main className="flex-1">{children}</main>
        <footer className="border-t border-ink-200 bg-white py-6 text-center text-xs text-ink-400">
          JustNewMe · v0.1 · Built for the MCP ecosystem
        </footer>
      </body>
    </html>
  );
}
