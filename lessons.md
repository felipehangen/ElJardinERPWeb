# Lessons Learned — El Jardín ERP

## 2026-06-25 — Recurring "Diferencia por Conciliar" drift (cash)

### Symptom
`Diferencia por Conciliar` kept leaving ₡0 "way too much", and the shortfall
always landed on **cash** (banco / caja_chica), never on inventory or assets.
It was repeatedly papered over with manual plug correctivos.

### Root cause (structural, not bad luck)
`banco` and `caja_chica` were the **only** balances stored as mutable running
totals that `reconcile()` never recomputed. Inventory, fixed assets, and
equity (`inventario`, `activo_fijo`, `patrimonio`) are all **derived** from
their source data on every reconcile, so they self-heal. Cash had no source of
truth to recompute from at runtime, so any out-of-band corruption became
**permanent** and silently propagated into `patrimonio`:

- last-write-wins on the whole-state blob in cloud sync,
- two tabs / two devices interleaving,
- a conflict-aborted write,
- an offline edit,
- a **backup restore** (the Jun-2026 data wipe + restore reinstated stale
  cash balances that no longer matched the transaction list).

The developers already knew the symptom: the v5→v7 migration literally
recalculates `trueCash`/`trueBank` from history "due to tab-sync race
conditions" — but only **once per schema-version bump**, not continuously. So
the cure existed in the code but stopped running, and drift resumed.

### The fix (v1.1.4)
Make cash a **derived** field, exactly like inventory:

- `deriveCashFromLedger(transactions)` in `useStore.ts` — chronological replay
  of the transaction log. Cash audits with `realVal` are **absolute SETs**
  (re-anchor to the physical count); legacy audits apply the recorded delta;
  VOIDED originals and their `[ANULACIÓN]` contras are skipped.
- `reconcile()` now derives `banco`/`caja_chica` from the log.
- `onRehydrateStorage → reconcile()` — re-derive on **every load**, so any
  drift is corrected automatically instead of accumulating. *This is the fix
  for the recurrence.*
- Purchase/expense handlers reordered so `addTransaction` runs **before**
  `reconcile()` (the log must be complete before cash is derived from it).
- Tests: `web/src/__tests__/useStore.reconcileCash.test.ts` (incl. a
  stale-tab-overwrite regression test).

### Data cleanup done alongside the deploy
Physical count: caja ₡113,235, banco ₡315,834. We:
1. recorded two cash audits to the real counts → booked **₡20,415** of real
   cash shortfall (caja −18,115, banco −2,300);
2. deleted the three phantom-COGS plug correctivos (they had inflated COGS by
   ~₡47k and masked the drift);
3. recorded one honest reconciliation loss of **₡29,045.31** for the
   accumulated shrinkage from the restore.

Result: `Diferencia` = ₡0 for real reasons, COGS no longer distorted, and
~₡49k of genuine losses now visible instead of hidden.

> Footnote: the reconciliation entry was first sized at ₡31,045.31 using the
> *stored* `accounts.inventario` (₡280,691.05) — which was itself stale. On
> first load of v1.1.4, `reconcile()` recomputed inventory from the array
> (₡282,691.05, ₡2,000 higher) and the gap briefly reopened to ₡2,000. Lesson:
> **size correctivos against values derived from the sources (the inventory
> array, the ledger), never against the stored derived fields** — the exact
> trap this fix was meant to eliminate.

### Operating rules going forward
- **The transaction ledger is the single source of truth.** Every balance is
  derived from it. Never trust stored running balances.
- **Never patch `accounts` with direct SQL.** Cash is recomputed from the log
  on load, so a manual balance patch won't stick. Correct a balance only via a
  transaction — a cash audit (records `realVal`, which now anchors
  permanently) or a correctivo.
- **A non-zero `Diferencia` is an alarm, not a number to plug.** It means
  something bypassed the transaction flow (a restore, a sync race). Investigate
  the cause; don't fabricate COGS to hide it.
- **Backup restores are the one operation that can reintroduce drift** — they
  reinstate a whole-state snapshot, not a transaction. After any restore, let
  the app reconcile and verify `Diferencia` = ₡0.
- A reconciliation/shrinkage loss belongs in "Diferencias Inv." / otros gastos
  with a clear description — not silently inside cost of goods sold.

### Still worth doing (not yet done)
- Make cloud sync **union-merge the transaction array by id** instead of
  last-write-wins on the whole blob, so concurrent edits never drop records.
