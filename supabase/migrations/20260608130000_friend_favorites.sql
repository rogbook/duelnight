-- 친구 즐겨찾기(비공개). 즐겨찾기한 친구를 목록 상단에 고정 표시.
-- "등록한 사실을 상대는 알 수 없음" → 본인만 접근(RLS).
-- 적용: Lovable에서 실행.

create table if not exists public.friend_favorites (
  user_id uuid not null references auth.users(id) on delete cascade,
  favorite_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, favorite_id)
);

alter table public.friend_favorites enable row level security;

drop policy if exists "friend_favorites self" on public.friend_favorites;
create policy "friend_favorites self" on public.friend_favorites
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
