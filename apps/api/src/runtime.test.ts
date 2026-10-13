import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { shouldPersistInitialStore } from "./runtime.js";

const bootstrap = vi.hoisted(() => ({
  app: {},
  pool: { end: vi.fn() },
  createApp: vi.fn(),
  createPostgresPool: vi.fn(),
  resolveDatabaseUrl: vi.fn(),
  loadPostgresRows: vi.fn(),
  savePostgresRows: vi.fn(),
  reconcileReferenceEvidence: vi.fn(),
  reconcileReconOperations: vi.fn()
}));

vi.mock("./app.js", () => ({ createApp: bootstrap.createApp }));
vi.mock("./postgresPool.js", () => ({ createPostgresPool: bootstrap.createPostgresPool }));
vi.mock("./runtimeConfig.js", () => ({ resolveDatabaseUrl: bootstrap.resolveDatabaseUrl }));
vi.mock("./postgresPersistence.js", () => ({
  loadPostgresRows: bootstrap.loadPostgresRows,
  savePostgresRows: bootstrap.savePostgresRows
}));
vi.mock("./seedData.js", () => ({
  reconcileReferenceEvidence: bootstrap.reconcileReferenceEvidence,
  reconcileReconOperations: bootstrap.reconcileReconOperations
}));

describe("runtime persistence bootstrap", () => {
  it("persists additive bootstrap reconciliation during a loaded Postgres cold start", () => {
    expect(shouldPersistInitialStore("postgres", true, true)).toBe(true);
  });

  it("initializes an empty Postgres store", () => {
    expect(shouldPersistInitialStore("postgres", false, false)).toBe(true);
  });

  it("persists local reference reconciliation", () => {
    expect(shouldPersistInitialStore("file", true, true)).toBe(true);
  });
});

describe("runtime initialization recovery", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.resetAllMocks();
    vi.stubEnv("PERSISTENCE_MODE", "postgres");
    bootstrap.resolveDatabaseUrl.mockResolvedValue("postgres://local-test/inspectiq");
    bootstrap.createPostgresPool.mockReturnValue(bootstrap.pool);
    bootstrap.pool.end.mockResolvedValue(undefined);
    bootstrap.loadPostgresRows.mockResolvedValue(true);
    bootstrap.reconcileReferenceEvidence.mockReturnValue(true);
    bootstrap.reconcileReconOperations.mockReturnValue(false);
    bootstrap.createApp.mockReturnValue(bootstrap.app);
    bootstrap.savePostgresRows.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("shares initialization across concurrent callers and caches a successful runtime", async () => {
    let resolveDatabase!: (url: string) => void;
    bootstrap.resolveDatabaseUrl.mockReturnValueOnce(new Promise<string>((resolve) => {
      resolveDatabase = resolve;
    }));
    const { createRuntime } = await import("./runtime.js");
    const first = createRuntime();
    const second = createRuntime();
    expect(bootstrap.resolveDatabaseUrl).toHaveBeenCalledTimes(1);
    expect(bootstrap.createPostgresPool).not.toHaveBeenCalled();

    resolveDatabase("postgres://local-test/inspectiq");
    const [firstRuntime, secondRuntime] = await Promise.all([first, second]);
    expect(firstRuntime).toBe(secondRuntime);
    expect(await createRuntime()).toBe(firstRuntime);
    expect(bootstrap.createPostgresPool).toHaveBeenCalledTimes(1);
    expect(bootstrap.savePostgresRows).toHaveBeenCalledTimes(1);
    expect(bootstrap.pool.end).not.toHaveBeenCalled();
  });

  it("closes a failed bootstrap pool and retries once for concurrent recovery callers", async () => {
    const serializationFailure = Object.assign(new Error("could not serialize access due to concurrent update"), { code: "40001" });
    const failedPool = { end: vi.fn().mockResolvedValue(undefined) };
    bootstrap.createPostgresPool.mockReturnValueOnce(failedPool);
    bootstrap.savePostgresRows.mockRejectedValueOnce(serializationFailure);
    const { createRuntime } = await import("./runtime.js");
    const failures = await Promise.allSettled([createRuntime(), createRuntime()]);
    expect(failures).toEqual([
      { status: "rejected", reason: serializationFailure },
      { status: "rejected", reason: serializationFailure }
    ]);
    expect(bootstrap.createPostgresPool).toHaveBeenCalledTimes(1);

    const [firstRuntime, secondRuntime] = await Promise.all([createRuntime(), createRuntime()]);
    expect(firstRuntime).toBe(secondRuntime);
    expect(firstRuntime).toEqual({ app: bootstrap.app, pool: bootstrap.pool });
    expect(await createRuntime()).toBe(firstRuntime);
    expect(bootstrap.createPostgresPool).toHaveBeenCalledTimes(2);
    expect(bootstrap.savePostgresRows).toHaveBeenCalledTimes(2);
    expect(failedPool.end).toHaveBeenCalledTimes(1);
    expect(bootstrap.pool.end).not.toHaveBeenCalled();
  });

  it("preserves the initialization error when failed-pool cleanup also fails", async () => {
    const initializationFailure = new Error("database bootstrap failed");
    bootstrap.loadPostgresRows.mockRejectedValueOnce(initializationFailure);
    bootstrap.pool.end.mockRejectedValueOnce(new Error("pool cleanup failed"));
    const { createRuntime } = await import("./runtime.js");

    await expect(createRuntime()).rejects.toBe(initializationFailure);
    await expect(createRuntime()).resolves.toEqual({ app: bootstrap.app, pool: bootstrap.pool });
    expect(bootstrap.pool.end).toHaveBeenCalledTimes(1);
    expect(bootstrap.createPostgresPool).toHaveBeenCalledTimes(2);
  });
});
