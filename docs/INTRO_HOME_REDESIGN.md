# 인트로 + 홈 재설계 — 확정 결정 반영판 (intro.tsx / index.tsx)

> 작성일: 2026-06-04
> 대상: 비로그인 인트로 `src/routes/intro.tsx`, 로그인 홈 `src/routes/index.tsx`
> 본 문서는 **코드 작성 전 설계 단계**(CLAUDE.md 1단계) 산출물. Gemini/Antigravity/Lovable 공용.
> 기반 설계서(섹션 상세/티어 테이블 등)는 기획 원안을 따르되, **아래 §0 확정 결정으로 단순화**한다.

---

## 0. 확정 결정 (2026-06-04, 운영 기획)

세 가지 결정으로 원안을 단순화한다.

| # | 결정 | 의미 | 설계 반영 |
|---|------|------|-----------|
| **D1** | **비로그인 → 각 게임별 랭킹** | 인트로 메인은 게임별(원피스/포켓몬/디지몬) 리더보드 | 단일 TOP1 "성적표 쇼케이스"를 **게임별 랭킹 중심**으로 교체(쇼케이스는 선택적 티저로 축소) |
| **D2** | **로그인 → 가장 많이 한 게임** | 홈은 내가 제일 많이 플레이한 게임 기준으로 성적표 표시 | `user_ratings`에서 `matches_count` 최다 게임 자동 선택 |
| **D3** | **시즌 = 2개월 간격** | 90일 롤링 폐기, 2개월 시즌제 | 공용 `getSeasonStart()` 유틸(달력 정렬 2개월)로 통일 |

---

## 1. 시즌 정의 (D3) — 공용 유틸

현재 `index.tsx`는 `SEASON_START = now - 90일` 롤링으로 하드코딩되어 있다. 이를 **2개월 달력 시즌**으로 교체하고 공용화한다.

```ts
// src/lib/season.ts (신규)
// 달력 정렬 2개월 시즌: 1-2월 / 3-4월 / 5-6월 / 7-8월 / 9-10월 / 11-12월
export function getSeasonStart(now = new Date()): Date {
  const m = now.getUTCMonth();            // 0..11
  const startMonth = m - (m % 2);         // 0,2,4,6,8,10
  return new Date(Date.UTC(now.getUTCFullYear(), startMonth, 1));
}

export function getSeasonLabel(now = new Date()): string {
  const s = getSeasonStart(now);
  const y = s.getUTCFullYear();
  const half = Math.floor(s.getUTCMonth() / 2) + 1; // 1..6
  return `${y} S${half}`;                  // 예: "2026 S3"
}
```
- 적용처: `index.tsx`(내 시즌 통계), 인트로 랭킹/성적표, 향후 리더보드 시즌 표기.
- **결정 보류**: 시즌 경계를 달력(권장) vs 서비스 런칭일 기준으로 앵커링할지. → 달력 정렬을 기본으로 채택(구현 단순·설명 용이).

---

## 2. 비로그인 인트로 (D1)

### 2-1. 정보 구조 (위→아래)
```
0. 상단바 (로고 / 언어 / 로그인·무료시작)        ← 기존 유지
1. 신규 발매 스크롤 배너 (ReleaseTicker)        ← 기존 재사용 + D-day 뱃지
2. 히어로 (서비스 한 줄 + CTA)                  ← 축소
3. ★ 게임별 랭킹 (NEW 메인) — 게임 탭/스택       ← D1 핵심
     · 원피스 TOP N · 포켓몬 TOP N · 디지몬 TOP N
     · 각 행: 순위 · 아바타 · 닉네임 · 티어 · 승률/판수 · RP
     · "전체 랭킹 보기" → /leaderboard
   (선택) TOP1 성적표 티저 카드 1장 — 가입 유도
4. 기능 소개 / 가격                             ← 기존 유지, 하단 이동
5. 하단 CTA + 푸터                              ← 기존 유지
```

### 2-2. 게임별 랭킹 데이터
- `supabase.rpc("get_leaderboard", { p_game, p_min_total, p_limit })` — 게임별 호출.
- 게임 키: `optcg` / `ptcg` / `dtcg` (GameFilter·leaderboard와 동일).
- 표시 방식 2안(택1, 구현 시 확정):
  - **탭형**: 게임 탭으로 전환(모바일 친화).
  - **스택형**: 3게임 미니 랭킹(TOP3~5)을 세로로 나열(스크롤 한 번에 전체 조망).
  - → 권장: 모바일=탭, 데스크탑=3열 스택(반응형).
