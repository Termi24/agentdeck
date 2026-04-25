'use client';
import 'dockview-react/dist/styles/dockview.css';
import '@/components/dockview-theme.css';

import { useEffect, useRef, useState } from 'react';
import { DockviewReact, type DockviewApi, type DockviewReadyEvent, type IDockviewPanelProps } from 'dockview-react';
import { AgentPanel } from '@/components/panels/agent-panel';
import { AgentTreePanel } from '@/components/panels/agent-tree-panel';
import { ChannelPanel } from '@/components/panels/channel-panel';
import { DocsPanel } from '@/components/panels/docs-panel';
import { SandboxPanel } from '@/components/panels/sandbox-panel';
import { ProceduresPanel } from '@/components/panels/procedures-panel';
import { ResultsPanel } from '@/components/panels/results-panel';
import { MemoryPanel } from '@/components/panels/memory-panel';
import { SecretsPanel } from '@/components/panels/secrets-panel';
import { BrowserPanel } from '@/components/panels/browser-panel';
import { DmPanel } from '@/components/panels/dm-panel';
import { useSession } from '@/components/session-context';

const PANEL_COMPONENTS: Record<string, React.FunctionComponent<IDockviewPanelProps>> = {
  agent: AgentPanel as unknown as React.FunctionComponent<IDockviewPanelProps>,
  agentTree: AgentTreePanel as unknown as React.FunctionComponent<IDockviewPanelProps>,
  channel: ChannelPanel as unknown as React.FunctionComponent<IDockviewPanelProps>,
  docs: DocsPanel as unknown as React.FunctionComponent<IDockviewPanelProps>,
  sandbox: SandboxPanel as unknown as React.FunctionComponent<IDockviewPanelProps>,
  procedures: ProceduresPanel as unknown as React.FunctionComponent<IDockviewPanelProps>,
  results: ResultsPanel as unknown as React.FunctionComponent<IDockviewPanelProps>,
  memory: MemoryPanel as unknown as React.FunctionComponent<IDockviewPanelProps>,
  secrets: SecretsPanel as unknown as React.FunctionComponent<IDockviewPanelProps>,
  browser: BrowserPanel as unknown as React.FunctionComponent<IDockviewPanelProps>,
  dm: DmPanel as unknown as React.FunctionComponent<IDockviewPanelProps>,
};

export function DockviewLayout({ rootAgentId, projectId }: { rootAgentId: string; projectId: string }) {
  const { events } = useSession();
  const apiRef = useRef<DockviewApi | null>(null);
  const [activeAgentId, setActiveAgentId] = useState(rootAgentId);
  const [apiReady, setApiReady] = useState(false);
  const knownAgentIdsRef = useRef<Set<string>>(new Set());

  const onReady = (event: DockviewReadyEvent) => {
    const api = event.api;
    apiRef.current = api;

    const tree = api.addPanel({
      id: 'tree',
      component: 'agentTree',
      title: 'Agents',
      params: {
        onSelectAgent: (id: string) => {
          setActiveAgentId(id);
          const panel = api.getPanel(`agent:${id}`);
          if (panel) panel.api.setActive();
        },
        activeAgentId: rootAgentId,
      },
    });
    tree.api.setSize({ width: 220 });

    api.addPanel({
      id: `agent:${rootAgentId}`,
      component: 'agent',
      title: 'orchestrator',
      params: { agentId: rootAgentId },
      position: { referencePanel: 'tree', direction: 'right' },
    });

    const fixedRef = `agent:${rootAgentId}`;
    const fixed = [
      { id: 'channel', title: 'Channel', component: 'channel', params: {} as Record<string, unknown> },
      { id: 'docs', title: 'Docs', component: 'docs', params: {} as Record<string, unknown> },
      { id: 'sandbox', title: 'Sandbox', component: 'sandbox', params: {} as Record<string, unknown> },
      { id: 'procedures', title: 'Procedures', component: 'procedures', params: {} as Record<string, unknown> },
      { id: 'results', title: 'Results', component: 'results', params: {} as Record<string, unknown> },
      { id: 'browser', title: 'Browser', component: 'browser', params: {} as Record<string, unknown> },
      { id: 'memory', title: 'Memory', component: 'memory', params: { projectId } },
      { id: 'secrets', title: 'Secrets', component: 'secrets', params: { projectId } },
    ];
    for (const p of fixed) {
      api.addPanel({
        id: p.id,
        component: p.component,
        title: p.title,
        params: p.params,
        position: { referencePanel: fixedRef, direction: 'within' },
      });
    }

    const root = api.getPanel(fixedRef);
    if (root) root.api.setActive();

    knownAgentIdsRef.current.add(rootAgentId);
    setApiReady(true);
  };

  useEffect(() => {
    const api = apiRef.current;
    if (!api || !apiReady) return;
    for (const ev of events) {
      if (ev.type !== 'agent.spawned') continue;
      if (knownAgentIdsRef.current.has(ev.agentId)) continue;
      knownAgentIdsRef.current.add(ev.agentId);
      if (ev.agentId === rootAgentId) continue;
      api.addPanel({
        id: `agent:${ev.agentId}`,
        component: 'agent',
        title: ev.name,
        params: { agentId: ev.agentId },
        position: { referencePanel: `agent:${rootAgentId}`, direction: 'within' },
      });
      api.addPanel({
        id: `dm:${ev.agentId}`,
        component: 'dm',
        title: `DM: ${ev.name}`,
        params: { agentId: ev.agentId, agentName: ev.name },
        position: { referencePanel: `agent:${rootAgentId}`, direction: 'within' },
      });
    }
  }, [events, rootAgentId, apiReady]);

  useEffect(() => {
    const api = apiRef.current;
    if (!api) return;
    const treePanel = api.getPanel('tree');
    if (treePanel) treePanel.api.updateParameters({ activeAgentId });
  }, [activeAgentId]);

  return (
    <DockviewReact
      className="dockview-theme-agentdeck h-full w-full"
      components={PANEL_COMPONENTS}
      onReady={onReady}
      disableFloatingGroups
      defaultRenderer="always"
    />
  );
}
