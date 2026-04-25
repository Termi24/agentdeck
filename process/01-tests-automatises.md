# 01 — Tests automatisés (pytest + script API + Playwright E2E)

> Trois techniques de test automatisé empilées : **pytest** (backend, micro-niveau), **script API direct** (API publique en HTTP réel, multi-personas), **Playwright E2E** (parcours UI scriptés). Cette base technique tourne en CI à chaque PR.

---

## 1. pytest backend

### 1.1 Stack

| Élément | Choix eyeot |
|---|---|
| Runner | `pytest` |
| DB de test | SQLite in-memory (`sqlite:///:memory:`) — fixture `app` scope=`session` |
| Config | `TestConfig` dans `backend/core/config.py` |
| Auth | JWT créé via `flask_jwt_extended.create_access_token()` |
| Lint | `ruff` |
| Type-check | `mypy` |
| Couverture | `pytest --cov=services --cov=api` |

### 1.2 Fixtures clés (`backend/tests/conftest.py`)

```python
@pytest.fixture(scope="session")
def app():
    app = create_app("test")  # SQLite in-memory
    _register_test_routes(app)
    with app.app_context():
        _db.create_all()
        yield app
        _db.drop_all()

@pytest.fixture
def client(app):
    return app.test_client()

@pytest.fixture
def db(app):
    with app.app_context():
        yield _db

@pytest.fixture
def admin_headers(app):
    """JWT carrying admin:all permission."""
    token = create_access_token(
        identity=str(user.id),
        additional_claims={"permissions": ["admin:all"]},
    )
    return {"Authorization": f"Bearer {token}"}

@pytest.fixture
def user_headers(app):
    """JWT carrying standard user permissions."""
    # Permissions limitées pour tester le RBAC
```

### 1.3 Convention de nommage

- Fichier : `backend/tests/test_<module>.py` (ex: `test_clients.py`, `test_it_ticket_state.py`)
- Classe : `TestModuleAction` (ex: `TestLogin`, `TestTicketTransition`)
- Méthode : `test_what_happens_when_<scenario>` (ex: `test_login_success`, `test_transition_invalid_returns_409`)

### 1.4 Structure d'un test type

```python
class TestTicketStateMachine:
    def test_new_to_in_progress_succeeds(self, client, admin_headers, db):
        # Arrange : créer ticket NOUVEAU
        ticket = TicketFactory.create(status="NOUVEAU")
        db.session.commit()

        # Act
        resp = client.post(
            f"/api/v1/it/tickets/{ticket.id}/transition",
            json={"status": "EN_COURS"},
            headers=admin_headers,
        )

        # Assert
        assert resp.status_code == 200
        assert resp.json["data"]["status"] == "EN_COURS"
        assert resp.json["data"]["first_response_at"] is not None  # side effect

    def test_new_to_resolu_returns_409(self, client, admin_headers, db):
        ticket = TicketFactory.create(status="NOUVEAU")
        db.session.commit()
        resp = client.post(
            f"/api/v1/it/tickets/{ticket.id}/transition",
            json={"status": "RESOLU"},
            headers=admin_headers,
        )
        assert resp.status_code == 409
        assert "Transition invalide" in resp.json["detail"]
```

### 1.5 Couverture cible

| Niveau | Cible |
|---|---|
| Services métier (`backend/services/*`) | ≥ 70% lignes |
| Routes API (`backend/api/v1/*`) | ≥ 60% endpoints (au moins 1 happy path + 1 erreur connue) |
| Models (`backend/models/*`) | ≥ 50% (validations, side effects, mixins) |
| Multi-tenant isolation | 100% (un test par modèle critique : "objet d'org A invisible depuis org B") |

### 1.6 Anti-patterns à éviter

