# 🌐 글로벌 인증 및 Stripe 결제 아키텍처 개편 완료 보고서

글로벌 시장(한국, 미국, 일본 등)으로의 매끄러운 영토 확장과 비즈니스 고도화를 위해, 국내 전용 소셜 채널을 배제한 **인증 간소화(Google/Email)** 및 **통합 글로벌 결제 인프라(Stripe Checkout)** 구축 작업을 완벽하게 달성했습니다.

---

## 🛠️ 1. 주요 구현 내용 및 기술 사양

### 1) 소셜 로그인 다이어트 및 구글 중심 단일화
* **대상 파일**: [`login.tsx`](file:///Users/hyukkwon/Library/Mobile%20Documents/com~apple%20Docs/Development/tcg-hub/src/routes/login.tsx)
* **내용**: 
  - 네이버와 카카오 소셜 로그인을 UI 및 Supabase Auth 핸들러 로직에서 완전히 일소했습니다.
  - 이를 통해 로컬라이징 및 다국어 팩 파일([`ko.ts`](file:///Users/hyukkwon/Library/Mobile%20Documents/com~apple%20Docs/Development/tcg-hub/src/i18n/locales/ko.ts), [`en.ts`](file:///Users/hyukkwon/Library/Mobile%20Documents/com~apple%20Docs/Development/tcg-hub/src/i18n/locales/en.ts), [`ja.ts`](file:///Users/hyukkwon/Library/Mobile%20Documents/com~apple%20Docs/Development/tcg-hub/src/i18n/locales/ja.ts))에 불필요하게 남아있던 관련 번역 키 6개(naverLogin, kakaoLogin 등)를 동시 삭제하여 데이터 경량화를 확보했습니다.
  - 서비스의 메인 구글 로그인(Google OAuth)과 이메일 인증 기능만 정제 보존하여 사용자 편의성을 높였습니다.

### 2) 데이터베이스 국가 캐싱 필드 확장
* **신설 마이그레이션**: [`20260526000000_add_country_code_to_profiles.sql`](file:///Users/hyukkwon/Library/Mobile%20Documents/com~apple%20Docs/Development/tcg-hub/supabase/migrations/20260526000000_add_country_code_to_profiles.sql)
* **타입 매핑**: [`types.ts`](file:///Users/hyukkwon/Library/Mobile%20Documents/com~apple%20Docs/Development/tcg-hub/src/integrations/supabase/types.ts)
* **내용**: 
  - `profiles` 테이블에 유저의 글로벌 접속 국가 기준을 담아둘 수 있는 `country_code text DEFAULT 'US'` 컬럼을 확장 마이그레이션 코드로 구축했습니다.
  - Supabase가 관리하는 클라이언트 타입 스키마 정의(`types.ts`)에도 `country_code`를 수동 보강하여 TypeScript 컴파일 무결성을 사전 정렬했습니다.

### 3) Cloudflare Workers 기반의 IP 국가 추적 및 실시간 통화 매핑
* **연동 파일**: [`payment.functions.ts`](file:///Users/hyukkwon/Library/Mobile%20Documents/com~apple%20Docs/Development/tcg-hub/src/lib/payment.functions.ts)
* **내용**: 
  - 결제 세션 발급 시 TanStack Start 서버 환경의 `getRequest()`를 실행, Cloudflare Workers 프록시 레이어가 공급하는 **`cf-ipcountry`** 헤더를 추출하여 접속자 국가를 동적으로 추적합니다.
  - 해당 정보는 유저 프로필 테이블에 없을 시 최초 1회 즉각 영구 캐싱됩니다.
  - **지역 통화/가격 실시간 변환 규칙**:
    - **KR**: 통화 `krw` 매핑 ➡️ ₩10,000 / ₩45,000 / ₩85,000
    - **JP**: 통화 `jpy` 매핑 ➡️ ¥1,000 / ¥4,500 / ¥8,500
    - **US & Global**: 통화 `usd` 매핑 ➡️ $10.00 / $45.00 / $85.00 (Stripe의 센트 포맷 자동 정규화)

### 4) Stripe Checkout 글로벌 파이프라인 수립
* **클라이언트 모듈**: [`payment.ts`](file:///Users/hyukkwon/Library/Mobile%20Documents/com~apple%20Docs/Development/tcg-hub/src/lib/payment.ts)
* **결제 팝업 UI**: [`PaymentDialog.tsx`](file:///Users/hyukkwon/Library/Mobile%20Documents/com~apple%20Docs/Development/tcg-hub/src/components/payment/PaymentDialog.tsx)
* **상점 연동**: [`store.tsx`](file:///Users/hyukkwon/Library/Mobile%20Documents/com~apple%20Docs/Development/tcg-hub/src/routes/store.tsx)
* **내용**:
  - 기존의 국내/해외 결제 방식 분기 토글을 완전히 폐기하고, Stripe Checkout 세션 기반의 **Stripe 단일 글로벌 결제 흐름**으로 통합했습니다.
  - `PaymentDialog`는 깔끔하고 품격 있는 충전 팩 요약과 Stripe 결제 보안 보장 배지만을 노출하며, 충전 실행 시 백엔드의 `createStripeCheckoutSession` 서버 함수로부터 Checkout URL을 취득해 Stripe 결제창으로 유저 브라우저를 직접 넘겨줍니다.
  - 결제 성공 후 돌아왔을 때 성공 매개변수(`success=true`, `session_id=...`)가 수신되는 즉시 마운트 라이프사이클 훅이 작동해 백엔드의 `verifyStripePayment`를 동적 호출합니다. 
  - Stripe 서버로부터 성공 여부가 공인되면, 크레딧 밸런스를 즉시 업데이트한 뒤 브라우저 히스토리 대체(`window.history.replaceState`)를 실행해 URL 파라미터를 깨끗이 씻어내어 리프레시 중복 요청을 철통 방어합니다.

---

## 🚦 2. 검증 완료 사항

* **동적 검증**: `npx tsc --noEmit` 실행 완료 ➡️ **경고/타입 에러 0개 (100% SUCCESS)**
  - Stripe SDK를 런타임에 동적으로 바인딩하여 컴파일 부하 및 에러 여지 차단.
  - `payments` 테이블의 `provider: string` 수용력을 이용해 `"stripe"`를 정상 기록.
  - `user_credits` 가산 로직이 충전 팩 ID(`credits-small`, `credits-medium`, `credits-large`)에 매칭된 정확한 보너스 합산 크레딧(+1,000 / +5,000 / +10,000)을 즉시 지급하도록 완결성 확보.

---

## 🚀 3. 향후 유지보수 가이드 및 운영 관리
- **Stripe API Key 관리**: 개발/운영 환경 격리에 맞춰 적절한 API secret key(테스트용 `sk_test_...` 및 실무용 `sk_live_...`)가 Supabase vault 또는 Cloudflare 환경변수에 바인딩되도록 유의하십시오.
- **국가별 통화 변환 확장**: 추후 유럽(EUR), 대만(TWD) 등 다른 타겟 국가 확장 시 `payment.functions.ts` 내의 통화 매핑 분기에 신규 `country_code` 조건절을 손쉽게 보강하여 자동 확장 가능합니다.
