const LEGEND_ITEMS = [
  ["原计划未来路径", "灰色虚线", "baseline"],
  ["已锁定路径", "深灰实线", "baseline_locked"],
  ["复用路径", "青色实线", "baseline_reused"],
  ["修改路径", "橙色脉冲线", "dynamic_modified"],
  ["新增路径", "绿色实线", "dynamic_new"],
  ["取消路径", "红色淡出线", "dynamic_cancelled"]
] as const;

export function DynamicLegend() {
  return (
    <section className="task2-legend" aria-label="动态变化图例">
      <h2>变化图例</h2>
      <ul>
        {LEGEND_ITEMS.map(([label, shape, changeType]) => (
          <li key={changeType}>
            <span
              className={`task2-legend__swatch task2-legend__swatch--${changeType}`}
              aria-hidden="true"
            />
            <span>{label}</span>
            <small>{shape}</small>
          </li>
        ))}
      </ul>
    </section>
  );
}
