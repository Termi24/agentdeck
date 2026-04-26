const PROXY_URL = process.env.NEXT_PUBLIC_PROXY_URL ?? 'http://127.0.0.1:4317';

export interface ChannelMessage {
  id: string;
  fromAgentName: string;
  fromAgentId: string;
  content: string;
  createdAt: string;
}
export interface DocSummary { id: string; path: string; updatedByAgentId: string; updatedAt: string; }
export interface DocFull extends DocSummary { content: string; }
export interface ProcedureSummary { name: string; format: 'yaml' | 'md'; description: string | null; }
export interface TestResultRow {
  id: string; sessionId: string; agentId: string; suite: string; caseName: string;
  status: 'passed' | 'failed' | 'skipped'; message: string | null; createdAt: string;
}
export interface MemoryRow { projectId: string; key: string; value: string; updatedByAgentId: string | null; updatedAt: string; }
export interface SecretListEntry { name: string; updatedAt: string; }
export interface DirectMessageRow {
  id: string; fromAgentId: string; fromAgentName: string; toAgentId: string; content: string; createdAt: string;
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
  return res.json();
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
  if (res.status === 204) return undefined as T;
  return res.json();
}

export function fetchChannel(sessionId: string) {
  return getJson<{ messages: ChannelMessage[] }>(`${PROXY_URL}/sessions/${sessionId}/channel?limit=200`);
}
export function fetchDocs(sessionId: string) {
  return getJson<{ docs: DocSummary[] }>(`${PROXY_URL}/sessions/${sessionId}/docs`);
}
export function fetchDoc(sessionId: string, path: string) {
  return getJson<DocFull>(`${PROXY_URL}/sessions/${sessionId}/docs/${path}`);
}
export function fetchProcedures() {
  return getJson<{ procedures: ProcedureSummary[] }>(`${PROXY_URL}/procedures`);
}
export function fetchProcedure(name: string) {
  return getJson<{ name: string; format: 'yaml' | 'md'; description: string | null; content: string }>(
    `${PROXY_URL}/procedures/${encodeURIComponent(name)}`,
  );
}

export function fetchTestResults(sessionId: string) {
  return getJson<{ results: TestResultRow[] }>(`${PROXY_URL}/sessions/${sessionId}/test-results`);
}

export function fetchMemory(projectId: string) {
  return getJson<{ entries: MemoryRow[] }>(`${PROXY_URL}/projects/${encodeURIComponent(projectId)}/memory`);
}
export function writeMemory(projectId: string, key: string, value: string) {
  return postJson<{ at: string }>(
    `${PROXY_URL}/projects/${encodeURIComponent(projectId)}/memory/${encodeURIComponent(key)}`,
    { value },
  );
}
export function deleteMemory(projectId: string, key: string) {
  return fetch(`${PROXY_URL}/projects/${encodeURIComponent(projectId)}/memory/${encodeURIComponent(key)}`, {
    method: 'DELETE',
  });
}

export function fetchSecrets(projectId: string) {
  return getJson<{ secrets: SecretListEntry[] }>(`${PROXY_URL}/projects/${encodeURIComponent(projectId)}/secrets`);
}
export function writeSecret(projectId: string, name: string, value: string) {
  return postJson<{ updatedAt: string }>(
    `${PROXY_URL}/projects/${encodeURIComponent(projectId)}/secrets/${encodeURIComponent(name)}`,
    { value },
  );
}
export function deleteSecret(projectId: string, name: string) {
  return fetch(`${PROXY_URL}/projects/${encodeURIComponent(projectId)}/secrets/${encodeURIComponent(name)}`, {
    method: 'DELETE',
  });
}

export function fetchDms(sessionId: string, agentId: string) {
  return getJson<{ messages: DirectMessageRow[] }>(
    `${PROXY_URL}/sessions/${sessionId}/dm?agentId=${encodeURIComponent(agentId)}&limit=200`,
  );
}

export function submitUserInput(sessionId: string, content: string) {
  return postJson<{ inputId: string; at: string }>(`${PROXY_URL}/sessions/${sessionId}/user-input`, { content });
}

export function requestAgentCancel(sessionId: string, agentId: string) {
  return postJson<{ agentId: string; at: string }>(
    `${PROXY_URL}/sessions/${sessionId}/agents/${encodeURIComponent(agentId)}/cancel`,
    {},
  );
}

export function screenshotUrl(sessionId: string, screenshotId: string): string {
  return `${PROXY_URL}/sessions/${sessionId}/browser/screenshot/${screenshotId}`;
}
