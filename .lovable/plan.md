
# 비즈니스 모델 + 브랜드 인트로 페이지 구축 계획

## 1. 브랜드 네이밍 제안 (샘플)

도메인 미정 상태이므로 인트로 페이지에는 **샘플 브랜드명**을 적용해 둡니다. 정식 오픈 시 한 번에 교체 가능하도록 `src/lib/brand.ts` 한 곳에 상수화합니다.

추천 후보 3가지:

| 후보 | 컨셉 | 도메인 가능성 |
|---|---|---|
| **DeckLog** (덱로그) | 덱 + 매치 로그. 한·영 모두 자연스러움 | decklog.kr / decklog.gg |
| **MetaForge** (메타포지) | 메타 분석을 단련(forge)한다 | metaforge.gg |
| **Tactica** (택티카) | 전략(tactics)에서 파생, 짧고 임팩트 | tactica.gg |

**기본 채택: `DeckLog`** — TCG 본질(덱 빌딩 + 매치 기록)과 가장 잘 맞고 한국어 발음도 친숙. 코드/문서 모두 이 이름으로 들어가되 `BRAND_NAME` 상수만 바꾸면 통째로 교체됩니다.

---

## 2. 청구 모델: Freemium + 크레딧 하이브리드

### 2.1 플랜 구조

| 구분 | Free | Pro 멤버십 (월 ₩4,900) | 크레딧 충전 (선택) |
|---|---|---|---|
| 카드 DB·덱 빌더·LFG·매치 기록 | 무제한 | 무제한 | — |
| AI OCR 카드 등록 | **일 5회** | 무제한 | 5크레딧/회 |
| AI 코치 분석 | **월 3회** | 무제한 | 10크레딧/회 |
| 덱 저장 | 5개 | 무제한 | — |
| 매치 기록 보존 | 최근 50개 | 무제한 | — |
| 광고 (향후) | 노출 | 제거 | — |

크레딧 패키지: 100C ₩1,000 / 550C ₩5,000(+10%) / 1,200C ₩10,000(+20%)

### 2.2 비용 구조 근거
- OCR 1회 실비 ≈ ₩30~50 → 5C(₩50) 차감으로 손익 균형
- 코치 1회 실비 ≈ ₩10~20 → 10C(₩100)로 마진 확보
- Pro 멤버십 손익분기: 월 ~100회 사용 시점

---

## 3. 테스트/라이브 결제 분리

`src/lib/payment.ts`는 이미 `sandbox` 옵션을 지원하므로:

- `VITE_PAYMENT_MODE` 환경변수 도입 (`test` | `live`)
- `test` 모드: PortOne 테스트 PG(`kakaopay.TC0ONETIME`), 실제 차감 X. 인트로/결제 화면에 **"테스트 모드" 배지** 표시
- `live` 모드: 운영 PG(이니시스), 배지 숨김
- 정식 오픈 시 환경변수만 변경

추가로 `payments` 테이블에 `mode TEXT NOT NULL DEFAULT 'test'` 컬럼 추가해 거래 추적.

---

## 4. DB 스키마 변경 (Lovable 담당)

### 4.1 사용량 추적
```sql
-- AI 사용 카운터 (일/월 단위 집계)
CREATE TABLE ai_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  feature text NOT NULL,           -- 'ocr' | 'coach'
  used_at timestamptz NOT NULL DEFAULT now(),
  cost_credits int NOT NULL DEFAULT 0,
  source text NOT NULL             -- 'free_quota' | 'credits' | 'pro'
);
-- RLS: 본인만 SELECT, INSERT는 서버 함수에서만
```

### 4.2 멤버십
```sql
CREATE TYPE subscription_status AS ENUM ('active','canceled','expired','trialing');

CREATE TABLE subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  plan text NOT NULL,              -- 'pro_monthly'
  status subscription_status NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  current_period_end timestamptz NOT NULL,
  billing_key text,                -- PortOne 정기결제 키
  cancel_at_period_end boolean NOT NULL DEFAULT false
);
-- RLS: 본인 SELECT만
```

### 4.3 기존 테이블 확장
- `payments`: `mode` 컬럼, `purpose text` ('credits_topup' | 'pro_subscribe')
- `user_credits`: `lifetime_purchased int`, `lifetime_used int` 추가

### 4.4 서버 함수 (RLS 우회용 SECURITY DEFINER)
- `consume_credits(user_id, amount, feature)` — 잔액 확인 + 차감 + ai_usage 로그
- `check_free_quota(user_id, feature)` — 일/월 한도 체크
- `grant_credits(user_id, amount, payment_id)` — 결제 후 충전
- `activate_subscription(user_id, billing_key, period_end)` — Pro 활성화

