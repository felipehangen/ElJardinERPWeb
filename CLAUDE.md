# El Jardín ERP — working notes

Contable SPA (React 19 + Vite + TS + Zustand + Supabase), deployed to GitHub
Pages via GitHub Actions on push to `master`. Code lives in `web/`.

## Accounting invariants — read before touching money code

**The transaction ledger is the single source of truth.** Every balance is
*derived* from it on each `reconcile()` and on every load:

- `inventario`  = Σ(item.stock × item.cost)
- `activo_fijo` = Σ(asset.value)
- `banco` / `caja_chica` = `deriveCashFromLedger(transactions)`
- `patrimonio`  = banco + caja_chica + inventario + activo_fijo

Hard rules (a past incident traced directly to breaking these — see
[lessons.md](./lessons.md)):

1. **Never patch `accounts` with direct SQL.** Cash is recomputed from the log
   on load, so a manual balance edit will be silently overwritten. Correct a
   balance only through a transaction — a cash audit (records `realVal`, which
   anchors permanently) or a correctivo ADJUSTMENT.
2. **`Diferencia por Conciliar` ≠ ₡0 is an alarm, not a number to plug.** It
   means something bypassed the transaction flow (a backup restore, a sync
   race). Investigate the cause; do not fabricate COGS to hide it.
3. **Cash audits are absolute SETs** to the verified physical count, not
   deltas. They re-anchor the ledger to reality.
4. **Backup restores are the one operation that can reintroduce drift** — they
   reinstate a whole-state snapshot, not a transaction. After any restore, let
   the app reconcile and confirm `Diferencia` = ₡0.

## Deploy

- **Always bump `web/package.json` `version` before pushing** (it's the
  displayed version; the update-check uses the CI-written commit SHA).
- `npm test` (vitest) must pass. Node/npm/gh are not on PATH by default.

## Known follow-up

Cloud sync uses last-write-wins on the whole-state blob. It should
**union-merge the transaction array by id** so concurrent edits never drop
records. Until then, the derived-cash + on-load reconcile is what keeps balances
correct after a conflict.
