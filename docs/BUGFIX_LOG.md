# 버그 수정 이력 (BUGFIX LOG)

> **목적**: 모든 버그 수정 내용을 날짜순으로 기록합니다.
> Lovable, Antigravity, Gemini 등 모든 협업 툴에서 이 파일을 참고하여
> 중복 수정이나 충돌 없이 작업할 수 있습니다.
>
> **규칙**:
> - 버그를 수정할 때마다 **상단에 새 항목 추가** (최신순 유지)
> - 심각도 레이블: 🔴 Critical / 🟠 High / 🟡 Medium / 🔵 Low
> - 수정된 파일 경로는 반드시 명시
> - 환경변수 추가가 필요한 경우 `⚙️ ENV 필요` 섹션 포함

---

## 템플릿

```markdown
## YYYY-MM-DD | [심각도] 버그 제목

**수정자**: @handle 또는 도구명 (예: Claude Cowork)
**관련 파일**:
- `src/...`

### 문제
(어떤 증상이 있었는지 1~3줄)

### 원인
(왜 발생했는지 기술적 설명)

### 수정 내용
(무엇을 어떻게 고쳤는지)

⚙️ ENV 필요 (해당 시)
| 변수명 | 값 예시 | 설명 |
|--------|---------|------|
| VAR_NAME | value | 설명 |
```

---

## 2026-06-03 | 🟠 High — 퍼블리싱 가드/문서 불일치 점검 및 협업 문서 갱신

**수정자**: Claude Cowork
**관련 파일**:
- `docs/COLLABORATION_GUIDE.md`
- `docs/DEPLOY_PROCESS.md`
- `docs/BUGFIX_LOG.md`

### 문제
Lovable Publish 시 자동 생성 파일이 수동 수정/덮어쓰기되며 배포가 깨질 위험이 있었음. 문서와 실제 코드/가드 설정이 불일치 상태였음.

### 원인
- `src/integrations/supabase/`에 자동 생성 파일 3종(`client.server.ts`, `auth-attacher.ts`, `auth-middleware.ts`)이 추가됐으나 `COLLABORATION_GUIDE.md` §4 수정 금지 목록에 미반영.
- `guard-lovable-files.yml` 정규식이 실제 lock 파일명 `bun.lock`이 아닌 `bun.lockb`를 검사 → 실제 lock 파일 미보호. `client.server.ts`/`auth-*`/`routeTree.gen.ts`도 가드 정규식에서 누락.
- `start.ts`의 `functionMiddleware: [attachSupabaseAuth]`, `__root.tsx`의 `onAuthChange` 무효화 등 퍼블리싱 필수 불변식이 문서화되지 않아 리팩토링 중 제거될 위험.
- 서버 admin 클라이언트가 요구하는 `SUPABASE_SERVICE_ROLE_KEY` / `SUPABASE_URL` Secrets 요건이 문서에 누락.

### 수정 내용
- `COLLABORATION_GUIDE.md` §4 수정 금지 목록을 실제 자동 생성 파일 기준으로 확장하고 `src/integrations/supabase/` 전체를 Lovable 전용으로 명시.
- guard 워크플로우 정규식 누락분을 문서에 경고로 기록하고 갱신용 정규식 제안 추가(워크플로우 자체 수정은 승인 대기).
- §4-1 "퍼블리싱 필수 불변식" 표 신설(start.ts / __root.tsx / use-auth / 인증 의존 쿼리).
- §7에 서버 Secrets(`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`) 필수 요건 추가.
- `DEPLOY_PROCESS.md` Publish 전 체크리스트에 항목 5~8(관리 파일 무결성·서버 Secrets·불변식 보존·로그인 회귀) 추가.

⚙️ ENV 필요
| 변수명 | 값 예시 | 설명 |
|--------|---------|------|
| SUPABASE_URL | https://xxxx.supabase.co | 서버 admin 클라이언트 |
| SUPABASE_SERVICE_ROLE_KEY | (service-role 키) | RLS 우회 서버 작업 전용, 클라이언트 노출 금지 |

> 후속 권장: `guard-lovable-files.yml` 정규식을 §4 제안대로 갱신(별도 승인 필요).

---

## 2026-06-02 | 🟠 High — 코드 수정/HMR 및 매장 이동 직후 로그인 상태 흔들림

**수정자**: Lovable
**관련 파일**:
- `src/hooks/use-auth.tsx`
- `src/routes/__root.tsx`
- `src/hooks/use-is-admin.ts`
- `src/routes/stores.index.tsx`
- `src/routes/stores.$id.tsx`

### 문제
로그인 직후 매장찾기(`/stores`)로 이동하거나, Lovable에서 코드를 수정해 HMR/리로드가 발생한 뒤 로그인 UI가 풀린 것처럼 보이고 인증 의존 쿼리가 불안정하게 실행됨.

