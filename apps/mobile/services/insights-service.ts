import { getSupabaseClient } from '@/lib/supabase';

export type AstroInsight = {
  id: string;
  weekOf: string;
  kind: string;
  tone: 'positive' | 'neutral' | 'caution';
  title: string;
  body: string;
  startsAt: string;
  endsAt?: string;
};

type InsightRow = {
  id: string;
  week_of: string;
  kind: string;
  tone: AstroInsight['tone'];
  title: string;
  body: string;
  starts_at: string;
  ends_at: string | null;
};

/** The latest week's insights (written weekly by the send-astro-insights function), most notable first. */
export async function getLatestInsights(): Promise<AstroInsight[]> {
  const { data, error } = await getSupabaseClient()
    .from('astro_insights')
    .select('id, week_of, kind, tone, title, body, starts_at, ends_at')
    .order('week_of', { ascending: false })
    .order('priority', { ascending: false })
    .order('starts_at', { ascending: true })
    .limit(8);
  if (error) throw error;

  const rows = (data ?? []) as InsightRow[];
  const latestWeek = rows[0]?.week_of;
  return rows
    .filter((row) => row.week_of === latestWeek)
    .map((row) => ({
      id: row.id,
      weekOf: row.week_of,
      kind: row.kind,
      tone: row.tone,
      title: row.title,
      body: row.body,
      startsAt: row.starts_at,
      endsAt: row.ends_at ?? undefined,
    }));
}
