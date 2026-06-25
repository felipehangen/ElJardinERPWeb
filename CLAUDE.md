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
   - Corollary: **to remove a transaction, VOID it — never hard-delete the row.**
     Cloud sync union-merges transaction logs by id (so concurrent entries on
     another tab/device are never lost), but it has no tombstones: a hard-deleted
     row can be resurrected from a stale client. Voiding is a mutation the merge
     resolves correctly (the voided version always wins).
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

## Sync model

Cloud sync stores the whole state as one document, but `cloudStorage.ts`
**union-merges the transaction logs by id** on every load and forced refresh
(`mergeTransactionLogs`), so a concurrent entry on another tab/device is never
lost to last-write-wins. The optimistic lock (`safe_save_app_state`) still
prevents clobbering; the merge recovers the blocked writer's entries on reload.
Derived fields (cash/inventario/patrimonio) are recomputed by `reconcile()`
afterward. See the "void, never hard-delete" corollary above for the one edge
this leaves open.
