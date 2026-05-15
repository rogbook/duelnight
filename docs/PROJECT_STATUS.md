# TCG Hub 프로젝트 현황

> 최종 갱신: 2026-05-15
> 목적: 협업자(특히 Antigravity)가 빠르게 프로젝트 전체를 파악하기 위한 단일 진입 문서.

---

## 1. 프로젝트 개요

- **서비스명**: TCG Hub
- **한 줄 소개**: 트레이딩 카드 게임(원피스 TCG 중심) 플레이어를 위한 통합 허브 — 카드 DB, 덱 빌더, 매칭/전적, 오프라인 모임(LFG), 매장/대회 캘린더, 티어 리스트.
- **도메인**: https://tcg-hub.lovable.app
- **타깃 게임 enum**: `optcg` 외 확장 가능 (`tcg_game`)
- **협업 모델**:
  - **Lovable**: UI, DB 마이그레이션, 패키지 설치, 배포, 디자인 시스템
  - **Antigravity**: 비즈니스 로직, 리팩토링, 복잡한 유틸/훅
  - **원칙**: 한 번에 한 곳에서만 작업. 상세는 [`COLLABORATION_GUIDE.md`](./COLLABORATION_GUIDE.md)
- **수정 금지 파일** (Lovable 자동 관리): `src/integrations/supabase/types.ts`, `src/integrations/supabase/client.ts`, `.env`, lock 파일, `supabase/config.toml`의 `project_id`

---

## 2. 기능 목록 (라우트별)

> 상태 표기: ✅ 구현 완료 · 🟡 검증 중 · 🔴 이슈/미완 · ⚪ 코드만 존재

### 2.1 공개 페이지

| 라우트 | 설명 | 상태 |
|--------|------|------|
| `/` | 홈 / 랜딩 | ✅ |
| `/announcements` | 공지사항 목록 | ✅ |
| `/announcements/:id` | 공지 상세 | ✅ |
| `/cards` | 카드 DB 목록/검색 | ✅ |
| `/cards/:code` | 카드 상세 (즐겨찾기, 리뷰) | ✅ |
| `/decks` | 공개 덱 목록 | ✅ |
| `/decks/:id` | 덱 상세 | ✅ |
| `/leaderboard` | 게임별 레이팅 랭킹 | ✅ |
| `/tier` | 티어 리스트 목록 | ✅ |
| `/tier/:id` | 티어 리스트 상세 | ✅ |
| `/calendar` | 대회/이벤트 캘린더 | ✅ |
| `/events/:id` | 이벤트 상세 | ✅ |
| `/stores` | 매장 목록 | ✅ |
| `/stores/:id` | 매장 상세 | ✅ |
| `/store` | 매장(레거시?) | ⚪ 정리 필요 |
| `/lfg` | 오프라인 매칭 모집 글 목록 | ✅ |
| `/lfg/:id` | LFG 상세 + 댓글/신청/메시지 | 🟡 댓글 신고/관리자 검토 검증 중 |
| `/packs` | 팩 정보 | ✅ |
| `/login` | 로그인/회원가입 (Google OAuth 포함) | ✅ |
| `/reset-password` | 비밀번호 재설정 | ✅ |

### 2.2 인증 필요 페이지

| 라우트 | 설명 | 상태 |
|--------|------|------|
| `/profile` | 내 프로필 편집, 게임 설정 | ✅ |
| `/collection` | 내 카드 보유 컬렉션 | ✅ |
| `/matches` | 전적 기록/조회 | ✅ |
| `/messages` | LFG 1:1 쪽지 | ✅ |
| `/notifications` | 알림함 | 🟡 트리거 미흡 |
| `/friends` | 친구 요청/관리 | ✅ |
| `/cards/upload` | 카드 제보 (검수 대기) | ✅ |

### 2.3 관리자 (admin role)

| 라우트 | 설명 | 상태 |
|--------|------|------|
| `/admin` | 관리자 대시보드 | ✅ |
| `/admin/cards` | 카드 관리 (CRUD) | ✅ |
| `/admin/cards/review` | 사용자 제보 카드 검수 | ✅ |
| `/admin/reports` | LFG 댓글 신고 처리 | 🟡 |

### 2.4 API / 시스템

