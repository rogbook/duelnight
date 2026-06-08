-- 1:1 다이렉트 메시지(DM) + 차단/신고 + 알림/실시간
-- 적용: Lovable에서 실행. (DB는 Lovable 단독 적용 규칙)
-- 설계: 1:1 대화는 (user_lo < user_hi) 정규화로 중복 방지. 읽음표시는 대화행의 read_at_*.

-- ── 대화방 ─────────────────────────────────────────────
create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  user_lo uuid not null references auth.users(id) on delete cascade,
  user_hi uuid not null references auth.users(id) on delete cascade,
  last_message text,
  last_message_at timestamptz not null default now(),
  last_sender_id uuid,
  read_at_lo timestamptz not null default now(),
  read_at_hi timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint conversations_user_order check (user_lo < user_hi),
  constraint conversations_unique unique (user_lo, user_hi)
);
create index if not exists conversations_user_lo_idx on public.conversations(user_lo, last_message_at desc);
create index if not exists conversations_user_hi_idx on public.conversations(user_hi, last_message_at desc);

-- ── 메시지 ─────────────────────────────────────────────
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 4000),
  created_at timestamptz not null default now()
);
create index if not exists messages_conversation_idx on public.messages(conversation_id, created_at);

-- ── 차단 / 신고 ────────────────────────────────────────
create table if not exists public.user_blocks (
  blocker_id uuid not null references auth.users(id) on delete cascade,
  blocked_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id)
);
create table if not exists public.user_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references auth.users(id) on delete cascade,
  reported_id uuid not null references auth.users(id) on delete cascade,
  conversation_id uuid references public.conversations(id) on delete set null,
  reason text,
  created_at timestamptz not null default now()
);

-- ── RLS ────────────────────────────────────────────────
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.user_blocks enable row level security;
alter table public.user_reports enable row level security;

drop policy if exists "conv read" on public.conversations;
create policy "conv read" on public.conversations for select
  using (auth.uid() = user_lo or auth.uid() = user_hi);
drop policy if exists "conv update" on public.conversations;
create policy "conv update" on public.conversations for update
  using (auth.uid() = user_lo or auth.uid() = user_hi);

drop policy if exists "msg read" on public.messages;
create policy "msg read" on public.messages for select
  using (exists (
    select 1 from public.conversations c
    where c.id = conversation_id and (c.user_lo = auth.uid() or c.user_hi = auth.uid())
  ));
drop policy if exists "msg insert" on public.messages;
create policy "msg insert" on public.messages for insert
  with check (
    sender_id = auth.uid()
    and exists (
      select 1 from public.conversations c
      where c.id = conversation_id and (c.user_lo = auth.uid() or c.user_hi = auth.uid())
    )
    -- 차단 관계(양방향)면 전송 불가
    and not exists (
      select 1 from public.user_blocks b, public.conversations c
      where c.id = conversation_id
        and ((b.blocker_id = c.user_lo and b.blocked_id = c.user_hi)
          or (b.blocker_id = c.user_hi and b.blocked_id = c.user_lo))
    )
  );

drop policy if exists "blocks self" on public.user_blocks;
create policy "blocks self" on public.user_blocks for all
  using (auth.uid() = blocker_id) with check (auth.uid() = blocker_id);

drop policy if exists "reports insert" on public.user_reports;
create policy "reports insert" on public.user_reports for insert
  with check (auth.uid() = reporter_id);
drop policy if exists "reports self read" on public.user_reports;
create policy "reports self read" on public.user_reports for select
  using (auth.uid() = reporter_id);

-- ── DM 시작(없으면 생성). 차단 검사 포함 ───────────────
create or replace function public.start_dm(_other uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  _me uuid := auth.uid();
  _lo uuid;
  _hi uuid;
  _id uuid;
begin
  if _me is null then raise exception '로그인이 필요합니다'; end if;
  if _other is null or _other = _me then raise exception '대상이 올바르지 않습니다'; end if;
  if exists (
    select 1 from public.user_blocks
    where (blocker_id = _me and blocked_id = _other)
       or (blocker_id = _other and blocked_id = _me)
  ) then
    raise exception '차단된 사용자와는 대화할 수 없습니다';
  end if;
  if _me < _other then _lo := _me; _hi := _other; else _lo := _other; _hi := _me; end if;
  select id into _id from public.conversations where user_lo = _lo and user_hi = _hi;
  if _id is null then
    insert into public.conversations(user_lo, user_hi) values (_lo, _hi) returning id into _id;
  end if;
  return _id;
end;
$$;
grant execute on function public.start_dm(uuid) to authenticated;

-- ── 읽음 표시 ──────────────────────────────────────────
create or replace function public.mark_dm_read(_conversation uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare _me uuid := auth.uid();
begin
  update public.conversations
    set read_at_lo = case when user_lo = _me then now() else read_at_lo end,
        read_at_hi = case when user_hi = _me then now() else read_at_hi end
    where id = _conversation and (user_lo = _me or user_hi = _me);
end;
$$;
grant execute on function public.mark_dm_read(uuid) to authenticated;

-- ── 메시지 삽입 시: 대화 요약 갱신 + 수신자 알림 ───────
create or replace function public.on_message_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  _lo uuid;
  _hi uuid;
  _recipient uuid;
begin
  select user_lo, user_hi into _lo, _hi from public.conversations where id = new.conversation_id;
  _recipient := case when new.sender_id = _lo then _hi else _lo end;

  update public.conversations
    set last_message = new.body,
        last_message_at = new.created_at,
        last_sender_id = new.sender_id,
        read_at_lo = case when new.sender_id = user_lo then new.created_at else read_at_lo end,
        read_at_hi = case when new.sender_id = user_hi then new.created_at else read_at_hi end
    where id = new.conversation_id;

  if not exists (
    select 1 from public.user_blocks
    where blocker_id = _recipient and blocked_id = new.sender_id
  ) then
    insert into public.notifications(user_id, type, title, body, link)
    values (_recipient, 'dm', '새 메시지', left(new.body, 120), '/messages/' || new.conversation_id::text);
  end if;

  return new;
end;
$$;
drop trigger if exists trg_on_message_insert on public.messages;
create trigger trg_on_message_insert after insert on public.messages
  for each row execute function public.on_message_insert();

-- ── 실시간 ─────────────────────────────────────────────
alter publication supabase_realtime add table public.messages;
alter publication supabase_realtime add table public.conversations;