---

## 5. 코드 변경 범위 (Antigravity 후속 리팩토링 영역 표시)

### Lovable 담당 (이 작업)
- **DB 마이그레이션** (위 스키마)
- **인트로 페이지 신규** (`/intro` 라우트)
- **요금제/결제 UI 신규** (`/pricing`, `/billing`)
- **브랜드 상수 파일** (`src/lib/brand.ts`)
- **테스트 모드 배지 컴포넌트**

### Antigravity 담당 (후속)
- `card-ocr.ts`/`coach.ts` 내부 로직: AI 호출 전 `check_free_quota` → 부족 시 `consume_credits` → 둘 다 실패 시 402 반환
- 클라이언트 OCR 이미지 압축 (1024px 리사이즈)
- 카드 코드 기반 OCR 결과 캐싱

---

## 6. 인트로 페이지 (`/intro`) 구성

신규 라우트 `src/routes/intro.tsx`. **로그인하지 않은 사용자가 처음 진입했을 때 보는 마케팅 랜딩**.

섹션 구성:
1. **Hero** — 브랜드명(DeckLog) + 한 줄 카피("당신의 모든 TCG 매치를 기록하는 곳") + CTA(무료 시작 / 둘러보기)
2. **지원 게임** — 원피스·포켓몬·디지몬 로고 그리드
3. **핵심 기능 6선** — 카드 DB, 덱 빌더, AI OCR, AI 코치, LFG, 리더보드 (아이콘 카드)
4. **요금제 미리보기** — Free / Pro / 크레딧 3-컬럼, "현재 베타 무료" 강조 배지
5. **로드맵 타임라인** — 베타(현재) → 정식 오픈(결제 활성) → 신규 게임 추가
6. **FAQ** — 4~6개 (결제 시점, 환불, 무료 사용 한계 등)
7. **Final CTA** — "지금 베타 참여하기" → /login

라우팅 정책:
- `/intro`는 누구나 접근 가능
- `/`(대시보드)는 로그인 사용자용 유지
- 비로그인 사용자가 `/` 접근 시 `/intro`로 자동 리다이렉트 (선택사항, 후속 결정)

SEO:
- `head()` 에 title="DeckLog — TCG 통합 관리 플랫폼", description, og:title/description, JSON-LD `WebSite` 타입
- 브랜드 변경 시 `BRAND_NAME` 한 곳만 수정하면 모든 메타 자동 갱신

---

## 7. 요금제/결제 페이지

### `/pricing`
- 3-컬럼 카드(Free/Pro/Credits)
- 현재 **베타 모드 배너**: "정식 오픈 전까지 모든 기능 무료, 결제는 테스트 모드로 동작합니다"
- Pro 카드 → "구독하기" 버튼 → 테스트 모드면 시뮬레이션 결제, 라이브면 실제 결제
- Credits 카드 → 패키지 선택 → 충전 결제

### `/billing` (마이페이지 하위)
- 현재 플랜 / 잔여 크레딧 / 다음 결제일
- 결제 내역(`payments` 테이블 조회)
- 구독 취소(다음 결제일까지 유지)

---

## 8. 작업 순서

1. **DB 마이그레이션** (subscriptions, ai_usage, payments/credits 확장, SECURITY DEFINER 함수 4종) — Lovable 승인 필요
2. **`src/lib/brand.ts`** — 브랜드 상수, 테스트모드 플래그
3. **인트로 페이지 `/intro`** — 7개 섹션
4. **요금제 페이지 `/pricing`** — 3-컬럼 + 베타 배너
5. **결제 통합** — `payment.ts` 확장, 결제 성공 → `grant_credits`/`activate_subscription` 호출
6. **테스트 모드 배지** — 전역 표시 (사이드바 하단 또는 헤더)
7. **마이페이지 `/billing`** — 잔액·내역·구독 관리
8. **문서 업데이트** — `docs/PROJECT_STATUS.md`에 비즈니스 모델 섹션 추가

AI 한도 체크 로직 자체는 Antigravity 후속 작업으로 넘기되, 함수와 테이블은 이번에 모두 준비합니다.

---

## 9. 기술 메모

- 모든 가격/한도 값은 `src/lib/pricing.ts` 단일 파일에 상수화 → 정식 오픈 시 일괄 변경
- PortOne 빌링키(정기결제) 발급은 첫 Pro 결제 시 함께 진행
- 테스트 모드에서도 실제 DB에 결제 row가 쌓이되 `mode='test'` 플래그로 구분 → 운영 통계와 섞이지 않음

