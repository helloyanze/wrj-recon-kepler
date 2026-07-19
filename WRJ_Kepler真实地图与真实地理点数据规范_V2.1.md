# WRJ 静态侦察规划三维演示前端
# 真实地图与真实地理点数据规范（Kepler.gl V2.1 补充版）

**文档版本：** V2.1  
**适用项目：** `wrj-recon-kepler-demo`  
**适用文档：** 《WRJ 静态侦察规划三维演示前端——Kepler.gl 嵌入版 Codex 开发文档 V2.0》  
**默认演示区域：** 海南省万宁市日月湾及附近海域  
**核心原则：** 地图、海岸线、道路、建筑和公开地理点使用真实公开地理数据；任务区域、条带和无人机航迹作为模拟规划数据单独标识。

---

# 1. 必须明确的数据真实性边界

前端不得把不同性质的数据混为“真实数据”。

## 1.1 真实数据

以下内容可以作为真实公开地理数据：

- 卫星影像或真实道路底图；
- 海岸线；
- 道路；
- 建筑轮廓；
- 岛屿、海湾、沙滩等自然地理要素；
- 公开地图中已有的停车场、码头、观景点、旅游设施等 POI；
- OpenStreetMap 中公开记录的航标、灯塔、浮标等海事要素；
- 已有名称、坐标和来源编号的公共地理对象。

真实地理对象必须带有明确来源和原始 ID，不得由开发者凭视觉手工点击后声称为真实数据。

## 1.2 模拟数据

以下内容仍然属于 WRJ 规划模拟数据：

- 无人机起飞点；
- 侦察任务区域；
- 安全避让区；
- 侦察条带；
- 进入点和退出点；
- 无人机曲线航迹；
- 飞行高度；
- 飞行速度；
- 起飞时间；
- 航迹时间戳；
- 任务分配；
- 油耗、电量和完成时间。

除非用户提供真实飞行日志或正式任务数据，否则上述内容不得标记为“真实飞行数据”。

## 1.3 实测数据

只有满足下列条件的数据才能标记为实测：

- 来自实际无人机飞行日志；
- 包含真实 GNSS 坐标和时间戳；
- 高度基准和单位明确；
- 数据来源获得合法使用授权；
- 不包含不应公开的敏感任务信息。

当前版本不包含实测飞行数据。

---

# 2. 页面必须使用的分层表达

Kepler.gl 数据层固定拆分为：

| Dataset ID | 数据性质 | 内容 |
|---|---|---|
| `wrj-real-pois` | 真实公开地理数据 | POI、码头、停车场、景点、岛屿、航标等 |
| `wrj-real-context` | 真实公开地理数据 | 需要额外显示的道路、岸线和建筑 |
| `wrj-simulated-region` | 模拟规划数据 | 侦察区域与安全边界 |
| `wrj-simulated-strips` | 模拟规划数据 | 侦察条带及任务分配 |
| `wrj-simulated-planned-routes` | 模拟规划数据 | 静态完整规划航迹 |
| `wrj-simulated-trips` | 模拟规划数据 | 四维 Trip 动画航迹 |

不得再把真实 POI、模拟任务区域和模拟无人机航迹合并在同一个文件中。

---

# 3. 真实底图

## 3.1 推荐底图

联网演示默认使用：

```text
Mapbox Standard Satellite
```

环境变量：

```env
VITE_MAPBOX_TOKEN=
```

底图样式必须通过 Kepler.gl 配置或自定义 Mapbox Style 加载。

不得：

- 把卫星截图作为静态背景图；
- 截取第三方地图图片后无授权使用；
- 在源码中写死 Token；
- 使用与 WGS84 不一致且未转换的坐标数据。

## 3.2 备选底图

当卫星底图不适合投屏时，可以切换为：

```text
Mapbox Standard
Mapbox Light
```

页面应提供“卫星 / 简洁地图”两个固定选项，不暴露复杂底图编辑器。

---

# 4. 真实地理点的数据源

## 4.1 默认数据源

采用 OpenStreetMap 数据，并通过 Overpass API 查询日月湾附近真实地理对象。

使用范围包括：

```text
name
natural=beach
tourism=attraction
amenity=parking
man_made=pier
man_made=lighthouse
place=island
place=islet
seamark:type
harbour
leisure
building
highway
```

## 4.2 不允许的生成方式

禁止：

