import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { MemoryStore } from "./store.js";
import { loadPostgresRows, migratePostgres, mutatePostgresRows, savePostgresRows } from "./postgresPersistence.js";
import { createPostgresPool } from "./postgresPool.js";
import { readFile } from "node:fs/promises";
import request from "supertest";
import { createApp } from "./app.js";
import { reconcileReconOperations, reconcileReferenceEvidence } from "./seedData.js";

const databaseUrl = process.env.TEST_DATABASE_URL;
const integration = databaseUrl ? describe : describe.skip;
const actor = { id: "postgres-reviewer", name: "Postgres Reviewer", role: "reviewer" as const };
let pool: Pool;
let inspectionId: string;

async function insertLegacyFinalizedInspection(target: Pool) {
  const sourceId = crypto.randomUUID(), gradeId = crypto.randomUUID(), jobId = crypto.randomUUID(), reportId = crypto.randomUUID();
  await target.query("insert into users (id, name, role) values ($1, $2, $3) on conflict (id) do nothing", [actor.id, actor.name, actor.role]);
  await target.query(`insert into inspections
    (id, vin, year, make, model, trim, mileage, exterior_color, seller_source, inspector_name, status, completeness_percentage, created_by, assigned_to_user_id, version, created_at, updated_at, finalized_at)
    values ($1, 'LEGACYHISTORY00001', 2022, 'Test', 'Legacy Vehicle', 'Base', 31992, 'Blue', 'Historical intake', 'Historical Inspector', 'FINALIZED', 100, $2, $2, 4, '2026-07-24T12:00:00Z', '2026-07-24T12:05:00Z', '2026-07-24T12:05:00Z')`, [sourceId, actor.id]);
  await target.query(`insert into condition_grades
    (id, inspection_id, suggested_grade, approved_grade, condition_grade_before_recon, estimated_grade_after_recon, reviewed_by, explanation_json, grading_version, version, created_at, reviewed_at)
    values ($1, $2, 4.7, 4.7, 4.7, 4.7, $3, '{"deductions":[]}', 'legacy-grade-v2', 2, '2026-07-24T12:02:00Z', '2026-07-24T12:03:00Z')`, [gradeId, sourceId, actor.id]);
  await target.query("insert into ai_report_jobs (id, inspection_id, status) values ($1, $2, 'completed')", [jobId, sourceId]);
  await target.query(`insert into ai_report_drafts
    (id, inspection_id, job_id, provider, prompt_version, input_summary_json, output_json, confidence, human_review_required, validation_status)
    values ($1, $2, $3, 'historicalProvider', 'legacy-report-v1', $4::jsonb, '{}', 0.9, false, 'valid')`, [crypto.randomUUID(), sourceId, jobId, JSON.stringify({ gradeId })]);
  await target.query(`insert into final_reports
    (id, inspection_id, report_body, finalized_by, finalized_at, version, approval_status, reviewer_comment, approved_by, approved_at)
    values ($1, $2, 'Historical buyer disclosure. Do not rewrite.', $3, '2026-07-24T12:05:00Z', 4, 'finalized', 'Historical approval.', $3, '2026-07-24T12:04:00Z')`, [reportId, sourceId, actor.id]);
  await target.query(`insert into report_versions
    (id, report_id, inspection_id, version, report_body, approval_status, reviewer_comment, changed_by, change_type, created_at)
    values ($1, $2, $3, 4, 'Historical buyer disclosure. Do not rewrite.', 'finalized', 'Historical approval.', $4, 'finalized', '2026-07-24T12:05:00Z')`, [crypto.randomUUID(), reportId, sourceId, actor.id]);
  return { sourceId, reportId, gradeId };
}

async function historicalBytes(target: Pool, sourceId: string) {
  const lineageColumns = ["reinspection_source_inspection_id", "reinspection_source_report_id", "reinspection_source_report_version", "reinspection_reason", "reinspection_operation_id"];
  const inspection = await target.query("select (to_jsonb(i) - $2::text[])::text bytes from inspections i where id = $1", [sourceId, lineageColumns]);
  const reports = await target.query("select to_jsonb(r)::text bytes from final_reports r where inspection_id = $1 order by id", [sourceId]);
  const versions = await target.query("select to_jsonb(v)::text bytes from report_versions v where inspection_id = $1 order by version, id", [sourceId]);
  const grades = await target.query("select to_jsonb(g)::text bytes from condition_grades g where inspection_id = $1 order by id", [sourceId]);
  return JSON.stringify({ inspection: inspection.rows, reports: reports.rows, versions: versions.rows, grades: grades.rows });
}

