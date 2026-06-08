-- 특별 지정(무제한) AI 사용자 허용목록.
-- 관리자(app_role 'admin')는 코드에서 이미 무제한 처리되므로, 이 표는
-- "관리자는 아니지만 무제한으로 풀어줄 사용자"를 손으로 지정하는 용도다.
-- 적용: Lovable에서 실행 (DB는 Lovable 단독 적용 규칙).

create table if not exists public.ai_unlimited (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  note       text,
  granted_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

alter table public.ai_unlimited enable row level security;

-- 본인은 자신의 무제한 여부를 조회 가능(서버 한도 검사에서 사용)
drop policy if exists "ai_unlimited self read" on public.ai_unlimited;
create policy "ai_unlimited self read"
  on public.ai_unlimited
  for select
  using (auth.uid() = user_id);

-- 관리자는 전체 조회/추가/삭제 가능
drop policy if exists "ai_unlimited admin all" on public.ai_unlimited;
create policy "ai_unlimited admin all"
  on public.ai_unlimited
  for all
  using (public.has_role(_role => 'admin'::public.app_role, _user_id => auth.uid()))
  with check (public.has_role(_role => 'admin'::public.app_role, _user_id => auth.uid()));
