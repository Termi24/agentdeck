'use client';
import { useState, type FormEvent } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { submitUserInput } from '@/lib/session-api';

export function UserInputBar({ sessionId, disabled }: { sessionId: string; disabled?: boolean }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!text.trim() || busy) return;
    setBusy(true);
    try {
      await submitUserInput(sessionId, text);
      setText('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={onSubmit} className="flex items-center gap-2 border-t border-border bg-card px-6 py-2">
      <Input
        placeholder="Inject a human message into the session (agents see it via await_user_input)…"
        value={text}
        onChange={(e) => setText(e.target.value)}
        disabled={disabled}
      />
      <Button type="submit" size="sm" disabled={busy || disabled || !text.trim()}>Send</Button>
    </form>
  );
}
