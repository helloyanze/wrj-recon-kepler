export function cameraTransitionDuration(durationMs: number): number {
  const reducedMotion = typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  return reducedMotion ? 0 : durationMs;
}
