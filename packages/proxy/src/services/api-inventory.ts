import { readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, join, relative } from 'node:path';

export type InventoryFramework = 'flask' | 'express' | 'fastapi' | 'fastify';

export interface InventoryRoute {
  method: string;
  /** Full absolute path as mounted on the app (blueprint prefix resolved when possible). */
  path: string;
  /** Original path literal from the decorator, without blueprint prefix. */
  relativePath?: string;
  /** Blueprint variable name detected for this route (e.g. `clients_bp`), if any. */
  blueprint?: string;
  file: string;
  line: number;
  handler?: string;
  permissionRequired?: string;
}

export interface InventoryResult {
  framework: InventoryFramework;
  rootPath: string;
  scannedFiles: number;
  routes: InventoryRoute[];
  /** Debug: blueprint variable → resolved absolute URL prefix. */
  blueprintPrefixes?: Record<string, string>;
  /** Populated only when `runInventorySelfCheck` is called. */
  selfCheck?: InventorySelfCheckResult;
}

export interface InventorySelfCheckInput {
  /** Base URL of the live target (e.g. `https://erp.eyeot.fr`). */
  baseUrl: string;
  /** How many routes to probe. Default 8, capped by available GET routes. */
  sampleSize?: number;
  /** Per-probe timeout in ms. Default 5000. */
  timeoutMs?: number;
  /**
   * Suspicion threshold: if `suspicious.length / sampled > threshold`,
   * `suspectedParsingIssue` is set. Default 0.2.
   */
  threshold?: number;
}

export interface InventorySelfCheckResult {
  baseUrl: string;
  sampled: number;
  /** Histogram of observed HTTP status codes. */
  buckets: Record<string, number>;
  /** Routes whose status looked wrong for the given shape (no auth, no body). */
  suspicious: Array<{
    method: string;
    path: string;
    status: number;
    hint: string;
  }>;
  /** True when the suspicion ratio exceeds the threshold. */
  suspectedParsingIssue: boolean;
  /** Human-readable summary the caller can surface verbatim. */
  warnings: string[];
}

const PY_EXT = new Set(['.py']);
const JS_EXT = new Set(['.js', '.ts', '.mjs', '.cjs', '.tsx']);
const SKIP_DIRS = new Set(['node_modules', '.git', '__pycache__', '.venv', 'venv', 'dist', 'build', '.next', 'migrations']);

function walk(root: string, exts: Set<string>, out: string[]) {
  let entries;
  try {
    entries = readdirSync(root);
  } catch {
    return;
  }
  for (const name of entries) {
    if (SKIP_DIRS.has(name)) continue;
    const full = join(root, name);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) walk(full, exts, out);
    else if (exts.has(extname(name))) out.push(full);
  }
}

/**
 * Resolve blueprint URL prefixes so routes are reported with their full,
 * app-mounted path instead of the decorator-local path.
 *
 * Handles two registration patterns:
 *   1. Direct:  `<parent>.register_blueprint(<child>, url_prefix='/x')`
 *   2. Tuple-list + loop:
 *        blueprints = [(auth_bp, '/auth'), (clients_bp, '/clients'), ...]
 *        for bp, prefix in blueprints:
 *            app.register_blueprint(bp, url_prefix=f"/api/v1{prefix}")
 *      (common in multi-module Flask projects; the loop's f-string template
 *       is extracted and concatenated to each tuple's prefix.)
 */
