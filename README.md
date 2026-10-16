# Kundali Konnect

Monorepo for the Kundali Konnect mobile app, Supabase backend, and future admin dashboard.

Going live? Work through [`docs/production-checklist.md`](docs/production-checklist.md).

## Structure

```text
apps/
  mobile/      Expo React Native app
  admin/       Future admin dashboard
packages/      Future shared TypeScript packages
supabase/      Database migrations, config, and Edge Functions
```

## Mobile

```sh
npm install
npm run mobile:start
```

To add Supabase to the Expo app:

```sh
npm install --workspace apps/mobile @supabase/supabase-js
```

Copy `apps/mobile/.env.example` to `apps/mobile/.env` for Expo public environment variables.

## Supabase

See `supabase/README.md`.
