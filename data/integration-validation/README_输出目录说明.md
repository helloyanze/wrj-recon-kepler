# WRJ 任务一输出目录说明

本文档用于说明任务一静态侦察规划程序的输出目录层级、文件用途、主要字段和阅读顺序。

> 当前输出中的空间坐标采用 **局部平面直角坐标系**，单位为米；不是 WGS84 经纬度。  
> `trajectories.geojson` 虽使用 GeoJSON 文件格式，但坐标仍为 `[xM, yM]`，不能直接当作 `[longitude, latitude]` 叠加到在线地图。

---

## 1. 总体目录结构

```text
integration-validation/
├─ <CASE_ID>/
│  ├─ <YYYYMMDDTHHMMSS>/
│  │  ├─ mission_plan.json
│  │  ├─ assignments.xlsx
│  │  ├─ trajectories.geojson
│  │  ├─ validation_report.json
│  │  ├─ score_report.json              # 条件生成
│  │  ├─ failure_report.json            # 条件生成
│  │  ├─ intermediate/
│  │  │  ├─ region_profile.json
│  │  │  ├─ strip_plans.json
│  │  │  ├─ capabilities.json
│  │  │  └─ assignment_candidates.json
│  │  └─ logs/
│  │     └─ task01.log
│  └─ <其他历史运行时间戳>/
│
└─ _batch_validation/
   └─ <YYYYMMDDTHHMMSS>/
      ├─ batch_validation_report.md
      ├─ batch_validation_summary.csv
      ├─ batch_validation_summary.json
      └─ logs/
         └─ <CASE_ID>.log
```

### 目录命名规则

- `<CASE_ID>`：算例编号，例如 `R01-BASELINE-01`。
- `<YYYYMMDDTHHMMSS>`：本次运行的时间戳，例如 `20260721T192032`。
- 同一个算例允许保留多次运行结果，时间戳较大的目录通常是更新的一次运行。
- `_batch_validation`：批量验证的汇总结果，不属于某一个单独算例。

### 如何判断一次运行是否完整

完整运行目录通常至少包含：

```text
mission_plan.json
assignments.xlsx
trajectories.geojson
validation_report.json
intermediate/
logs/
```

补充规则：

- 存在 `score_report.json`：说明方案已进入评分阶段。
- 存在 `failure_report.json`：说明本次结果不可行，或流程生成了结构化失败报告。
- 只有 `logs/task01.log`：通常表示程序在较早阶段异常退出，尚未形成完整输出。
- `trajectories.geojson` 可能存在但 `features=[]`，表示没有成功生成可输出的精确航迹。

---

## 2. 推荐阅读顺序

面向汇报或人工检查时，建议按以下顺序查看：

1. **`assignments.xlsx`**：快速了解总体方案、无人机分配、航段和约束结果。
2. **`mission_plan.json`**：读取最终方案的完整机器可读数据。
3. **`trajectories.geojson`**：绘制或检查各无人机航迹。
4. **`validation_report.json`**：确认硬约束、告警和失败项。
5. **`score_report.json`**：查看综合评分及各维度得分。
6. **`failure_report.json`**：不可行时查看错误码和失败原因。
7. **`intermediate/` 与 `logs/`**：用于算法调试和问题追踪。

对外系统集成时，建议以 `mission_plan.json` 为主要数据源；`assignments.xlsx` 主要用于人工阅读。

---

## 3. 最终结果文件

### 3.1 `mission_plan.json`

最终任务方案的主文件，也是本次运行结果的核心数据源。

主要字段：

| 字段 | 含义 |
|---|---|
| `planId` | 最终方案编号 |
| `caseId` | 算例编号 |
| `assignmentPlan` | 被选中的任务分配方案 |
| `trajectories` | 各架次精确航迹 |
| `coverageRatio` | 覆盖率，取值通常为 0～1 |
| `missionMakespanSec` | 所有任务并行执行后的总完成时间，单位秒 |
| `totalDistanceM` | 所有航迹累计距离，单位米 |
| `totalFuelKg` | 所有航迹累计油耗，单位千克 |
| `validationReport` | 嵌入的约束校验结果 |
| `finalScore` | 最终综合得分 |
| `feasible` | 最终方案是否可行 |
| `failureCodes` | 失败错误码列表；可行时通常为空 |

#### `assignmentPlan`

主要包含：

