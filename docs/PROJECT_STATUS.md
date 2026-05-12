# TCG Hub — 1차 개발 완료 보고서

작성일: 2026-05-12
환경: TanStack Start v1 (Vite 7) + React 19 + Tailwind v4 + Lovable Cloud(Supabase)

---

## 1. 프로젝트 개요

여러 TCG(원피스 / 포켓몬 / 디지몬) 사용자를 대상으로 한 통합 허브 웹앱.
카드 DB · 덱 빌딩 · 컬렉션 · 전적 통계 · 커뮤니티 · 관리자 운영 도구를 제공.

- **Preview**: https://id-preview--91f6cdde-f492-45b3-be3f-4b2dc70d4752.lovable.app
- **Published**: https://tcg-hub.lovable.app

---

## 2. 기술 스택

| 영역 | 사용 기술 |
|------|-----------|
| Framework | TanStack Start v1 (SSR + Vite 7) |
| UI | React 19, Tailwind CSS v4, shadcn/ui |
| 상태/데이터 | TanStack Query, TanStack Router (loader + search params) |
| 백엔드 | Lovable Cloud (Supabase: Postgres + Auth + RLS + Edge) |
| 인증 | 이메일 + Google OAuth, RLS 기반 권한 |
| AI | Lovable AI Gateway (코치 카드용) |

---

## 3. 라우트 구성 (페이지)

### 공통 / 인증
- `/` — 대시보드 (홈)
- `/login` — 로그인 / 회원가입
- `/reset-password` — 비밀번호 재설정

### 카드 · 덱
- `/cards` — 카드 DB (검색/필터)
- `/decks` — 덱 빌더
- `/collection` — 내 컬렉션
- `/packs` — 팩 시뮬레이터

### 플레이 · 통계
- `/matches` — 전적 기록 (게임/기간 필터, 승률 추이 차트, 덱·매치업·이벤트별 통계, AI 코치)
- `/leaderboard` — 리더보드 (게임/기간/최소판수 필터, Wilson 신뢰하한)
- `/tier` — 티어 메이킹

### 커뮤니티
- `/stores` — 매장 찾기
- `/lfg` — 오프라인 매칭
- `/announcements` — 공지사항
- `/calendar` — 이벤트 캘린더

### 계정
- `/profile` — 프로필

### 관리자 전용
- `/admin` — 관리자 콘솔(권한 grant/revoke, admin 목록)
- `/admin/seed` — 시드 데이터 재생성
- `/admin/card-generator` — 카드 자동 생성
- `/admin/inspect` — 데이터 검수 화면

### 데모
- `/sandbox` — 샘플 데이터 둘러보기

---

## 4. 데이터베이스 스키마 (public)

| 테이블 | 용도 |
|--------|------|
| `profiles` | 사용자 프로필 (display_name, username, avatar) |
| `user_roles` | 권한 분리 테이블 (admin/user) — privilege escalation 방지 |
| `cards` | 카드 마스터 데이터 |
| `card_favorites` | 카드 즐겨찾기 |
| `card_reviews` | 카드 리뷰 |
| `user_collection` | 사용자별 보유 카드 |
| `decks` | 덱 정보 |
| `matches` | 전적(승/패/무, 선후공, 게임, 이벤트, 상대 정보) |
| `tier_lists` | 티어 리스트 |
| `lfg_posts` | LFG(상대 모집) 게시글 |
| `stores` | 오프라인 매장 |
| `events` | 일정/이벤트 |
| `announcements` | 공지사항 |

### 보안
- 모든 테이블 **RLS 적용**
- 관리자 권한 검증: `has_role(user_id, 'admin')` SECURITY DEFINER 함수
- 서버 함수(`createServerFn`)는 `requireSupabaseAuth` 미들웨어 + RPC 내부 재검증(이중 방어)

---

## 5. 핵심 기능 구현 현황

### 5-1. 인증 / 권한
- ✅ 이메일 / Google 로그인
- ✅ 사용자/관리자 역할 분리 (별도 테이블)
- ✅ `useIsAdmin` 훅으로 클라이언트 UI 분기
- ✅ 서버 측 권한 검증 (`src/lib/admin.functions.ts`)
- ✅ 관리자 부트스트랩(`claim_admin_if_none`)

### 5-2. 사이드바(역할 기반 UI 분리)
- 일반 사용자: 메인 / 카드 / 플레이 / 커뮤니티 / 계정
- 관리자: 위 메뉴 + **관리자 콘솔** + **더미 데이터 운영**(시드/카드 생성/데이터 검수) + 데모

### 5-3. 전적 기록 (`/matches`)
- 게임/기간 필터 (라벨 분리하여 UI 정리 완료)
- 종합 통계: 전체/선공/후공 승률, 연승 streak
- 승률 추이 차트 (일/주/월 단위)
- 덱별 · 매치업 · 이벤트 · 상대 메타 통계 (Wilson 신뢰하한 포함)
- CSV/JSON 가져오기·내보내기
- 덱 이름 정규화
- AI 코치 카드 (Lovable AI 호출)

### 5-4. 리더보드
- 게임 / 기간(7/30/90/전체) / 최소 판수 필터
- `get_leaderboard` RPC 기반

### 5-5. 더미 데이터
- 시드 마이그레이션으로 12장 카드, 컬렉션 6, 덱 2, 공지 2, 티어 1, LFG 1 생성
- 테스트 계정:
  - `admin@lovable.test / Admin123!`
  - `user1@lovable.test / User1234!`
  - `user2@lovable.test / User1234!`

---

## 6. 주요 인프라 / 라이브러리 패턴

- **Server functions**: `src/lib/*.functions.ts` (createServerFn) + `*.server.ts` 헬퍼
- **Auth fetch patch**: `src/lib/server-fn-fetch.ts` — `/_serverFn/...` 호출에 자동으로 Supabase Bearer 토큰 첨부
- **Router**: TanStack Router 파일 기반(`src/routes/`), 자동 생성된 `routeTree.gen.ts`
- **Design tokens**: `src/styles.css` (`oklch` 기반), 다크모드 지원
- **공통 컴포넌트**: `PageHeader`, `EmptyState`, `GameFilter`, shadcn UI 전체

---

## 7. 알려진 이슈 / 향후 작업

- [ ] 카드 이미지: 12장 중 4장(OP12-002~005)만 실제 이미지, 나머지 8장 placeholder
- [ ] 모바일 사이드바 동작 추가 검증 필요
- [ ] AI 코치 응답 캐싱 정책 검토
- [ ] 일정/매장/티어 페이지의 실데이터 운영 시나리오 보강

---

## 8. 1차 테스트 권장 시나리오

1. **로그인 / 권한**
   - admin / user1 각각 로그인 후 사이드바 메뉴 차이 확인
   - 비관리자가 `/admin/*` 직접 접근 시 안내 화면 노출 확인

2. **전적 기록**
   - 새 전적 추가 → 통계/차트/Streak 즉시 갱신
   - 게임·기간 필터 전환
   - CSV 내보내기/가져오기

3. **카드 / 덱 / 컬렉션**
   - 카드 검색·필터, 즐겨찾기, 컬렉션 등록
   - 덱 빌더에서 생성/저장

4. **리더보드**
   - 기간/최소판수 변경 시 결과 갱신

5. **관리자 운영**
   - 권한 grant/revoke
   - 시드 재생성, 카드 자동 생성
   - 데이터 검수 화면에서 각 테이블 카운트 확인

---

*본 문서는 `docs/PROJECT_STATUS.md`에 보관되며, `docs/COLLABORATION_GUIDE.md`와 함께 운영 기준 문서로 사용됩니다.*