integration("Postgres row persistence", () => {
  beforeAll(async () => {
    pool = createPostgresPool(databaseUrl!, "inspectiq-postgres-integration");
    await pool.query("drop schema public cascade");
    await pool.query("create schema public");
    await migratePostgres(pool);
  });

  afterAll(async () => {
    await pool?.end();
  });

  it("applies numbered migrations and commits business, audit, and outbox rows together", async () => {
    const store = new MemoryStore();
    store.ensureUser(actor);
    const inspection = store.createInspection({
      vin: "1HGBH41JXMN109186",
      year: 2024,
      make: "Hyundai",
      model: "Tucson",
      trim: "SEL",
      mileage: 14250,
      exteriorColor: "Gray",
      sellerSource: "Postgres integration",
      inspectorName: "CI Inspector"
    }, actor);
    inspectionId = inspection.id;
    store.recon.createConsignorAccount({
      name: "Postgres JSON Account",
      accountType: "DEALERSHIP",
      authorizedUserIds: [actor.id]
    }, actor);
    await savePostgresRows(store, pool);

    const migrations = await pool.query<{ version: string }>("select version from schema_migrations order by version");
    expect(migrations.rows.map((row) => row.version)).toEqual([
      "0001_event_foundation.sql",
      "0002_report_versions.sql",
      "0003_analysis_metadata.sql",
      "0004_inspection_recon.sql",
      "0005_suggestion_idempotency.sql",
      "0006_normalize_ocr_suggestion_keys.sql",
      "0007_inspection_operation_idempotency.sql",
      "0008_audited_reinspections.sql"
    ]);
    const persisted = await pool.query(
      "select (select count(*) from inspections) inspections, (select count(*) from audit_events) audits, (select count(*) from domain_events) events"
    );
    expect(Number(persisted.rows[0]?.inspections)).toBe(1);
    expect(Number(persisted.rows[0]?.audits)).toBe(1);
    expect(Number(persisted.rows[0]?.events)).toBe(1);
    const account = await pool.query<{ authorized_user_ids_json: string[] }>(
      "select authorized_user_ids_json from consignor_accounts where name = $1",
      ["Postgres JSON Account"]
    );
    expect(account.rows[0]?.authorized_user_ids_json).toEqual([actor.id]);
  });

  it("rejects a stale reviewer update and rolls back its audit row", async () => {
    const first = new MemoryStore();
    const stale = new MemoryStore();
    await loadPostgresRows(first, pool);
    await loadPostgresRows(stale, pool);
    const version = first.getInspection(inspectionId).version;
    const auditCountBefore = Number((await pool.query("select count(*) count from audit_events")).rows[0]?.count);

    first.patchInspection(inspectionId, { mileage: 14310, expectedVersion: version }, actor);
    await savePostgresRows(first, pool);

    stale.patchInspection(inspectionId, { mileage: 14420, expectedVersion: version }, actor);
    await expect(savePostgresRows(stale, pool)).rejects.toMatchObject({
      status: 409,
      code: "VERSION_CONFLICT"
    });

    const record = await pool.query("select mileage, version from inspections where id = $1", [inspectionId]);
    const auditCountAfter = Number((await pool.query("select count(*) count from audit_events")).rows[0]?.count);
    expect(record.rows[0]).toMatchObject({ mileage: 14310, version: version + 1 });
    expect(auditCountAfter).toBe(auditCountBefore + 1);
  });

  it("serializes concurrent cold-start migrations and records each version once", async () => {
    const schema = `migration_race_${crypto.randomUUID().replaceAll("-", "")}`;
    await pool.query(`create schema ${schema}`);
    const starters = Array.from({ length: 3 }, () => new Pool({ connectionString: databaseUrl!, max: 1, options: `-c search_path=${schema}` }));
    try {
      await Promise.all(starters.map((starter) => migratePostgres(starter)));
      const versions = await starters[0]!.query("select version, count(*)::int count from schema_migrations group by version order by version");
      expect(versions.rows).toHaveLength(8);
      expect(versions.rows.every((row) => row.count === 1)).toBe(true);
      expect(versions.rows.at(-1)?.version).toBe("0008_audited_reinspections.sql");
    } finally {
      await Promise.all(starters.map((starter) => starter.end()));
      await pool.query(`drop schema ${schema} cascade`);
    }
  });

  it("reads committed facts after waiting for a contending writer", async () => {
    const contentionPool = new Pool({ connectionString: databaseUrl!, max: 4 });
    await migratePostgres(contentionPool);
    const bootstrapActor = { ...actor, id: "bootstrap-contention-reviewer", name: "Original Reviewer" };
    const initial = new MemoryStore();
    await loadPostgresRows(initial, contentionPool);
    initial.ensureUser(bootstrapActor);
    await savePostgresRows(initial, contentionPool);
    const blocker = await contentionPool.connect();
    let pending: Promise<{ value?: boolean; error?: unknown }> | undefined;
    let observedName: string | undefined;
    try {
      await blocker.query("begin");
      await blocker.query("select pg_advisory_xact_lock($1::bigint)", ["7803144587035695001"]);
      const contender = new MemoryStore();
      pending = mutatePostgresRows(contender, contentionPool, async () => {
        observedName = contender.users.get(bootstrapActor.id)?.name;
        contender.ensureUser({ ...bootstrapActor, name: "Corrected Reviewer" });
      }).then((value) => ({ value }), (error: unknown) => ({ error }));
      let waiting = false;
      for (let attempt = 0; attempt < 100; attempt += 1) {
        const result = await contentionPool.query("select exists(select 1 from pg_locks where locktype = 'advisory' and not granted) waiting");
        if (result.rows[0]?.waiting) { waiting = true; break; }
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      expect(waiting).toBe(true);
      await blocker.query("update users set name = $1 where id = $2", ["Committed While Waiting", bootstrapActor.id]);
      await blocker.query("commit");
      expect(await pending).toEqual({ value: true });
      expect(observedName).toBe("Committed While Waiting");
      const persisted = await contentionPool.query("select name from users where id = $1", [bootstrapActor.id]);
      expect(persisted.rows[0]?.name).toBe("Corrected Reviewer");
    } finally {
      await blocker.query("rollback");
      blocker.release();
      await pending;
      await contentionPool.end();
    }
  });

  it.each([
    { label: "hydrated", hydrate: true },
    { label: "fresh", hydrate: false }
  ])("retries $label store rows when commit fails before acknowledging the snapshot", async ({ label, hydrate }) => {
    const store = new MemoryStore();
    if (hydrate) await loadPostgresRows(store, pool);
    const commitActor = { ...actor, id: `commit-retry-${label}-reviewer`, name: "Pending Commit Reviewer" };
    store.ensureUser(commitActor);
    let commitFailed = false;
    let injectCommitFailure = false;
    const faultyPool = new Proxy(pool, {
      get(target, property) {
        if (property === "connect") return async () => {
          const client = await target.connect();
          return new Proxy(client, {
            get(connection, key) {
              if (key === "query") return async (query: unknown, ...values: unknown[]) => {
                if (query === "commit" && injectCommitFailure && !commitFailed) {
                  commitFailed = true;
                  throw Object.assign(new Error("Injected pre-commit serialization failure"), { code: "40001" });
                }
                return Reflect.apply(connection.query, connection, [query, ...values]);
              };
              const value = Reflect.get(connection, key);
              return typeof value === "function" ? value.bind(connection) : value;
            }
          });
        };
        const value = Reflect.get(target, property);
        return typeof value === "function" ? value.bind(target) : value;
      }
    });
    await migratePostgres(faultyPool);
    injectCommitFailure = true;
    await savePostgresRows(store, faultyPool);
    expect(commitFailed).toBe(true);
    const persisted = await pool.query("select name from users where id = $1", [commitActor.id]);
    expect(persisted.rows[0]?.name).toBe(commitActor.name);
  });

  it("persists one damage item and grade for each inspection-scoped operation key", async () => {
    const store = new MemoryStore();
    await loadPostgresRows(store, pool);
    const damageInput = {
      inspectionId,
      location: "right rear wheel",
      damageType: "wheel_damage" as const,
      severity: "minor" as const,
      notes: "Idempotency integration proof.",
      source: "manual" as const,
      idempotencyKey: `${inspectionId}:damage:test-operation`
    };
    const firstDamage = store.addDamage(damageInput, actor);
    const duplicateDamage = store.addDamage(damageInput, actor);
    expect(duplicateDamage.id).toBe(firstDamage.id);

    const gradeInput = {
      suggestedGrade: 4.2,
      conditionGradeBeforeRecon: 4.2,
      evidenceBlockers: [],
      explanationJson: { deductions: [] },
      gradingVersion: "idempotency-integration-v1"
    };
    const gradeKey = `${inspectionId}:grade:test-operation`;
    const firstGrade = store.saveGrade(inspectionId, gradeInput, actor, gradeKey);
    const duplicateGrade = store.saveGrade(inspectionId, gradeInput, actor, gradeKey);
    expect(duplicateGrade.id).toBe(firstGrade.id);

    await savePostgresRows(store, pool);
    const persisted = await pool.query(
      `select
         (select count(*) from damage_items where inspection_id = $1 and idempotency_key = $2) damage_count,
         (select count(*) from condition_grades where inspection_id = $1 and idempotency_key = $3) grade_count`,
      [inspectionId, damageInput.idempotencyKey, gradeKey]
    );
    expect(Number(persisted.rows[0]?.damage_count)).toBe(1);
    expect(Number(persisted.rows[0]?.grade_count)).toBe(1);
  });

  it("prevents duplicate actionable findings for the same photo", async () => {
    const store = new MemoryStore();
    await loadPostgresRows(store, pool);
    const photo = store.addPhoto({
      inspectionId,
      storageKey: `/uploads/${inspectionId}/front.jpg`,
      originalFilename: "front.jpg",
      mimeType: "image/jpeg",
      uploadedBy: actor.id,
      declaredAngle: "front"
    }, actor);
    const suggestion = store.createSuggestion({
      inspectionId,
      photoId: photo.id,
      suggestionType: "quality_warning",
      suggestedValueJson: { warning: "Image is too dark." },
      confidence: 0.72,
      explanation: "Image is too dark. Reviewer confirmation required."
    });
    await savePostgresRows(store, pool);

    await expect(pool.query(
      `insert into vision_suggestions (
        id, inspection_id, photo_id, suggestion_type, suggested_value_json, confidence,
        explanation, status, assigned_to_role, due_at, created_at, version
      )
      select
        $1, inspection_id, photo_id, suggestion_type, suggested_value_json, confidence,
        explanation, status, assigned_to_role, due_at, created_at, version
      from vision_suggestions where id = $2`,
      ["duplicate-quality-warning", suggestion.id]
    )).rejects.toMatchObject({ code: "23505" });

    const odometerSuggestion = store.createSuggestion({
      inspectionId,
      photoId: photo.id,
      suggestionType: "extracted_text",
      suggestedValueJson: { odometer: "079037" },
      confidence: 0.91,
      explanation: "Detected odometer reading. Reviewer confirmation required."
    });
    await savePostgresRows(store, pool);

    await expect(pool.query(
      `insert into vision_suggestions (
        id, inspection_id, photo_id, suggestion_type, suggested_value_json, confidence,
        explanation, status, assigned_to_role, due_at, created_at, version
      )
      select
        $1, inspection_id, photo_id, suggestion_type, '{"odometer":"79037"}'::jsonb, confidence,
        explanation, status, assigned_to_role, due_at, created_at, version
      from vision_suggestions where id = $2`,
      ["duplicate-odometer-reading", odometerSuggestion.id]
    )).rejects.toMatchObject({ code: "23505" });
  });

  it("upgrades persisted legacy reports additively and preserves history through reinspection and reload", async () => {
    const schemaName = `reinspection_upgrade_${crypto.randomUUID().replaceAll("-", "")}`;
    await pool.query(`create schema ${schemaName}`);
    const legacyPool = new Pool({ connectionString: databaseUrl!, options: `-c search_path=${schemaName},public` });
    try {
      const schemaSql = await readFile(new URL("./db/schema.sql", import.meta.url), "utf8");
      expect(schemaSql).toContain("-- Reinspection lineage:");
      const priorSchema = schemaSql.split("-- Reinspection lineage:")[0];
      expect(priorSchema).not.toContain("reinspection_source_inspection_id");
      const client = await legacyPool.connect();
      try {
        await client.query("begin");
        await client.query(priorSchema);
        for (const name of ["0001_event_foundation.sql", "0002_report_versions.sql", "0003_analysis_metadata.sql", "0004_inspection_recon.sql", "0005_suggestion_idempotency.sql", "0006_normalize_ocr_suggestion_keys.sql", "0007_inspection_operation_idempotency.sql"]) {
          await client.query(await readFile(new URL(`./db/migrations/${name}`, import.meta.url), "utf8"));
          await client.query("insert into schema_migrations (version) values ($1)", [name]);
        }
        await client.query("commit");
      } catch (error) {
        await client.query("rollback");
        throw error;
      } finally {
        client.release();
      }
      const legacy = await insertLegacyFinalizedInspection(legacyPool);
      const before = await historicalBytes(legacyPool, legacy.sourceId);
      await migratePostgres(legacyPool);
      expect(await historicalBytes(legacyPool, legacy.sourceId)).toBe(before);
      const store = new MemoryStore();
      await loadPostgresRows(store, legacyPool);
      reconcileReferenceEvidence(store);
      expect(reconcileReconOperations(store)).toBe(false);
      await savePostgresRows(store, legacyPool);
      expect(await historicalBytes(legacyPool, legacy.sourceId)).toBe(before);
      expect(store.bundle(legacy.sourceId).requiresReinspection).toBe(true);
      expect(store.buyerVisibleReady(legacy.sourceId)).toBe(false);
      const intent = { operationId: crypto.randomUUID(), reason: "A new evidence policy requires an independent audited inspection.", expectedReportVersion: 4 };
      const created = store.createReinspection(legacy.sourceId, intent, actor).inspection;
      await savePostgresRows(store, legacyPool);
      const reloaded = new MemoryStore();
      await loadPostgresRows(reloaded, legacyPool);
      reconcileReferenceEvidence(reloaded);
      expect(reloaded.getInspection(created.id)).toEqual(created);
      expect(reloaded.bundle(created.id)).toMatchObject({ photos: [], damageItems: [], conditionGrade: null, finalReport: null, requiresReinspection: false });
      expect(reloaded.createReinspection(legacy.sourceId, intent, actor)).toEqual({ inspection: created, reused: true });
      const lineageCount = reloaded.auditForInspection(legacy.sourceId).length;
      await savePostgresRows(reloaded, legacyPool);
      expect((await legacyPool.query("select count(*)::int count from inspections where reinspection_source_inspection_id = $1", [legacy.sourceId])).rows[0]?.count).toBe(1);
      expect((await legacyPool.query("select count(*)::int count from audit_events where inspection_id = $1", [legacy.sourceId])).rows[0]?.count).toBe(lineageCount);
      expect(reconcileReconOperations(reloaded)).toBe(false);
      expect(reloaded.recon.intakeForInspection(created.id)).toBeNull();
      expect(reloaded.recon.workOrdersForInspection(created.id)).toEqual([]);
      await savePostgresRows(reloaded, legacyPool);
      expect(await historicalBytes(legacyPool, legacy.sourceId)).toBe(before);
    } finally {
      await legacyPool.end();
      await pool.query(`drop schema ${schemaName} cascade`);
    }
  }, 20_000);

  it.each([{ matching: true }, { matching: false }])("handles concurrent reinspection retries without overwriting history (matching=$matching)", async ({ matching }) => {
    const legacy = await insertLegacyFinalizedInspection(pool);
    const before = await historicalBytes(pool, legacy.sourceId);
    const intent = { operationId: crypto.randomUUID(), reason: "Create a fresh inspected record without changing historical publication.", expectedReportVersion: 4 };
    let ready!: () => void;
    const barrier = new Promise<void>((resolve) => { ready = resolve; });
    let loads = 0;
    const apps = [new MemoryStore(), new MemoryStore()];
    await Promise.all(apps.map((store) => loadPostgresRows(store, pool)));
    const servers = apps.map((store) => createApp(store, {
      beforeRequest: async () => {
        await loadPostgresRows(store, pool);
        loads += 1;
        if (loads <= 2) {
          if (loads === 2) ready();
          await barrier;
        }
      },
      afterMutation: async () => { await savePostgresRows(store, pool); }
    }));
    const headers = { "x-actor-id": actor.id, "x-actor-name": actor.name, "x-actor-role": actor.role };
    const responses = await Promise.all(servers.map((app, index) => request(app)
      .post(`/api/inspections/${legacy.sourceId}/reinspections`)
      .set(headers)
      .send({ ...intent, reason: matching || index === 0 ? intent.reason : "A changed reason must not adopt another request's replacement." })
    ));
    expect(responses.map((response) => response.status).sort()).toEqual(matching ? [200, 201] : [201, 409]);
    if (matching) expect(responses[0].body.data.inspection.id).toBe(responses[1].body.data.inspection.id);
    const persisted = await pool.query("select id, reinspection_reason from inspections where reinspection_source_inspection_id = $1", [legacy.sourceId]);
    expect(persisted.rows).toHaveLength(1);
    const winner = responses.find((response) => response.status === 201)!;
    expect(persisted.rows[0]?.reinspection_reason).toBe(winner.body.data.inspection.reinspectionReason);
    expect(await historicalBytes(pool, legacy.sourceId)).toBe(before);
    expect((await pool.query("select count(*)::int count from audit_events where inspection_id = $1 and event_type = 'inspection.reinspection_requested'", [legacy.sourceId])).rows[0]?.count).toBe(1);
  });
});