- `assignmentPlanId`：任务分配方案编号；
- `stripPlanId`：采用的条带方案编号；
- `assignments`：每一个无人机架次的分配记录；
- `usedUavCount`：使用的无人机数量；
- `unassignedStripIds`：未分配条带；
- `estimatedMakespanSec`：任务分配阶段估算的完成时间；
- `batchCount`：批次数；
- `stripPlanSnapshot`：最终采用条带方案的快照。

每条 `assignment` 常见字段：

| 字段 | 含义 |
|---|---|
| `assignmentId` | 架次任务编号 |
| `uavId` | 无人机编号 |
| `baseId` | 起降阵地编号 |
| `flightCandidateId` | 飞行参数候选编号 |
| `stripStartIndex` / `stripEndIndex` | 负责的条带索引范围 |
| `stripIds` | 负责的条带编号列表 |
| `entryVariant` | 进入条带组的入口方式 |
| `plannedLaunchTimeSec` | 相对任务起点的计划起飞时间 |
| `batchIndex` | 执行批次 |
| `routeEstimateId` | 对应的快速航迹估算编号 |

#### `trajectories`

每一项代表一个具体架次，主要包含：

- `trajectoryId`、`uavId`、`assignmentId`；
- `segments`：完整航段序列；
- `entryPoint`、`exitPoint`；
- `totalDistanceM`、`totalDurationSec`、`totalFuelKg`；
- `remainingFuelKg`、`remainingFuelRatio`；
- `valid`、`failureCodes`。

当前实际输出的航段类型包括：

```text
TAKEOFF
CLIMB
ENTRY
COVERAGE_LINE
TURN
RETURN
DESCENT
LANDING
```

每个航段通常包含：

- `segmentId`、`segmentType`；
- `geometry`；
- `startPoint`、`endPoint`；
- `distanceM`、`heightM`、`speedMps`；
- `durationSec`、`fuelConsumptionKg`；
- `turnRadiusM`；
- `stripId`；
- `valid`。

---

### 3.2 `assignments.xlsx`

面向人工查看的 Excel 汇总文件。当前包含 4 个工作表。

#### 工作表 1：`总体方案`

展示最终方案的核心指标，包括：

- 方案 ID、可行性和约束校验结果；
- 综合得分；
- 区域面积；
- 总条带数和完成条带数；
- 覆盖率；
- 并行完成时间；
- 使用无人机数量；
- 总飞行距离、总油耗、总体剩余油量；
- 条带、参数、资源、任务分配、航迹等维度得分；
- 风险惩罚。

#### 工作表 2：`无人机分配`

每一行对应一个无人机架次，包含：

- 无人机与阵地；
- 条带起止索引、条带数量和条带 ID；
- 入口方式、入口坐标和出口坐标；
- 批次、计划起飞时间；
- 转场/覆盖高度与速度；
- 侦察幅宽；
- 进入、覆盖、返航距离；
- 掉头次数；
- 总距离、总耗时、总油耗和剩余油量。

#### 工作表 3：`航段明细`

每一行对应一个航段，包含：

- 航迹段 ID；
- 无人机 ID；
- 航段类型；
- 距离、高度、速度；
- 耗时、油耗；
- 转弯半径；
- 航段是否有效。

#### 工作表 4：`约束校验`

展示每个校验项的：

- 校验项名称；
- 阈值；
- 实际值；
- 是否通过；
- 错误码；
- 说明。

---

### 3.3 `trajectories.geojson`

用于航迹可视化或空间分析。

文件结构：

```json
{
  "type": "FeatureCollection",
  "features": []
}
```

每个 `Feature` 对应一个航段：

```json
{
  "type": "Feature",
  "properties": {
    "planId": "PLAN-002",
    "uavId": "UAV-04",
    "assignmentId": "ASG-0001-001",
    "segmentId": "SEG-UAV-04-ENTRY-001",
    "segmentType": "ENTRY",
    "heightM": 2900.0,
    "speedMps": 223.702,
    "durationSec": 300.16,
    "fuelConsumptionKg": 18.80,
    "turnRadiusM": null,
    "valid": true
  },
  "geometry": {
    "type": "LineString",
    "coordinates": [
      [5000.0, 5000.0],
      [65498.75, 34129.11]
    ]
  }
}
```

#### 坐标注意事项

当前空间参考为：

```text
LOCAL_CARTESIAN_M
```

因此：

```text
[5000.0, 5000.0]
```

表示：

```text
[xM, yM]
```

而不是：

```text
[longitude, latitude]
```

在 QGIS、ArcGIS 或网页地图中使用前，需要根据项目定义的局部坐标原点和转换参数，先反算为 WGS84 经纬度。