- **Mocks abusifs** sur la DB → préférer SQLite in-memory réel.
- **Tests qui dépendent de l'ordre d'exécution** → chaque test crée ses propres fixtures.
- **Hardcoder des UUIDs** → utiliser des factory ou `uuid4()` dans le test.
- **Skipper les contraintes FK en mémoire** → SQLite ne pose pas certaines contraintes que PG pose. Ajouter `PRAGMA foreign_keys = ON` dans la config test.
- **Tester le ORM** au lieu du métier → ce qui compte c'est la logique métier, pas que SQLAlchemy fonctionne.

### 1.7 Commandes utiles

```bash
cd backend
python -m pytest tests/ -v                                # tous
python -m pytest tests/test_it_ticket_state.py -v        # un fichier
python -m pytest tests/test_it_ticket_state.py::TestTicketStateMachine::test_new_to_in_progress_succeeds -v  # un test précis
python -m pytest tests/ -k 'it_'                         # tous les tests IT
python -m pytest tests/ -k 'tenant'                      # tous les tests d'isolation
python -m pytest tests/ --cov=services --cov-report=html # couverture HTML
python -m pytest tests/ -x --pdb                         # stop au 1er échec, ouvre debugger
```

---

## 2. Script API direct multi-personas (`test-all-creates.py`)

### 2.1 Idée

Un script Python qui, depuis n'importe quelle machine connectée à internet, **se logue avec les 8 comptes-personas IndusForge**, et exerce **toutes les routes CREATE/UPDATE/DELETE/ACTIONS** de chaque persona, en pure API HTTP.

C'est plus rapide que Playwright (pas de browser), plus large que pytest (couvre plusieurs personas et leurs RBAC réels en condition prod). Idéal pour un cliché en 5 minutes avant une release.

### 2.2 Source

Fichier de référence : `_team/test-all-creates.py` (~600 lignes).

Output : `_team/test-all-creates-report.md` (table de 47+ cas).

### 2.3 Architecture

```python
PERSONAS = {
    "admin":       {"email": "admin@industest.fr",       "label": "Amandine (admin)"},
    "directeur":   {"email": "directeur@industest.fr",   "label": "Bernard (manager)"},
    "chef_projet": {"email": "chef-projet@industest.fr", "label": "Camille (chef_projet)"},
    "commercial":  {"email": "commercial@industest.fr",  "label": "Damien (commercial)"},
    "prospection": {"email": "prospection@industest.fr", "label": "Elodie (commercial)"},
    "technicien":  {"email": "technicien@industest.fr",  "label": "Fabien (technicien)"},
    "magasinier":  {"email": "magasinier@industest.fr",  "label": "Ghislaine (magasinier)"},
    "rh":          {"email": "rh@industest.fr",          "label": "Hugo (rh)"},
}

@dataclass
class TestCase:
    name: str
    module: str
    method: str          # GET / POST / PUT / PATCH / DELETE
    path: str            # ex: "/api/v1/it/tickets"
    persona: str         # qui fait la requête
    payload: dict | None = None
    expected_status: int = 201
    needs_id_from: str | None = None   # alias d'une fixture créée précédemment
    saves_id_as: str | None = None     # nom à donner à l'id retourné

@dataclass
class Session:
    base: str                    # https://erp.eyeot.fr
    tokens: dict[str, str]       # persona -> JWT
    fixtures: dict[str, str]     # alias -> uuid (chaînage entre tests)
    http: requests.Session
```

### 2.4 Boucle principale

```python
def main():
    session = Session(base=args.base)
    # 1. Login chaque persona (avec retry sur 429)
    for p in PERSONAS:
        login(session, p)

    # 2. Définir les test cases (47+ dans le script complet)
    cases = define_cases()

    # 3. Exécuter chaque case dans l'ordre (les fixtures sont chaînées)
    results = []
    for case in cases:
        result = run_case(session, case)
        results.append(result)
        if case.saves_id_as and result.ok:
            session.fixtures[case.saves_id_as] = result.body["data"]["id"]

    # 4. Rapport markdown
    write_report(results, "_team/test-all-creates-report.md")
```

