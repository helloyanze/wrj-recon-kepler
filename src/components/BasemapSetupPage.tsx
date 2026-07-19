interface BasemapSetupPageProps {
  error?: string | null;
  onRetry?: () => void;
}

export function BasemapSetupPage({error, onRetry}: BasemapSetupPageProps) {
  if (!error) {
    return (
      <main className="basemap-setup-page" aria-live="polite">
        <section className="basemap-setup-card">
          <span className="spinner" />
          <p>正在准备地图底图…</p>
        </section>
      </main>
    );
  }

  return (
    <main className="basemap-setup-page">
      <section className="basemap-setup-card" aria-labelledby="basemap-setup-title">
        <span className="eyebrow">WRJ · 地图配置检查</span>
        <h1 id="basemap-setup-title">底图配置失败</h1>
        <p>{error}</p>
        <button type="button" onClick={onRetry}>重新加载底图</button>
      </section>
    </main>
  );
}
