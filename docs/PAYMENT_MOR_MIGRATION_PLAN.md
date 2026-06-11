# 결제 전략: MoR 우선 → 사업자등록 후 직접 PG 전환 설계

> **작성일**: 2026-06-03
> **작성자**: Claude Cowork
> **상태**: 설계(Design) — 코드 변경 없음. 추후 구현의 청사진.
> **목적**: 사업자등록증 없이 결제를 시작하고, 추후 사업자 등록 후 자체 PG로 매끄럽게 전환할 수 있는 결제 아키텍처를 정의한다.
> **협업 메모**: 이 문서는 Lovable / Antigravity / Gemini 등 모든 협업 툴이 참고하는 **단일 기준 문서(SSOT)**다. 결제 관련 작업 전 반드시 이 문서를 확인할 것.

---

## 0. 한 줄 요약

> **지금**: Apple/Google IAP·Lemon Squeezy 같은 **Merchant of Record(MoR)** 를 쓰면 **사업자등록 없이** 결제 가능.
> **나중**: 사업자등록 후 **PortOne/Stripe 직접 연동(provider)만 추가**하면 됨. 크레딧 원장·UI는 그대로.

---

## 1. 배경 / 현황 진단

### 1.1 현재 아키텍처

- **앱 형태**: 순수 **PWA 웹앱** (`public/manifest.webmanifest`, `display: standalone`). 네이티브 래퍼(Capacitor/RN) 없음. Cloudflare 배포(`wrangler.jsonc`).
- **결제 코드**:
  - 클라이언트: `src/lib/payment.ts`(PortOne SDK, Stripe.js), `src/components/payment/PaymentDialog.tsx`, `src/routes/store.tsx`
  - 서버: `src/lib/payment.functions.ts` (`createStripeCheckoutSession`, `verifyStripePayment`, `verifyPortOnePayment`, `recordSuccessfulPayment`)
  - 상품 정의: `CREDIT_PACKS` (`credits-small/medium/large`)
- **데이터**:
  - `payments` 테이블 — `order_id`(UNIQUE), `imp_uid`, `amount`, `currency`, **`provider`**, `status`
  - `user_credits` 테이블 — 크레딧 **원장(ledger)**, `balance`
  - `process_successful_payment(...)` RPC — `order_id` 기준 **멱등 적립**(중복 결제 방지)

### 1.2 핵심 제약 (사업자등록 관점)

| 결제 수단                   |  사업자등록   | 비고                                  |
| --------------------------- | :-----------: | ------------------------------------- |
| PortOne(KG이니시스/토스 등) |  ✅ **필수**  | 개인은 PG 계약 불가                   |
| Stripe 직접                 |  ✅ **필수**  | 사업자/법인 정보 필요                 |
| **MoR(아래 §2)**            | ❌ **불필요** | 플랫폼이 법적 판매자가 되어 대신 정산 |

→ **결론**: 사업자등록 전 단계에서는 **MoR 방식**만이 합법적으로 디지털 재화(크레딧) 결제를 받을 수 있는 현실적 경로다.

---

## 2. 핵심 개념: Merchant of Record (MoR)

**MoR** = 플랫폼이 "법적 판매자(seller of record)"가 되어 고객에게 상품을 판매하고, **결제·세금(VAT/부가세)·환불·정산을 대행**한 뒤, 운영자에게는 **개인 명의로 정산금만 지급**하는 방식.

- 운영자는 자신의 PG 계약·사업자등록 없이 시작 가능.
- 애플/구글 **IAP가 바로 MoR**다(앱 스토어가 판매자). 그래서 개인 개발자 계정만으로 매출 수령이 된다.
- 웹에서는 **Lemon Squeezy / Paddle / Gumroad** 가 MoR 역할.

### 2.1 환경별 "사업자등록 없이" 가능한 옵션

| 환경            | 수단                               | 사업자등록 | 수수료(대략) | 정산             | 비고                                                          |
| --------------- | ---------------------------------- | :--------: | ------------ | ---------------- | ------------------------------------------------------------- |
| **웹**          | **Lemon Squeezy** (현 Stripe 소유) |     ❌     | ~5% + 건당   | Wise/PayPal/은행 | 개인 판매자 가입 가능. **한국 거주 가입·정산 수단 확인 필요** |
| 웹              | Paddle                             |     ❌     | ~5% + 건당   | 은행/PayPal      | KYC가 다소 엄격                                               |
| 웹              | Gumroad                            |     ❌     | ~10%         | PayPal 등        | 개인 친화적, 수수료 높음                                      |
| **앱(iOS)**     | **Apple IAP**                      |     ❌     | 15~30%       | 개인 은행        | 개인 개발자 $99/년. 네이티브 앱 필요                          |
| **앱(Android)** | **Google Play Billing**            |    ❌\*    | 15~30%       | 개인 은행        | $25 1회. \*세금정보 필요, 개인 가능. 네이티브 앱 필요         |
| 웹              | PortOne/Stripe **직접**            |     ✅     | ~2~3%        | 사업자 계좌      | **사업자등록 후 단계**                                        |

