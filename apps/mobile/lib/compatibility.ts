import type { CompatibilityResult } from '@/constants/mock-data';

export function realCompatibilityScore(value: unknown): number | null {
  if (!value || typeof value !== 'object') return null;
  const score = (value as { overallScore?: unknown }).overallScore;
  return typeof score === 'number' && Number.isFinite(score) && score >= 0 && score <= 100 ? score : null;
}

/** Legacy empty JSON is unavailable, rather than a zero or a fabricated report. */
export function realCompatibility(value: unknown): CompatibilityResult | null {
  if (!value || typeof value !== 'object') return null;
  const report = value as Partial<CompatibilityResult>;
  if (!report.id || !report.generatedAt || !Number.isFinite(Date.parse(report.generatedAt))
    || typeof report.overallScore !== 'number' || !Number.isFinite(report.overallScore)
    || report.overallScore < 0 || report.overallScore > 100) return null;
  return {
    id: report.id, generatedAt: report.generatedAt, overallScore: report.overallScore,
    summary: typeof report.summary === 'string' ? report.summary : '',
    yogas: Array.isArray(report.yogas) ? report.yogas.filter((item) => typeof item === 'string') : [],
    doshas: Array.isArray(report.doshas) ? report.doshas.filter((item) => typeof item === 'string') : [],
    breakdown: Array.isArray(report.breakdown) ? report.breakdown.filter((item) => item && typeof item.label === 'string'
      && Number.isFinite(item.value) && item.value >= 0 && item.value <= 100) : [],
    raw: report.raw,
  };
}