- 根据地图截图手工猜坐标；
- 从搜索结果摘要中复制不确定坐标；
- 为了画面好看随意增加“港口”“浮标”“雷达站”；
- 把模拟起飞点标成现实无人机基地；
- 没有来源 ID 的点标记为真实；
- 运行时自动生成随机真实点。

---

# 5. Overpass 查询规范

## 5.1 查询区域

日月湾第一版建议使用以下查询范围：

```text
south = 18.6000
west  = 110.1800
north = 18.6600
east  = 110.2700
```

该范围只是数据检索边界，不代表任务边界。

## 5.2 查询文件

创建：

```text
scripts/overpass/riyue-real-features.overpass
```

内容：

```overpass
[out:json][timeout:90];

(
  nwr["name"](18.6000,110.1800,18.6600,110.2700);
  nwr["natural"="beach"](18.6000,110.1800,18.6600,110.2700);
  nwr["tourism"="attraction"](18.6000,110.1800,18.6600,110.2700);
  nwr["amenity"="parking"](18.6000,110.1800,18.6600,110.2700);
  nwr["man_made"="pier"](18.6000,110.1800,18.6600,110.2700);
  nwr["man_made"="lighthouse"](18.6000,110.1800,18.6600,110.2700);
  nwr["place"~"island|islet"](18.6000,110.1800,18.6600,110.2700);
  nwr["seamark:type"](18.6000,110.1800,18.6600,110.2700);
  nwr["harbour"](18.6000,110.1800,18.6600,110.2700);
  nwr["leisure"](18.6000,110.1800,18.6600,110.2700);
);

out center tags;
```

## 5.3 查询时间

真实地理数据在开发阶段或发布前抓取，不在用户浏览器中实时查询。

原因：

- 保证演示结果稳定；
- 避免 Overpass 服务不可用导致页面白屏；
- 避免每次打开页面返回不同数据；
- 可以人工复核点位；
- 便于保留原始数据和来源信息。

---

# 6. 真实数据抓取脚本

创建：

```text
scripts/fetch-real-geodata.mjs
```

npm script：

```json
{
  "scripts": {
    "data:fetch-real": "node scripts/fetch-real-geodata.mjs"
  }
}
```

## 6.1 脚本流程

```text
读取 Overpass 查询文件
→ 请求 Overpass API
→ 保存原始 OSM JSON
→ 转换为 GeoJSON
→ 规范化属性
→ 过滤无坐标和无意义对象
→ 输出真实 POI GeoJSON
→ 输出数据报告
```

## 6.2 输出目录

```text
public/data/riyue-3d/real/
├── overpass-source.json
├── real-pois.geojson
├── real-context.geojson
└── provenance.json
```

## 6.3 输出要求

`overpass-source.json`：

- 保存完整原始返回；
- 不手工编辑；
- 便于追踪来源。

`real-pois.geojson`：

- 主要保存 Point；
- Way 或 Relation 可以使用中心点；
- 每个 Feature 必须保留 OSM 类型和 OSM ID。

`real-context.geojson`：

- 保存需要额外显示的真实 LineString 或 Polygon；
- 只保留演示中确实需要的对象。

`provenance.json`：

```json
{
  "source": "OpenStreetMap",
  "queryFile": "scripts/overpass/riyue-real-features.overpass",
  "retrievedAt": "2026-07-18T12:00:00Z",
  "bbox": {
    "south": 18.6,
    "west": 110.18,
    "north": 18.66,
    "east": 110.27
  },
  "featureCount": 0,
  "license": "ODbL",
  "attribution": "© OpenStreetMap contributors"
}
```

---

# 7. 真实 Feature 属性规范

每个真实地理 Feature 至少包含：

```ts
interface RealGeographicFeatureProperties {
  dataNature: "REAL_PUBLIC_GEODATA";
  sourceName: "OpenStreetMap";
  sourceType: "node" | "way" | "relation";
  sourceId: string;
  sourceRef: string;
  retrievedAt: string;

  name: string | null;
  category: string;
  geometryOrigin: "original" | "center-derived";

  osmTags: Record<string, string>;
  verifiedForDemo: boolean;
  verificationNote: string | null;
}
```

示例：

```json
{
  "dataNature": "REAL_PUBLIC_GEODATA",
  "sourceName": "OpenStreetMap",
  "sourceType": "node",
  "sourceId": "123456789",
  "sourceRef": "node/123456789",
  "retrievedAt": "2026-07-18T12:00:00Z",
  "name": "示例公共地点",
  "category": "tourism_attraction",
  "geometryOrigin": "original",
  "osmTags": {
    "tourism": "attraction"
  },
  "verifiedForDemo": true,
  "verificationNote": "已在卫星底图和 OSM 中复核"
}
```

