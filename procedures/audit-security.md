# Procedure: audit-security

## Objectif
Probe la posture sécurité d'agentdeck : secrets AES-256-GCM round-trip + ciphertext vérifié, sandbox path-traversal refused, no-auth surface documentée, install-claude idempotency, master-key rotation gap.

## Pré-requis
- Tools : `mcp__agentdeck__secrets_get`, `mcp__agentdeck__validate_claim`, `mcp__agentdeck__sandbox_*`
- Lecture : `packages/proxy/src/services/crypto-store.ts`, `packages/proxy/src/services/sandbox.ts`, `packages/proxy/src/server.ts`, `scripts/install-claude.mjs`
- Accès `~/.agentdeck/master.key` (read-only) pour vérifier permissions

## Étapes

1. **Secrets AES-256-GCM round-trip**
   - POST `/projects/:pid/secrets/sec-test` avec value `"the quick brown fox 🦊"`
   - GET récupère la même valeur (decrypted)
   - Vérifier dans la DB que `value_encrypted` est opaque base64 (pas plaintext) via sandbox_exec sqlite3
   - DELETE et confirmer
   - PASS si round-trip byte-exact, ciphertext non-plain

2. **Sandbox path-traversal refused**
   Tester chaque payload : `../escape.txt`, `..\\windows.txt`, `/abs/path`, `data:abc`, et un symlink hop si possible
   - Tous doivent retourner **400** avec message contenant `path escapes`
   - `validate_claims_bulk` avec ces 5 claims, `expectStatus: 400`

3. **Proxy no-auth posture**
   - `netstat -an | grep 4317` doit montrer `LISTENING 127.0.0.1` (jamais `0.0.0.0`)
   - Confirmer aucun middleware d'auth dans `packages/proxy/src/server.ts`
   - Documenter le risque si `PROXY_HOST=0.0.0.0` était configuré
   - Recommandation : `z.literal('127.0.0.1')` dans config (au choix)

4. **Install-claude idempotency**
   Static review de `scripts/install-claude.mjs` :
   - `pnpm install` est-il existence-gated ?
   - `claude mcp add` overwrite par nom (pas de duplicate) ?
   - `permissions.allow` rebuilt via Set + sort ?
   - PASS si oui pour les 3

5. **Master-key rotation gap**
   - Lire `crypto-store.ts` : `cachedKey` module-scope, pas de hook de rotation
   - Schema `secrets` : pas de colonne `key_id` ou `key_version`
   - WARN documentée : rotation = wipe table + re-upload (workflow opérationnel)
   - Recommandation : ajouter colonne + endpoint `/admin/rotate-master-key`

6. **Bridge attribution no-token**
   Confirmer que `POST /sessions {bridge:true}` n'exige aucun token et accepte n'importe quel `fromAgentId` envoyé par l'orchestrateur. Documenter posture.

## Format des reports
- suite: `security`
- caseName: par probe (ex: `aes-256-gcm-roundtrip`, `sandbox-path-traversal-refusal`)
- evidence: `{ok, mismatches?, file_evidence?}`

## Critère de done
- 6 probes reportées
- Doc `10-security-audit.md` publié avec posture documentée + recommandations

## Anti-patterns
- Confondre "no-auth = bug" avec "no-auth = design intentionnel sur localhost" — c'est le second tant que `PROXY_HOST=127.0.0.1`
- Oublier de DELETE le secret de probe — pollue la DB
