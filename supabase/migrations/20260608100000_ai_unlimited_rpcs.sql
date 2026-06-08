-- AI 무제한 허용목록(ai_unlimited) 관리용 RPC. 관리자 전용.
-- 이메일 → user_id 해석은 auth.users 접근이 필요하므로 SECURITY DEFINER.
-- 기존 grant_admin_by_email / list_admins 패턴과 동일.
-- 적용: Lovable에서 실행.

-- 이메일로 AI 무제한 부여
create or replace function public.grant_ai_unlimited_by_email(_email text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  _target uuid;
begin
  if not public.has_role(_role => 'admin'::public.app_role, _user_id => auth.uid()) then
    raise exception '관리자만 호출할 수 있어요';
  end if;

  select id into _target from auth.users where lower(email) = lower(_email) limit 1;
  if _target is null then
    raise exception '해당 이메일의 사용자를 찾을 수 없어요';
  end if;

  insert into public.ai_unlimited (user_id, granted_by, note)
  values (_target, auth.uid(), null)
  on conflict (user_id) do nothing;

  return _target;
end;
$$;

-- 이메일로 AI 무제한 해제
create or replace function public.revoke_ai_unlimited_by_email(_email text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  _target uuid;
begin
  if not public.has_role(_role => 'admin'::public.app_role, _user_id => auth.uid()) then
    raise exception '관리자만 호출할 수 있어요';
  end if;

  select id into _target from auth.users where lower(email) = lower(_email) limit 1;
  if _target is null then
    raise exception '해당 이메일의 사용자를 찾을 수 없어요';
  end if;

  delete from public.ai_unlimited where user_id = _target;
  return _target;
end;
$$;

-- AI 무제한 사용자 목록 (이메일/이름 포함)
create or replace function public.list_ai_unlimited()
returns table (user_id uuid, email text, display_name text, granted_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.has_role(_role => 'admin'::public.app_role, _user_id => auth.uid()) then
    raise exception '관리자만 호출할 수 있어요';
  end if;

  return query
    select a.user_id, u.email::text, p.display_name, a.created_at
    from public.ai_unlimited a
    join auth.users u on u.id = a.user_id
    left join public.profiles p on p.id = a.user_id
    order by a.created_at desc;
end;
$$;

grant execute on function public.grant_ai_unlimited_by_email(text) to authenticated;
grant execute on function public.revoke_ai_unlimited_by_email(text) to authenticated;
grant execute on function public.list_ai_unlimited() to authenticated;