---

# 8. 模拟 Feature 属性规范

所有任务模拟数据必须包含：

```ts
interface SimulatedMissionProperties {
  dataNature: "SIMULATED_MISSION_DATA";
  sourceName: "WRJ Demo Generator";
  caseId: string;
  generatedAt: string;
  realLocationContext: true;
  operationalUseAllowed: false;
  simulationNote: string;
}
```

Trip 示例：

```json
{
  "dataNature": "SIMULATED_MISSION_DATA",
  "sourceName": "WRJ Demo Generator",
  "caseId": "riyue-3d",
  "generatedAt": "2026-07-18T12:00:00Z",
  "realLocationContext": true,
  "operationalUseAllowed": false,
  "simulationNote": "基于真实地理环境生成的模拟无人机规划航迹"
}
```

---

# 9. 模拟点必须与真实环境建立关系

模拟任务数据不能随意漂浮在地图上。

## 9.1 任务区域

任务区域必须满足：

- 位于真实海面或目标区域；
- 不跨越明显陆地和建筑；
- 边界与真实海岸保持合理距离；
- 不能覆盖已知人口密集区；
- 与真实底图视觉一致。

## 9.2 起飞点

起飞点不能标记为真实无人机基地。

可采用以下显示方式：

```text
模拟起降点
基于真实公共地理位置附近设置
```

属性：

```json
{
  "dataNature": "SIMULATED_MISSION_DATA",
  "label": "模拟起降点",
  "referenceRealFeatureId": "node/...",
  "simulationNote": "参考真实公共地点位置设置，不代表现实中允许无人机起降"
}
```

## 9.3 障碍与避让区

真实对象和模拟安全区必须分开：

```text
真实地理对象：公开地图中的建筑、岸线、岛屿或设施
模拟避让区：规划算法围绕真实对象生成的缓冲区
```

模拟缓冲区属性应记录：

```json
{
  "derivedFromRealFeatureId": "way/...",
  "bufferDistanceM": 120,
  "dataNature": "SIMULATED_MISSION_DATA"
}
```

---

# 10. 地图图例

页面必须显示固定图例：

```text
● 真实公开地理点
▰ 真实地理对象
▱ 模拟任务区域
━ 模拟侦察条带
━ 模拟规划航迹
━ 动态模拟飞行
```

必须通过文字或线型区分，不能只依赖颜色。

## 10.1 推荐视觉编码

| 类型 | 样式 |
|---|---|
| 真实 POI | 白色或浅蓝点，带真实名称 |
| 真实岸线/设施 | 灰白线或轮廓 |
| 模拟任务区域 | 蓝色透明面，虚线边界 |
| 模拟安全区 | 橙红色透明面 |
| 模拟条带 | 按 UAV 着色的细线 |
| 模拟完整规划线 | 低透明度粗线 |
| 模拟 Trip | 高亮动态线 |

---

# 11. Tooltip 要求

## 11.1 真实地理点 Tooltip

显示：

```text
名称
类别
来源：OpenStreetMap
OSM 类型 / ID
数据抓取时间
数据性质：真实公开地理数据
```

## 11.2 模拟任务 Tooltip

显示：

```text
对象名称
无人机编号
任务阶段
高度
速度
时间
数据性质：模拟规划数据
不可用于真实飞行
```

---

# 12. 页面声明

页面右下角或详情栏永久显示：

```text
底图和公共地理对象来自真实地图数据；
任务区域、条带和无人机航迹为模拟规划数据；
本演示不构成真实飞行计划或空域信息。
```

地图上同时保留：

```text
© OpenStreetMap contributors
```

如果使用 Mapbox 底图，还应保留 Mapbox 要求的归属信息。

不得通过 CSS 隐藏地图供应商归属信息。

---

# 13. P0 验证标准更新

原 V2.0 P0 增加以下硬性验收：

- [ ] 使用真实卫星或道路底图；
- [ ] 真实 POI 通过 Overpass 数据脚本生成；
- [ ] 至少显示 3 个带 OSM ID 的真实地理对象；
- [ ] 每个真实点的名称、来源和 ID 可在 Tooltip 中查看；
- [ ] 模拟任务对象带 `SIMULATED_MISSION_DATA` 标记；
- [ ] 真实点与模拟点样式明显不同；
- [ ] 页面显示 OSM 和 Mapbox 归属；
- [ ] 页面声明真实与模拟数据的边界；
- [ ] 没有开发者手工猜测后标记为真实的坐标；
- [ ] 数据脚本可重复运行；
- [ ] 原始 Overpass 响应已保存；
- [ ] `provenance.json` 已生成。

