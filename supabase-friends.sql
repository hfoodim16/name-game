-- Friends for The Name Game.
-- Run this once in Supabase → SQL Editor (project ref ddrsxmscyuefbkrfdzoj).
-- Model: a one-directional "follow" — you add people you want to see; profiles
-- are already public-readable, so adding someone lets you view their stats.

create table if not exists public.friends (
  user_id    uuid not null references auth.users(id) on delete cascade,
  friend_id  uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, friend_id),
  check (user_id <> friend_id)
);

alter table public.friends enable row level security;

-- You can only see, add, and remove your OWN friend rows.
create policy "friends read own"   on public.friends for select using (auth.uid() = user_id);
create policy "friends insert own" on public.friends for insert with check (auth.uid() = user_id);
create policy "friends delete own" on public.friends for delete using (auth.uid() = user_id);
