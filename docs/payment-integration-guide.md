# 결제 시스템(PortOne & PayPal) 연동 및 운영 가이드

이 문서는 TCG Hub의 결제 시스템을 실제 운영 환경에 맞게 최종 설정하는 방법을 설명합니다.

---

## 1. 구현 요약
- **국내 결제**: [포트원(PortOne)](https://portone.io/) SDK 연동 (`src/lib/payment.ts`)
- **해외 결제**: [PayPal](https://www.paypal.com/) SDK 연동 (`src/lib/payment.ts`)
- **사용자 인터페이스**: 상점 페이지(`src/routes/store.tsx`) 및 결제 선택 모달(`src/components/payment/PaymentDialog.tsx`)

---

## 2. 결제 대행사(PG) 설정

### 🟢 포트원 (국내 결제)
1. **포트원 관리자 콘솔** 접속 및 로그인
2. **결제 연동 > 내 식별코드** 확인
    - `가맹점 식별코드 (User Code)`를 확인합니다.
3. **결제 연동 > 결제 대행사 설정**
    - 사용할 PG사(예: KG이니시스, 토스페이먼츠 등)를 설정하고 테스트 모드를 활성화합니다.
4. **코드 업데이트**:
    - `src/components/payment/PaymentDialog.tsx`의 `handleDomesticPayment` 함수 내 `userCode` 변수에 자신의 가맹점 식별코드를 입력합니다.

### 🟡 PayPal (해외 결제)
1. **PayPal Developer Portal** ([developer.paypal.com](https://developer.paypal.com/)) 접속
2. **Apps & Credentials**에서 새 앱을 생성하고 **Client ID**를 발급받습니다.
3. **코드 업데이트**:
    - 현재 `PaymentDialog.tsx`에서는 PayPal SDK 연동이 틀만 잡혀 있습니다. 실사용을 위해 `initPayPalButtons`를 호출할 때 발급받은 `clientId`를 전달해야 합니다.

---

## 3. 백엔드 검증 (Supabase Edge Function)

결제가 클라이언트에서 성공하더라도, 서버에서 반드시 검증(Verification) 절차를 거쳐야 합니다.

### 단계:
1. **Edge Function 생성**:
   `supabase/functions/verify-payment/index.ts`를 생성하여 포트원/PayPal API를 호출해 결제 유효성을 확인합니다.
2. **포트원 웹훅(Webhook) 등록**:
   포트원 관리자 콘솔에서 결제 성공 시 호출될 URL을 등록합니다:
   `https://<YOUR_PROJECT_ID>.supabase.co/functions/v1/verify-payment`
3. **DB 반영**:
   검증이 완료되면 `payments` 테이블에 기록하고 사용자의 크레딧을 업데이트하는 로직을 Edge Function 내에 구현합니다.

---

## 4. DB 스키마 제안 (Migration)

결제 내역 관리를 위해 다음과 같은 테이블 생성을 권장합니다:

```sql
create table public.payments (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users not null,
  amount numeric not null,
  currency text not null default 'KRW',
  status text not null default 'pending', -- pending, completed, failed, cancelled
  provider text not null, -- portone, paypal
  order_id text unique not null,
  provider_payment_id text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- RLS 설정: 사용자 본인의 결제 내역만 조회 가능
alter table public.payments enable row level security;
create policy "Users can view own payments" on public.payments 
  for select using (auth.uid() = user_id);
```

---

## 5. 향후 작업 권장 사항
- **테스트 결제**: 실제 카드로 결제하기 전 반드시 각 서비스의 'Sandbox/Test' 환경에서 100원 결제 등을 테스트해 보세요.
- **환불 로직**: 취소 및 환불 처리를 위한 어드민 페이지와 API 연동이 추가로 필요할 수 있습니다.
- **통화 변환**: 현재 PayPal은 고정 환율(1300원)을 예시로 사용하고 있습니다. 실서비스 시 환율 API 연동을 고려하세요.
