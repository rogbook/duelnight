# TCG AI · 팩 시뮬레이터 스펙

> 범용 TCG AI 배틀 및 팩 시뮬레이터 기술 스펙. **1차 타깃: OPTCG (원피스 카드게임)**.
> `ITcgEngine` 인터페이스를 통해 DTCG·PTCG 등으로 확장 가능.

상위 로드맵: [`.lovable/plan.md`](../.lovable/plan.md)
DB 변경 절차: [`docs/DB_WORKFLOW.md`](./DB_WORKFLOW.md)
DSL 검증 게이트: [`docs/SIMULATOR_SAMPLE_CARDS.md`](./SIMULATOR_SAMPLE_CARDS.md)

---

## 1. 설계 원칙

1. **게임 규칙 분리**: 코어는 `ITcgEngine` 인터페이스만 알고, 규칙은 각 게임 엔진 모듈이 구현.
2. **순수 함수 엔진**: `applyAction(state, action) → state`. 사이드 이펙트 없음 → 테스트·리플레이 용이.
3. **결정론적 RNG**: 모든 셔플·코인은 `state.rngSeed` 기반. 동일 입력 → 동일 결과.
4. **효과는 데이터**: 카드 효과는 TS 코드가 아닌 JSON DSL로 저장 (`cards.effects`).
5. **AI는 가치함수**: `V = Σ Wi · feature_i`로 액션 선택. W는 게임별 상수.
6. **인터럽트 처리**: 공격 선언 → 응답 윈도우(카운터) → 데미지 산정 단계 모델.

---

## 2. ITcgEngine 인터페이스

```ts
export interface ITcgEngine<S extends GameState = GameState> {
  init(decks: [DeckRecipe, DeckRecipe], seed: string): S;
  getAvailableActions(state: S, player: PlayerId): Action[];
  applyAction(state: S, action: Action): S;
  isTerminal(state: S): { winner: PlayerId } | { draw: true } | null;
  meta: EngineMeta;
}

export type EngineMeta = {
  gameCode: "optcg" | "dtcg" | "ptcg";
  zoneLabels: Record<ZoneKind, string>;
  startingLife: number;
  maxCharacterArea?: number; // OPTCG=5
  startingHandSize: number; // OPTCG=5
};
```

---

## 3. GameState 모델

```ts
export type PlayerId = "p1" | "p2";
export type ZoneKind =
  | "primary"
  | "secondary"
  | "resource"
  | "graveyard"
  | "hand"
  | "deck"
  | "life";

export interface CardInstance {
  iid: string; // 게임 내 고유 ID
  code: string; // cards.code 참조
  rested: boolean; // 레스트 상태
  power?: number; // 현재 파워 (수정자 반영)
  attached: CardInstance[]; // 부착 카드/DON!!
  counters: Record<string, number>; // damage, power_mod, status_flags
}

export interface Zones {
  primary: CardInstance[]; // OPTCG: 리더 1장 / DTCG: 배틀존
  secondary: CardInstance[]; // OPTCG: 캐릭터 에리어(최대 5) / DTCG: 벤치
  resource: CardInstance[]; // OPTCG: 두웅!! 코스트 에리어 / PTCG: 에너지
  graveyard: CardInstance[]; // 트래시
  hand: CardInstance[];
  deck: CardInstance[];
  life: CardInstance[]; // OPTCG: 라이프 / DTCG: 시큐리티 / PTCG: 사이드
}

export interface PlayerState {
  id: PlayerId;
  zones: Zones;
  donDeck: number; // OPTCG 전용: 남은 두웅!! 덱 수 (보통 10)
  donActive: number; // 액티브 두웅!! 수
  donRested: number; // 레스트 두웅!! 수
  turnFlags: {
    activatedThisTurn: string[]; // iid 목록 (Activate:Main 1회 제한)
    donAttachedThisTurn: number;
  };
}

export interface GameState {
  rngSeed: string;
  turn: number;
  activePlayer: PlayerId;
  phase: TurnPhase;
  pendingResponse: PendingResponse | null; // 인터럽트 윈도우
  players: Record<PlayerId, PlayerState>;
  log: GameEvent[];
}

export type TurnPhase =
  | "refresh" // 카드 액티브화
  | "draw"
  | "don" // 두웅!! 드로우(2장)
  | "main"
  | "attack_declared" // 공격 선언 후, 카운터 응답 대기
  | "end"
  | "ended";

export interface PendingResponse {
  kind: "counter_window";
  attackerIid: string; // 공격자 카드 iid (리더 또는 캐릭터)
  defenderIid: string; // 대상 (리더 또는 레스트 캐릭터)
  defenderPlayer: PlayerId;
  baseAttackerPower: number;
  baseDefenderPower: number;
  appliedModifiers: { source: string; delta: number }[];
}
```