### 2.5 Patterns importants

#### Retry sur rate-limit (429)

```python
def login(session, persona):
    for attempt in range(5):
        r = session.http.post(f"{session.base}/api/v1/auth/login", json={...})
        if r.status_code == 429:
            wait = 15 * (attempt + 1)
            time.sleep(wait)
            continue
        return r
```

#### Fixtures chaînées (CREATE → UPDATE → DELETE sur le même objet)

```python
TestCase("create_client", "clients", "POST", "/api/v1/clients", "commercial",
         payload={"name": f"Test {suffix}"}, saves_id_as="client_id"),
TestCase("patch_client", "clients", "PATCH", "/api/v1/clients/{client_id}", "commercial",
         payload={"phone": "0102030405"}, expected_status=200),
TestCase("delete_client", "clients", "DELETE", "/api/v1/clients/{client_id}", "admin",
         expected_status=200),
```

Le script résout `{client_id}` depuis `session.fixtures` avant chaque appel.

#### Suffixe unique anti-collision

```python
suffix = uuid.uuid4().hex[:8]   # ex: "03f0b1f2"
# Tous les noms créés sont préfixés "TEST QA <suffix> ..."
```

→ Permet de relancer le script sans que le précédent run ne crée de duplicates qui font échouer les unicity constraints.

### 2.6 Format du rapport

```markdown
# Rapport test exhaustif CREATE — https://erp.eyeot.fr

**Suffixe unique** : `03f0b1f2`
**Total cas** : 47 · ✅ 41 · ❌ 6

| # | Persona | Module | Flow | HTTP | Durée | Verdict | Message |
|---|---------|--------|------|------|-------|---------|---------|
| 1 | commercial | clients | CRM: create_client | 201 | 56ms | ✅ |  |
| 14 | admin | finance | Finance: create_record | 0 | 0ms | ❌ | Fixtures manquantes dans payload: ['site_id'] |
...

## Fixtures créées
- `client_id` : `8659c782-1854-48bf-8f9b-4ef3029024b0`
...
```

### 2.7 Quand l'utiliser

- **Smoke avant release** : 5 min, dit immédiatement si l'API casse.
- **Audit RBAC** : un commercial qui réussit à DELETE un client = bug critique. Le script catch tout.
- **Détection des régressions multi-org** : si un payload réussit en pytest (in-memory) mais échoue en prod (multi-tenant), le script révèle la divergence.

### 2.8 Quand NE PAS l'utiliser

- Pour tester l'UI (pas couvert).
- Pour tester des workflows complexes avec branches conditionnelles (limité par le format `TestCase`).
- Pour tester les notifications SSE en temps réel (pas exposé).

---

## 3. Playwright E2E scriptés

### 3.1 Stack

- **Tests** : `e2e/specs/*.spec.ts` (fichiers TypeScript)
- **Config** : `playwright.config.ts` à la racine (à créer si pas encore là)
- **Browsers** : Chromium principalement (Firefox/Safari optionnel)
- **Auth** : helper `auth.ts` qui se connecte en début de test, persiste le `storageState` pour réutilisation
- **CI** : GitHub Actions, tests E2E sur staging à chaque PR critique

### 3.2 Pattern d'authentification

Pour ne pas se reconnecter à chaque test :

```typescript
// e2e/helpers/auth.ts
import { Page, BrowserContext } from '@playwright/test';

export async function loginAs(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.fill('[name="email"]', email);
  await page.fill('[name="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL('/');
}

export async function saveAuthState(context: BrowserContext, persona: string) {
  await context.storageState({ path: `e2e/.auth/${persona}.json` });
}
```

```typescript
// playwright.config.ts (extrait)
projects: [
  { name: 'setup', testMatch: '**/*.setup.ts' },
  {
    name: 'chromium',
    use: { storageState: 'e2e/.auth/admin.json' },
    dependencies: ['setup'],
  },
],
```

