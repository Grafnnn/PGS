import type { RiskLevel } from "./types";

export function scoreToRiskLevel(score: number): RiskLevel {
  if (score >= 80) return "critical";
  if (score >= 60) return "high";
  if (score >= 35) return "medium";
  return "low";
}

export function riskWeight(level: RiskLevel) {
  return { low: 1, medium: 2, high: 3, critical: 4 }[level];
}

export function maxRiskLevel(levels: RiskLevel[]): RiskLevel {
  return levels.sort((a, b) => riskWeight(b) - riskWeight(a))[0] ?? "low";
}
