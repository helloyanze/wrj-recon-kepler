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
