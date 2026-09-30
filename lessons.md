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

## 2026-06→09 — The sync-clobber saga (inventory) and the healing ladder

### Symptom family
Five live incidents (Jun-30, Jul-07, Jul-31, Aug-22/30, Sep-17) with one
fingerprint: a physical count or purchase whose TRANSACTION survived in the
log while its ARRAY effect was reverted — `Diferencia` opens by exactly the
booked amount, positive when phantom stock remains, negative when COGS is
booked twice or an effect is missing.

### Root cause
Cloud sync union-merges the transaction LOG by id, but `inventory`/`assets`
ride the whole-document blob **last-write-wins**. Any stale writer — a
background Safari tab suspended for weeks, a device running an old cached
build, a save racing a rehydrate — can revert array mutations while the
union-merge faithfully preserves the transactions that produced them. Cash
was immune (derived from the log since v1.1.4); inventory was not.

### The defense ladder (each layer caught what the previous missed)
1. **v1.1.11 honest lock** — the write baseline travels INSIDE the snapshot
   (`state._baseCloudTs`), never in a module variable updated on network
   read; plus a write mutex. Kills the "fresh timestamp, stale state" race.
2. **v1.1.12 shadow audit** — on every save, derive each item's expected
   stock from the ledger (anchor = latest physical count) and alarm on
   divergence. Turned silent corruption into same-minute detection.
3. **v1.1.13 realtime ping** — broadcast "saved at <ts>" so other windows
   pull instead of aging into stale writers.
4. **v1.1.15 authoritative heal** — at rehydrate (the only door a clobber
   enters through), rewrite drifted stock to the ledger-derived value.
   Runs at rehydrate ONLY: several handlers mutate the array before their
   `addTransaction` lands, so an in-flow derivation would revert real work.

### Lesson: self-healing quantities ≠ self-healing values (Sep-17, Sep-30)
The heal collapses a healed item's batches to ONE batch at the item's
**current average cost**. Stock heals perfectly; VALUE inherits whatever the
average was at that instant. Two bites:
- Sep-17: ~₡600 residue across four small heals (absorbed via an honest
  reconciliation entry).
- Sep-30: a typo purchase (100 popsicle sticks at ₡95,000 instead of ₡950)
  poisoned the item's average to ₡477.50/u; the user voided it correctly,
  but a racing rehydrate healed stock at that poisoned average → ₡47,250 of
  phantom inventory value, repaired manually.

**Pending fix:** when the heal REDUCES stock it must drain batches LIFO
(newest first) instead of collapsing at average — the drift it repairs is
always "recent mutations replayed wrong", so removing the newest layers
undoes exactly the suspect value and preserves historical costs. Adding
found stock at average remains fine.

### Accounting lessons (operational, not code)
- **A negative derived cash balance is the ledger being honest**: outflows
  recorded against an account that physically never held them. Find the
  mis-entered transaction; do not "fix" the balance.
- **Record pending sales BEFORE a cash audit.** An audit's surplus already
  contains any unrecorded sale's money; retro-dating the sale afterwards
  double-counts the income (Aug-02: arqueo surplus 6,021 included an
  unrecorded ₡4,000 sale). If it happens, reduce the audit's booked diff.
- **Every repair goes through the front door**: correct via transactions or
  targeted, backed-up, verified edits that keep `Diferencia` at its known
  residual — never by plugging the number. Cloud-side backups live as
  `backup_*` rows in `app_state`.
- The known residual drifts a few céntimos with FIFO-vs-average rounding;
  track its current value (−₡33.71 as of 2026-09-30) and alarm only beyond
  tolerance.

### Meta-lesson
Every balance the app displays must be derivable from the immutable log, and
anything merely *stored* will eventually lie. We got there in layers: detect
loudly, then heal automatically, then make the healing itself value-exact.
