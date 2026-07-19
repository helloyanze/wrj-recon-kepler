export function TokenMissingPage() {
  return (
    <main className="token-page">
      <section className="token-card" aria-labelledby="token-title">
        <span className="eyebrow">WRJ · 地图配置检查</span>
        <h1 id="token-title">缺少 Mapbox Token</h1>
        <p>三维工作台需要有效的 Mapbox 访问令牌才能加载真实底图。</p>
        <ol>
          <li>在项目根目录创建 <code>.env.local</code></li>
          <li>写入 <code>VITE_MAPBOX_TOKEN=你的令牌</code></li>
          <li>重新启动开发服务器</li>
        </ol>
        <p className="token-note">令牌只从环境变量读取，不会写入源码或算例数据。</p>
      </section>
    </main>
  );
}