### 원인
인증 훅이 `onAuthStateChange`의 초기 이벤트와 `getSession()` 복원 결과를 동시에 처리하면서, 세션 저장소 복원 전 `null` 세션을 먼저 반영할 수 있었음. 또한 즐겨찾기/관리자/알림 등 사용자 의존 쿼리가 세션 복원 완료 전 실행될 여지가 있었고, 인증 변경 후 라우터/쿼리 캐시 무효화가 루트에서 일관되게 처리되지 않았음.

### 수정 내용
- `AuthProvider`가 `getSession()` 복원 결과를 첫 인증 상태의 기준으로 삼도록 변경해 HMR 직후 로그아웃 플래시를 완화
- 인증 변경 시 루트에서 `router.invalidate()`와 `queryClient.invalidateQueries()`를 실행해 로그인/로그아웃/토큰 갱신 이후 화면 상태 동기화
- `useIsAdmin`, 매장 목록/상세 즐겨찾기 쿼리를 `authLoading`이 끝난 뒤 실행하도록 제한
- 매장 상세의 `notFoundComponent`를 정식 컴포넌트로 분리해 Hooks 규칙 위반을 제거

---

## 2026-05-22 | 🟠 High — RecipeEditor "편집 완료 및 저장" 실제 저장 안 됨

**수정자**: Claude Cowork
**관련 파일**:
- `src/components/decks/recipe-editor.tsx`

### 문제
"편집 완료 및 저장" 버튼을 눌러도 덱의 최종 수정 시각이 DB에 반영되지 않았음. 버튼은 `qc.invalidateQueries`만 호출하고 성공 toast를 띄웠으나, `decks` 테이블의 `updated_at`이 갱신되지 않아 다른 도구(Lovable 등)에서 최신 수정 여부를 알 수 없었음.

### 원인
버튼 핸들러에 Supabase `update` 호출이 없었음. 개별 카드 추가/수량 변경/삭제는 즉시 DB에 반영되지만 덱 메타데이터(`updated_at`) 갱신이 누락됨.

### 수정 내용
- 버튼 핸들러를 async로 변경
- `supabase.from("decks").update({ updated_at: new Date().toISOString() }).eq("id", deck.id)` 호출 추가
- 실패 시 `toast.error` 표시 후 조기 종료, 성공 시에만 `invalidateQueries` 및 성공 toast

```ts
// 수정 후
onClick={async () => {
  const { error } = await supabase
    .from("decks")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", deck.id);
  if (error) { toast.error("저장에 실패했습니다: " + error.message); return; }
  qc.invalidateQueries({ queryKey: ["decks"] });
  toast.success("덱 레시피가 저장되었습니다.");
}}
```

---

## 2026-05-22 | 🟠 High — RecipeEditor updateQty / removeCard 에러 무시

**수정자**: Claude Cowork
**관련 파일**:
- `src/components/decks/recipe-editor.tsx`

### 문제
카드 수량 변경(+/-)이나 삭제 시 DB 오류가 발생해도 오류가 무시되고 `refetch()`가 호출되어 UI가 잘못된 상태로 표시됨.

### 원인
`updateQty`와 `removeCard` 함수 모두 `await supabase...` 결과를 검사하지 않고 바로 `refetch()` 호출.

### 수정 내용
- `updateQty`: 반환값의 `error`를 구조분해 할당, 오류 발생 시 `toast.error` 후 early return (refetch 건너뜀)
- `removeCard`: 동일하게 에러 검사 및 `toast.error` 추가

```ts
// updateQty 수정 후
const { error } =
  qty < 1
    ? await supabase.from("deck_cards").delete().eq("id", id)
    : await supabase.from("deck_cards").update({ quantity: qty }).eq("id", id);
if (error) { toast.error("수량 변경에 실패했습니다: " + error.message); return; }
refetch();
```

---

## 2026-05-22 | 🟠 High — Dashboard 통계 전체 하드코딩

**수정자**: Claude Cowork
**관련 파일**:
- `src/routes/index.tsx`

### 문제
대시보드의 "이번 시즌 승률", "보유 카드", "저장된 덱", "랭킹" 4개 지표가 모두 `"—%"`, `"0"`, `"—"` 하드코딩 값으로 표시되어 실제 유저 데이터를 전혀 반영하지 않았음.

### 원인
`const stats = [...]` 배열이 정적 상수로 선언되어 있었으며, Supabase 쿼리 연동이 전혀 없었음.

### 수정 내용
- `useDashboardStats(userId)` 커스텀 훅 신규 작성 (4개 병렬 `useQuery` 호출)
  - 승률: `matches` 테이블에서 최근 90일 결과 집계 → 승/패 기반 백분율 계산
  - 보유 카드: `user_collection` count 쿼리
  - 저장된 덱: `decks` count 쿼리 (user_id 필터)
  - 최고 레이팅: `user_ratings` 최고 rating 조회 (게임 표기 포함)