> 수수료는 변동·소규모 사업자 할인 프로그램(예: Apple Small Business 15%, Google 15%)이 있으므로 가입 시 최신 정책 확인.

### 2.2 권장 선택

- **웹 우선 + 사업자등록 전** → ✅ **Lemon Squeezy(웹 MoR)** 로 시작.
- 추후 네이티브 앱(Capacitor) 출시 시 → **Apple/Google IAP** 추가.
- 사업자등록 후 → **PortOne(국내)/Stripe(해외) 직접** 추가하여 수수료 절감.

---

## 3. 단계별 로드맵 (Phase)

```
Phase 0 (현재)   Phase 1            Phase 2             Phase 3
PWA + 미연동  →  웹 MoR 연동     →  네이티브앱 + IAP  →  사업자등록 + 직접PG
              (Lemon Squeezy)    (Capacitor)         (PortOne/Stripe)
              사업자등록 불필요   사업자등록 불필요    수수료 절감/대체
```

| Phase | 목표            | 사업자등록 | 주요 작업                                                                         | 코드 영향                                            |
| ----- | --------------- | :--------: | --------------------------------------------------------------------------------- | ---------------------------------------------------- |
| **0** | 현황            |     —      | (완료) provider 컬럼·멱등 원장 보유                                               | —                                                    |
| **1** | **웹 MoR 시작** |     ❌     | Lemon Squeezy 상품 등록 + 체크아웃 + **웹훅 검증** → 기존 크레딧 적립 함수로 수렴 | provider 추상화, `lemonsqueezy` provider 추가        |
| **2** | 앱 IAP          |     ❌     | Capacitor 래핑 + 스토어 consumable 상품 + **서버 영수증 검증**(Apple/Google)      | `apple`/`google` provider 추가, 클라이언트 환경 분기 |
| **3** | 직접 PG         |     ✅     | 사업자등록 후 PortOne/Stripe 직접 연동 활성화                                     | 기존 `portone`/`stripe` provider 재사용              |

핵심: **모든 Phase가 같은 크레딧 원장으로 수렴**하므로 Phase 간 재작업이 최소화된다.

---

## 4. 목표 아키텍처: Provider 추상화

```
              ┌─────────────────────────────────────────────┐
   결제 소스   │  Lemon Squeezy  Apple IAP  Google  PortOne   │
              │   (웹훅)        (영수증)   (RTDN)  (조회검증) │
              └───────┬───────────┬─────────┬────────┬───────┘
                      ▼           ▼         ▼        ▼
          ┌───────────────────────────────────────────────┐
          │  PaymentProvider 인터페이스 (검증/정규화)        │
          │  verify(payload) → { userId, packId, orderId,  │
          │                      amount, currency, provider}│
          └───────────────────────┬───────────────────────┘
                                  ▼
          ┌───────────────────────────────────────────────┐
          │  grantCredits()  ← 단일 멱등 적립 (order_id 기준) │
          │  payments(provider, order_id UNIQUE) + user_credits│
          └───────────────────────────────────────────────┘
```

### 4.1 제안 인터페이스 (의사코드, 추후 구현)

```ts
// src/lib/payments/types.ts (신규 예정)
export type PaymentProvider = "lemonsqueezy" | "apple" | "google" | "portone" | "stripe";

export interface VerifiedPayment {
  userId: string;
  packId: keyof typeof CREDIT_PACKS;
  orderId: string; // provider별 고유 주문/거래 ID → payments.order_id (멱등 키)
  amountPaid: number; // 실제 결제액 (위변조 검증용)
  currency: string;
  provider: PaymentProvider;
  externalRef?: string; // imp_uid / transactionId / subscription_id 등
}

export interface PaymentVerifier {
  /** provider 원본 페이로드(웹훅/영수증)를 검증 후 정규화 */
  verify(rawPayload: unknown): Promise<VerifiedPayment>;
}
```

- 기존 `recordSuccessfulPayment`(`src/lib/payment.functions.ts`)를 **`grantCredits(VerifiedPayment)`** 로 일반화하여 모든 provider가 공유.
- **금액 위변조 검증 원칙 통일**: 클라이언트가 보낸 값이 아니라 `packId`로 서버에서 산출한 기준가 = provider가 보고한 실제 결제액 비교. (이미 `verifyPortOnePayment`에 적용된 패턴을 전 provider로 확장)

---

## 5. DB 설계 변경 (제안)

> ⚠️ 마이그레이션은 Phase 1 구현 시 적용. 지금은 설계만.