| 라우트 | 설명 | 상태 |
|--------|------|------|
| `/sitemap.xml` | 사이트맵 자동 생성 | ✅ |
| `/api/coach` | AI 덱/플레이 코칭 (Lovable AI Gateway) | ✅ |
| `/api/card-ocr` | 카드 이미지 OCR (Lovable AI Gateway) | ✅ |
| `/api/drive/auth` | Google Drive OAuth 시작 | ✅ |
| `/auth/google-drive/callback` | Google Drive OAuth 콜백 | ✅ |

---

## 3. DB 스키마 요약

> 27개 테이블, 모두 RLS 활성화. 상세 정책은 Lovable Cloud 콘솔 또는 `supabase/migrations/` 참조.

### 3.1 사용자 / 인증

| 테이블 | 주요 컬럼 | 접근 권한 |
|--------|-----------|-----------|
| `profiles` | display_name, username, bio, avatar_url, primary_game | 전체 조회 / 본인만 수정 |
| `user_roles` | user_id, role(`admin`/...) | 본인 조회만. **권한 격상 방지를 위해 별도 테이블** |
| `user_credits` | balance | 본인 조회만 (서버에서만 변경) |
| `user_drive_tokens` | access_token, refresh_token, expires_at | 본인 CRUD |
| `friendships` | requester_id, addressee_id, status | 당사자만 |

### 3.2 카드 도메인

| 테이블 | 주요 컬럼 | 접근 권한 |
|--------|-----------|-----------|
| `cards` | code, name, game, type, cost/power/counter, status(`approved`/`pending`) | approved는 전체 조회 / 사용자는 pending 제보 / 관리자 CRUD |
| `card_favorites` | user_id, card_code | 본인 |
| `card_reviews` | rating(1~5), body | 전체 조회 / 본인 작성 |
| `card_audit_logs` | actor_id, action, before/after_data | 관리자 조회 (시스템 INSERT) |
| `user_collection` | card_code, quantity | 본인 |

### 3.3 덱 / 티어

| 테이블 | 주요 컬럼 | 접근 권한 |
|--------|-----------|-----------|
| `decks` | name, leader, colors, is_public | public이거나 본인 |
| `deck_cards` | deck_id, card_code, quantity | 덱 가시성에 종속 |
| `tier_lists` | title, placements(jsonb), is_public | public이거나 본인 |

### 3.4 매칭 / 전적

| 테이블 | 주요 컬럼 | 접근 권한 |
|--------|-----------|-----------|
| `matches` | result, my_deck, opp_deck, event, points_delta, opponent_user_id | 본인 + 상대 조회 |
| `user_ratings` | game, rating(기본 1000), matches_count | 전체 조회 (서버에서만 변경) |

### 3.5 LFG (오프라인 매칭)

| 테이블 | 주요 컬럼 | 접근 권한 |
|--------|-----------|-----------|
| `lfg_posts` | title, location, meet_at, category, store_id | 전체 조회 / 본인 CRUD |
| `lfg_comments` | post_id, parent_id, body | 전체 조회 / 본인 작성 / 본인 또는 글 작성자 삭제 |
| `lfg_comment_reports` | comment_id, reason, status | 본인+관리자 조회, 관리자 처리 |
| `lfg_messages` | sender, recipient, body, read_at | 송수신자만 |
| `lfg_participants` | post_id, user_id, status | 본인+게시자 |

### 3.6 이벤트 / 매장

| 테이블 | 주요 컬럼 | 접근 권한 |
|--------|-----------|-----------|
| `events` | title, kind, starts_at, store_id | 전체 조회 / 본인 CRUD |
| `event_favorites` | event_id, user_id | 본인 |
| `stores` | name, region, address, games | 전체 조회 / 관리자 CRUD |
| `store_favorites` | store_id, user_id | 본인 |

### 3.7 공지 / 알림 / 결제

| 테이블 | 주요 컬럼 | 접근 권한 |
|--------|-----------|-----------|
| `announcements` | title, body, pinned, view_count | 전체 조회 / 관리자 CRUD |
| `notifications` | type, title, body, link, read_at | 본인 조회/삭제 (INSERT는 서버 전용) |
| `payments` | provider, amount, currency, status, imp_uid | 본인 조회만 (서버에서만 기록) |

---

