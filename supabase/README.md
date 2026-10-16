# Supabase Backend

This directory stores the repo-side Supabase backend for Kundali Konnect.

## Structure

- `config.toml` - local Supabase CLI configuration.
- `migrations/` - Postgres schema, indexes, and RLS policies.
- `functions/` - Edge Function source for server-side business logic.

## Setup

1. Create a Supabase project in the dashboard.
2. Copy root `.env.example` to `.env` for backend/API secrets.
3. Copy `apps/mobile/.env.example` to `apps/mobile/.env` for Expo public Supabase variables.
4. Enable Phone Auth in Supabase Auth providers.
5. Configure an SMS provider before testing real phone OTP.
6. Link and deploy from this repo:

```sh
supabase link --project-ref your-project-ref
supabase db push
supabase functions deploy generate-kundli
supabase functions deploy generate-match-score
supabase functions deploy create-like
supabase functions deploy reply-to-like
supabase functions deploy send-chat-message
supabase functions deploy send-push-notification --no-verify-jwt
supabase functions deploy create-checkout
supabase functions deploy confirm-checkout
supabase functions deploy payment-webhook --no-verify-jwt
supabase functions deploy delete-account
```

Or run `npm run supabase:db:push` and `npm run supabase:functions:deploy` from the repo root.

## How the backend is put together

- **Reads go straight to Postgres.** The app reads through RLS-protected tables and a few
  `security invoker` SQL functions that return everything a screen needs in one round trip:
  `get_discover_profiles`, `get_incoming_likes`, `get_chat_previews`. Public profile data comes
  from the `profile_cards` view, which hides fields a user marked as not visible.
- **Writes with side effects go through Edge Functions** (`generate-kundli`,
  `generate-match-score`, `create-like`, `reply-to-like`, `send-chat-message`). They calculate
  Kundlis and match scores, spend credits, and send push notifications in the background after
  responding. Multi-step writes (`reply_to_like`, `send_chat_message`) are single SQL
  transactions.
- **Shared Edge Function code** lives in `functions/_shared/` (HTTP helpers, auth, push).
- **Realtime:** `messages`, `likes` and `chat_participants` are in the `supabase_realtime`
  publication. The app subscribes once per session (`hooks/use-realtime-sync.ts`); Realtime
  applies each subscriber's RLS policies.

## Security model

- **Profiles are owner-only.** `profiles` and `profile_photos` can only be read by their owner.
  Everyone else sees `profile_cards`, which returns an age instead of the birth date and never
  phone, email, birth time/place or coordinates. Cards are visible for completed, discoverable
  profiles and between people connected through a like.
- **Server-controlled columns.** Direct API writes cannot change a profile's phone,
  verification status, Kundli status or discoverability (`protect_profile_columns` trigger);
  discoverability follows `user_settings`.