- 티어 뱃지: `rating` → 티어 매핑(§4 티어 테이블). 백분위는 순위/총원 근사.

### 2-3. (선택) 성적표 티저
- §3에서 만드는 `SeasonReport` 카드를 **게임별 1위 1명**에 대해 1장만 티저로 노출 가능("가입하면 나도 이런 성적표").
- D1로 메인은 랭킹이므로, 티저는 **옵션**(없어도 됨).

---

## 3. 로그인 홈/대시보드 (D2)

### 3-1. 정보 구조 (위→아래)
```
0. PageHeader + GameFilter                      ← 기존 유지
1. 신규 발매 스크롤 배너 (ReleaseTicker 공유)     ← 인트로와 동일 컴포넌트
2. ★ 내 시즌 성적표 (My Season Report)           ← D2: "가장 많이 한 게임" 기준
     · 내 프로필 + 티어 뱃지 + 상위 %
     · 시즌 요약(승률 / 연승 / 선·후공 / 판수)
     · 내 모스트 덱 Top3
     · 내 상대 메타(매치업)
     · [내 전적 전체 보기] → /matches
3. 핵심 KPI 미니 (보유 카드 / 덱 수 / 다음 일정)   ← 기존 4칸 중 비-전적 항목 슬림 유지
4. 바로가기 그리드 (기존 8개)                     ← 위치만 하단
```

### 3-2. "가장 많이 한 게임" 선택 (D2)
```ts
// user_ratings에서 matches_count 최다 게임을 기본 게임으로
const { data } = await supabase
  .from("user_ratings")
  .select("game, rating, matches_count")
  .eq("user_id", me)
  .order("matches_count", { ascending: false })
  .limit(1);
const primaryGame = data?.[0]?.game ?? null;   // 없으면 빈 상태 처리
```
- GameFilter로 사용자가 다른 게임을 직접 고르면 그 게임 기준으로 성적표 갱신(기본값만 "최다 게임").
- 전적/덱/매치업: `matches`를 `user_id` + `game = primaryGame` + `played_at >= getSeasonStart()`로 조회 → `computeStats()` / `computeStreak()` 재사용.

### 3-3. 빈 상태
- 전적 0: "이번 시즌 첫 전적을 기록해보세요" → `/matches` CTA.
- 레이팅/게임 없음: KPI 미니 + 바로가기만 노출.

---

## 4. 게이미피케이션: 티어 테이블 (rating → 티어)

| 티어 | rating 구간 | 색상 키 |
|------|------------|---------|
| 챌린저 | 1600+ | amber/gold |
| 다이아 | 1400–1599 | sky/cyan |
| 플래티넘 | 1250–1399 | teal |
| 골드 | 1100–1249 | yellow |
| 실버 | 950–1099 | slate |
| 브론즈 | ~949 | orange |

- **TODO**: `user_ratings` 실제 rating 분포 확인 후 구간 보정.
- 유틸: `src/lib/tier.ts` (rating→티어/색상, 순위→백분위). 인트로·홈 공용.

---

## 5. 데이터 소스 (전부 기존 자원으로 충당, 신규 마이그레이션 불필요)

| 화면 | 섹션 | 소스 |
|------|------|------|
| 공용 | 발매 배너 | `events` (kind=release) |
| 인트로 | 게임별 랭킹 | `get_leaderboard(p_game, p_min_total, p_limit)` × 3게임 |
| 인트로(선택) | TOP1 성적표 티저 | `get_leaderboard limit=1` + `get_user_recent_matches` |
| 홈 | 기본 게임 선택 | `user_ratings` order by `matches_count` desc |
| 홈 | 내 시즌 통계 | `matches`(user_id+game+played_at≥시즌시작) → `computeStats`/`computeStreak` |
| 공용 | 티어/백분위 | `user_ratings.rating` + 순위 → `tier.ts` |

---

## 6. 컴포넌트 재사용

