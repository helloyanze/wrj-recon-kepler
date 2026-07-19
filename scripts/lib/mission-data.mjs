const CASE_ID = "riyue-3d";
const SOURCE_NAME = "WRJ Demo Generator";
const EARTH_RADIUS_M = 6_371_000;
const START_TIME = 1_784_509_200;

const UAVS = [
  {
    uavId: "UAV-01",
    callsign: "WRJ01",
    color: "#35C5FF",
    coverageAltitudeM: 92,
    transitAltitudeM: 122,
    maxAltitudeM: 133.5,
    speedMps: 24
  },
  {
    uavId: "UAV-02",
    callsign: "WRJ02",
    color: "#FFB44D",
    coverageAltitudeM: 100,
    transitAltitudeM: 128,
    maxAltitudeM: 139.5,
    speedMps: 25
  },
  {
    uavId: "UAV-03",
    callsign: "WRJ03",
    color: "#4ED6A0",
    coverageAltitudeM: 108,
    transitAltitudeM: 136,
    maxAltitudeM: 147.5,
    speedMps: 26
  }
];

const TRIP_CSV_HEADERS = [
  "_geojson",
  "uav_id",
  "callsign",
  "strip_range",
  "total_distance_km",
  "total_duration_min",
  "coverage_altitude_m",
  "transit_altitude_m",
  "max_altitude_m",
  "missionStage",
  "speed_mps",
  "start_time",
  "status",
  "dataNature",
  "operationalUseAllowed"
];

function csvCell(value) {
  const text = String(value ?? "");
  return `"${text.replaceAll('"', '""')}"`;
}

export function serializeTripsCsv(trips) {
  const rows = trips.features.map((feature) => {
    const properties = feature.properties;
    return [
      JSON.stringify(feature),
      properties.uav_id,
      properties.callsign,
      properties.strip_range,
      properties.total_distance_km,
      properties.total_duration_min,
      properties.coverage_altitude_m,
      properties.transit_altitude_m,
      properties.max_altitude_m,
      properties.missionStage,
      properties.speed_mps,
      properties.start_time,
      properties.status,
      properties.dataNature,
      properties.operationalUseAllowed
    ]
      .map(csvCell)
      .join(",");
  });
  return `${TRIP_CSV_HEADERS.join(",")}\r\n${rows.join("\r\n")}\r\n`;
}

function simulationProperties(generatedAt, extra = {}) {
  return {
    dataNature: "SIMULATED_MISSION_DATA",
    sourceName: SOURCE_NAME,
    caseId: CASE_ID,
    generatedAt,
    realLocationContext: true,
    operationalUseAllowed: false,
    simulationNote: "基于真实地理环境生成的模拟无人机规划数据，不可用于真实飞行",
    ...extra
  };
}

function toRadians(value) {
  return (value * Math.PI) / 180;
}

function distanceMeters(a, b) {
  const latitudeDelta = toRadians(b[1] - a[1]);
  const longitudeDelta = toRadians(b[0] - a[0]);
  const latitude1 = toRadians(a[1]);
  const latitude2 = toRadians(b[1]);
  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(latitude1) * Math.cos(latitude2) * Math.sin(longitudeDelta / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(haversine));
}

function routeDistanceMeters(coordinates) {
  let total = 0;
  for (let index = 1; index < coordinates.length; index += 1) {
    total += distanceMeters(coordinates[index - 1], coordinates[index]);
  }
  return total;
}

function stripCoordinates(index) {
  const latitude = 18.6115 + index * 0.00255;
  return [
    [110.228, latitude],
    [110.258, latitude]
  ];
}

function teardropTurn(end, nextStart, altitude, eastbound) {
  const longitudeOffset = eastbound ? 0.002 : -0.002;
  return [
    [end[0] + longitudeOffset, end[1] + 0.0006, altitude],
    [end[0] + longitudeOffset, nextStart[1] - 0.0006, altitude],
    [nextStart[0], nextStart[1], altitude]
  ];
}

function buildWaypoints(uav, uavIndex, assignedStrips) {
  const base = [110.2105, 18.628 + uavIndex * 0.0017, 0];
  const loiterCenter = [110.222, 18.626 + uavIndex * 0.001, uav.transitAltitudeM];
  const waypoints = [
    base,
    [110.214, base[1] - 0.001, uav.transitAltitudeM * 0.55],
    [110.2185, loiterCenter[1], uav.maxAltitudeM]
  ];

  for (let index = 0; index <= 12; index += 1) {
    const angle = (Math.PI * 2 * index) / 12;
    waypoints.push([
      loiterCenter[0] + Math.cos(angle) * 0.0022,
      loiterCenter[1] + Math.sin(angle) * 0.0018,
      uav.transitAltitudeM
    ]);
  }

  const firstStrip = assignedStrips[0];
  waypoints.push([firstStrip[0][0], firstStrip[0][1], uav.coverageAltitudeM]);

  assignedStrips.forEach((strip, localIndex) => {
    const eastbound = localIndex % 2 === 0;
    const start = eastbound ? strip[0] : strip[1];
    const end = eastbound ? strip[1] : strip[0];
    if (localIndex === 0) {
      waypoints.push([start[0], start[1], uav.coverageAltitudeM]);
    }
    waypoints.push([end[0], end[1], uav.coverageAltitudeM]);
    if (localIndex < assignedStrips.length - 1) {
      const nextStrip = assignedStrips[localIndex + 1];
      const nextStart = eastbound ? nextStrip[1] : nextStrip[0];
      waypoints.push(...teardropTurn(end, nextStart, uav.coverageAltitudeM, eastbound));
    }
  });

  waypoints.push(
    [110.225, 18.636 + uavIndex * 0.001, uav.transitAltitudeM],
    [110.219, 18.634 + uavIndex * 0.001, uav.maxAltitudeM],
    [110.214, base[1] + 0.001, uav.transitAltitudeM * 0.4],
    base
  );
  return waypoints;
}

