import {caseBundleSchema} from "../cases/caseBundle";
import {ZodError} from "zod";
import {dynamicEventBatchSchema} from "./dynamicEventSchema";
import {decisionTraceV1Schema} from "./decisionTraceSchema";
import {
  type DynamicSceneCatalog,
  type DynamicSceneCatalogEntry,
  type LoadedDynamicScenePackage,
  parseDynamicSceneCatalog,
  sceneConfigSchema,
  sceneProvenanceSchema
} from "./dynamicSceneSchema";
import {taskGeometryDiffV1Schema} from "./taskGeometryDiffSchema";
import {
  failureReportSchema,
  missionViewV1Schema
} from "./missionViewSchema";

export type DynamicFetch = (
  input: RequestInfo | URL,
  init?: RequestInit
) => Promise<Response>;

const decoder = new TextDecoder("utf-8", {fatal: true});

function joinUrl(base: string, relative: string): string {
  return `${base.replace(/\/$/u, "")}/${relative.replace(/^\//u, "")}`;
}

function assertSafeRelativePath(path: string, label: string): void {
  const normalized = path.replaceAll("\\", "/");
  if (
    normalized.startsWith("/") ||
    normalized.split("/").some(part => part === "" || part === "." || part === "..")
  ) {
    throw new Error(`${label} contains an unsafe path: ${path}`);
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function fetchBytes(
  url: string,
  fetcher: DynamicFetch,
  signal?: AbortSignal
): Promise<Uint8Array> {
  const response = await fetcher(url, {signal});
  if (!response.ok) {
    throw new Error(
      `${url.slice(url.lastIndexOf("/") + 1)} request failed: ` +
      `${response.status} ${response.statusText}`.trim()
    );
  }
  return new Uint8Array(await response.arrayBuffer());
}

function parseUtf8Json(bytes: Uint8Array, filename: string): unknown {
  try {
    return JSON.parse(decoder.decode(bytes));
  } catch (error) {
    throw new Error(`${filename}: invalid UTF-8 JSON: ${errorMessage(error)}`);
  }
}

function parseSchema<T>(
  filename: string,
  value: unknown,
  parser: {safeParse(value: unknown):
    | {success: true; data: T}
    | {success: false; error: {issues: Array<{
      path: Array<string | number>;
      message: string;
    }>}}
  }
): T {
  const result = parser.safeParse(value);
  if (result.success) return result.data;
  const issue = result.error.issues[0];
  const path = issue?.path.length
    ? issue.path.join(".")
    : "<root>";
  throw new Error(`${filename}: ${path}: ${issue?.message ?? "validation failed"}`);
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digestInput = new Uint8Array(bytes.byteLength);
  digestInput.set(bytes);
  const digest = await crypto.subtle.digest("SHA-256", digestInput);
  return [...new Uint8Array(digest)]
    .map(value => value.toString(16).padStart(2, "0"))
    .join("");
}

async function verifyHash(
  name: string,
  bytes: Uint8Array,
  expected: string | undefined
): Promise<void> {
  if (expected === undefined) {
    throw new Error(`${name} is missing from packagedSha256`);
  }
  const actual = await sha256Hex(bytes);
  if (actual.toLowerCase() !== expected.toLowerCase()) {
    throw new Error(`${name} hash mismatch: expected ${expected}, got ${actual}`);
  }
}

async function fetchJson(
  url: string,
  filename: string,
  fetcher: DynamicFetch,
  signal?: AbortSignal
): Promise<unknown> {
  return parseUtf8Json(
    await fetchBytes(url, fetcher, signal),
    filename
  );
}

export async function loadDynamicSceneCatalog(
  dataBase: string,
  fetcher: DynamicFetch = fetch,
  signal?: AbortSignal
): Promise<DynamicSceneCatalog> {
  const filename = "catalog.json";
  const value = await fetchJson(
    joinUrl(dataBase, "task2/scenes/catalog.json"),
    filename,
    fetcher,
    signal
  );
  try {
    return parseDynamicSceneCatalog(value);
  } catch (error) {
    if (!(error instanceof ZodError)) throw error;
    const issue = error.issues[0];
    const path = issue?.path.length
      ? issue.path.join(".")
      : "<root>";
    throw new Error(
      `${filename}: ${path}: ${issue?.message ?? "validation failed"}`
    );
  }
}

export async function loadDynamicScene(
  dataBase: string,
  entry: DynamicSceneCatalogEntry,
  fetcher: DynamicFetch = fetch,
  signal?: AbortSignal
): Promise<LoadedDynamicScenePackage> {
  assertSafeRelativePath(entry.baseUrl, "baseUrl");
  const baseUrl = joinUrl(dataBase, entry.baseUrl);
  const provenanceValue = await fetchJson(
    joinUrl(baseUrl, "provenance.json"),
    "provenance.json",
    fetcher,
    signal
  );
  const provenance = parseSchema(
    "provenance.json",
    provenanceValue,
    sceneProvenanceSchema
  );

  const required = [
    "scene.json",
    "baseline.bundle.json",
    "mission_view.v1.json",
    "dynamic_events.json",
    "decision_trace.v1.json"
  ] as const;
  const bytes = new Map<string, Uint8Array>();
  for (const name of required) {
    const value = await fetchBytes(joinUrl(baseUrl, name), fetcher, signal);
    await verifyHash(name, value, provenance.packagedSha256[name]);
    bytes.set(name, value);
  }

  const config = parseSchema(
    "scene.json",
    parseUtf8Json(bytes.get("scene.json")!, "scene.json"),
    sceneConfigSchema
  );
  const baseline = parseSchema(
    "baseline.bundle.json",
    parseUtf8Json(
      bytes.get("baseline.bundle.json")!,
      "baseline.bundle.json"
    ),
    caseBundleSchema
  );
  const view = parseSchema(
    "mission_view.v1.json",
    parseUtf8Json(
      bytes.get("mission_view.v1.json")!,
      "mission_view.v1.json"
    ),
    missionViewV1Schema
  );
  const dynamicEvents = parseSchema(
    "dynamic_events.json",
    parseUtf8Json(
      bytes.get("dynamic_events.json")!,
      "dynamic_events.json"
    ),
    dynamicEventBatchSchema
  );
  let geometryDiff: LoadedDynamicScenePackage["geometryDiff"] = null;
  const geometryDiffHash = provenance.packagedSha256[
    "task_geometry_diff.v1.json"
  ];
  if (geometryDiffHash !== undefined) {
    const name = "task_geometry_diff.v1.json";
    const value = await fetchBytes(joinUrl(baseUrl, name), fetcher, signal);
    await verifyHash(name, value, geometryDiffHash);
    geometryDiff = parseSchema(
      name,
      parseUtf8Json(value, name),
      taskGeometryDiffV1Schema
    );
  }
  const decisionTrace = parseSchema(
    "decision_trace.v1.json",
    parseUtf8Json(
      bytes.get("decision_trace.v1.json")!,
      "decision_trace.v1.json"
    ),
    decisionTraceV1Schema
  );

  let failureReport: LoadedDynamicScenePackage["failureReport"] = null;
  if (entry.failureReportUrl !== null) {
    assertSafeRelativePath(entry.failureReportUrl, "failureReportUrl");
    const name = entry.failureReportUrl;
    const value = await fetchBytes(joinUrl(baseUrl, name), fetcher, signal);
    await verifyHash(name, value, provenance.packagedSha256[name]);
    failureReport = parseSchema(
      name,
      parseUtf8Json(value, name),
      failureReportSchema
    );
  }

  if (config.sceneId !== entry.sceneId) {
    throw new Error(
      `scene.json sceneId ${config.sceneId} does not match catalog ${entry.sceneId}`
    );
  }
  if (
    config.resultStatus !== entry.resultStatus ||
    view.activePlan.planStatus !== entry.resultStatus
  ) {
    throw new Error(`${entry.sceneId}: result status does not match package files`);
  }
  if (config.baselineCaseId !== baseline.case.caseId) {
    throw new Error(`${entry.sceneId}: baseline caseId does not match scene.json`);
  }
  if (entry.resultStatus === "PARTIAL_SAFE_FALLBACK" && failureReport === null) {
    throw new Error(`${entry.sceneId}: partial safe fallback requires failure_report.json`);
  }
  if (entry.resultStatus === "COMPLETE" && failureReport !== null) {
    throw new Error(`${entry.sceneId}: complete scene must not include failure_report.json`);
  }
  if (
    decisionTrace.resultStatus !== entry.resultStatus ||
    decisionTrace.missionId !== view.mission.missionId ||
    decisionTrace.eventBatchId !== view.provenance.eventBatchId ||
    decisionTrace.sourcePlanVersion !== view.activePlan.sourcePlanVersion ||
    decisionTrace.publication.planId !== view.activePlan.planId ||
    decisionTrace.publication.planVersion !== view.activePlan.planVersion
  ) {
    throw new Error(`${entry.sceneId}: decision trace does not match package files`);
  }
  if (
    dynamicEvents.batchId !== decisionTrace.eventBatchId ||
    dynamicEvents.missionId !== decisionTrace.missionId ||
    dynamicEvents.sourcePlanVersion !== decisionTrace.sourcePlanVersion
  ) {
    throw new Error(`${entry.sceneId}: dynamic event batch identity is inconsistent`);
  }
  if (
    geometryDiff !== null &&
    (
      geometryDiff.missionId !== view.mission.missionId ||
      geometryDiff.sourcePlanVersion !== view.activePlan.sourcePlanVersion ||
      geometryDiff.planVersion !== view.activePlan.planVersion
    )
  ) {
    throw new Error(`${entry.sceneId}: geometry diff identity is inconsistent`);
  }
  if (
    failureReport !== null &&
    (
      decisionTrace.publication.failureReportPath !==
        entry.failureReportUrl ||
      decisionTrace.attemptId !== failureReport.attemptId
    )
  ) {
    throw new Error(`${entry.sceneId}: decision trace failure reference is inconsistent`);
  }

  return {
    config,
    baseline,
    view,
    dynamicEvents,
    geometryDiff,
    decisionTrace,
    failureReport,
    provenance
  };
}
