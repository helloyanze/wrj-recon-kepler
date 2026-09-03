import {discoverValidRuns} from "./prepare-algorithm-cases.ts";
const disc = await discoverValidRuns("v2_staging_inv");
const sel = disc.selectedRuns.get("R01-V2-SEQUENTIAL-CHECK");
console.log(JSON.stringify({
  caseId: sel.caseId, planId: sel.planId, runId: sel.runId,
  displayName: sel.bundle.case.displayName,
  sourcePath: sel.sourcePath,
  metrics: sel.bundle.metrics,
  warnings: sel.bundle.validation.warnings
}, null, 2));