### 3.3 Anti-pattern critique : SSE/networkidle

Le plus gros piège E2E sur eyeot : **les connexions SSE ouvertes empêchent `waitForLoadState('networkidle')` de terminer**.

```typescript
// ❌ NE FONCTIONNE PAS sur les pages avec SSE
await page.goto('/it');
await page.waitForLoadState('networkidle');  // hangs forever

// ✅ ATTENDRE UN ÉLÉMENT VISUEL CONCRET À LA PLACE
await page.goto('/it');
await page.waitForSelector('h1:has-text("Service IT")');
await page.waitForLoadState('domcontentloaded');
```

### 3.4 Spec type — créer un ticket

```typescript
// e2e/specs/it-helpdesk.spec.ts
import { test, expect } from '@playwright/test';

test.describe('IT Helpdesk', () => {
  test('admin creates ticket, assigns, resolves', async ({ page }) => {
    await page.goto('/it/tickets');
    await page.click('button:has-text("Nouveau ticket")');

    await page.fill('[name="title"]', 'TEST E2E — Wifi HS');
    await page.fill('[name="description"]', 'Plus de Wifi salle réunion.');
    await page.selectOption('[name="type"]', 'INCIDENT');
    await page.selectOption('[name="priority"]', 'HAUTE');
    await page.click('button:has-text("Créer")');

    // Toast succès
    await expect(page.getByText(/ticket créé/i)).toBeVisible({ timeout: 5000 });

    // Le ticket apparaît dans la liste
    await expect(page.getByRole('row', { name: /TEST E2E — Wifi HS/ })).toBeVisible();
  });
});
```

### 3.5 Pièges cumulatifs (cf. `08-apprentissages.md`)

- **Cookie banner RGPD** bloque les clics → dismiss en `beforeEach`.
- **Sélecteurs fragiles** sur classes Tailwind → préférer `getByRole`, `getByText`, `data-testid`.
- **Async timing** : `await page.waitFor*()` plutôt que `setTimeout`.
- **Browser context partagé** entre tests parallèles → `test.describe.configure({ mode: 'serial' })` si dépendances.

### 3.6 Couverture cible E2E

**N'essaie pas de couvrir 100%**. Choisis 5-10 golden paths critiques par module :

| Module | Golden paths E2E |
|---|---|
| Auth | login OK, login KO, logout, 2FA setup |
| CRM | créer client, créer devis, accepter devis, convertir en commande |
| IT | créer ticket, transition complète, assigner, résoudre, satisfaction |
| Stock | créer produit, créer mouvement, alerte rupture |
| RH | créer employé, demander congé, valider congé |
| Finance | générer facture depuis devis, marquer payée |

Total cible : ~40 specs E2E, ~10 min de run.

---

## 4. Stratégie de stack

```
À chaque commit       : pytest + vitest             (5 min)
À chaque PR           : + script API direct          (+5 min, total 10 min)
À chaque release      : + E2E full                    (+10 min, total 20 min)
Avant gros jalon      : + tout ci-dessus + agent métier MCP (méthodo 4)
```

---

## 5. Ce que ces tests automatisés NE TROUVERONT JAMAIS

- Les **frictions UX** (libellé ambigu, cul-de-sac de navigation, pas de toast).
- Les **manques fonctionnels visibles côté UI** (l'API a la feature, l'UI ne l'expose pas — testé en condition réelle par un agent métier).
- Les **bugs spécifiques à un état d'org** (ex: org sans seeds, FK Membership manquante en prod).
- Les **bugs cross-rôles** (ex: commercial voit des données d'un autre commercial).

→ Pour ces cas-là, voir `02-tests-agents-metier.md` et `03-orchestration-multi-agents.md`.

---

*Tests automatisés — 2026-04-25, v1.0.*