- **Birth details are locked after onboarding.** Once `onboarding_completed` is true, direct
  API writes keep the stored birth date, time, place, coordinates and timezone (and onboarding
  can't be reset). The Kundli and every match score depend on them. Support can still correct
  them with the service role.
- **Adults only.** The same trigger refuses an app write that sets a date of birth under 18
  years (or finishes onboarding without one); `latest_adult_birth_date()` gives the cutoff,
  using the earliest time zone so nobody is refused on their 18th birthday. The service role
  isn't checked.
- **No direct writes to server-owned tables.** Likes are created only by `create-like` (which
  charges a credit and needs a match score); recipients may only move a pending like to
  `dismissed`. Messages are written only by `send_chat_message` / `reply_to_like` (max 2000
  characters; opening messages max 300).
- **Credits** are spent and refunded only by the Edge Functions through
  `spend_user_credit` / `refund_credit_transaction` (service role). Spends are serialised per
  user, so concurrent requests cannot overdraw a balance. Credits and subscriptions are only
  granted by `fulfill_payment_order` after a verified payment.
- **Signed-out requests** have no access to tables or functions in `public`.
- **Edge Functions** validate ids and message lengths, and only allow scoring or liking
  profiles that are discoverable or already connected.

## Safety and moderation

- **Block** (`block_user`): the two people disappear from each other's Discover, Likes and Chats
  (enforced in `profile_cards`, which every screen reads), any chat between them is deleted and
  pending likes are dismissed. `unblock_user` / `get_blocked_users` back the Settings list.
- **Report** (`report_user`): stores the reason, optional details and an evidence snapshot (the
  reported profile, the last 50 messages between them and any opening message) in
  `user_reports`, then blocks unless the reporter turned that off. One report per pair per day;
  at most 20 reports per reporter per day. Only the service role can read reports.
- **Unmatch** (`unmatch_chat`) ends a chat for both; **Hide** (`set_chat_hidden`) is per user.
- **Account deletion**: the `delete-account` Edge Function (requires `{ "confirm": "DELETE" }`)
  removes the user's Storage folders, their chats (`delete_user_account_data`) and the auth user;
  the rest cascades. Reports keep their evidence with the user references set to null.

### Reviewing reports

Open reports, newest first (SQL editor):

```sql
select r.id, r.created_at, r.reason, r.details, r.reported_user_id, p.display_name,
       (select count(*) from public.user_reports x
        where x.reported_user_id = r.reported_user_id and x.status = 'open') as open_reports,
       r.evidence
from public.user_reports r
left join public.profiles p on p.id = r.reported_user_id
where r.status = 'open'
order by r.created_at desc;
```

Acting on a report:

```sql
-- Suspend: hidden from everyone, can't message or like (reversible: set back to null).
update public.profiles set suspended_at = now() where id = '<reported user id>';

-- Record the outcome.
update public.user_reports
set status = 'actioned', reviewed_at = now(), reviewer_note = 'Suspended for scam messages'
where reported_user_id = '<reported user id>' and status = 'open';
```

For serious cases (e.g. a minor, threats), delete the account from Authentication → Users and
clear its Storage folders. Use `status = 'dismissed'` for reports that need no action.

## Birth timezones

`profiles.birth_timezone` holds the IANA zone detected from the birthplace's coordinates in the
app (e.g. `Asia/Kolkata`), or a fixed UTC offset in hours (`5.5`) for older profiles and manual
overrides. `_shared/timezone.ts` turns it into the offset in force at the birth date and time
(daylight saving and historical changes included, e.g. UTC+6:30 in India in 1942-45), which
converts the birth time to UTC in both `generate-kundli` and `generate-match-score`.

## Astrology engine

Kundlis and match scores are calculated inside the Edge Functions (`functions/_shared/astro/`);
there is no third-party astrology API, key or per-call cost.

- **Positions** (`ephemeris.ts`): [astronomy-engine](https://github.com/cosinekitty/astronomy)
  (MIT, pure TypeScript, no data files) gives the apparent Sun, Moon and planet positions; the
  ascendant comes from local sidereal time; Rahu is the mean lunar node (Ketu opposite); the
  ayanamsa is Lahiri (same definition as the Swiss Ephemeris' `SE_SIDM_LAHIRI`). Checked against
  the Swiss Ephemeris over 400 random charts from 1930–2010: planets within 20", the Moon within
  5", the ascendant within 1" (`tests/astro_test.ts` keeps reference charts as fixtures).
- **Kundli** (`kundli.ts`): sun/moon/ascendant signs, nakshatra and pada, varna, vashya, yoni,
  gana, nadi, tithi, yoga, karana, name syllable, Manglik (Mars in houses 1, 2, 4, 7, 8 or 12
  from the lagna and/or Moon), Kaal Sarp, and a few sign-based yogas (Gajakesari, Budhaditya,
  Chandra-Mangala, Pancha Mahapurusha). `kundlis.chart_houses` holds the D1 and D9 (navamsa)
  layouts with whole-sign houses from the ascendant, which the app draws; `raw_response` holds the
  details shown as badges and `chart_raw_responses` every planet's position. No chart images are
  generated any more (older Kundlis' images still display).
- **Matching** (`ashtakoota.ts`): North Indian Ashtakoota / Guna Milan out of 36, plus Nadi,
  Bhakoot and Manglik-mismatch doshas and a plain-language report. Traditions differ on a few
  tables; this uses element-based Varna, the common symmetric Vashya table and the Saravali Gana
  table. Change them there if your astrologer prefers another school.
- `KUNDLI_ENGINE_VERSION` is part of each Kundli's `input_signature`; bump it after changing the
  calculation and every Kundli is rebuilt on its next request. Stored match scores are kept.

## Payments

Checkout is provider-agnostic:

1. The app calls `create-checkout` with a product (`credit_pack` / `subscription` + id). The
   price comes from `credit_packs` / `subscription_plans`, never from the app, and is
   snapshotted into `payment_orders`.
2. The server creates the order with the active provider and returns what the app needs.
3. The app's checkout adapter for that provider shows the payment UI
   (`apps/mobile/services/checkout/`).
4. The app sends the result to `confirm-checkout`; the provider verifies it server-side and
   `fulfill_payment_order` grants credits or the subscription. Providers with webhooks
   (Razorpay) also call `payment-webhook`, and fulfilment is idempotent, so the two paths can
   race safely.

Server code: `functions/_shared/payments/` (`types.ts` is the provider interface).

### Providers

| `PAYMENT_PROVIDER` | Use | Secrets |
|---|---|---|
| `dummy` (default) | Development and testing. The app shows a "Test payment" prompt; no money moves. | `PAYMENTS_ALLOW_DUMMY=true` (otherwise purchases are disabled) |
| `razorpay` | Production | `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` |

```sh
supabase secrets set PAYMENT_PROVIDER=dummy PAYMENTS_ALLOW_DUMMY=true
```

### Switching to Razorpay

1. In the Razorpay dashboard, create API keys and a webhook pointing to
   `https://<project-ref>.supabase.co/functions/v1/payment-webhook?provider=razorpay` with the
   events `payment.captured`, `order.paid` and `payment.failed`.
2. Set the secrets and switch the provider (and stop allowing the dummy):
   ```sh
   supabase secrets set PAYMENT_PROVIDER=razorpay RAZORPAY_KEY_ID=rzp_... \
     RAZORPAY_KEY_SECRET=... RAZORPAY_WEBHOOK_SECRET=...
   supabase secrets unset PAYMENTS_ALLOW_DUMMY
   ```
3. In the app: `npx expo install react-native-razorpay`, register the adapter in
   `apps/mobile/services/checkout/index.ts` (the exact lines are in the comment there) and
   ship a new build.
4. Test with Razorpay test-mode keys first; switch to live keys when ready.

Prices are placeholders: edit `credit_packs` and `subscription_plans.price_minor` (in paise).

Edge Function tests (payments, guards, push): `npm run supabase:functions:test` (needs Deno).

### After deploying

`spend_credit(text)` remains only so Edge Functions deployed before the lockdown migration keep
working during the rollout. Once the current functions are deployed it can be dropped.

## Social sign-in (Google, Meta, Apple)

The app signs in with Supabase-hosted OAuth in an in-app browser (`apps/mobile/services/auth/`),
so a provider works as soon as it is enabled in Supabase; no native SDK is required. Buttons
appear on the welcome screen only for providers listed in the app's
`EXPO_PUBLIC_SOCIAL_AUTH_PROVIDERS` (e.g. `google,facebook`).

**Redirect URLs** (Authentication → URL Configuration → Redirect URLs): add
`kundalikonnect://auth/callback`, plus `exp://<your-dev-machine>:8081/--/auth/callback` when
testing in Expo Go. The provider consoles below always redirect to Supabase, never to the app.

**Google**
1. Google Cloud Console → APIs & Services → Credentials → Create OAuth client ID → *Web
   application*. Authorized redirect URI: `https://<project-ref>.supabase.co/auth/v1/callback`.
2. Supabase → Authentication → Providers → Google: paste the client ID and secret, enable.
3. Optional native account picker: also create Android/iOS client IDs, add the web client ID to
   "Authorized Client IDs" in the Supabase Google provider, and follow the steps in
   `apps/mobile/services/auth/index.ts`.

**Meta (Facebook)**
1. developers.facebook.com → Create app → add *Facebook Login*. Valid OAuth Redirect URI:
   `https://<project-ref>.supabase.co/auth/v1/callback`. Request the `email` permission.
2. Supabase → Authentication → Providers → Facebook: paste the App ID and App Secret, enable.
3. Switch the Meta app to *Live* before release (in development mode only app roles can log in).

**Apple** (needed for the iOS App Store if Google/Meta sign-in ships: guideline 4.8)
1. Apple Developer → Identifiers: create a Services ID with Sign in with Apple, return URL
   `https://<project-ref>.supabase.co/auth/v1/callback`; create a Sign in with Apple key.
2. Supabase → Authentication → Providers → Apple: fill in the Services ID, team, key, enable.
3. Add `apple` to `EXPO_PUBLIC_SOCIAL_AUTH_PROVIDERS`.

Notes:
- A social account and a phone account are separate users. Supabase links identities
  automatically only when they share a verified email, and phone sign-ups have none.
- New social users get their name and email prefilled in onboarding. If the email is already
  used by another profile, the profile is created without it.

## Recommended project settings

- **Asymmetric JWT signing keys** (Dashboard → Project Settings → JWT Keys). The Edge Functions
  verify tokens with `auth.getClaims()`, which checks them locally when asymmetric keys are
  enabled and otherwise falls back to a request to the Auth server.
- **Realtime** must be enabled for the project (it is by default).
