/**
 * Native OS notifications for events that need to surface outside the
 * dashboard — primarily `await_user_input`, where an agent is blocked
 * waiting for a human and the user may have the CLI in focus rather
 * than the dashboard.
 *
 * Strategy:
 *  - Windows: PowerShell + Windows.UI.Notifications toast (Win10+, no
 *    extra module to install). Spawned detached + windowsHide so it
 *    leaves no visible console.
 *  - macOS: osascript display notification.
 *  - Linux: notify-send if present.
 *  - All errors are swallowed — notifications are best-effort, never
 *    block the request that triggered them.
 *
 * A throttle map prevents the same (sessionId, agentId) pair from
 * spamming toasts when an agent retries `await_user_input` rapidly.
 */
import { spawn } from 'node:child_process';

const lastNotifiedAt = new Map<string, number>();
const THROTTLE_MS = 4_000;

export interface NotifyOptions {
  sessionId: string;
  agentName: string | null;
  agentId: string | null;
  prompt: string | null;
  dashboardUrl: string;
}

export function notifyAwaitingInput(opts: NotifyOptions): void {
  const key = `${opts.sessionId}:${opts.agentId ?? 'root'}`;
  const now = Date.now();
  const last = lastNotifiedAt.get(key) ?? 0;
  if (now - last < THROTTLE_MS) return;
  lastNotifiedAt.set(key, now);

  const title = 'agentdeck — waiting for you';
  const who = opts.agentName ? `${opts.agentName}` : 'an agent';
  const body = opts.prompt
    ? `${who}: ${truncate(opts.prompt, 180)}\n${opts.dashboardUrl}`
    : `${who} is waiting for your input.\n${opts.dashboardUrl}`;

  try {
    if (process.platform === 'win32') {
      fireWindowsToast(title, body);
    } else if (process.platform === 'darwin') {
      fireMacNotification(title, body);
    } else {
      fireLinuxNotification(title, body);
    }
  } catch {
    // best-effort — never throw from a notification
  }
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

function fireWindowsToast(title: string, body: string): void {
  // Escape single quotes for PowerShell single-quoted strings (double them).
  const t = title.replace(/'/g, "''");
  const b = body.replace(/'/g, "''");
  const ps = `
$ErrorActionPreference = 'SilentlyContinue'
[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType=WindowsRuntime] | Out-Null
[Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType=WindowsRuntime] | Out-Null
$tpl = [Windows.UI.Notifications.ToastNotificationManager]::GetTemplateContent([Windows.UI.Notifications.ToastTemplateType]::ToastText02)
$nodes = $tpl.GetElementsByTagName('text')
$nodes.Item(0).AppendChild($tpl.CreateTextNode('${t}')) | Out-Null
$nodes.Item(1).AppendChild($tpl.CreateTextNode('${b}')) | Out-Null
$toast = [Windows.UI.Notifications.ToastNotification]::new($tpl)
[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('agentdeck').Show($toast)
`.trim();
  const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], {
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
  });
  child.unref();
}

function fireMacNotification(title: string, body: string): void {
  const escaped = (s: string) => s.replace(/"/g, '\\"');
  const script = `display notification "${escaped(body)}" with title "${escaped(title)}"`;
  const child = spawn('osascript', ['-e', script], { detached: true, stdio: 'ignore' });
  child.unref();
}

function fireLinuxNotification(title: string, body: string): void {
  const child = spawn('notify-send', [title, body], { detached: true, stdio: 'ignore' });
  child.unref();
}
