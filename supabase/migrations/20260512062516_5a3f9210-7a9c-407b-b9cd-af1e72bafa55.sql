
-- Helper to create auth user + identity
DO $$
DECLARE
  admin_id uuid := '11111111-1111-1111-1111-111111111111';
  u1_id    uuid := '22222222-2222-2222-2222-222222222222';
  u2_id    uuid := '33333333-3333-3333-3333-333333333333';
BEGIN
  -- Insert auth.users
  INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change_token_new, email_change)
  VALUES
    ('00000000-0000-0000-0000-000000000000', admin_id, 'authenticated', 'authenticated', 'admin@lovable.test', crypt('Admin123!', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"name":"관리자"}', now(), now(), '', '', '', ''),
    ('00000000-0000-0000-0000-000000000000', u1_id, 'authenticated', 'authenticated', 'user1@lovable.test', crypt('User1234!', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"name":"루피"}', now(), now(), '', '', '', ''),
    ('00000000-0000-0000-0000-000000000000', u2_id, 'authenticated', 'authenticated', 'user2@lovable.test', crypt('User1234!', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"name":"조로"}', now(), now(), '', '', '', '')
  ON CONFLICT (id) DO NOTHING;

  -- Identities (required for email login)
  INSERT INTO auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  VALUES
    (gen_random_uuid(), admin_id, admin_id::text, jsonb_build_object('sub', admin_id::text, 'email', 'admin@lovable.test', 'email_verified', true), 'email', now(), now(), now()),
    (gen_random_uuid(), u1_id, u1_id::text, jsonb_build_object('sub', u1_id::text, 'email', 'user1@lovable.test', 'email_verified', true), 'email', now(), now(), now()),
    (gen_random_uuid(), u2_id, u2_id::text, jsonb_build_object('sub', u2_id::text, 'email', 'user2@lovable.test', 'email_verified', true), 'email', now(), now(), now())
  ON CONFLICT (provider, provider_id) DO NOTHING;

  -- Profiles
  INSERT INTO public.profiles (id, display_name, username, bio) VALUES
    (admin_id, '관리자', 'admin', '사이트 운영자입니다.'),
    (u1_id, '루피', 'luffy', '해적왕이 될 사람!'),
    (u2_id, '조로', 'zoro', '세계 제일의 검사를 노린다.')
  ON CONFLICT (id) DO UPDATE SET display_name = EXCLUDED.display_name, username = EXCLUDED.username, bio = EXCLUDED.bio;

  -- Admin role
  INSERT INTO public.user_roles (user_id, role) VALUES (admin_id, 'admin')
  ON CONFLICT (user_id, role) DO NOTHING;
END $$;

-- Cards (OP12)
INSERT INTO public.cards (code, set_code, game, name, type, rarity, image_url, attribute, power, cost, counter, colors, effect) VALUES
  ('OP12-002', 'OP12', 'optcg', '에드워드 뉴게이트', 'character', 'UC', '/cards/OP12-002.png', '특수', 6000, 5, 2000, ARRAY['red'], '흰 수염 해적단'),
  ('OP12-003', 'OP12', 'optcg', '크로커스', 'character', 'UC', '/cards/OP12-003.png', '지혜', 3000, 2, 1000, ARRAY['red'], 'KO 시: 자신의 패에서 이벤트 2장을 공개할 수 있다: 자신의 패에서 파워 3000 이하인 적색 캐릭터 카드를 1장까지 등장시킨다.'),
  ('OP12-004', 'OP12', 'optcg', '코즈키 오뎅', 'character', 'UC', '/cards/OP12-004.png', '참격', 3000, 2, 1000, ARRAY['red'], '기동 메인 / 턴 1회: 자신의 패에서 이벤트 2장을 공개할 수 있다: 이번 턴 동안, 이 캐릭터의 파워 +2000.'),
  ('OP12-005', 'OP12', 'optcg', '시키', 'character', 'C', '/cards/OP12-005.png', '참격', 10000, 8, 1000, ARRAY['red'], 'FILM/금사자 해적단')
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, image_url = EXCLUDED.image_url, power = EXCLUDED.power, cost = EXCLUDED.cost, counter = EXCLUDED.counter, effect = EXCLUDED.effect, attribute = EXCLUDED.attribute, rarity = EXCLUDED.rarity;

-- Collections
INSERT INTO public.user_collection (user_id, card_code, quantity) VALUES
  ('22222222-2222-2222-2222-222222222222', 'OP12-002', 3),
  ('22222222-2222-2222-2222-222222222222', 'OP12-003', 2),
  ('22222222-2222-2222-2222-222222222222', 'OP12-004', 4),
  ('22222222-2222-2222-2222-222222222222', 'OP12-005', 1),
  ('33333333-3333-3333-3333-333333333333', 'OP12-002', 1),
  ('33333333-3333-3333-3333-333333333333', 'OP12-004', 2)
ON CONFLICT (user_id, card_code) DO NOTHING;

-- Decks
INSERT INTO public.decks (user_id, game, name, leader, archetype, is_public, notes) VALUES
  ('22222222-2222-2222-2222-222222222222', 'optcg', '적색 흰수염 어그로', '에드워드 뉴게이트', '적색 어그로', true, '뉴게이트 중심의 빠른 압박 덱.'),
  ('33333333-3333-3333-3333-333333333333', 'optcg', '코즈키 컨트롤', '코즈키 오뎅', '적색 컨트롤', true, '이벤트 활용 컨트롤 빌드.')
ON CONFLICT DO NOTHING;

-- Announcements
INSERT INTO public.announcements (author_id, title, body, pinned) VALUES
  ('11111111-1111-1111-1111-111111111111', '🎉 사이트 오픈 안내', '카드 컬렉션·덱·티어리스트 기능을 정식 오픈했습니다. 많은 이용 부탁드립니다!', true),
  ('11111111-1111-1111-1111-111111111111', 'OP12 신규 카드 추가', '신규 부스터 OP12의 카드 데이터가 일부 등록되었습니다.', false);

-- Tier list
INSERT INTO public.tier_lists (user_id, game, title, is_public, placements) VALUES
  ('11111111-1111-1111-1111-111111111111', 'optcg', 'OP12 적색 캐릭터 티어 (운영자 픽)', true,
   '{"S":["OP12-005"],"A":["OP12-002"],"B":["OP12-004"],"C":["OP12-003"]}'::jsonb);

-- LFG sample
INSERT INTO public.lfg_posts (user_id, game, title, location, contact, body, status) VALUES
  ('22222222-2222-2222-2222-222222222222', 'optcg', '주말 강남 친선전 구해요', '서울 강남', 'DM', '토요일 오후 자유 대전 같이 하실 분!', 'open');
