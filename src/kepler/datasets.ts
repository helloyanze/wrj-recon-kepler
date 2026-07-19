import {processCsvData, processGeojson} from "@kepler.gl/processors";
import type {ProtoDataset} from "@kepler.gl/types";
import type {LoadedCaseDataset} from "../data/loadCase";

const DATASET_LABELS: Record<LoadedCaseDataset["id"], string> = {
  "wrj-real-pois": "真实公开地理点",
  "wrj-real-context": "真实地理上下文",
  "wrj-simulated-region": "模拟任务区域",
  "wrj-simulated-strips": "模拟侦察条带",
  "wrj-simulated-planned-routes": "模拟静态完整航迹",
  "wrj-simulated-trips": "模拟四维 Trip 航迹"
};

export function buildKeplerDatasets(datasets: LoadedCaseDataset[]): ProtoDataset[] {
  return datasets.map((dataset) => {
    const data =
      dataset.format === "csv" ? processCsvData(dataset.raw) : processGeojson(dataset.raw);
    if (!data) throw new Error(`${dataset.id} 无法由 Kepler Processor 解析`);
    return {
      info: {id: dataset.id, label: DATASET_LABELS[dataset.id]},
      data
    };
  });
}
