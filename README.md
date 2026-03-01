# ScholarSync

Calendar + assignments + course planning with AI assistant, local persistence, and optional account cloud sync.

## Local Setup
Prerequisites: Node.js 20+

1. Install deps:
`npm install`
2. Create env file:
`cp .env.example .env.local`
3. Fill values in `.env.local`:
- `VITE_GEMINI_API_KEY`
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
4. Run:
`npm run dev`

## Cloud Save Setup (Supabase)
Create table + row-level security policies in Supabase SQL Editor:

```sql
create table if not exists public.planner_states (
  user_id uuid primary key references auth.users(id) on delete cascade,
  state jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.planner_states enable row level security;

create policy "select own planner state"
on public.planner_states
for select
to authenticated
using (auth.uid() = user_id);

create policy "insert own planner state"
on public.planner_states
for insert
to authenticated
with check (auth.uid() = user_id);

create policy "update own planner state"
on public.planner_states
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
```

Then in Supabase Auth:
- Enable Email/Password provider.
- If desired for easier testing, disable email confirmation.

## Public Deploy (Vercel)
1. Push this repo to GitHub.
2. In Vercel, import the repo.
3. Framework preset: `Vite`.
4. Build command: `npm run build`.
5. Output directory: `dist`.
6. Add project env vars in Vercel:
- `VITE_GEMINI_API_KEY`
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
7. Deploy.

After deploy:
- In Supabase, add your Vercel URL to Auth allowed URLs as needed.
- Sign in from the app's Account page and confirm sync status is `Synced`.

## Security
- Never use Supabase `service_role` in frontend env vars.
- Rotate keys immediately if they were exposed in screenshots, chat, or commits.
