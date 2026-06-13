# 게이머 UI 3차 — 시뮬레이터·매장·LFG 톤 통일 지시서 (2026-06-13)

> **이 문서가 3차 UI 작업의 단일 기준이다.** 담당: Antigravity. 검토: Claude.
> 토큰·컴포넌트·대원칙은 [UI_GAMER_SPEC.md](./UI_GAMER_SPEC.md)(2차 확정 시안)를 그대로 따른다. **신규 토큰·신규 공통 컴포넌트 없음.**

## 0. 목표 한 줄

홈·카드·덱·전적까지 적용된 게이머 톤을 **시뮬레이터·매장·LFG**에 동일하게 — 흰 박스(SaaS) 표면을 game 토큰 표면으로 교체한다. **로직은 한 줄도 건드리지 않는다.**

## 1. 대상 파일 (이 6개만)

| 파일 | 성격 | 적용 수위 |
|---|---|---|
| `src/routes/simulator.index.tsx` | 덱 목록 + 대국 설정 | 전면 |
| `src/routes/simulator.$id.tsx` | **대국 게임판 (987줄)** | **보수적 — §3 참조** |
| `src/routes/stores.index.tsx` | 매장 목록 + 지역 필터 | 전면 |
| `src/routes/stores.$id.tsx` | 매장 상세 | 전면 |
| `src/routes/lfg.index.tsx` | 모집글 목록 + 작성 다이얼로그 | 전면 |
| `src/routes/lfg.$id.tsx` | 모집글 상세 | 전면 |

`simulator.tsx`(4줄 레이아웃)·관리자 화면·그 외 라우트는 건드리지 않는다.

## 2. 표면 치환 매핑 (2차 matches.tsx에서 확립된 패턴 그대로)

| 기존 (SaaS) | 교체 (게이머 톤) |
|---|---|
| `bg-card` / `bg-background` 박스 | `bg-game-card` |
| `border-border` | `border-game-line` |
| 호버 강조 `hover:border-primary/40` 등 | `hover:border-game-line-accent` |
| `text-foreground` (강조) | `text-game-text` |
| 보조 텍스트 | `text-game-text-mid` |
| `text-muted-foreground` (라벨·설명) | `text-game-text-dim` |
| `text-primary` 링크·활성 | `text-game-blue` |
| 즐겨찾기 별 `text-yellow-500` (stores) | `text-game-gold` |
| 상태 양성(모집중·승리·OPEN) | `text-game-win` |
| 상태 음성(마감·삭제·실패) | `text-game-loss` |
| 탭/세그먼트 활성·비활성 | matches.tsx 277~348행 패턴 재사용 |

- `PageHeader` · `EmptyState` · shadcn 컴포넌트(Dialog/Select/Dropdown)는 **그대로 유지** — 2차와 동일하게 감싸는 표면만 교체.
- 게임 태그 칩(stores `bg-muted` 알약)은 `bg-game-bg` 알약 + `text-game-text-dim`으로.

## 3. 화면별 지침

### 시뮬레이터 목록 (`simulator.index.tsx`)

- 덱 카드·대국 설정 박스·레시피 편집 패널(`rounded-2xl border-border bg-card`)을 §2 매핑으로 교체.
- "대국 시작" CTA는 `--game-blue-deep` 계열로 홈 중앙 버튼과 같은 무게감.
- 빈 덱 상태는 기존 EmptyState 유지(문구 변경 없음).

### 시뮬레이터 대국 (`simulator.$id.tsx`) — ⚠️ 보수적

- **게임판 내부(카드 배치·핸드·필드·전투 UI)는 변경 금지.** 버그 리스크 대비 효과가 나쁘다.
- 허용 범위: 게임판을 감싸는 **외곽 패널 배경·테두리·상단 바·결과 표시 텍스트 색**만 §2 매핑 적용.
- 한 줄이라도 로직·상태·이벤트 핸들러에 닿으면 중단하고 보고.

### 매장 (`stores.index.tsx` / `stores.$id.tsx`)

- 매장 카드 li를 game 표면으로, 즐겨찾기 별은 `text-game-gold`(채움 동일).
- 전화·지도·URL 링크 아이콘 행은 `text-game-text-dim` → hover `text-game-text`.
- 지역 Select·신규 매장 Dialog는 shadcn 그대로(표면만).

### LFG (`lfg.index.tsx` / `lfg.$id.tsx`)

- 모집글 카드를 game 표면으로. 상태 배지: 모집중 `--game-win` / 마감 `--game-text-dim`.
- `quick_match`(번개 Zap) 글은 `border-game-line-accent`로 한 단계 강조.
- 카테고리(친선/티어/대회연습) 칩은 MenuTile 아이콘 칩 4색 순환 재사용 가능(선택), 무리면 단색 칩.

## 4. 불변 규칙 (2차와 동일 — 위반 시 반려)

- **로직·라우트·데이터 쿼리·이벤트 핸들러 변경 금지** — className·스타일 표면만.
- 새 패키지 금지, lucide 아이콘만. 기존 아이콘 교체 금지.
- 라이트 테마는 깨지지만 않게(다크 우선).
- 빈 상태·로딩·에러 분기 기존 동작 보존. NaN·깨진 숫자 노출 금지.
- 신규 문구 없음이 원칙 — 부득이하면 i18n 키로 ko/en/ja 3개 언어 모두 추가.
- 한국어로 계획·보고, **브랜치에 push 후 보고** (main 직접 push 금지).

## 5. 작업 순서 · 검증

1. 매장(가장 단순) → LFG → 시뮬레이터 목록 → 시뮬레이터 대국(외곽만) 순으로 진행.
2. 각 화면 완료 시 `bun run build` 통과 확인 (실패 상태로 다음 화면 진행 금지).
3. 전체 완료 → 브랜치 push → 보고 → Claude가 화면 검증(`verify`) 후 병합 → 사용자 폰 평가.