### 5.1 `payments.provider` 확장

- 현재 타입상 `"stripe" | "portone"` → `"lemonsqueezy" | "apple" | "google"` 추가 허용(텍스트 컬럼이라 스키마 변경 불필요, 타입/검증만 확장).

### 5.2 웹훅 멱등·감사 테이블 (신규 제안)

MoR/스토어는 **웹훅(비동기 알림)** 으로 결제를 통지하므로, 재전송·중복에 대비한 이벤트 저장이 필요.

```sql
-- 제안: payment_webhook_events
CREATE TABLE IF NOT EXISTS public.payment_webhook_events (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider      text NOT NULL,
  event_id      text NOT NULL,           -- provider별 이벤트 고유 ID
  event_type    text NOT NULL,
  payload       jsonb NOT NULL,
  processed_at  timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, event_id)            -- 중복 웹훅 방지(멱등)
);
```

- 처리 흐름: 웹훅 수신 → 서명 검증 → `payment_webhook_events`에 INSERT(중복이면 skip) → `grantCredits()`(order_id 기준 2차 멱등).

### 5.3 멱등 적립 함수 재사용

- 기존 `process_successful_payment` 패턴 유지. **단, 보너스 크레딧(예: 45,000원→5,000)을 정확히 반영하려면** `p_credits`를 명시 전달하는 오버로드를 사용해야 한다(원격 DB에 존재, 본문 검증 필요 — §8 참고).

---

## 6. Provider별 검증 플로우 (요약)

### 6.1 Lemon Squeezy (웹, Phase 1)

1. 클라이언트: LS Checkout(상품/variant)로 결제창. `custom` 필드에 `user_id`, `pack_id` 동봉.
2. 서버 웹훅 엔드포인트(예: `src/routes/api/payments.lemonsqueezy.ts` 신규):
   - `X-Signature` HMAC-SHA256 서명 검증(`LEMONSQUEEZY_WEBHOOK_SECRET`).
   - `order_created`/`order_refunded` 이벤트 처리.
   - `custom_data.user_id`·`pack_id` 추출 → 기준가 대조 → `grantCredits()`.
3. 환불 시 크레딧 회수 정책 정의(선택).

### 6.2 Apple IAP (앱, Phase 2)

- StoreKit 2 구매 → 서버에서 **App Store Server API**로 트랜잭션(JWS) 검증.
- **App Store Server Notifications V2**(S2S 웹훅)로 환불/재구매 동기화.
- consumable 상품 ID = `CREDIT_PACKS` 키와 매핑.

### 6.3 Google Play Billing (앱, Phase 2)

- 구매 토큰 → **Play Developer API** `purchases.products.get`로 검증 후 `acknowledge`/`consume`.
- **RTDN(Pub/Sub)** 으로 실시간 알림.

### 6.4 PortOne / Stripe (직접, Phase 3)

- 기존 `verifyPortOnePayment`/`verifyStripePayment` 재사용. 사업자등록 후 PG 계약·키만 채우면 활성화.

---

## 7. 무중단 전환 전략

- **원장 불변**: `user_credits`·크레딧 소비 로직(`ai-quota.server.ts` 등)은 어떤 Phase에서도 그대로.
- **추가만 하고 제거 안 함**: provider는 누적식. Phase 3에서 PortOne을 켜도 LS/IAP는 유지(웹=LS 또는 PortOne, 앱=IAP 강제).
- **환경 분기**: 클라이언트가 실행 환경 감지 → 네이티브면 IAP, 웹이면 LS/PortOne. (스토어 정책상 **네이티브 앱 내 디지털재화는 IAP 강제** 주의)
- **가격 단일 출처**: `CREDIT_PACKS`를 기준으로 각 provider 가격을 매핑(스토어 가격 티어는 별도 등록 필요).

---

## 8. ⚙️ 환경변수 (Phase별 추가 예정)

| Phase | 변수                                                             | 설명                                     |
| ----- | ---------------------------------------------------------------- | ---------------------------------------- |
| 1     | `LEMONSQUEEZY_API_KEY`                                           | 서버 API 키                              |
| 1     | `LEMONSQUEEZY_STORE_ID`                                          | 스토어 ID                                |
| 1     | `LEMONSQUEEZY_WEBHOOK_SECRET`                                    | 웹훅 서명 검증                           |
| 1     | `VITE_LEMONSQUEEZY_*`                                            | 클라이언트 체크아웃 식별자(상품/variant) |
| 2     | `APPLE_ISSUER_ID`/`APPLE_KEY_ID`/`APPLE_PRIVATE_KEY`             | App Store Server API                     |
| 2     | `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON`                               | Play Developer API                       |
| 3     | `PORTONE_API_KEY`/`PORTONE_API_SECRET`, `VITE_PORTONE_USER_CODE` | (기존)                                   |
| 3     | `STRIPE_SECRET_KEY`, `VITE_STRIPE_PUBLISHABLE_KEY`               | (기존)                                   |

