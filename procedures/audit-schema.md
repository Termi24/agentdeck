# Procedure: audit-schema

## Objectif
Vérifier les invariants schéma de `packages/shared` : every event type has a matching table write, no orphan tables, every MCP tool input schema round-trips clean via z.toJSONSchema, no extra autoincrement PK beyond `events.id`.

## Pré-requis
- Tools : `mcp__agentdeck__schema_inventory`, `mcp__agentdeck__events_inventory`, `mcp__agentdeck__mcp_tools_inventory`
- Lecture : `packages/shared/src/db/schema.ts`, `packages/shared/src/types/events.ts`, `packages/mcp/src/tools.ts`

## Étapes

1. **Cartographie schéma**
   ```
   schema = schema_inventory({rootPath:'G:/agentdeck/packages/shared/src/db'})
   events = events_inventory({rootPath:'G:/agentdeck/packages/shared/src/types'})
   tools = mcp_tools_inventory({rootPath:'G:/agentdeck/packages/mcp/src/tools.ts'})
   ```
   Asserts attendus : `schema.tables.length >= 18`, `events.events.length >= 20`, `tools.tools.length >= 36`.

2. **Invariant 1 — every event → table write**
   Pour chaque event type, grep dans `packages/proxy/src/**` une `insert(<table>)`. Si aucune ne match → BUG-SCHEMA-001-class.

3. **Invariant 2 — no orphan tables**
   Pour chaque `schema.tables.name`, vérifier qu'au moins 1 event de la liste écrit dedans (sandbox ou via persistence helper). Sinon : tagger INFO-SCHEMA si justifiable (ex: `procedures` table cache-only), BUG sinon.

4. **Invariant 3 — zod → JSON Schema round-trip**
   Pour chaque tool, `z.toJSONSchema(tool.inputSchema)` doit produire un JSON valide. Capturer toute exception → BUG-SCHEMA-RT-NNN.

5. **Invariant 4 — single autoincrement PK**
   Filtrer `schema.tables[*].columns[*]` sur `autoIncrement === true`. Doit retourner exactement 1 entrée : `events.id`. Plus → BUG-SCHEMA-CONVENTION.

6. **Invariant 5 — migrations linéaires**
   Lire `packages/shared/src/db/migrations/meta/_journal.json`. Vérifier que les `idx` sont contigus 0..N (pas de gap = pas de merge raté).

## Format des reports
- suite: `schema-invariants`
- caseName: par invariant (ex: `event.tool_use.start has table_writer`, `no_extra_autoincrement_pk`)
- evidence: `{table?, event_type?, file?, line?, message?}`

## Critère de done
- 5 invariants reportés (passed ou failed)
- Doc `04-schema-audit.md` publié avec table récap
- Channel summary

## Anti-patterns
- Ouvrir schema.ts à la main et compter les tables (utiliser `schema_inventory`)
- Reporter "20 events" sans vérifier que le nombre matche le code (utiliser `events_inventory`)
