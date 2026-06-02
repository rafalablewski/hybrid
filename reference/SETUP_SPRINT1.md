# Sprint 1 setup — turn on real auth + database

The code is in place and **guarded**: with no Supabase keys the app runs on the
demo session, so the live site keeps working. Add the keys below and it flips to
real Supabase auth (Apple · Google · email) with zero code changes.

## 1. Create a Supabase project
1. supabase.com → New project. Save the database password.
2. **Settings → API**: copy `Project URL` and the `anon public` key, and the
   `service_role` key.
3. **Settings → Database → Connection string**: copy the **pooled** (port 6543)
   and **direct** (port 5432) strings.

## 2. Set environment variables
Copy `.env.example` → `.env` and fill in the values. Set the **same** variables
in **Vercel → Project → Settings → Environment Variables** (then redeploy — the
`NEXT_PUBLIC_*` ones are inlined at build time, so a rebuild is required).

## 3. Run the database migration
Prisma is already wired into `apps/web` (deps, schema path, client singleton at
`apps/web/lib/db.ts`, and `prisma generate` runs on build). So:
```bash
cd /path/to/hybrid
pnpm install                          # generates the Prisma client
pnpm --filter @hybrid/web db:migrate  # prisma migrate dev (prompts for a name)
```
This creates the `User`, `CoachLink`, `CoachNote`, `Session`, `Macrocycle`,
`Biometric`, `Plan` tables from `prisma/schema.prisma`. `DIRECT_URL` (port 5432)
must be set for migrations; `DATABASE_URL` (pooled) is what the app uses.

Your project URL is already known: `https://hgufkvwccodogieqygyy.supabase.co`.

## 4. Enable auth providers (Supabase → Authentication → Providers)
- **Email**: on by default — good for your first real login.
- **Google**: create an OAuth client in Google Cloud, paste client ID/secret.
- **Apple**: requires the Apple Developer Program ($99/yr); create a Services ID
  + key. *Apple sign-in is mandatory once you offer Google login.*
- **Redirect URL** for OAuth: add `https://YOUR-DOMAIN/auth/callback` (and
  `http://localhost:3000/auth/callback` for local). The handler already exists at
  `apps/web/app/auth/callback/route.ts`.

## 5. Make yourself an admin
After your first sign-in, set your role in the Supabase SQL editor:
```sql
update auth.users
set raw_user_meta_data = raw_user_meta_data || '{"role":"admin"}'
where email = 'you@email.com';
```
(Role moves to the Prisma `User` row as the source of truth once the
`/api/me` route is wired — the next backend step.)

## What's already wired
- `lib/supabase/client.ts` / `server.ts` — browser + server Supabase clients
- `lib/session.tsx` — hydrates from Supabase when configured, else demo
- `app/login/page.tsx` — real Apple/Google/email when configured
- `app/auth/callback/route.ts` — OAuth code exchange
- `prisma/schema.prisma` — the full data model + RLS intent

## Still to do (next backend pass, best done against the live project)
- Prisma client singleton + `/api/me` (role from the DB, not metadata)
- RLS policies in Supabase enforcing the coach/client/admin rules
- API routes for Session/Macrocycle/Biometric that both clients call
