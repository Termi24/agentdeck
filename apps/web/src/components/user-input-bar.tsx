'use client';
import { useState, type FormEvent } from 'react';
import { OctagonX } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useSession } from '@/components/session-context';
import { requestAgentCancel, submitUserInput } from '@/lib/session-api';

export function UserInputBar({ sessionId, disabled }: { sessionId: string; disabled?: boolean }) {
  const { pendingInputs } = useSession();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const hasPending = pendingInputs.length > 0;

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

  const onStop = async () => {
    if (busy) return;
    setBusy(true);
    try {
      for (const req of pendingInputs) {
        if (!req.agentId) continue;
        try { await requestAgentCancel(sessionId, req.agentId); } catch { /* keep going */ }
      }
      await submitUserInput(sessionId, 'stop');
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
      {hasPending && (
        <Button
          type="button"
          variant="destructive"
          size="sm"
          onClick={onStop}
          disabled={busy || disabled}
          title="Annule tous les agents en attente d'input et leur dit explicitement de stopper."
        >
          <OctagonX className="mr-1 h-3.5 w-3.5" />
          Stop
        </Button>
      )}
    </form>
  );
}
