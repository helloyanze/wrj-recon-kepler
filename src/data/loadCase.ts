import {
  caseManifestSchema,
  caseSummarySchema,
  type CaseDataset,
  type CaseManifest,
  type CaseSummary
} from "./caseSchema";
import {loadJson, rebaseDataUrl} from "./loadJson";
import {loadText} from "./loadText";

export {rebaseDataUrl} from "./loadJson";

export type LoadedCaseDataset = CaseDataset &
  (
    | {format: "csv"; raw: string}
    | {format: "geojson"; raw: unknown}
  );

export interface CaseBundle {
  manifest: CaseManifest;
  summary: CaseSummary;
  keplerConfig: Record<string, unknown>;
  datasets: LoadedCaseDataset[];
}

async function loadDataset(
  dataset: CaseDataset,
  dataBase: string,
  signal?: AbortSignal
): Promise<LoadedCaseDataset> {
  const file = rebaseDataUrl(dataset.file, dataBase);
  if (file.endsWith(".csv")) {
    return {...dataset, format: "csv", raw: await loadText(file, signal)};
  }
  return {...dataset, format: "geojson", raw: await loadJson<unknown>(file, signal)};
}

export async function loadCase(
  caseId: string,
  dataBase = "/data",
  signal?: AbortSignal
): Promise<CaseBundle> {
  const base = dataBase.replace(/\/$/, "");
  const manifestUrl = `${base}/${caseId}/case-manifest.json`;
  const manifest = caseManifestSchema.parse(await loadJson<unknown>(manifestUrl, signal));

  const [summaryRaw, keplerConfig, datasets] = await Promise.all([
    loadJson<unknown>(rebaseDataUrl(manifest.summaryFile, base), signal),
    loadJson<Record<string, unknown>>(manifest.keplerConfigFile, signal),
    Promise.all(manifest.datasets.map((dataset) => loadDataset(dataset, base, signal)))
  ]);

  return {
    manifest,
    summary: caseSummarySchema.parse(summaryRaw),
    keplerConfig,
    datasets
  };
}
