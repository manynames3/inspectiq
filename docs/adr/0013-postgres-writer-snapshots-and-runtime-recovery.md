# ADR 0013: Postgres Writer Snapshots and Runtime Recovery

Date: 2026-10-13

Status: Accepted in the active branch; not yet applied to the AWS API.

## Context

The post-deployment live smoke reproduced intermittent API/preflight 500 responses. Existing Lambda logs identified `40001: could not serialize access due to concurrent update` in bootstrap persistence. Writers took a repeatable-read snapshot while waiting for an advisory lock, so a prior writer's committed row version was invisible. Exhausted startup retries also left a rejected runtime promise cached.

Real isolated Postgres regressions reproduced that conflict and a second failure: remembering a changed-row snapshot before commit could make a commit retry silently omit rolled-back writes.

## Decision

Use **Read Committed for the serialized write transaction**, retaining the existing transaction-scoped advisory lock before business reads/writes. Queries after the lock wait see the prior writer's committed facts. All application writers must cooperate with this lock; existing conditional version checks still reject stale reviewer updates. Standalone store hydration still uses separate statement-level reads; this change does not introduce a consistent read snapshot or replace the DB-first repository gate.

Remember a persisted snapshot only after commit succeeds. Preserve rollback and discard a connection whose rollback fails. On failed runtime initialization, close only its allocated pool, clear the cached failure, and let the next invocation retry single-flight initialization. Keep the original error if cleanup also fails; never return a partially initialized runtime.

Schema/bootstrap migrations use their own transaction-scoped advisory lock and Read Committed transaction. The schema, pending migration SQL, and ledger inserts commit together; a pool is marked migrated only after commit. Concurrent API/worker cold starts therefore do not race the additive reinspection migration. This does not grandfather prior report approval.

The live smoke includes HTTP failure status and origin/path, excluding signed URL query strings.

## Alternatives and Consequences

- More retries do not fix the stale snapshot or poisoned runtime cache.
- A session advisory lock before `BEGIN` avoids the snapshot race but is incompatible with transaction pooling; keep the transaction-scoped lock instead.
- This changes serialized writer isolation, not the whole application read model. Optimistic version guards remain. Direct SQL writers that bypass the application lock are outside this serialized bridge's guarantees.
- The global lock remains a throughput bottleneck; aggregate-specific repositories and narrower transactions remain a production gate.
- No schema migration, legacy report approval, auth exception, model fallback, or new service is introduced. AWS promotion remains subject to the [legacy-record release gate](../release-status.md).

## Evidence and Sources

- [Persistence implementation](../../apps/api/src/postgresPersistence.ts), [real Postgres regressions](../../apps/api/src/postgresPersistence.integration.test.ts), [runtime recovery](../../apps/api/src/runtime.ts), and [runtime tests](../../apps/api/src/runtime.test.ts).
- [PostgreSQL isolation documentation](https://www.postgresql.org/docs/current/transaction-iso.html) explains statement snapshots, repeatable-read conflicts, and retries.
- [PgBouncer pooling feature map](https://www.pgbouncer.org/features.html) excludes session-level advisory locks from transaction pooling.
- New persistence regressions failed before the fix with the actual serialization error and missing committed user row, then passed against a disposable Postgres 16 database. Additional tests cover fresh/hydrated commit rollback and three concurrent migration starts. This is local regression proof, not successful production burst verification.