```
src/lib/season.ts          ← getSeasonStart / getSeasonLabel (D3, 공용)
src/lib/tier.ts            ← rating→티어/색상/백분위 (공용)

src/components/season-report/
├─ SeasonReport.tsx        ← props로 데이터 주입(내부 fetch 안 함). mode: "me" | "showcase"
├─ ReportHeader.tsx        (프로필+티어+백분위)
├─ SeasonSummaryCards.tsx  (match-stat-cards 패턴 재사용)
├─ MostDeckCards.tsx
└─ MostMatchupCards.tsx

src/components/leaderboard/GameRankingList.tsx  ← 인트로 게임별 랭킹(get_leaderboard)

intro.tsx → <GameRankingList game=.../>  (+ 선택적 <SeasonReport mode="showcase"/>)
index.tsx → <SeasonReport mode="me" game={primaryGame} .../>
```
- `SeasonReport`는 **데이터 주입형**(컨테이너가 fetch) → 인트로(공개 RPC)·홈(내 데이터) 양쪽 재사용.
- 모바일 가로 스크롤은 기존 `match-stat-cards.tsx` 패턴 차용.

---

## 6-1. 구현 현황 (2026-06-04)

- ✅ `src/lib/season.ts` — 2개월 달력 시즌 유틸 (`getSeasonStart/ISO/Label/End`, `getDaysLeftInSeason`).
- ✅ `src/lib/tier.ts` — rating→티어/색상 매핑 + `getTopPercentile`.
- ✅ `src/components/season-report/season-report.tsx` — 데이터 주입형 성적표(요약/모스트덱/매치업).
- ✅ `src/components/leaderboard/game-ranking-list.tsx` — 게임별 랭킹(모바일 탭/데스크탑 3열).
- ✅ `index.tsx` — 90일 롤링 → `getSeasonStart()`, 최다 플레이 게임 자동선택 + 내 성적표 + KPI 미니.
- ✅ `intro.tsx` — 게임별 랭킹 섹션 삽입(히어로 아래).
- ✅ i18n(ko/en/ja) — `tier.*`(6), `seasonReport.*`, `gameRanking.*` 키 추가.
- ⬜ 미적용(후속): ReleaseTicker(발매 배너) 컴포넌트 신규, "상위 X%" 정확 백분위 RPC, GameFilter↔홈 성적표 연동, 티어 임계값 실데이터 보정.

> 검증: 의존성 설치가 샌드박스로 막혀(npm 403) 전체 `tsc/eslint`는 미실행. 신규/변경 파일은 bun 트랜스파일 구문검증 통과. 동적 i18n 키는 `as TranslationKey` 캐스트 처리.

## 7. 구현 단계 (승인 후)

1. `src/lib/season.ts`(2개월 시즌), `src/lib/tier.ts`(티어) 추가.
2. `index.tsx`: `SEASON_START`(90일) → `getSeasonStart()` 교체. "가장 많이 한 게임" 선택 로직 추가.
3. `SeasonReport` 및 하위 카드 컴포넌트(데이터 주입형) 구현 — `computeStats`/`match-stat-cards` 재사용.
4. `index.tsx`에 `ReleaseTicker` + `SeasonReport(mode="me")` 배치, KPI 미니 축소, 바로가기 하단.
5. `intro.tsx`: 게임별 랭킹(`GameRankingList`) 메인 배치, 발매배너 D-day 뱃지, 기능/가격 하단.
6. i18n(ko/en/ja): 티어명, "이번 시즌", "모스트 덱", "상대 메타", "상위 X%", 시즌 라벨 등.
7. 빈/에러 상태, 반응형 QA, 문서·`PROJECT_STATUS.md` 갱신.

---

## 8. 남은 열린 결정

- [x] 인트로 게임별 랭킹 표시 방식 → **반응형(모바일 탭 / 데스크탑 3열)** 채택·구현 완료.
- [x] 인트로 TOP1 성적표 티저 → **채택**. `season-report-teaser.tsx` 구현(게임별 TOP1 중 최고 rating, 가입 CTA).
- [x] 티어 구간 임계값 → ELO 기본 1000·K=32 기준 **1000 앵커로 보정**(challenger 1450 / diamond 1300 / platinum 1180 / gold 1080 / silver 980 / bronze<980). 실데이터 누적 시 재조정(권장). *MCP/네트워크 차단으로 실분포 직접 확인은 보류.*
- [ ] 시즌 앵커: 달력 정렬(기본) vs 런칭일 기준.
- [ ] "상위 X%" 정확 백분위 필요 시 count 집계 RPC 1개 추가 여부.
- [ ] 홈 성적표를 GameFilter와 연동(기본=최다 게임, 사용자가 전환 가능) — 권장 채택.
```