function resampleRoute(waypoints, speedMps, startTime) {
  const coordinates = [[...waypoints[0], startTime]];
  let timestamp = startTime;
  for (let index = 1; index < waypoints.length; index += 1) {
    const from = waypoints[index - 1];
    const to = waypoints[index];
    const steps = Math.max(1, Math.ceil(distanceMeters(from, to) / speedMps / 2));
    for (let step = 1; step <= steps; step += 1) {
      const ratio = step / steps;
      timestamp += 2;
      coordinates.push([
        from[0] + (to[0] - from[0]) * ratio,
        from[1] + (to[1] - from[1]) * ratio,
        from[2] + (to[2] - from[2]) * ratio,
        timestamp
      ]);
    }
  }
  return coordinates;
}

function round(value, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export function buildMissionArtifacts({generatedAt}) {
  const stripGeometries = Array.from({length: 12}, (_, index) => stripCoordinates(index));
  const region = {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        geometry: {
          type: "Polygon",
          coordinates: [
            [
              [110.226, 18.6095],
              [110.260, 18.6095],
              [110.260, 18.6425],
              [110.226, 18.6425],
              [110.226, 18.6095]
            ]
          ]
        },
        properties: simulationProperties(generatedAt, {
          objectName: "日月湾近岸模拟侦察任务区",
          missionStage: "任务区域",
          areaRole: "SURVEILLANCE_REGION"
        })
      }
    ]
  };

  const strips = {
    type: "FeatureCollection",
    features: stripGeometries.map((coordinates, index) => {
      const uav = UAVS[Math.floor(index / 4)];
      return {
        type: "Feature",
        geometry: {type: "LineString", coordinates},
        properties: simulationProperties(generatedAt, {
          objectName: `侦察条带 ${index + 1}`,
          stripId: index + 1,
          uav_id: uav.uavId,
          missionStage: "覆盖侦察",
          altitude_m: uav.coverageAltitudeM,
          color: uav.color
        })
      };
    })
  };

  const tripFeatures = [];
  const plannedFeatures = [];
  const uavSummaries = [];

  UAVS.forEach((uav, uavIndex) => {
    const assignedStrips = stripGeometries.slice(uavIndex * 4, uavIndex * 4 + 4);
    const waypoints = buildWaypoints(uav, uavIndex, assignedStrips);
    const coordinates = resampleRoute(waypoints, uav.speedMps, START_TIME + uavIndex * 20);
    const distanceKm = round(routeDistanceMeters(coordinates) / 1000);
    const durationMin = round((coordinates.at(-1)[3] - coordinates[0][3]) / 60, 1);
    const common = simulationProperties(generatedAt, {
      objectName: `${uav.uavId} 模拟规划航迹`,
      uav_id: uav.uavId,
      callsign: uav.callsign,
      strip_range: `${uavIndex * 4 + 1}-${uavIndex * 4 + 4}`,
      missionStage: "多阶段静态侦察任务",
      speed_mps: uav.speedMps,
      coverage_altitude_m: uav.coverageAltitudeM,
      transit_altitude_m: uav.transitAltitudeM,
      max_altitude_m: uav.maxAltitudeM,
      total_distance_km: distanceKm,
      total_duration_min: durationMin,
      start_time: coordinates[0][3],
      end_time: coordinates.at(-1)[3],
      status: "VALID",
      color: uav.color
    });

    tripFeatures.push({
      type: "Feature",
      geometry: {type: "LineString", coordinates},
      properties: common
    });
    plannedFeatures.push({
      type: "Feature",
      geometry: {
        type: "LineString",
        coordinates: coordinates.map(([longitude, latitude]) => [longitude, latitude])
      },
      properties: {...common, objectName: `${uav.uavId} 静态完整规划线`}
    });
    uavSummaries.push({
      uavId: uav.uavId,
      callsign: uav.callsign,
      stripRange: `${uavIndex * 4 + 1}-${uavIndex * 4 + 4}`,
      distanceKm,
      durationMin,
      coverageAltitudeM: uav.coverageAltitudeM,
      transitAltitudeM: uav.transitAltitudeM,
      maxAltitudeM: uav.maxAltitudeM,
      status: "VALID"
    });
  });

  const totalDistanceKm = round(
    uavSummaries.reduce((sum, uav) => sum + uav.distanceKm, 0)
  );
  const missionMakespanSec = Math.max(
    ...tripFeatures.map((feature) => feature.geometry.coordinates.at(-1)[3] - START_TIME)
  );

  return {
    region,
    strips,
    plannedRoutes: {type: "FeatureCollection", features: plannedFeatures},
    trips: {type: "FeatureCollection", features: tripFeatures},
    summary: {
      schemaVersion: "1.0",
      caseId: CASE_ID,
      name: "日月湾三维多无人机静态侦察",
      description: "三架轻型固定翼无人机在真实地理环境中协同完成模拟近岸区域侦察。",
      status: "FEASIBLE",
      demoMock: true,
      location: "海南省万宁市日月湾附近海域",
      metrics: {
        uavCount: 3,
        stripCount: 12,
        coverageRatio: 0.98,
        missionMakespanSec,
        totalDistanceKm,
        totalFuelKg: null
      },
      uavs: uavSummaries,
      notice:
        "底图和公共地理对象来自真实地图数据；任务区域、条带和无人机航迹为模拟规划数据；本演示不构成真实飞行计划或空域信息。"
    }
  };
}