- 정적 `stats` 배열 제거, `Dashboard()` 컴포넌트에서 `useDashboardStats` 호출로 대체
- 힌트 텍스트도 데이터 유무에 따라 동적으로 표시

---

## 2026-05-22 | 🟠 High — AI 코치 항상 401 반환

**수정자**: Claude Cowork
**관련 파일**:
- `src/components/ai-coach-card.tsx`

### 문제
"AI 분석 실행" 버튼을 누르면 항상 "로그인이 필요합니다" 오류가 발생하며 AI 코치 기능이 동작하지 않음.

### 원인
`fetchCoach()` 함수가 `/api/coach`로 POST 요청 시 `Authorization` 헤더를 전송하지 않았으나, 서버는 `Bearer` 토큰이 없으면 401을 반환하도록 구현되어 있었음.

### 수정 내용
- `useAuth()` 훅을 import하여 `session.access_token`을 가져옴
- `fetchCoach(payload, token)` 형태로 시그니처 변경
- HTTP 요청에 `Authorization: Bearer {token}` 헤더 추가
- 토큰이 없을 경우 사용자에게 "로그인이 필요합니다" 에러 메시지 표시

```ts
// 수정 전
fetch("/api/coach", { method: "POST", headers: { "Content-Type": "application/json" }, ... })

// 수정 후
fetch("/api/coach", {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
  ...
})
```

---

## 2026-05-22 | 🔴 Critical — PayPal 환율 클라이언트 하드코딩

**수정자**: Claude Cowork
**관련 파일**:
- `src/lib/payment.ts`
- `src/lib/payment.functions.ts`

### 문제
PayPal 결제 시 KRW → USD 환율이 클라이언트에 `1400`으로 하드코딩되어 있어, 실제 환율과 차이가 날 경우 결제 금액 검증이 실패하거나 위변조 탐지가 무력화될 위험이 있었음.

### 원인
`payment.ts`의 PayPal `createOrder`에서 `options.amount / 1400`으로 고정 환율을 사용. 서버 검증 로직에도 환율 기반 금액 재확인 로직이 없었음.

### 수정 내용
- 클라이언트: 하드코딩 `1400` → `VITE_PAYPAL_KRW_RATE` 환경변수로 대체
- 서버: 결제 완료 후 `PAYPAL_KRW_RATE` 환경변수 기반으로 예상 USD 금액 계산, 실제 청구금액과 ±0.05달러 이내인지 검증 추가

```ts
// 서버 검증 추가 (payment.functions.ts)
const rate = Number(process.env.PAYPAL_KRW_RATE ?? 1400);
const expectedUsd = parseFloat((amount / rate).toFixed(2));
const capturedUsd = parseFloat(captures[0]?.amount?.value ?? "0");
if (Math.abs(capturedUsd - expectedUsd) > 0.05) throw new Error("금액 불일치");
```

⚙️ ENV 필요
| 변수명 | 값 예시 | 설명 |
|--------|---------|------|
| `VITE_PAYPAL_KRW_RATE` | `1400` | 클라이언트 PayPal 환율 (프론트엔드) |
| `PAYPAL_KRW_RATE` | `1400` | 서버 검증용 환율 (백엔드) |

---

## 2026-05-22 | 🔴 Critical — PayPal 프로덕션에서 Sandbox URL 사용

**수정자**: Claude Cowork
**관련 파일**:
- `src/lib/payment.functions.ts`

### 문제
`verifyPayPalPayment` 서버 함수가 프로덕션 배포 후에도 `https://api-m.sandbox.paypal.com`을 호출하고 있어 실제 결제가 전혀 검증되지 않음. 실제 고객 결제가 검증 실패로 이어질 수 있었음.

### 원인
PayPal API 베이스 URL이 환경 분기 없이 Sandbox 고정값으로 하드코딩되어 있었음.

### 수정 내용
- `process.env.PAYPAL_ENV === "production"` 조건으로 URL 분기 처리
- 프로덕션: `https://api-m.paypal.com`
- 샌드박스: `https://api-m.sandbox.paypal.com`
- 토큰 발급 실패 시 명시적 오류 처리 추가

```ts
// 수정 후
const isProduction = process.env.PAYPAL_ENV === "production";
const PAYPAL_BASE = isProduction
  ? "https://api-m.paypal.com"
  : "https://api-m.sandbox.paypal.com";
```

⚙️ ENV 필요
| 변수명 | 값 예시 | 설명 |
|--------|---------|------|
| `PAYPAL_ENV` | `production` | 비어있으면 자동으로 sandbox 사용 |

---

