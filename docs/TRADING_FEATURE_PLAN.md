# 실물 카드 교환(트레이딩) 기능 설계서 (추후 개발용)

> 상태: **기획 보류 → 결정 후 개발**. 본 문서는 결정 시 바로 착수할 수 있도록 모델·단계·DB 초안·재사용 자산을 정리한 것.
> 대상: DuelNight(실물 TCG 컴패니언). 작성 2026-06.

## 0. 핵심 전제 — "이전"이 아니라 "연결"

| | 디지털(포켓몬 TCG Pocket) | **실물(DuelNight)** |
|---|---|---|
| 앱의 역할 | 카드를 앱이 **보관·즉시 이전**(custody/escrow) | **만남·대화·신뢰를 연결**. 실제 교환은 오프라인(매장/이벤트/택배) |
| 핵심 모델 | 소유권 이전 | **교환소(matching marketplace) + DM + 평판** |
| 결제 | 인앱 | v1은 **앱이 직접 다루지 않음**(분쟁·규제 리스크). 연락·약속만. |

→ 앱은 *누가 무엇을 가졌고/원하는지* 보여주고, *서로 연결*하고, *거래 후 신뢰를 쌓게* 한다. 실제 카드·돈 교환은 사람끼리.

## 1. 재사용 가능한 기존 자산 (이미 구현됨)
- **DM(1:1 메시지)** — 협상 채널. `start_dm` / `/messages`.
- **친구 + 즐겨찾기 + 전역 온라인(presence)** — 신뢰 관계, 단골 거래 상대.
- **차단/신고(user_blocks/user_reports)** — 사기·악성 차단.
- **매장/지역(stores) + LFG(매칭)** — 오프라인 직거래 장소·지역 매칭.
- **컬렉션(user_collection)** — 보유 카드 원천(현재 `card_code, quantity`만).
- **알림(notifications) + Realtime** — 매칭/제안 알림.

→ 트레이딩은 위를 조합 + "보유/구함/거래" 데이터만 추가하면 된다.

## 2. 기능 단계 (Phase)

### 1단계 — 보유/구함 등록 (기반)
- 컬렉션에서 카드별 **"교환 가능(for_trade)"** 토글 + **상태(condition)** + **수량**.
- **위시리스트(구함)** — 원하는 카드 등록(+우선순위/메모).

### 2단계 — 교환 찾기 + 매칭
- **카드 검색 → 보유자 목록**: 그 카드를 "교환 가능"으로 둔 유저(+지역) → 바로 DM/즐겨찾기.
- **상호 매칭 추천**: `내 위시 ∩ 상대 보유` + `상대 위시 ∩ 내 보유` → 서로 맞는 상대 자동 추천. 지역 필터.

### 3단계 — 성사 + 평판
- 거래 상태(제안→수락→완료) 기록.
- **거래 후 상호 평가/후기 + 거래 횟수 배지**.
- 안전거래 가이드, (선택) 매장 인증 거래.

### 4단계(추후/선택)
- 시세 표시(데이터 확보 후), 안전결제/에스크로, 다자 교환, 알림 고도화.

## 3. 실물 특화 체크리스트
- **카드 상태(condition)**: NM/LP/MP/HP/DMG 등 등급 + **실물 사진 첨부**(진위/상태 확인).
- **거래 방식**: 직거래(매장·이벤트) vs 택배 → **지역**이 매우 중요(매장/지역 데이터 활용).
- **사기 방지**: 평판·신고·차단, 안전거래 가이드, 매장 인증 거래(중개).
- **결제 비취급(v1)**: 연락·약속만. 결제/에스크로는 분쟁·규제 검토 후 별도.
- **개인정보**: 연락처 노출 최소화(앱 내 DM 우선).

## 4. DB 스키마 초안 (Lovable 적용용 — 결정 시 확정)

```sql
-- 컬렉션 확장: 교환 가능 표시 + 상태
alter table public.user_collection
  add column if not exists for_trade boolean not null default false,
  add column if not exists condition text;          -- 'NM'|'LP'|'MP'|'HP'|'DMG'

-- 위시리스트(구함)
create table if not exists public.wishlist (
  user_id uuid not null references auth.users(id) on delete cascade,
  card_code text not null,
  priority int not null default 0,
  note text,
  created_at timestamptz not null default now(),
  primary key (user_id, card_code)
);
alter table public.wishlist enable row level security;
create policy "wishlist self write" on public.wishlist
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
-- 매칭을 위해 타인의 위시 조회 허용(공개) 또는 RPC로 제한 — 결정 필요
create policy "wishlist public read" on public.wishlist for select using (true);

-- (3단계) 거래 기록 + 평가
create table if not exists public.trades (
  id uuid primary key default gen_random_uuid(),
  proposer_id uuid not null references auth.users(id) on delete cascade,
  receiver_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'proposed',  -- proposed|accepted|completed|cancelled
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.trade_reviews (
  trade_id uuid not null references public.trades(id) on delete cascade,
  reviewer_id uuid not null references auth.users(id) on delete cascade,
  rating int not null check (rating between 1 and 5),
  comment text,
  created_at timestamptz not null default now(),
  primary key (trade_id, reviewer_id)
);
-- RLS/매칭용 RPC(예: find_trade_matches, list_card_owners)는 확정 시 작성.
```

> 주의: 위시 공개 범위(전체 공개 vs 매칭 RPC 한정)와 보유 컬렉션 공개 범위는 **개인정보/UX 결정 사항**. 기본은 "교환 가능으로 표시한 카드만 타인에게 노출".

## 5. 프론트엔드 작업 범위(요약)
- 컬렉션 화면: 카드별 교환가능/상태 토글 UI.
- `/trade`(가칭): ① 위시리스트 관리 ② 카드 검색→보유자 목록(+지역) ③ 상호 매칭 추천 탭.
- 카드 상세/보유자 카드에 **DM 보내기(StartDmButton 재사용)** + 즐겨찾기.
- (3단계) 거래 제안/수락/완료 + 평가 모달, 프로필에 거래 평판 배지.
- i18n(ko/en/ja), 다크/라이트, 반응형.

## 6. v1 추천 (작게 시작)
**컬렉션 "교환 가능 + 상태" 토글 → 위시리스트 → "교환 찾기"(카드로 보유자 검색 + 지역) → DM 연결(이미 있음).**
여유 시 **상호 매칭 추천**까지. **거래 평가/후기**는 거래가 실제로 돌기 시작한 뒤(2차).

## 7. 결정이 필요한 열린 항목 (착수 전 확정)
- [ ] 위시/보유 **공개 범위**(전체 공개 vs 친구/매칭 한정 vs 교환표시 카드만).
- [ ] **거래 방식** 우선순위(직거래 중심 vs 택배 포함).
- [ ] **평가/평판** v1 포함 여부.
- [ ] **결제** 취급 여부(기본: 미취급).
- [ ] 매칭 추천의 **지역 기준**(매장/시도 단위).

## 8. 분업
- DB(테이블/RLS/RPC) = **Lovable 적용**(Claude가 마이그레이션 SQL 작성·전달).
- 프론트(화면/로직) = Claude 구현. 미리보기 검증 = Lovable.
