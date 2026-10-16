import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.106.2';

import { birthInstant, siderealLongitude } from '../_shared/astro/ephemeris.ts';
import { type Insight, insightsFor, weekTransits } from '../_shared/astro/insights.ts';
import { HttpError, jsonResponse, requiredEnv, servePost } from '../_shared/http.ts';
import { sendPushToUser } from '../_shared/push.ts';
import { getAdminClient } from '../_shared/supabase.ts';
import { resolveUtcOffset } from '../_shared/timezone.ts';

// Run weekly by a Supabase cron job (see supabase/README.md → Astrology insights). Deployed with
// --no-verify-jwt; the caller must send `Authorization: Bearer <INSIGHTS_CRON_SECRET>`.

const PAGE_SIZE = 500;
const PUSH_CONCURRENCY = 10;
const KEEP_WEEKS = 8;
const TIME_ZONE = Deno.env.get('INSIGHTS_TIME_ZONE') ?? 'Asia/Kolkata';

type ProfileRow = {
  id: string;
  date_of_birth: string;
  time_of_birth: string;
  birth_timezone: string;
  birth_latitude: number;
  birth_longitude: number;
};

function constantTimeEqual(a: string, b: string) {
  const left = new TextEncoder().encode(a);
  const right = new TextEncoder().encode(b);
  let difference = left.length ^ right.length;
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    difference |= (left[index] ?? 0) ^ (right[index] ?? 0);
  }
  return difference === 0;
}

/** The calendar date at `at` in the insights time zone, as YYYY-MM-DD. */
function localDate(at: Date) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(at);
}

function natalMoon(profile: ProfileRow) {
  const offset = resolveUtcOffset(profile.birth_timezone, profile.date_of_birth, profile.time_of_birth);
  return siderealLongitude('Moon', birthInstant(profile.date_of_birth, profile.time_of_birth, offset));
}

async function inBatches<T>(items: T[], size: number, run: (item: T) => Promise<void>) {
  for (let index = 0; index < items.length; index += size) {
    await Promise.all(items.slice(index, index + size).map(run));
  }
}

async function eligibleProfiles(adminClient: SupabaseClient, from: number) {
  const { data, error } = await adminClient
    .from('profiles')
    .select('id, date_of_birth, time_of_birth, birth_timezone, birth_latitude, birth_longitude')
    .eq('onboarding_completed', true)
    .is('suspended_at', null)
    .not('date_of_birth', 'is', null)
    .not('time_of_birth', 'is', null)
    .not('birth_timezone', 'is', null)
    .not('birth_latitude', 'is', null)
    .not('birth_longitude', 'is', null)
    .order('id')
    .range(from, from + PAGE_SIZE - 1)
    .returns<ProfileRow[]>();
  if (error) throw error;
  return data ?? [];
}

servePost(async (request) => {
  const secret = requiredEnv('INSIGHTS_CRON_SECRET');
  const authorization = request.headers.get('Authorization') ?? '';
  if (!constantTimeEqual(authorization, `Bearer ${secret}`)) {
    throw new HttpError(401, 'Unauthorized');
  }

  const adminClient = getAdminClient();
  const start = new Date();
  const weekOf = localDate(start);
  const week = weekTransits(start);

  let profilesSeen = 0;
  let insightsStored = 0;
  let pushesSent = 0;
  let failures = 0;

  for (let from = 0; ; from += PAGE_SIZE) {
    const profiles = await eligibleProfiles(adminClient, from);
    profilesSeen += profiles.length;

    const insightsByUser = new Map<string, Insight[]>();
    for (const profile of profiles) {
      try {
        const insights = insightsFor(natalMoon(profile), week, { timeZone: TIME_ZONE });
        if (insights.length > 0) insightsByUser.set(profile.id, insights);
      } catch (error) {
        failures += 1;
        console.warn(`Insights failed for ${profile.id}`, error);
      }
    }

    const rows = [...insightsByUser].flatMap(([userId, insights]) =>
      insights.map((insight) => ({
        user_id: userId,
        week_of: weekOf,
        kind: insight.kind,
        tone: insight.tone,
        title: insight.title,
        body: insight.body,
        starts_at: insight.startsAt.toISOString(),
        ends_at: insight.endsAt?.toISOString() ?? null,
        priority: insight.priority,
      }))
    );

    if (rows.length > 0) {
      // A rerun in the same week inserts nothing new, so nobody is notified twice.
      const { data: inserted, error } = await adminClient
        .from('astro_insights')
        .upsert(rows, { onConflict: 'user_id,week_of,kind', ignoreDuplicates: true })
        .select('user_id, kind');
      if (error) throw error;
      insightsStored += inserted?.length ?? 0;

      const newlyInformed = new Set((inserted ?? []).map((row) => row.user_id as string));
      await inBatches([...newlyInformed], PUSH_CONCURRENCY, async (userId) => {
        const top = insightsByUser.get(userId)?.[0];
        if (!top) return;
        try {
          // sendPushToUser skips anyone with "Astrology reports" turned off.
          const result = await sendPushToUser(adminClient, {
            recipientUserId: userId,
            title: top.title,
            body: top.body,
            data: { type: 'insight', weekOf },
            notificationType: 'astrologyReports',
          });
          pushesSent += result.sent;
        } catch (error) {
          failures += 1;
          console.warn(`Insight push failed for ${userId}`, error);
        }
      });
    }

    if (profiles.length < PAGE_SIZE) break;
  }

  const cutoff = new Date(start.getTime() - KEEP_WEEKS * 7 * 24 * 3_600_000);
  const { error: pruneError } = await adminClient.from('astro_insights').delete().lt('week_of', localDate(cutoff));
  if (pruneError) console.warn('Pruning old insights failed', pruneError);

  return jsonResponse({ weekOf, profilesSeen, insightsStored, pushesSent, failures });
});
