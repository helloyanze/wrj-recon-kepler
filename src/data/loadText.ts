export async function loadText(url: string, signal?: AbortSignal): Promise<string> {
  const response = await fetch(url, {signal});
  if (!response.ok) {
    throw new Error(`加载 ${url} 失败：${response.status} ${response.statusText}`);
  }
  return response.text();
}