## 4. 기술 스택 & 아키텍처

### 4.1 프런트엔드
- **프레임워크**: TanStack Start v1 (React 19, Vite 7, SSR 지원)
- **라우팅**: 파일 기반 (`src/routes/`), `routeTree.gen.ts` 자동 생성
- **스타일**: Tailwind CSS v4 (CSS 변수 기반 디자인 시스템, `src/styles.css`)
- **컴포넌트**: shadcn/ui 기반, `src/components/`
- **상태/데이터**: TanStack Query, React Server Functions
- **모바일/데스크톱**: 반응형, manifest.json 존재 (PWA 가능)

### 4.2 백엔드 (Lovable Cloud / Supabase)
- **DB**: PostgreSQL + RLS 전면 적용
- **인증**: Supabase Auth (이메일/비밀번호 + Google OAuth)
- **권한**: `user_roles` 테이블 + `has_role(uid, role)` SECURITY DEFINER 함수 (재귀 RLS 방지)
- **서버 로직**: TanStack `createServerFn` 우선. **Edge Functions 미사용 원칙** (외부 웹훅 등 불가피한 경우만)
- **스토리지**: Supabase Storage (카드 이미지, 아바타)

### 4.3 AI / 외부 연동
- **AI**: Lovable AI Gateway (Gemini 2.5, GPT-5 계열, **API 키 불필요**)
  - 사용처: `/api/coach`, `/api/card-ocr`
- **결제**: 포트원(import) — `payments` 테이블, Webhook 연동
- **Google Drive**: 사용자별 OAuth 토큰 (`user_drive_tokens`), 카드 이미지 백업/가져오기
- **카카오톡**: LFG 게시글에 `kakao_link` 필드 (오픈채팅 등)

### 4.4 배포 / 런타임
- **호스팅**: Cloudflare Workers (workerd 런타임)
- **제약**: `child_process`, `sharp`, native binding 사용 불가. 순수 JS / Web API / WASM만 가능
- **빌드**: Lovable이 자동 수행 (수동 빌드 금지)

---

## 5. 남은 작업 / 향후 로드맵

### 5.1 단기 (현재 검증 중)
- 🟡 **LFG 댓글/신고/관리자 검토 플로우** end-to-end 안정화
  - 최근 댓글 라우팅, 카드 클릭 영역, 신고 처리 흐름 연속 수정됨
  - 신고 → `/admin/reports` 처리 → 알림 트리거 검증 필요
- 🟡 **알림(`notifications`) 트리거 보강**: 현재 INSERT 권한 없음 → 댓글/친구요청/매칭 시 서버 함수에서 자동 생성하도록 통일

### 5.2 중기 후보
- 매칭/전적 입력 UX 다듬기 (모바일 폼 길이 단축)
- 카드 검수 플로우 자동화 (OCR → 자동 채움 → 관리자 1클릭 승인)
- 결제 영수증 처리 검증 및 사용자 표시
- 친구/메시지 실시간 알림 (Realtime 채널)

### 5.3 장기
- SEO 최적화 (현재 별도 미진행. 사용자/콘텐츠 누적 후 진행)
- 다국어 지원 (i18n)
- PWA 강화 (오프라인 캐싱, 설치 유도)
- 다른 TCG 게임 확장 (`tcg_game` enum 확대)

### 5.4 기술 부채
- `docs/TODO_GOOGLE_DRIVE_PER_USER_OAUTH.md` 잔여 항목 통합
- `/store` 라우트 정리 (`/stores`와 중복?)
- 중복 컴포넌트/유틸 정리 (Antigravity 영역)

---

## 부록: 관련 문서

- [`COLLABORATION_GUIDE.md`](./COLLABORATION_GUIDE.md) — Lovable ↔ Antigravity 협업 규칙
- [`oauth-setup-guide.md`](./oauth-setup-guide.md) — Google OAuth 설정 가이드
- [`payment-integration-guide.md`](./payment-integration-guide.md) — 포트원 결제 연동
- [`payment-testing-guide.md`](./payment-testing-guide.md) — 결제 테스트
- [`TODO_GOOGLE_DRIVE_PER_USER_OAUTH.md`](./TODO_GOOGLE_DRIVE_PER_USER_OAUTH.md) — Drive 연동 TODO
