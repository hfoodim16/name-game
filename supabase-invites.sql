-- Game invites for The Name Game.
-- Run this once in Supabase → SQL Editor (project ref ddrsxmscyuefbkrfdzoj).
-- When you tap "Invite to a game" on a friend's profile, the app creates an
-- online room and drops a row here addressed to that friend. Their app polls
-- this table and shows a "Join" banner. Rows are deleted once acted on.

create table if not exists public.game_invites (
  id            uuid primary key default gen_random_uuid(),
  from_user_id  uuid not null references auth.users(id) on delete cascade,
  from_username text,
  to_user_id    uuid not null references auth.users(id) on delete cascade,
  code          text not null,
  created_at    timestamptz not null default now()
);

create index if not exists game_invites_to_idx on public.game_invites (to_user_id, created_at desc);

alter table public.game_invites enable row level security;

-- You can send invites as yourself, and see/clear invites on either end.
create policy "invites insert own"  on public.game_invites for insert with check (auth.uid() = from_user_id);
create policy "invites read mine"   on public.game_invites for select using (auth.uid() = to_user_id or auth.uid() = from_user_id);
create policy "invites delete mine" on public.game_invites for delete using (auth.uid() = to_user_id or auth.uid() = from_user_id);
