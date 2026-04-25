const PROXY_URL = process.env.NEXT_PUBLIC_PROXY_URL ?? 'http://127.0.0.1:4317';

export interface StartSessionInput {
  projectId: string;
  prompt: string;
  title?: string;
}

export interface StartSessionResult {
  sessionId: string;
  rootAgentId: string;
}

export type SessionStatus = 'pending' | 'running' | 'waiting_tool' | 'completed' | 'failed' | 'cancelled';

export interface SessionListItem {
  id: string;
  projectId: string;
  title: string;
  status: SessionStatus;
  startedAt: string;
  endedAt: string | null;
  totalTokensIn: number;
  totalTokensOut: number;
  isBridge: boolean;
  agentCount: number;
  runningAgentCount: number;
  channelMessageCount: number;
  docCount: number;
  testResultCount: number;
  toolCallCount: number;
  runningToolCallCount: number;
  lastActivityAt: string | null;
  lastChannelMessage: { fromAgentName: string; content: string; at: string } | null;
}

export interface SessionAgent {
  id: string;
  name: string;
  role: string | null;
  prompt: string;
  model: string | null;
  status: SessionStatus;
  parentAgentId: string | null;
  startedAt: string;
  endedAt: string | null;
  tokensIn: number;
  tokensOut: number;
  toolCallCount: number;
  runningToolCallCount: number;
  dmCount: number;
  channelMessageCount: number;
}

export interface DirectMessage {
  id: string;
  sessionId: string;
  fromAgentId: string;
  fromAgentName: string;
  toAgentId: string;
  content: string;
  createdAt: string;
}

export async function listSessionDms(
  sessionId: string,
  opts: { agentId?: string; limit?: number } = {},
): Promise<DirectMessage[]> {
  const qs = new URLSearchParams();
  if (opts.agentId) qs.set('agentId', opts.agentId);
  if (opts.limit) qs.set('limit', String(opts.limit));
  const url = `${PROXY_URL}/sessions/${sessionId}/dm${qs.toString() ? `?${qs}` : ''}`;
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`listSessionDms failed: ${res.status}`);
  const body = (await res.json()) as { messages: DirectMessage[] };
  return body.messages;
}

export async function listSessionAgents(sessionId: string): Promise<SessionAgent[]> {
  const res = await fetch(`${PROXY_URL}/sessions/${sessionId}/agents`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`listSessionAgents failed: ${res.status}`);
  const body = (await res.json()) as { agents: SessionAgent[] };
  return body.agents;
}

export async function getSession(sessionId: string): Promise<SessionListItem | null> {
  const res = await fetch(`${PROXY_URL}/sessions/${sessionId}`, { cache: 'no-store' });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`getSession failed: ${res.status}`);
  return (await res.json()) as SessionListItem;
}

export interface ToolCall {
  id: string;
  agentId: string;
  agentName: string;
  toolName: string;
  input: unknown;
  output: unknown | null;
  isError: boolean;
  status: 'running' | 'completed' | 'failed';
  startedAt: string;
  endedAt: string | null;
  durationMs: number | null;
}

export async function listSessionToolCalls(
  sessionId: string,
  opts: { status?: 'running' | 'completed' | 'failed'; limit?: number } = {},
): Promise<ToolCall[]> {
  const qs = new URLSearchParams();
  if (opts.status) qs.set('status', opts.status);
  if (opts.limit) qs.set('limit', String(opts.limit));
  const url = `${PROXY_URL}/sessions/${sessionId}/tool-calls${qs.toString() ? `?${qs}` : ''}`;
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`listSessionToolCalls failed: ${res.status}`);
  const body = (await res.json()) as { toolCalls: ToolCall[] };
  return body.toolCalls;
}

export async function startSession(input: StartSessionInput): Promise<StartSessionResult> {
  const res = await fetch(`${PROXY_URL}/sessions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`startSession failed: ${res.status} ${text}`);
  }
  return res.json();
}

export async function listSessions(limit = 200): Promise<SessionListItem[]> {
  const res = await fetch(`${PROXY_URL}/sessions?limit=${limit}`, {
    method: 'GET',
    cache: 'no-store',
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`listSessions failed: ${res.status} ${text}`);
  }
  const body = (await res.json()) as { sessions: SessionListItem[] };
  return body.sessions;
}

export async function cancelSession(sessionId: string): Promise<void> {
  await fetch(`${PROXY_URL}/sessions/${sessionId}/cancel`, { method: 'POST' });
}

// ─── Campaigns (QA methodology) ────────────────────────────────────────────

export interface CampaignListItem {
  id: string;
  projectName: string;
  cliSource: string;
  notes: string | null;
  status: 'running' | 'completed' | 'aborted' | 'failed';
  startedAt: string;
  endedAt: string | null;
}

export interface CampaignMetricRow {
  id: number;
  campaignId: string;
  name: string;
  valueJson: string;
  tagsJson: string | null;
  recordedAt: string;
}

export interface CampaignRetrospective {
  campaignId: string;
  whatWentWell: string;
  whatWentBadly: string;
  keyLearnings: string;
  toolingFeedback: string;
  recommendations: string;
  submittedAt: string;
}

export interface CampaignDetail {
  campaign: CampaignListItem;
  metrics: CampaignMetricRow[];
  retrospective: CampaignRetrospective | null;
}

export async function listCampaigns(): Promise<CampaignListItem[]> {
  const res = await fetch(`${PROXY_URL}/campaigns`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`listCampaigns failed: ${res.status}`);
  const body = (await res.json()) as { campaigns: CampaignListItem[] };
  return body.campaigns;
}

export async function getCampaign(id: string): Promise<CampaignDetail | null> {
  const res = await fetch(`${PROXY_URL}/campaigns/${id}`, { cache: 'no-store' });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`getCampaign failed: ${res.status}`);
  return (await res.json()) as CampaignDetail;
}