---

### 3.4 `validation_report.json`

约束校验报告。

顶层字段：

| 字段 | 含义 |
|---|---|
| `valid` | 整体校验是否通过 |
| `checks` | 逐项校验记录 |
| `failureCodes` | 校验失败错误码 |

每条 `check` 的结构：

```json
{
  "name": "COVERAGE_RATIO",
  "status": "PASS",
  "message": "覆盖率=1.0000",
  "value": 1.0,
  "threshold": 0.95
}
```

`status` 可能为：

- `PASS`：通过；
- `WARNING`：存在需要关注的风险，但不一定导致方案不可行；
- `FAIL`：硬约束失败。

当前输出中常见校验项包括：

```text
STRIP_ASSIGNMENT
COVERAGE_RATIO
RECON_ACCURACY
OBSTACLE_CROSSING
TURN_RADIUS
ALTITUDE_SPEED
RANGE_<UAV_ID>
FUEL_CONSUMPTION_<UAV_ID>
FUEL_RESERVE_<UAV_ID>
MULTI_AIRCRAFT_CONFLICT
TRAJECTORY_FEASIBILITY
```

---

### 3.5 `score_report.json`

方案评分报告。通常在方案成功进入评分阶段后生成。

主要字段：

| 字段 | 含义 |
|---|---|
| `planId` / `caseId` | 方案和算例编号 |
| `feasible` | 是否可行 |
| `finalScore` | 最终综合得分 |
| `dimensionScores` | 各评价维度及其权重、子指标 |
| `perUavDetails` | 各架次/无人机的评分与统计 |
| `aggregated` | 汇总统计 |

主要评分维度：

- `sStrip`：条带方案；
- `sParameter`：飞行参数匹配；
- `sResource`：资源利用；
- `sAssignment`：任务分配；
- `sRoute`：完整航迹；
- `riskPenalty`：风险惩罚；
- `gHard`：硬约束门控。

> 全部候选在精确航迹生成前后失败时，可能不会生成 `score_report.json`。

---

### 3.6 `failure_report.json`

不可行或失败情况下的结构化报告。

主要字段：

```text
planId
caseId
feasible
failureCodes
failureMessages
validationChecks
```

示例错误码：

```text
E401_STRIPS_UNASSIGNED
E509_TRANSIT_NO_DETOUR_PATH
E511_TRANSIT_SMOOTHING_FAILED
```

排查时应结合：

```text
failure_report.json
validation_report.json
logs/task01.log
```

共同判断问题发生在哪个阶段。

---

## 4. 中间过程文件

`intermediate/` 保存各模块之间的过程数据，主要用于调试、回归测试和算法分析。

> 中间文件属于内部接口数据，字段可能随算法迭代变化。外部系统不宜直接把这些字段作为长期稳定接口。

### 4.1 `region_profile.json`

区域预处理结果，主要包含：

- `regionId`；
- `geometryWkt`；
- `regionType`；
- `coordinateReference`；
- `areaM2`、`perimeterM`；
- `centroid`；
- `mainAxisAngleDeg`；
- `longAxisM`、`shortAxisM`；
- `valid`、`warnings`。

其中：

```json
"coordinateReference": "LOCAL_CARTESIAN_M"
```

明确表示当前使用局部米制平面坐标。

### 4.2 `strip_plans.json`

全部候选条带方案。

每个条带方案主要包含：

- `stripPlanId`；
- `flightCandidateId`；
- `regionId`；
- `scanAngleDeg`；
- `swathWidthM`；
- `stripSpacingM`；
- `stripCount`；
- `strips`；
- `estimatedCoverageRatio`；
- `generationWarnings`；
- `compatibleFlightCandidates`。

每个 `strip` 包含条带编号、索引、起终点、长度、扫描角和覆盖多边形。

### 4.3 `capabilities.json`

无人机执行不同条带范围的能力记录，文件通常较大。

每条记录主要包含：

- `capabilityId`；
- `uavId`；
- `stripPlanId`；
- `flightCandidateId`；
- `startStripIndex`；
- `maxExecutableStripCount`；
- `bestRouteEstimate`；
- `score`；
- `feasible`；
- `failureCodes`。

`bestRouteEstimate` 包含进入、覆盖和返航的估算距离、估算时间、估算油耗及余油比例。

### 4.4 `assignment_candidates.json`

任务分配模块生成的候选方案集合，最终方案从这些候选中经过精确航迹生成、约束校验和评分后选出。

