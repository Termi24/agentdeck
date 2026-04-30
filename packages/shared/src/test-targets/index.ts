/**
 * Test-target templates (v0.0.10+).
 *
 * A template encodes — for one test cible (api, ui, perf, security, …) —
 * (1) the 9-phase weighting (full / light / skip per phase),
 * (2) the specialist roster to fan out, (3) the runbooks to attach,
 * (4) the BLOCKING gates that `end_campaign` must verify before allowing
 * the campaign to close.
 *
 * Templates live as JSON files under `process/test-targets/` and are
 * loaded at proxy boot. The Zod schema below is the contract. Any new
 * gate kind requires (a) a new `source` enum value here AND (b) a matching
 * branch in `packages/proxy/src/services/gate-engine.ts`. Gate kinds are
 * intentionally narrow — every gate must reduce to a deterministic
 * computation over `campaigns` / `campaign_metrics` / `tool_calls`, no
 * subjective judgment, so historical replays produce stable verdicts.
 */
import { z } from 'zod';

export const PhaseWeight = z.enum(['full', 'light', 'skip']);
export type PhaseWeight = z.infer<typeof PhaseWeight>;

export const PHASE_KEYS = [
  'phase-0',
  'phase-1',
  'phase-2',
  'phase-3',
  'phase-4',
  'phase-5',
  'phase-6',
  'phase-7',
  'phase-9',
] as const;
export type PhaseKey = (typeof PHASE_KEYS)[number];

export const PhaseMatrix = z
  .object({
    'phase-0': PhaseWeight.optional(),
    'phase-1': PhaseWeight.optional(),
    'phase-2': PhaseWeight.optional(),
    'phase-3': PhaseWeight.optional(),
    'phase-4': PhaseWeight.optional(),
    'phase-5': PhaseWeight.optional(),
    'phase-6': PhaseWeight.optional(),
    'phase-7': PhaseWeight.optional(),
    'phase-9': PhaseWeight.optional(),
  })
  .default({});
export type PhaseMatrix = z.infer<typeof PhaseMatrix>;

/**
 * Gate kinds.
 *
 * - `ui-coverage-principe-10` — per-persona UI coverage ratio with waivers
 *   (the historical Principe 10 gate). Reads `tool_calls` + agents tagged
 *   for this campaign. Honours `hardFloor` / `warnFloor` and waiver lines
 *   `UI-EXEMPT: <persona>: <reason>` in retrospective.toolingFeedback.
 * - `metric-min` — campaign metric `metric` must be >= `minimum`.
 * - `metric-max` — campaign metric `metric` must be <= `maximum`.
 * - `metric-ratio-min` — `numeratorMetric / denominatorMetric` >= `minimum`.
 *   Treats missing/zero denominator as "unknown" → fail (no silent pass).
 *
 * Future kinds (event-invariant, retro-keyword, …) plug in by extending
 * this enum + the engine switch.
 */
export const GateSource = z.enum([
  'ui-coverage-principe-10',
  'metric-min',
  'metric-max',
  'metric-ratio-min',
]);
export type GateSource = z.infer<typeof GateSource>;

export const Gate = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  blocking: z.boolean().default(true),
  source: GateSource,
  /** For metric-min / metric-max */
  metric: z.string().optional(),
  /** For metric-ratio-min */
  numeratorMetric: z.string().optional(),
  denominatorMetric: z.string().optional(),
  /** For metric-min and metric-ratio-min */
  minimum: z.number().optional(),
  /** For metric-max */
  maximum: z.number().optional(),
  /** Principe 10 only */
  hardFloor: z.number().min(0).max(1).optional(),
  warnFloor: z.number().min(0).max(1).optional(),
  /** Skip eval if this many real measurements aren't available yet (Principe 10 has its own MIN_TOOL_CALLS_FOR_RATIO; metric gates use 0). */
  minSamples: z.number().int().min(0).optional(),
});
export type Gate = z.infer<typeof Gate>;

export const TestTargetTemplate = z.object({
  /** Stable identifier used as `campaigns.target`. */
  target: z.string().min(1),
  /** Human-readable summary surfaced in `read_methodology({section:'target-<x>'})`. */
  description: z.string(),
  phaseMatrix: PhaseMatrix,
  /** Spécialiste agent names the orchestrator should fan out to (ex. ["rest-auditor", "claim-validator"]). */
  specialists: z.array(z.string()).default([]),
  /** Procedure runbook filenames to attach (ex. ["exhaustive-crud-test.md"]). */
  runbooks: z.array(z.string()).default([]),
  gates: z.array(Gate).default([]),
});
export type TestTargetTemplate = z.infer<typeof TestTargetTemplate>;