如果实际查询后日月湾区域缺少足够的公开 POI：

1. 不得伪造补齐；
2. 可扩大查询范围；
3. 可使用真实道路、建筑、沙滩和岛屿作为真实对象；
4. 或更换为公开地图数据更丰富的海岸区域；
5. 必须在报告中说明数据覆盖不足。

---

# 14. 项目目录更新

在 V2.0 目录基础上增加：

```text
wrj-recon-kepler-demo/
├── scripts/
│   ├── fetch-real-geodata.mjs
│   ├── normalize-osm-features.mjs
│   └── overpass/
│       └── riyue-real-features.overpass
├── public/
│   └── data/
│       └── riyue-3d/
│           ├── real/
│           │   ├── overpass-source.json
│           │   ├── real-pois.geojson
│           │   ├── real-context.geojson
│           │   └── provenance.json
│           ├── simulated/
│           │   ├── region.geojson
│           │   ├── strips.geojson
│           │   ├── planned-routes.geojson
│           │   ├── trips.csv
│           │   └── summary.json
│           └── case-manifest.json
└── docs/
    ├── REAL_DATA_PROVENANCE.md
    └── REAL_VS_SIMULATED_DATA.md
```

---

# 15. case-manifest.json

```json
{
  "caseId": "riyue-3d",
  "name": "日月湾真实环境三维侦察演示",
  "coordinateReference": "EPSG:4326",
  "basemap": {
    "provider": "Mapbox",
    "style": "standard-satellite",
    "dataNature": "REAL_BASEMAP"
  },
  "datasets": [
    {
      "id": "wrj-real-pois",
      "file": "/data/riyue-3d/real/real-pois.geojson",
      "dataNature": "REAL_PUBLIC_GEODATA"
    },
    {
      "id": "wrj-real-context",
      "file": "/data/riyue-3d/real/real-context.geojson",
      "dataNature": "REAL_PUBLIC_GEODATA"
    },
    {
      "id": "wrj-simulated-region",
      "file": "/data/riyue-3d/simulated/region.geojson",
      "dataNature": "SIMULATED_MISSION_DATA"
    },
    {
      "id": "wrj-simulated-strips",
      "file": "/data/riyue-3d/simulated/strips.geojson",
      "dataNature": "SIMULATED_MISSION_DATA"
    },
    {
      "id": "wrj-simulated-planned-routes",
      "file": "/data/riyue-3d/simulated/planned-routes.geojson",
      "dataNature": "SIMULATED_MISSION_DATA"
    },
    {
      "id": "wrj-simulated-trips",
      "file": "/data/riyue-3d/simulated/trips.csv",
      "dataNature": "SIMULATED_MISSION_DATA"
    }
  ]
}
```

---

# 16. 数据复核流程

真实数据导入项目之前必须执行：

```text
1. 检查坐标是否位于查询范围；
2. 检查名称是否存在明显乱码；
3. 检查对象类型是否合理；
4. 在真实底图中目视复核；
5. 移除与演示无关或敏感的点；
6. 不修改对象坐标；
7. 标记 verifiedForDemo；
8. 记录复核说明；
9. 保存原始数据；
10. 生成数据来源文档。
```

真实数据可以筛选，但不得为画面效果移动坐标。

---

# 17. Codex 新增最终汇报项

Codex 完成后除 V2.0 要求外，还必须汇报：

```text
真实底图类型
Overpass查询范围
真实数据抓取时间
真实Feature数量
真实Point数量
真实Line/Polygon数量
OSM来源ID示例
数据复核结果
OSM归属显示位置
Mapbox归属显示位置
真实数据与模拟数据的区分方式
未能获取的真实对象
是否存在人工坐标
```

若存在任何人工坐标，必须说明其为模拟，不得列入真实数据统计。

---

# 18. 最终完成定义

更新后的项目应达到：

> 使用真实卫星或道路底图，叠加从 OpenStreetMap 查询并保留来源 ID 的真实公共地理点和空间对象；在此真实地理环境上生成并展示明确标记为模拟的任务区域、条带、静态规划航迹和三维 Trip 动画。页面能够让观看者清楚区分“真实地图与公共地理数据”和“WRJ 模拟规划数据”，且不存在将人工构造坐标冒充真实数据的情况。
