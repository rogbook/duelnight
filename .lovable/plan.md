# 다른 TCG 게임 확장에 필요한 항목

현재 DB enum `tcg_game`은 `optcg | ptcg | dtcg` 3종만 정의되어 있고, 코드 곳곳에 `optcg` 기본값과 "원피스" 라벨이 하드코딩되어 있다. 신규 게임(예: 유희왕 `ygo`, 매직 `mtg`, 워크라이 `wcg` 등)을 추가하려면 아래 6개 영역을 정리해야 한다.

---

## 1. DB / 백엔드 (마이그레이션 필요)

- **`tcg_game` enum 값 추가**
  `ALTER TYPE public.tcg_game ADD VALUE 'ygo';` (게임별 1회)
  → 영향 테이블: `cards`, `decks`, `matches`, `tier_lists`, `user_ratings`, `events`, `stores.games[]`, `profiles.primary_game`, `lfg_posts` 등 거의 전 도메인.
- **`get_leaderboard(p_game tcg_game, ...)`** 등 enum을 시그니처로 받는 함수 재배포 확인.
- **카드 코드 정규식**: 현재 `/^[A-Z0-9]{2,8}-[A-Z0-9]{2,5}$/` (`card-utils.ts`). 게임별 코드 체계가 다르면 게임별 정규식 분기 필요.
- **자료 적재**: 신규 게임 카드 데이터(코드/이름/타입/색·속성/레어도/이미지) 시드. 관리자 업로드 또는 마이그레이션.

## 2. 게임별 규칙 테이블 (코드 상수)

신규 게임마다 다음 5개 매핑에 항목을 추가해야 한다.

| 파일 | 상수 | 추가할 내용 |
|------|------|-------------|
| `src/lib/deck-colors.ts` | `COLORS_BY_GAME`, `HAS_LEADER`, `REQUIRES_MULTI_COLOR` | 색/속성 목록, 리더 개념 유무 |
| `src/lib/deck-rules.ts` | `CARD_TYPES_BY_GAME`, `DECK_MAX_TOTAL`, `DECK_MAX_COPIES`, `BAN_LIST`, `checkCanAdd` | 카드 타입, 덱 총 장수, 동일 카드 최대 매수, 금제, 게임별 예외(에너지/디지타마/ACE 같은) |
| `src/lib/normalize-deck.ts` | 게임별 색/타입 정규화 매핑 | 신규 게임의 표기 변형 |
| `src/lib/csv.ts` | `VALID_GAME` Set | enum 값 추가 |
| `src/components/cards/card-utils.ts` | `VALID_COLORS`, `VALID_RARITIES`, 코드 정규식 | 신규 색·레어도·코드 패턴 |

> 향후엔 이 5개를 하나의 `src/lib/games/{game}.ts` 모듈로 모으는 리팩토링이 바람직(현재 기술 부채). Antigravity 영역.

## 3. UI 라벨 / 게임 셀렉터 (하드코딩 제거)

지금은 `<SelectItem value="optcg">원피스</SelectItem>` 형태가 9곳 이상 흩어져 있다.

- 영향 파일: `routes/decks.index.tsx`, `tier.tsx`, `collection.tsx`, `profile.tsx`, `cards.index.tsx`, `calendar.tsx`, `matches.tsx`, `stores.tsx`, `lfg.index.tsx`, `components/game-filter.tsx`, `components/ai-coach-card.tsx`
- 정비 방향:
  1. `src/lib/games/registry.ts` 신설 — `{ id, label, defaultColor, hasLeader, ... }[]` 단일 소스
  2. 모든 Select/Filter는 이 배열을 map으로 렌더링
  3. `default game` 값도 `optcg` 리터럴 대신 registry의 첫 항목 또는 `profile.primary_game`을 사용

## 4. 카드 도메인 / OCR / AI

- **`/api/card-ocr`**: `game_hint` Zod enum(`["optcg","ptcg","dtcg"]`) 확장, 프롬프트 내 게임별 카드 레이아웃 설명 추가.
- **`/api/coach`**: 게임별 룰/메타 컨텍스트 프롬프트 분기.
- **`tier.tsx`**: `if (game === "optcg") q.eq("type","leader")` 같은 게임별 후보 카드 쿼리 분기를 registry 기반으로 일반화.

## 5. 콘텐츠 / SEO / 메타데이터

- `routes/index.tsx`, `cards.index.tsx`의 메타 description "원피스·포켓몬·디지몬..." 문구 갱신.
- 카드 샘플 CSV(`public/templates/cards-sample.csv`) 게임별 추가 또는 다중 게임 예시.
- 사이트맵(`sitemap.xml`)에 게임별 카드 인덱스 노출 정책 결정.

## 6. 운영 / 매장 / 이벤트

- `stores.games[]`에 신규 enum이 들어가도 기존 RLS·필터가 정상 동작하는지 검증.
- `events.kind` (대회/모임/발매 등) 중 게임 특화 종류가 있다면 추가.
- LFG/캘린더에서 신규 게임 기본 노출 여부, 정렬 우선순위 결정.

---

## 작업 권장 순서 (게임 1개 추가 기준)

1. **결정 사항 확정** — 게임 ID, 라벨, 색/타입 체계, 덱 룰, 카드 코드 패턴
2. **DB 마이그레이션** — `tcg_game` enum 값 추가 (Lovable)
3. **게임 규칙 모듈 추가** — `deck-colors`, `deck-rules`, `normalize-deck`, `csv`, `card-utils` 일괄 갱신 (Antigravity 권장: 동시 수정량 큼)
4. **게임 registry 도입** — UI 하드코딩 제거 리팩토링 (Antigravity)
5. **OCR/AI 프롬프트 확장** (Antigravity)
6. **콘텐츠/SEO 문구 갱신, 샘플 데이터, 카드 시드** (Lovable)
7. **검증** — 카드 업로드 → 덱 빌드 → 매칭/전적 → 티어/리더보드 → 매장/이벤트 end-to-end

## 협업 분담 요약

- **Lovable**: DB 마이그레이션, 카드 시드, 콘텐츠/SEO 문구, 라벨 텍스트 수정
- **Antigravity**: 게임 registry 리팩토링, 게임별 규칙 모듈 정비, OCR/AI 프롬프트 분기, 게임 추상화 유지보수

> 가장 비용이 큰 작업은 **3·4번(게임 추상화 리팩토링)**. 신규 게임 추가 전에 먼저 registry 패턴으로 정리해두면 이후 N번째 게임 추가는 거의 데이터 입력 수준으로 줄어든다.
