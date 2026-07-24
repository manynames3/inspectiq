import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { MemoryStore } from "./store.js";
import { loadPostgresRows, migratePostgres, savePostgresRows } from "./postgresPersistence.js";
import { createPostgresPool } from "./postgresPool.js";

const databaseUrl = process.env.TEST_DATABASE_URL;
const integration = databaseUrl ? describe : describe.skip;
const actor = { id: "postgres-reviewer", name: "Postgres Reviewer", role: "reviewer" as const };
let pool: Pool;
let inspectionId: string;

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
      "0005_suggestion_idempotency.sql"
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
  });
});
