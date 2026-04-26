# BUG-REST-002 — z.coerce.number() shadows enum branch in expectStatus

## Rationale

The original `z.union([z.coerce.number().int(), z.enum(['2xx',…])])` is order-sensitive: zod tries the first branch first, and `z.coerce.number()` willingly coerces "2xx" to NaN. NaN may pass `int()` on some zod versions, and the value is then committed to the int branch before the enum is tried, yielding `expectStatus = NaN`. Reordering with the enum first preserves the documented `expectStatus:'2xx'` contract while still accepting numeric strings ("200").

## Diff

See `sandbox/audit/patches/bug-4-REST-002.diff`.

## Test Plan

- Re-run REST auditor probe `POST /validate-claim {expectStatus:'2xx', url:'…/status/200'}` — should report `statusMatches:true`.
- Numeric path still works: `expectStatus: 200` and `expectStatus: '200'`.