主要字段与 `mission_plan.json` 中的 `assignmentPlan` 相同，包括：

- 分配方案编号；
- 条带方案编号；
- 架次分配；
- 使用无人机数；
- 未分配条带；
- 估算完成时间；
- 批次数；
- 分配得分；
- 条带方案快照。

---

## 5. 日志文件

### `logs/task01.log`

记录单个算例的执行过程，例如：

- 算例加载；
- 区域面积和主方向；
- 生成条带方案数量；
- 能力记录数量；
- 分配候选数量；
- 候选校验与修复次数；
- 最终可行性和评分；
- 输出文件路径；
- Warning 或错误信息。

当某个运行目录只有日志文件时，应优先查看该文件的最后一段 traceback 或错误码。

---

## 6. 批量验证目录

批量验证结果位于：

```text
_batch_validation/<YYYYMMDDTHHMMSS>/
```

### `batch_validation_report.md`

面向人工阅读的批量验证报告，包含：

- 开始时间；
- 执行场景数；
- PASS、CHECK、FAIL 数量；
- 场景汇总表；
- 需要处理的场景；
- 判定口径。

### `batch_validation_summary.csv`

适合用 Excel、Python 或其他统计工具批量分析。每一行对应一个算例。

主要字段包括：

- `caseId`、`status`；
- `processReturnCode`、`elapsedSec`；
- `runDir`、`consoleLog`；
- `errorCode`、`errorMessage`；
- `missionFeasible`、`finalScore`；
- `assignmentCount`、`trajectoryCount`；
- `usedBases`；
- ENTRY/RETURN 航段与弧段数量；
- 无效航段/航迹数量；
- 位置断点数量及最大断点距离；
- 同一无人机架次重叠数量和最小时间间隔；
- 可视化状态。

### `batch_validation_summary.json`

与 CSV 表达相同的批量结果，保留数组、布尔值和空值类型，更适合程序读取。

### `logs/<CASE_ID>.log`

保存批量脚本调用单个算例时的控制台输出。

### 批量状态含义

- `PASS`：主流程正常、方案可行、存在航迹、无无效航段、位置连续、同一无人机出动不重叠。
- `CHECK`：主流程完成，但结构检查存在需要人工确认的项目。
- `FAIL`：主流程异常退出、没有形成可解析的完整结果，或任务不可正常验证。

---

## 7. 通用单位

| 后缀或字段 | 单位/含义 |
|---|---|
| `xM`、`yM`、`zM` | 米 |
| `distanceM`、`heightM`、`swathWidthM` | 米 |
| `speedMps` | 米/秒 |
| `durationSec`、`MakespanSec` | 秒 |
| `fuelKg`、`FuelKg` | 千克 |
| `AngleDeg` | 度 |
| `coverageRatio`、`remainingFuelRatio` | 0～1 的比例 |
| `valid`、`feasible` | 布尔值 |

---

## 8. 快速检查命令

### 查找某个算例最新的运行目录

```powershell
$caseDir = ".\output\integration-validation\R10-LONG-TRANSIT-01"

$latestRun = Get-ChildItem $caseDir -Directory |
  Sort-Object Name -Descending |
  Select-Object -First 1

$latestRun.FullName
```

### 查看最终可行性和得分

```powershell
$plan = Get-Content "$($latestRun.FullName)\mission_plan.json" -Raw |
  ConvertFrom-Json

$plan |
  Select-Object caseId, planId, feasible, finalScore,
    coverageRatio, missionMakespanSec, totalDistanceM, totalFuelKg
```

### 查看失败原因

```powershell
Get-Content "$($latestRun.FullName)\failure_report.json" -Raw |
  ConvertFrom-Json |
  Format-List
```

### 查看运行日志末尾

```powershell
Get-Content "$($latestRun.FullName)\logs\task01.log" -Tail 50
```

---

## 9. 使用建议

- **汇报人员**：优先查看 `assignments.xlsx` 和 `trajectories.geojson`。
- **算法开发人员**：重点查看 `mission_plan.json`、`intermediate/` 和日志。
- **测试人员**：重点查看 `validation_report.json`、`failure_report.json` 和 `_batch_validation/`。
- **外部系统**：优先读取 `mission_plan.json`；不要依赖中间文件的长期字段稳定性。
- **地图展示**：必须先完成局部平面坐标到经纬度的逆变换。
- **历史结果管理**：不要只按场景目录判断结果，应进入对应时间戳目录；同一场景可能保留多次运行记录。
