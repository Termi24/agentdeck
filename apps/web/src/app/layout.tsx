import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

export const metadata: Metadata = {
  title: 'agentdeck',
  description: 'Live observability for Claude Agent SDK orchestrators and subagents.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-background">{children}</body>
    </html>
  );
}
