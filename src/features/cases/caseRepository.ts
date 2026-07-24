import {openDB, type DBSchema} from "idb";
import {
  caseBundleSchema,
  type CaseBundleV2
} from "./caseBundle";

const DATABASE_NAME = "wrj-algorithm-cases";
const DATABASE_VERSION = 1;
const BUNDLES_STORE = "bundles";
const ENTRIES_STORE = "entries";

export interface ImportedCaseEntry {
  caseId: string;
  planId: string;
  displayName: string;
  importedAt: string;
  sourceName: string;
  sourceRun: string;
  metrics: CaseBundleV2["metrics"];
  warnings: string[];
}

export interface CaseDatabaseAdapter {
  get(key: string): Promise<CaseBundleV2 | undefined>;
  list(): Promise<ImportedCaseEntry[]>;
  put(
    key: string,
    bundle: CaseBundleV2,
    entry: ImportedCaseEntry
  ): Promise<void>;
  delete(key: string): Promise<void>;
  close(): Promise<void>;
}

export type OpenCaseDatabaseAdapter = () => Promise<CaseDatabaseAdapter>;

export interface CaseRepository {
  persistent: boolean;
  list(): Promise<ImportedCaseEntry[]>;
  get(
    caseId: string,
    planId: string
  ): Promise<CaseBundleV2 | undefined>;
  save(
    bundle: CaseBundleV2,
    options?: {overwrite?: boolean}
  ): Promise<void>;
  remove(caseId: string, planId: string): Promise<void>;
}

interface CaseDatabaseSchema extends DBSchema {
  bundles: {
    key: string;
    value: CaseBundleV2;
  };
  entries: {
    key: string;
    value: ImportedCaseEntry;
  };
}

function caseKey(caseId: string, planId: string): string {
  return `${caseId}:${planId}`;
}

function compareEntries(
  left: ImportedCaseEntry,
  right: ImportedCaseEntry
): number {
  return left.caseId.localeCompare(right.caseId) ||
    left.planId.localeCompare(right.planId);
}

function toImportedCaseEntry(bundle: CaseBundleV2): ImportedCaseEntry {
  return {
    caseId: bundle.case.caseId,
    planId: bundle.case.planId,
    displayName: bundle.case.displayName,
    importedAt: bundle.provenance.importedAt,
    sourceName: bundle.provenance.sourceName,
    sourceRun: bundle.provenance.sourceRun,
    metrics: {...bundle.metrics},
    warnings: [...bundle.validation.warnings]
  };
}

function repositoryFromAdapter(
  adapter: CaseDatabaseAdapter,
  persistent: boolean
): CaseRepository {
  return {
    persistent,

    async list(): Promise<ImportedCaseEntry[]> {
      const entries = await adapter.list();
      return [...entries].sort(compareEntries);
    },

    get(
      caseId: string,
      planId: string
    ): Promise<CaseBundleV2 | undefined> {
      return adapter.get(caseKey(caseId, planId));
    },

    async save(
      bundle: CaseBundleV2,
      options: {overwrite?: boolean} = {}
    ): Promise<void> {
      const validatedBundle = caseBundleSchema.parse(bundle);
      const key = caseKey(
        validatedBundle.case.caseId,
        validatedBundle.case.planId
      );
      const existing = await adapter.get(key);
      if (existing !== undefined && options.overwrite !== true) {
        throw new Error(
          `算例 ${validatedBundle.case.caseId} / ${validatedBundle.case.planId} 已存在`
        );
      }
      await adapter.put(
        key,
        validatedBundle,
        toImportedCaseEntry(validatedBundle)
      );
    },

    remove(caseId: string, planId: string): Promise<void> {
      return adapter.delete(caseKey(caseId, planId));
    }
  };
}

export function createCaseRepository(
  adapter: CaseDatabaseAdapter
): CaseRepository {
  return repositoryFromAdapter(adapter, true);
}

export async function openBrowserCaseDatabaseAdapter():
Promise<CaseDatabaseAdapter> {
  const database = await openDB<CaseDatabaseSchema>(
    DATABASE_NAME,
    DATABASE_VERSION,
    {
      upgrade(upgradeDatabase) {
        if (!upgradeDatabase.objectStoreNames.contains(BUNDLES_STORE)) {
          upgradeDatabase.createObjectStore(BUNDLES_STORE);
        }
        if (!upgradeDatabase.objectStoreNames.contains(ENTRIES_STORE)) {
          upgradeDatabase.createObjectStore(ENTRIES_STORE);
        }
      }
    }
  );

  return {
    async get(key): Promise<CaseBundleV2 | undefined> {
      return database.get(BUNDLES_STORE, key);
    },

    async list(): Promise<ImportedCaseEntry[]> {
      return database.getAll(ENTRIES_STORE);
    },

    async put(key, bundle, entry): Promise<void> {
      const transaction = database.transaction(
        [BUNDLES_STORE, ENTRIES_STORE],
        "readwrite"
      );
      await Promise.all([
        transaction.objectStore(BUNDLES_STORE).put(bundle, key),
        transaction.objectStore(ENTRIES_STORE).put(entry, key),
        transaction.done
      ]);
    },

    async delete(key): Promise<void> {
      const transaction = database.transaction(
        [BUNDLES_STORE, ENTRIES_STORE],
        "readwrite"
      );
      await Promise.all([
        transaction.objectStore(BUNDLES_STORE).delete(key),
        transaction.objectStore(ENTRIES_STORE).delete(key),
        transaction.done
      ]);
    },

    async close(): Promise<void> {
      database.close();
    }
  };
}

function createMemoryAdapter(): CaseDatabaseAdapter {
  const bundles = new Map<string, CaseBundleV2>();
  const entries = new Map<string, ImportedCaseEntry>();

  return {
    async get(key): Promise<CaseBundleV2 | undefined> {
      return bundles.get(key);
    },
    async list(): Promise<ImportedCaseEntry[]> {
      return [...entries.values()];
    },
    async put(key, bundle, entry): Promise<void> {
      bundles.set(key, bundle);
      entries.set(key, entry);
    },
    async delete(key): Promise<void> {
      bundles.delete(key);
      entries.delete(key);
    },
    async close(): Promise<void> {
      // The session memory adapter owns no external resources.
    }
  };
}

let sessionMemoryAdapter: CaseDatabaseAdapter | undefined;

export async function openCaseRepository(
  openAdapter: OpenCaseDatabaseAdapter =
    openBrowserCaseDatabaseAdapter
): Promise<CaseRepository> {
  try {
    return createCaseRepository(await openAdapter());
  } catch {
    sessionMemoryAdapter ??= createMemoryAdapter();
    return repositoryFromAdapter(sessionMemoryAdapter, false);
  }
}
