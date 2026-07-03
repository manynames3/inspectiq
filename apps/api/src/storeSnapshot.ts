import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { MemoryStore } from "./store.js";

const storeMapNames = [
  "users",
  "inspections",
  "photos",
  "analyses",
  "suggestions",
  "damageItems",
  "conditionGrades",
  "reportJobs",
  "reportDrafts",
  "finalReports",
  "auditEvents"
] as const;

type StoreMapName = typeof storeMapNames[number];
type IdentifiedRecord = { id: string };
type StoreSnapshot = Partial<Record<StoreMapName, IdentifiedRecord[]>>;

function defaultStoreFile(): string {
  return process.env.INSPECTIQ_STORE_FILE ?? path.resolve(process.cwd(), "../../.inspectiq/local-store.json");
}

function storeMap(store: MemoryStore, name: StoreMapName): Map<string, IdentifiedRecord> {
  return store[name] as Map<string, IdentifiedRecord>;
}

export async function loadStoreSnapshot(store: MemoryStore, filePath = defaultStoreFile()): Promise<boolean> {
  try {
    const raw = await readFile(filePath, "utf8");
    const snapshot = JSON.parse(raw) as StoreSnapshot;
    store.reset();
    for (const name of storeMapNames) {
      const map = storeMap(store, name);
      for (const record of snapshot[name] ?? []) {
        if (record && typeof record.id === "string") {
          map.set(record.id, record);
        }
      }
    }
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

export async function saveStoreSnapshot(store: MemoryStore, filePath = defaultStoreFile()): Promise<void> {
  const snapshot = Object.fromEntries(
    storeMapNames.map((name) => [name, [...storeMap(store, name).values()]])
  ) as StoreSnapshot;
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(snapshot, null, 2), "utf8");
}