---

## 9. ⚠️ 주의 / 미해결 결정 항목 (TODO)

- [ ] **법률·세무**: 사업자등록 없이 시작해도 **소득은 과세 대상**(종합소득세). 한국은 계속·반복 사업 시 등록 의무가 있어, "테스트→본격화" 시점 판단은 **세무사 확인 필수**. _(본 문서는 법률/세무 조언이 아님)_
- [ ] **Lemon Squeezy 한국 거주 개인 판매자 가입 가능 여부 / 정산 수단(Wise·PayPal·국내 계좌) 확인.**
- [ ] **수수료 트레이드오프 합의**: MoR ~5% / 스토어 15~30% vs 직접 PG ~2~3%. 매출 규모별 전환 시점 정의.
- [ ] **보너스 크레딧 정확 적립**: 원격 DB의 `process_successful_payment(p_credits …)` 오버로드 본문 검증 후, 모든 provider 적립을 이 함수로 일원화(현 5-인자 버전은 `FLOOR(amount/10)`이라 보너스 누락).
- [ ] **크레딧 적립 동시성**: read-modify-write(현 `recordSuccessfulPayment`) → 원자적 RPC로 일원화 (BUGFIX_LOG 후속 권장 참조).
- [ ] **환불/취소 정책**: provider별 환불 시 크레딧 회수 규칙.
- [ ] **네이티브 앱 IAP 강제** 정책 검토(앱 내 외부결제 리젝 리스크, 지역별 규제 예외).

---

## 10. 참고 문서

- `docs/payment-integration-guide.md` — 기존 PortOne/PayPal 연동 가이드
- `docs/GLOBAL_PAYMENT_WALKTHROUGH.md` — 글로벌 결제 흐름
- `docs/payment-testing-guide.md` — 결제 테스트
- `docs/BUGFIX_LOG.md` — `verifyPortOnePayment` 위변조 차단 등 결제 보안 수정 이력
- 코드: `src/lib/payment.functions.ts`, `src/lib/payment.ts`, `src/components/payment/PaymentDialog.tsx`, `src/routes/store.tsx`
- DB: `supabase/migrations/20260513120000_init_payments.sql` (payments·user_credits·적립 RPC)

---

### 구현 현황

- ✅ **(2026-06-03) provider 추상화 리팩터링 완료** — `src/lib/payments/`로 분리. 동작 무변경(기존 Stripe/PortOne 그대로). 실제 생성된 구조는 아래.
- ⬜ Lemon Squeezy 연동(Phase 1) — 스켈레톤만 존재(`providers/lemonsqueezy.server.ts`).
- ⬜ `payment_webhook_events` 마이그레이션(§5.2).

```
src/lib/payments/
  types.ts                      # PaymentProvider, CreditPack, VerifiedPayment, PaymentVerifier, ...
  credit-packs.ts               # CREDIT_PACKS, getPack(), getPriceAndCurrency()  (순수/공유)
  auth.server.ts                # getAuthenticatedUserId()
  grant-credits.server.ts       # grantCredits(VerifiedPayment)  ← 단일 멱등 적립 (구 recordSuccessfulPayment)
  index.ts                      # 순수/공유 모듈 재노출
  providers/
    stripe.server.ts            # createCheckoutSession(), verifyPayment()
    portone.server.ts           # verifyPayment()
    lemonsqueezy.server.ts      # 🚧 Phase 1 MoR 스켈레톤 (PaymentVerifier 구현 예정)
src/lib/payment.functions.ts    # createServerFn 얇은 facade (인증 후 provider 위임). 클라이언트 import 경로 유지.
```

> **새 provider 추가 방법**: ① `providers/<name>.server.ts`에 검증/적립 로직 작성(또는 `PaymentVerifier` 구현) → ② 결제 결과를 `VerifiedPayment`로 정규화 → ③ `grantCredits()` 호출. 웹훅 기반(LS/Apple/Google)은 라우트(`src/routes/api/payments.<name>.ts`)에서 처리, 직접 PG는 `payment.functions.ts`에 서버 함수 래퍼 추가.

### 다음 액션 (Phase 1 착수 시)

1. Lemon Squeezy 가입·상품(variant) 등록 후 `LEMONSQUEEZY_*` 환경변수 설정.
2. 웹훅 라우트 + 서명 검증 + `lemonSqueezyVerifier.verify()` 구현 (§6.1).
3. `payment_webhook_events` 마이그레이션 추가 (§5.2).
4. 클라이언트: 웹 환경에서 LS Checkout 분기(현재 KR=PortOne / 그 외=Stripe → LS 추가).
