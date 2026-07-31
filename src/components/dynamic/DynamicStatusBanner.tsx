import type {
  MissionViewV1
} from "../../features/dynamic-replanning/missionViewSchema";

export interface DynamicStatusBannerProps {
  status: MissionViewV1["activePlan"]["planStatus"];
}

export function DynamicStatusBanner({
  status
}: DynamicStatusBannerProps) {
  if (status === "PARTIAL_SAFE_FALLBACK") {
    return (
      <section
        className="task2-status task2-status--fallback"
        role="status"
      >
        <strong>安全回退</strong>
        <span>不是完整方案</span>
      </section>
    );
  }
  if (status === "FAILED") {
    return (
      <section className="task2-status task2-status--failed" role="alert">
        <strong>方案失败</strong>
        <span>未发布可执行的新方案</span>
      </section>
    );
  }
  return (
    <section className="task2-status task2-status--complete" role="status">
      <strong>方案已发布</strong>
      <span>动态重规划完成</span>
    </section>
  );
}
