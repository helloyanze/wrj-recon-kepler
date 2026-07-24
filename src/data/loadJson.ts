export async function loadJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, {signal});
  if (!response.ok) {
    throw new Error(`加载 ${url} 失败：${response.status} ${response.statusText}`);
  }

  const raw = await response.text();
  try {
    return JSON.parse(raw) as T;
  } catch (error) {
    throw new Error(`解析 ${url} 的 JSON 失败`, {cause: error});
  }
}

function assertSafeRootRelativePath(path: string, label: string): void {
  if (
    !path.startsWith("/") ||
    path.startsWith("//") ||
    path.includes("\\") ||
    path.includes("?") ||
    path.includes("#")
  ) {
    throw new Error(`${label} 必须是同源的根相对路径`);
  }

  for (const segment of path.split("/")) {
    let decodedSegment: string;
    try {
      decodedSegment = decodeURIComponent(segment);
    } catch {
      throw new Error(`${label} 包含非法 URL 编码`);
    }
    if (
      decodedSegment === "." ||
      decodedSegment === ".." ||
      decodedSegment.includes("/") ||
      decodedSegment.includes("\\")
    ) {
      throw new Error(`${label} 不得包含路径穿越片段`);
    }
  }
}

export function rebaseDataUrl(url: string, dataBase: string): string {
  assertSafeRootRelativePath(dataBase, "dataBase");
  const base = dataBase === "/" ? "" : dataBase.replace(/\/+$/, "");

  if (url !== "/data" && !url.startsWith("/data/")) {
    return url;
  }
  assertSafeRootRelativePath(url, "data URL");

  const suffix = url.slice("/data".length);
  return `${base}${suffix}` || "/";
}
