import {loadJson, rebaseDataUrl} from "../../data/loadJson";
import {
  caseCatalogEntrySchema,
  caseCatalogSchema,
  type CaseCatalogEntry,
  type CaseCatalogV1
} from "./catalogSchema";
import {
  caseBundleSchema,
  type CaseBundleV2
} from "./caseBundle";
import type {ZodType} from "zod";

const CATALOG_URL = "/data/integration-cases/catalog.json";

function parseFromUrl<T>(
  schema: ZodType<T>,
  raw: unknown,
  url: string
): T {
  const result = schema.safeParse(raw);
  if (result.success) return result.data;

  const reason = result.error.issues
    .map(issue => {
      const path = issue.path.length > 0 ? issue.path.join(".") : "root";
      return `${path}: ${issue.message}`;
    })
    .join("; ");
  throw new Error(`校验 ${url} 的数据结构失败：${reason}`, {
    cause: result.error
  });
}

export async function loadCaseCatalog(
  dataBase = "/data",
  signal?: AbortSignal
): Promise<CaseCatalogV1> {
  const url = rebaseDataUrl(CATALOG_URL, dataBase);
  const raw = await loadJson<unknown>(url, signal);
  return parseFromUrl(caseCatalogSchema, raw, url);
}

export async function loadBuiltInCase(
  entry: CaseCatalogEntry,
  dataBase = "/data",
  signal?: AbortSignal
): Promise<CaseBundleV2> {
  const parsedEntry = caseCatalogEntrySchema.parse(entry);
  const url = rebaseDataUrl(parsedEntry.bundleUrl, dataBase);
  const raw = await loadJson<unknown>(url, signal);
  return parseFromUrl(caseBundleSchema, raw, url);
}