function resolveFlaskBlueprintPrefixes(files: string[]): Map<string, string> {
  // Step 1: collect direct (parent, child, prefix) registrations.
  const directRegRe =
    /([a-zA-Z_][\w]*)\s*\.\s*register_blueprint\s*\(\s*([a-zA-Z_][\w]*)\s*(?:,\s*url_prefix\s*=\s*(?:f?['"]([^'"]*)['"]|([a-zA-Z_][\w]*)))?/g;
  // Step 2: tuple lists + f-string loop template
  const tupleRe = /\(\s*([a-zA-Z_][\w]*)\s*,\s*f?['"]([^'"]*)['"]/g;
  const fstringLoopRe = /url_prefix\s*=\s*f\s*['"]([^'"]*)\{\s*\w+\s*\}([^'"]*)['"]/;

  type DirectReg = { parent: string; child: string; prefix: string };
  const direct: DirectReg[] = [];
  // child -> (template_prefix_left, template_prefix_right, local_prefix)
  const templated: Array<{ child: string; localPrefix: string; left: string; right: string }> = [];

  for (const file of files) {
    let src: string;
    try {
      src = readFileSync(file, 'utf8');
    } catch {
      continue;
    }

    directRegRe.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = directRegRe.exec(src)) !== null) {
      direct.push({
        parent: m[1] ?? '',
        child: m[2] ?? '',
        prefix: m[3] ?? '',
      });
    }

    // Look for tuple-list pattern combined with an f-string loop
    const loop = fstringLoopRe.exec(src);
    if (loop) {
      const left = loop[1] ?? '';
      const right = loop[2] ?? '';
      tupleRe.lastIndex = 0;
      let tm: RegExpExecArray | null;
      while ((tm = tupleRe.exec(src)) !== null) {
        const child = tm[1] ?? '';
        const local = tm[2] ?? '';
        // heuristic: only blueprint-looking variables
        if (!/_bp$|blueprint/i.test(child)) continue;
        templated.push({ child, localPrefix: local, left, right });
      }
    }
  }

  // Build parent → children graph from direct regs.
  const graph = new Map<string, Array<{ child: string; prefix: string }>>();
  for (const r of direct) {
    const arr = graph.get(r.parent) ?? [];
    arr.push({ child: r.child, prefix: r.prefix });
    graph.set(r.parent, arr);
  }

  // Walk from `app` (conventional Flask root). Anything reachable gets an
  // absolute prefix. Blueprints registered on another blueprint get nested.
  const absolute = new Map<string, string>();
  const visited = new Set<string>();
  const stack: Array<{ parent: string; prefix: string }> = [{ parent: 'app', prefix: '' }];
  while (stack.length) {
    const { parent, prefix } = stack.pop()!;
    if (visited.has(parent)) continue;
    visited.add(parent);
    const children = graph.get(parent) ?? [];
    for (const c of children) {
      const full = prefix + c.prefix;
      absolute.set(c.child, full);
      stack.push({ parent: c.child, prefix: full });
    }
  }

  // Apply the templated registration pattern.
  for (const t of templated) {
    if (!absolute.has(t.child)) {
      absolute.set(t.child, t.left + t.localPrefix + t.right);
    }
  }

  return absolute;
}

/**
 * Scan a Flask codebase and return every decorated route. Handles:
 *   @bp.route('/path', methods=['GET', 'POST'])
 *   @<name>_bp.route('/path')
 *   @app.get('/path')  /  @app.post('/path')  (Flask 2.x convenience)
 * Also captures the preceding @permissions_required('module:action') if present.
 *
 * Resolves blueprint URL prefixes across the project so the returned `path`
 * is the full app-mounted path (e.g. `/api/v1/clients/<id>`) instead of
 * just the decorator-local literal (`/<id>`).
 */
function scanFlask(rootPath: string): InventoryResult {
  const files: string[] = [];
  walk(rootPath, PY_EXT, files);
  const prefixes = resolveFlaskBlueprintPrefixes(files);
  const routes: InventoryRoute[] = [];

  const routeRe =
    /@([a-zA-Z_][a-zA-Z0-9_]*)\.(route|get|post|put|patch|delete)\s*\(\s*['"]([^'"]+)['"]([^)]*)\)/g;
  const methodsRe = /methods\s*=\s*\[([^\]]+)\]/;
  const permRe = /@permissions_required\(\s*['"]([^'"]+)['"]/;
  const defRe = /def\s+([a-zA-Z_][a-zA-Z0-9_]*)/;

  for (const file of files) {
    let src: string;
    try {
      src = readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    const lines = src.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i] ?? '';
      routeRe.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = routeRe.exec(line)) !== null) {
        const bpVar = m[1] ?? '';
        const verb = m[2] ?? '';
        const relPath = m[3] ?? '';
        const rest = m[4] ?? '';
        const methods: string[] =
          verb === 'route'
            ? (() => {
                const mm = methodsRe.exec(rest);
                if (!mm || !mm[1]) return ['GET'];
                return mm[1]
                  .split(',')
                  .map((s) => s.replace(/['"]/g, '').trim().toUpperCase())
                  .filter(Boolean);
              })()
            : [verb.toUpperCase()];

        let permissionRequired: string | undefined;
        let handler: string | undefined;
        for (let j = i + 1; j < Math.min(i + 8, lines.length); j++) {
          const la = lines[j] ?? '';
          if (!permissionRequired) {
            const pm = permRe.exec(la);
            if (pm && pm[1]) permissionRequired = pm[1];
          }
          const dm = defRe.exec(la);
          if (dm && dm[1]) {
            handler = dm[1];
            break;
          }
        }

        const prefix = prefixes.get(bpVar) ?? '';
        const fullPath = joinPath(prefix, relPath);

        for (const method of methods) {
          routes.push({
            method,
            path: fullPath,
            relativePath: relPath,
            blueprint: bpVar || undefined,
            file: relative(rootPath, file).replace(/\\/g, '/'),
            line: i + 1,
            handler,
            permissionRequired,
          });
        }
      }
    }
  }

  const blueprintPrefixes: Record<string, string> = {};
  for (const [k, v] of prefixes.entries()) blueprintPrefixes[k] = v;

  return { framework: 'flask', rootPath, scannedFiles: files.length, routes, blueprintPrefixes };
}

