import { NextResponse } from 'next/server';

// Liveness probe consumed by methodology pre-start checks and the
// auto-spawn launcher. Kept dependency-free on purpose so a partially
// broken app can still answer "yes I am up". The proxy has its own
// /health endpoint on :4317.
export function GET() {
  return NextResponse.json({ status: 'ok', service: 'agentdeck-web' });
}