---

## 4. Action 타입 (OPTCG)

```ts
export type Action =
  // 메인 페이즈
  | { type: "play_character"; iid: string; donToPay: number }
  | { type: "play_event"; iid: string; donToPay: number }
  | { type: "play_stage"; iid: string; donToPay: number }
  | { type: "attach_don"; targetIid: string; count: number } // 캐릭터/리더에 두웅!! 부착
  | { type: "activate_main"; sourceIid: string } // 기동: 메인
  // 어택 페이즈
  | { type: "attack"; attackerIid: string; targetIid: string }
  // 카운터 윈도우 응답
  | { type: "play_counter"; iid: string; targetIid: string }
  | { type: "use_blocker"; blockerIid: string }
  | { type: "pass_counter" }
  // 페이즈 전이
  | { type: "end_main" }
  | { type: "concede" };
```

검증·효과 실행은 엔진 `applyAction` + DSL 인터프리터에 위임.

---

## 5. 효과 DSL

### 5.1 스키마

```jsonc
{
  "id": "on_play:draw1",
  "label": "등장 시 1장 드로우",
  "trigger": "on_play",
  "cost": { "don_rest": 1 }, // 비용 (없으면 무비용)
  "conditions": [{ "kind": "self_leader_name_is", "value": "나미" }],
  "actions": [{ "kind": "draw", "count": 1 }],
}
```

### 5.2 trigger 종류

| trigger                         | 발동 시점                           |
| ------------------------------- | ----------------------------------- |
| `on_play`                       | 캐릭터·스테이지 등장 직후           |
| `on_ko`                         | 자신이 KO될 때                      |
| `on_block`                      | 블로커가 어택 대상이 됐을 때        |
| `on_attack`                     | 어택 선언 직후                      |
| `on_being_attacked`             | 어택 대상이 됐을 때 (카운터 윈도우) |
| `on_trigger`                    | 라이프에서 트리거 발동              |
| `on_turn_start` / `on_turn_end` | 자기 턴                             |
| `activate_main`                 | 수동, 메인 페이즈 (턴 1회)          |
| `counter`                       | 카운터 윈도우 내에서만 발동 가능    |
| `passive`                       | 상시                                |

### 5.3 action 종류 (1차)

| action.kind          | 파라미터                                 | 설명                        |
| -------------------- | ---------------------------------------- | --------------------------- |
| `draw`               | `count`                                  | 카드 드로우                 |
| `discard_hand`       | `count, who, choose`                     | 손패 버리기                 |
| `look_deck`          | `count, then[]`                          | 덱 위 N장 확인 후 처리      |
| `search_deck`        | `filter, count, destination, then_order` | 덱 서치                     |
| `ko_target`          | `filter, count, target`                  | KO                          |
| `return_to_hand`     | `filter, count, target`                  | 패로 회수                   |
| `rest_target`        | `count, target`                          | 레스트                      |
| `active_target`      | `count, target`                          | 액티브                      |
| `power_modifier`     | `delta, duration, target, scope`         | 파워 ±N                     |
| `attach_don`         | `count, target, state`                   | 두웅!! 부착 (액티브/레스트) |
| `return_don_to_deck` | `count, state`                           | 두웅!! 회수                 |
| `gain_keyword`       | `keyword, duration, target`              | 속공·블로커·러쉬 부여       |
| `look_life`          | `count, then[]`                          | 라이프 확인                 |
| `add_to_life`        | `from, count`                            | 패→라이프                   |
| `choose_one`         | `options[]`                              | 모드 선택                   |

### 5.4 target 셀렉터

```text
self_leader | opponent_leader | self_active(iid) |
self_character_any | opponent_character_any |
self_character_filter(filter) | opponent_character_filter(filter) |
chosen_target  (액션 발동 시 플레이어/AI가 지정)
```

### 5.5 filter

```jsonc
{
  "cost_max": 5,
  "cost_min": 0,
  "power_max": 6000,
  "color": ["red", "green"],
  "trait": ["밀짚모자 일당", "초신성"],
  "type": ["character", "event"],
  "rested_only": true,
}
```

### 5.6 cost (비용)

```jsonc
{
  "don_rest": 1, // 액티브 두웅!! N장 레스트
  "discard_hand": 1, // 손패 N장 버림
  "return_don": 2,
} // 두웅!! 회수
```

---

## 6. 인터럽트 (카운터 윈도우) 모델