function joinPath(prefix: string, relPath: string): string {
  if (!prefix) return relPath;
  // A bare "/" relpath means "mount the blueprint on its prefix, with a
  // trailing slash". Flask's default `strict_slashes=True` makes this
  // critical: requesting `/api/v1/clients` (no trailing slash) against a
  // route declared as `@bp.route('/')` returns a 308 redirect — and in
  // presence of a `before_request` auth guard, the 308 never reaches the
  // client and you see a 401 instead. Always preserve the trailing slash.
  if (!relPath) return prefix;
  if (relPath === '/') return prefix.endsWith('/') ? prefix : prefix + '/';
  const left = prefix.endsWith('/') ? prefix.slice(0, -1) : prefix;
  const right = relPath.startsWith('/') ? relPath : '/' + relPath;
  return left + right;
}

/**
 * Scan Express/Fastify codebases for `app.get('/...', ...)`, `router.post(...)`, etc.
 */
function scanExpressLike(rootPath: string, framework: 'express' | 'fastify'): InventoryResult {
  const files: string[] = [];
  walk(rootPath, JS_EXT, files);
  const routes: InventoryRoute[] = [];
  const re = /\b([a-zA-Z_$][\w$]*)\.(get|post|put|patch|delete|options|head|all)\s*\(\s*['"`]([^'"`]+)['"`]/g;

  for (const file of files) {
    let src: string;
    try {
      src = readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    const lines = src.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i] ?? '';
      re.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = re.exec(line)) !== null) {
        const verb = m[2] ?? '';
        const path = m[3] ?? '';
        routes.push({
          method: verb.toUpperCase(),
          path,
          file: relative(rootPath, file).replace(/\\/g, '/'),
          line: i + 1,
        });
      }
    }
  }
  return { framework, rootPath, scannedFiles: files.length, routes };
}

/**
 * Scan a FastAPI codebase for `@app.get/post/...` and `@router.get/post/...`.
 */
function scanFastAPI(rootPath: string): InventoryResult {
  const files: string[] = [];
  walk(rootPath, PY_EXT, files);
  const routes: InventoryRoute[] = [];
  const re = /@([a-zA-Z_][\w]*)\.(get|post|put|patch|delete|options|head)\s*\(\s*['"]([^'"]+)['"]/g;
  const defRe = /def\s+([a-zA-Z_][a-zA-Z0-9_]*)/;

  for (const file of files) {
    let src: string;
    try {
      src = readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    const lines = src.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i] ?? '';
      re.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = re.exec(line)) !== null) {
        const verb = m[2] ?? '';
        const path = m[3] ?? '';
        let handler: string | undefined;
        for (let j = i + 1; j < Math.min(i + 6, lines.length); j++) {
          const dm = defRe.exec(lines[j] ?? '');
          if (dm && dm[1]) {
            handler = dm[1];
            break;
          }
        }
        routes.push({
          method: verb.toUpperCase(),
          path,
          file: relative(rootPath, file).replace(/\\/g, '/'),
          line: i + 1,
          handler,
        });
      }
    }
  }
  return { framework: 'fastapi', rootPath, scannedFiles: files.length, routes };
}

export function inventoryRoutes(framework: InventoryFramework, rootPath: string): InventoryResult {
  switch (framework) {
    case 'flask':
      return scanFlask(rootPath);
    case 'fastapi':
      return scanFastAPI(rootPath);
    case 'express':
      return scanExpressLike(rootPath, 'express');
    case 'fastify':
      return scanExpressLike(rootPath, 'fastify');
  }
}

/**
 * Probe a handful of static GET routes from the inventory against the live
 * backend to detect parsing bugs before the caller starts building a test
 * matrix on top of a broken inventory.
 *
 * Rationale (IndusForge run 2, 2026-04-24): the previous run wasted ~10 min
 * because two silent bugs in Flask blueprint + trailing-slash resolution
 * produced 22 false-positive bug reports. A 5 s self-check that flags a
 * suspiciously high rate of 3xx/404/5xx probes would have caught both
 * bugs instantly.
 *
 * Classification (no Authorization header sent):
 *   - 200              → public endpoint, healthy
 *   - 401 / 403        → permission-gated, healthy (RBAC wall is working)
 *   - 3xx (redirect)   → suspicious: likely trailing-slash / strict_slashes mismatch
 *   - 404              → suspicious: extracted path does not resolve (prefix bug)
 *   - 5xx              → suspicious: path params probably interpreted as literals
 *   - network-error    → caller problem (baseUrl wrong or target down)
 */
export async function runInventorySelfCheck(
  result: InventoryResult,
  input: InventorySelfCheckInput,
): Promise<InventorySelfCheckResult> {
  const baseUrl = input.baseUrl.replace(/\/+$/, '');
  const sampleSize = Math.max(1, input.sampleSize ?? 8);
  const timeoutMs = input.timeoutMs ?? 5_000;
  const threshold = input.threshold ?? 0.2;

  const candidates = result.routes.filter(
    (r) =>
      r.method === 'GET' &&
      !/[<:{].*?[>:}]/.test(r.path) &&
      !r.path.includes('*'),
  );

  // Spread across blueprints so a single broken prefix doesn't blow up
  // the suspicion ratio, and a single good prefix can't mask a bad one.
  const byBp = new Map<string, InventoryRoute[]>();
  for (const r of candidates) {
    const key = r.blueprint ?? '';
    const arr = byBp.get(key) ?? [];
    arr.push(r);
    byBp.set(key, arr);
  }
  const picked: InventoryRoute[] = [];
  const leftovers: InventoryRoute[] = [];
  for (const arr of byBp.values()) {
    const [first, ...rest] = arr;
    if (first) picked.push(first);
    leftovers.push(...rest);
    if (picked.length >= sampleSize) break;
  }
  while (picked.length < sampleSize && leftovers.length > 0) {
    const next = leftovers.shift();
    if (next) picked.push(next);
  }
  const sample = picked.slice(0, sampleSize);

  const buckets: Record<string, number> = {};
  const suspicious: Array<{ method: string; path: string; status: number; hint: string }> = [];

  for (const r of sample) {
    const ctl = new AbortController();
    const to = setTimeout(() => ctl.abort(), timeoutMs);
    let status = 0;
    try {
      const res = await fetch(`${baseUrl}${r.path}`, {
        method: 'GET',
        redirect: 'manual',
        signal: ctl.signal,
      });
      status = res.status;
      try {
        await res.text();
      } catch {
        /* ignore */
      }
    } catch {
      status = 0;
    }
    clearTimeout(to);

    const bucket = status === 0 ? 'network-error' : String(status);
    buckets[bucket] = (buckets[bucket] ?? 0) + 1;

    if (status >= 300 && status < 400) {
      suspicious.push({
        method: r.method,
        path: r.path,
        status,
        hint:
          'redirect (3xx) — likely a trailing-slash mismatch. Check joinPath() and strict_slashes.',
      });
    } else if (status === 404) {
      suspicious.push({
        method: r.method,
        path: r.path,
        status,
        hint:
          'not found — extracted path does not resolve on the live backend. Check blueprint prefix resolution or url_prefix.',
      });
    } else if (status >= 500 && status < 600) {
      suspicious.push({
        method: r.method,
        path: r.path,
        status,
        hint:
          'server error — the handler may be receiving a literal path-param token, or the route throws unauthenticated.',
      });
    }
  }

  const sampled = sample.length;
  const ratio = sampled === 0 ? 0 : suspicious.length / sampled;
  const suspectedParsingIssue = ratio > threshold;

  const warnings: string[] = [];
  if (sampled === 0) {
    warnings.push(
      'No static GET routes available to probe — inventory is empty or every GET has path params.',
    );
  }
  if (buckets['network-error']) {
    warnings.push(
      `${buckets['network-error']} probe(s) failed to reach ${baseUrl}. Verify the baseUrl and that the target is reachable from the proxy host.`,
    );
  }
  if (suspectedParsingIssue) {
    warnings.push(
      `Suspicion ratio ${Math.round(ratio * 100)}% (${suspicious.length}/${sampled}) exceeds threshold ${Math.round(threshold * 100)}% — inventory likely has resolution bugs. Review the suspicious entries before building a test matrix on this output.`,
    );
  }

  return {
    baseUrl,
    sampled,
    buckets,
    suspicious,
    suspectedParsingIssue,
    warnings,
  };
}
