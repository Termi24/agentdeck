'use client';
import { useState, type FormEvent } from 'react';
import { OctagonX, Send } from 'lucide-react';
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
    <form onSubmit={onSubmit} className="flex items-center gap-2 py-3">
      <div className="glass ring-soft flex h-11 flex-1 items-center gap-2 rounded-full border border-white/10 px-4">
        <input
          type="text"
          placeholder="Inject a human message into the session (agents see it via await_user_input)…"
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled={disabled}
          className="flex-1 bg-transparent text-[13.5px] outline-none placeholder:text-white/40 disabled:opacity-50"
        />
      </div>
      <Button
        type="submit"
        size="sm"
        disabled={busy || disabled || !text.trim()}
        className="grad-accent h-11 rounded-full border-0 px-4 text-[13px] font-medium text-white shadow-soft-pop disabled:opacity-50 disabled:shadow-none"
      >
        <Send className="size-3.5" />
        Send
      </Button>
      {hasPending && (
        <Button
          type="button"
          variant="destructive"
          size="sm"
          onClick={onStop}
          disabled={busy || disabled}
          title="Annule tous les agents en attente d'input et leur dit explicitement de stopper."
          className="h-11 rounded-full bg-rose-500/20 px-4 text-[13px] font-medium text-rose-200 ring-1 ring-rose-300/30 hover:bg-rose-500/30"
        >
          <OctagonX className="mr-1 h-3.5 w-3.5" />
          Stop
        </Button>
      )}
    </form>
  );
}