## 2026-05-22 | 🔴 Critical — 알림 전체읽음 처리 시 user_id 필터 누락

**수정자**: Claude Cowork
**관련 파일**:
- `src/components/notification-bell.tsx`

### 문제
"모두 읽음" 버튼 클릭 시 `user_id` 조건 없이 `notifications` 테이블 전체를 업데이트하는 쿼리가 실행됨. RLS 정책이 없거나 잘못 설정된 경우 다른 사용자의 알림까지 일괄 읽음 처리될 위험이 있었음.

### 원인
`markAllRead()` 함수에서 `.is("read_at", null)` 조건만 있고 `.eq("user_id", user.id)` 조건이 누락됨.

### 수정 내용
- `user` 없을 경우 early return 추가
- `.eq("user_id", user.id)` 조건 추가로 본인 알림만 업데이트하도록 수정

```ts
// 수정 전
.update({ read_at: new Date().toISOString() })
.is("read_at", null)

// 수정 후
.update({ read_at: new Date().toISOString() })
.eq("user_id", user.id)   // ← 추가
.is("read_at", null)
```

---

## 2026-05-15 | 🟠 High — 덱 빌더 RecipeEditor `Map` 직렬화 오류

**수정자**: Lovable
**관련 파일**:
- `src/components/decks/recipe-editor.tsx`

### 문제
덱 상세 → 레시피 탭 진입 시 빈 화면 표시, 카드 이미지 미노출, +/- 버튼 무반응. 콘솔: `cardMap.get is not a function`.

### 원인
`cardMap`을 `Map` 객체로 보관했으나 SSR 직렬화 과정에서 `Map` 프로토타입이 소실되어 `.get()` 호출 시 throw 발생.

### 수정 내용
- `cardMap`을 `Record<string, CardRow>`로 변경
- `useMemo`로 `.get()` 호환 래퍼 제공
- 터치 정확도 개선: +/- 버튼 `h-8 w-8` + `touch-manipulation` 적용

---

## 2026-05-15 | 🟠 High — 덱 상세 React Hooks 순서 위반 크래시

**수정자**: Lovable
**관련 파일**:
- `src/routes/decks.$id.tsx`

### 문제
덱 목록에서 덱 클릭 시 무반응 (크래시). 덱 레시피 탭 미표시.

### 원인
조건부 `return` 이후에 `useQuery`/`useMemo` 훅이 호출되어 React Hooks 순서 규칙 위반으로 컴포넌트 크래시.

### 수정 내용
- 모든 훅을 조건부 return 이전으로 이동
- `enabled: !!deck` 가드 추가

---

## 2026-05-15 | 🟠 High — 덱 상세 SSR 세션 부재로 비공개 덱 접근 불가

**수정자**: Lovable
**관련 파일**:
- `src/routes/decks.$id.tsx`

### 문제
본인 비공개 덱이 "비공개 덱입니다"로 표시되거나 상세가 열리지 않음. 관리자도 타인 비공개 덱 열람 불가.

### 원인
`loader`가 SSR에서 `getUser()`를 호출했으나 서버에 세션 쿠키가 없어 `currentUserId=null`로 판정. 관리자 RLS 정책 미설정.

### 수정 내용
- `loader` 제거, 클라이언트 `useAuth` + `useQuery`로 권한 판정 전환
- `decks` 테이블에 관리자 SELECT 정책 추가 (`has_role(auth.uid(),'admin')`)

---

## 2026-05-27 — 세트 관리 근본 개선 (card_sets 테이블 도입)

### 배경
- 빈 세트를 목록에 표시하기 위해 `DUMMY-*` placeholder 카드를 `cards` 테이블에 넣어왔음
- "더미 카드 일괄 삭제" 작업 시 사용자가 만든 빈 세트가 함께 사라지는 사고 발생

### 변경
- 신규 테이블 `public.card_sets` 추가 (id, name UNIQUE, created_by, created_at, updated_at)
- RLS: SELECT 전체 공개 / INSERT·UPDATE·DELETE 관리자 한정
- 기존 `cards.set_code` distinct 값들을 모두 `card_sets`에 이관
- DUMMY-* 카드 전체 삭제 (더 이상 필요 없음)
- `useUniqueSets` 훅: `cards` → `card_sets`에서 직접 조회
- `SetConfigView`: 세트 추가/삭제 로직을 `card_sets` 기준으로 재작성
  - 세트 추가: DUMMY 카드 insert 대신 `card_sets` row insert
  - 세트 삭제: 소속 카드는 '미분류'로 update, `card_sets` row delete

### 효과
- 빈 세트도 정상 표시 (DUMMY 의존 제거)
- 카드 데이터에 영향 없이 세트만 독립적으로 CRUD 가능
- 향후 `cards`에 대한 bulk delete가 세트 목록에 영향 미치지 않음