```text
1. 공격자가 attack 액션 발행
2. 엔진: phase = "attack_declared", pendingResponse 생성
3. 방어자에게 가능한 응답:
   - play_counter (손패의 카운터 카드 사용)
   - use_blocker  (자신 필드의 블로커 사용)
   - pass_counter (응답 종료)
4. play_counter / use_blocker 적용 → pendingResponse.appliedModifiers 누적
5. pass_counter → 데미지 산정:
   - attackerPower >= defenderPower:
     - 리더 공격 시: 라이프 1장 → 패로
     - 캐릭터 공격 시: 대상 KO → graveyard
   - 미만: 아무 일도 일어나지 않음
6. on_trigger 발동 (라이프 카드 트리거)
7. phase = "main" 복귀
```

DTCG의 시큐리티 체크도 동일 모델로 처리 (응답 액션만 다름).

---

## 7. AI 가치함수 (OPTCG)

### 7.1 알고리즘

```
for action in getAvailableActions(state, ai_player):
  nextState = applyAction(state, action)
  score = V(nextState, ai_player)
return argmax(score)
```

1-ply lookahead. 카운터 윈도우 결정은 별도 평가 함수로 (방어자 시점).

### 7.2 feature 목록

| feature               | 설명                          | 기본 W |
| --------------------- | ----------------------------- | ------ |
| `life_diff`           | 내 라이프 - 상대 라이프       | +40    |
| `board_power_sum`     | 내 보드 파워 총합 / 1000      | +5     |
| `opp_board_power_sum` | 상대 보드 파워 총합 / 1000    | -4     |
| `active_don`          | 내 액티브 두웅!! 수           | +2     |
| `hand_size`           | 내 손패 수                    | +3     |
| `opp_hand_size`       | 상대 손패 수                  | -2     |
| `counter_capacity`    | 손패 내 카운터 합 추정 / 1000 | +2     |
| `bench_count`         | 내 캐릭터 에리어 카드 수      | +4     |
| `tempo_threat`        | 상대 액티브 위협 카드 수      | -3     |
| `terminal_win`        | isTerminal 승                 | +9999  |
| `terminal_loss`       | isTerminal 패                 | -9999  |

가중치는 `src/lib/simulator/ai/value-fn.ts`에 export.

---

## 8. 결정론적 RNG

```ts
// src/lib/simulator/rng.ts
export function nextRng(seed: string): { value: number; nextSeed: string };
export function shuffle<T>(arr: T[], seed: string): { result: T[]; nextSeed: string };
```

모든 RNG는 `state.rngSeed`를 소비하고 새 시드로 갱신 → 리플레이 가능. 라이브러리는 `seedrandom` 또는 직접 구현(murmur).

---

## 9. DB 매핑 (3단계 마이그레이션 대상)

### 9.1 `cards.effects jsonb`

카드당 효과 배열. 기존 `cards.extra`와 분리.

```jsonc
[
  { "id": "on_play:draw1", "trigger": "on_play", "actions": [...] },
  { "id": "counter:plus1000", "trigger": "counter", "actions": [...] }
]
```

### 9.2 `simulator_decks` 테이블

| 컬럼                    | 타입        | 비고                        |
| ----------------------- | ----------- | --------------------------- |
| id                      | uuid        | PK                          |
| user_id                 | uuid        | NOT NULL, auth.users 참조   |
| game                    | text        | 기존 컨벤션 일치            |
| name                    | text        | NOT NULL                    |
| recipe                  | jsonb       | `[{ card_code, quantity }]` |
| leader_code             | text        | OPTCG 전용                  |
| is_public               | boolean     | default false               |
| created_at / updated_at | timestamptz | default now()               |

RLS: 본인 CRUD + `is_public` SELECT.
GRANT: authenticated 전체, service_role 전체, anon 없음.

---

## 10. 협업 분담 ([`DB_WORKFLOW.md`](./DB_WORKFLOW.md) 준수)

| 단계             | 담당        | 산출물                           |
| ---------------- | ----------- | -------------------------------- |
| 0a (이 문서)     | Antigravity | `docs/SIMULATOR_SPEC.md`         |
| 0b (검증 게이트) | Antigravity | `docs/SIMULATOR_SAMPLE_CARDS.md` |
| 1 (TS 코드)      | Antigravity | `src/lib/simulator/**`           |
| 2 (packs upsert) | Antigravity | `src/routes/packs.tsx`           |
| 3 (DB)           | **Lovable** | 마이그레이션 + types.ts          |
| 4-5 (엔진/AI/UI) | Antigravity | 엔진·AI·시뮬 라우트              |

---

_최종 갱신: 2026-06-08 / OPTCG 1차 보정_
