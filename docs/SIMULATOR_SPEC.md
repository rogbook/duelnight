# TCG AI · 팩 시뮬레이터 스펙

> 범용 TCG AI 배틀 및 팩 시뮬레이터의 기술 스펙. PTCG(포켓몬 TCG)를 1차 타깃으로 하며, `ITcgEngine` 인터페이스를 통해 다른 게임(OPTCG, DTCG)도 동일한 코어 위에서 확장된다.

상위 로드맵: [`.lovable/plan.md`](../.lovable/plan.md)
DB 변경 절차: [`docs/DB_WORKFLOW.md`](./DB_WORKFLOW.md)

---

## 1. 설계 원칙

1. **게임 규칙 분리**: 코어는 `ITcgEngine` 인터페이스만 알고, 규칙은 각 게임별 엔진 모듈이 구현한다.
2. **순수 함수 엔진**: `applyAction(state, action) → state`. 사이드 이펙트 없음 → 단위 테스트·리플레이 용이.
3. **결정론적 RNG**: 모든 셔플·코인 토스는 `state.rngSeed` 기반. 동일 입력 → 동일 결과.
4. **효과는 데이터**: 카드 효과는 TS 코드가 아닌 JSON DSL로 저장 (`cards.effects`). 비개발자도 카드 추가 가능.
5. **AI는 가치함수**: 강화학습 대신 `V = Σ Wi · feature_i`로 액션 선택. W는 게임별 상수.

---

## 2. ITcgEngine 인터페이스

```ts
export interface ITcgEngine<S extends GameState = GameState> {
  /** 양 플레이어의 덱 레시피로 초기 상태 생성 (시드 포함) */
  init(decks: [DeckRecipe, DeckRecipe], seed: string): S;

  /** 특정 플레이어가 현재 상태에서 둘 수 있는 모든 액션 */
  getAvailableActions(state: S, player: PlayerId): Action[];

  /** 액션 적용 → 새 상태 (불변, 신규 객체 반환) */
  applyAction(state: S, action: Action): S;

  /** 종료 판정 — 승자 또는 null */
  isTerminal(state: S): { winner: PlayerId } | { draw: true } | null;

  /** 게임별 메타 정보 (UI에서 zone 라벨링 등에 사용) */
  meta: EngineMeta;
}

export type EngineMeta = {
  gameCode: "ptcg" | "optcg" | "dtcg";
  zoneLabels: Record<ZoneKind, string>;  // 게임별 한국어 라벨
  maxBenchSize?: number;
  prizeCount?: number;
};
```

---

## 3. GameState 모델

```ts
export type PlayerId = "p1" | "p2";
export type ZoneKind = "primary" | "secondary" | "resource" | "graveyard" | "hand" | "deck" | "prize";

export interface CardInstance {
  iid: string;                    // 게임 내 고유 ID (셔플마다 재부여)
  code: string;                   // cards.code 참조
  counters: Record<string, number>; // damage, energy_count, status_flags
  attached: CardInstance[];       // 부착 카드 (에너지, 도구)
}

export interface Zones {
  primary: CardInstance[];        // PTCG: 액티브 / OPTCG: 리더 / DTCG: 배틀
  secondary: CardInstance[];      // PTCG: 벤치 / OPTCG: 캐릭터
  resource: CardInstance[];       // PTCG: 부착 에너지(액티브/벤치 내부) / OPTCG: 돈
  graveyard: CardInstance[];      // 트래시 / 묘지
  hand: CardInstance[];
  deck: CardInstance[];
  prize: CardInstance[];          // PTCG 사이드 / OPTCG 라이프 / DTCG 시큐리티
}

export interface PlayerState {
  id: PlayerId;
  zones: Zones;
  turnFlags: {
    energyAttachedThisTurn: boolean;
    supporterPlayedThisTurn: boolean;
    hasEvolvedThisTurn: string[]; // iid 목록
  };
}

export interface GameState {
  rngSeed: string;                // 다음 RNG 호출에 사용
  turn: number;
  activePlayer: PlayerId;
  phase: TurnPhase;
  players: Record<PlayerId, PlayerState>;
  log: GameEvent[];               // 디버깅·리플레이용
}

export type TurnPhase =
  | "setup"
  | "draw"
  | "main"
  | "attack"
  | "between_turns"
  | "ended";
```

---

## 4. Action 타입

```ts
export type Action =
  | { type: "play_basic"; iid: string }                       // 손패 → 벤치
  | { type: "evolve"; targetIid: string; cardIid: string }
  | { type: "attach_energy"; energyIid: string; targetIid: string }
  | { type: "retreat"; benchIid: string }
  | { type: "play_trainer"; iid: string; payload?: unknown }
  | { type: "use_ability"; sourceIid: string; abilityId: string }
  | { type: "declare_attack"; attackId: string }
  | { type: "end_turn"}
  | { type: "concede" };
```

각 액션은 게임 엔진의 `applyAction`에서 검증 후 효과 DSL 인터프리터에 위임된다.

---

## 5. 효과 DSL

### 5.1 스키마

```jsonc
{
  "id": "attack:thunderbolt",        // 카드 내 고유
  "label": "백만볼트",
  "trigger": "on_attack",            // when to fire
  "cost": { "energy": { "L": 2, "any": 2 } },  // PTCG 공격 코스트
  "conditions": [
    { "kind": "active_self", "card_code": "any" }
  ],
  "actions": [
    { "kind": "deal_damage", "amount": 120, "target": "opponent_active" },
    { "kind": "discard_attached", "filter": { "category": "energy" }, "count": 2, "target": "self_active" }
  ]
}
```

### 5.2 trigger 종류

| trigger | 발동 시점 |
|---|---|
| `on_play` | 카드를 필드에 낼 때 |
| `on_evolve` | 진화 직후 |
| `on_attack` | 공격 선언 → 데미지 산정 |
| `on_damage_taken` | 데미지 받은 직후 |
| `on_turn_start` | 자기 턴 시작 |
| `on_turn_end` | 자기 턴 종료 |
| `ability` | 수동 발동 능력 (포켓파워/특성) |
| `passive` | 상시 적용 (수정자 발동) |

### 5.3 action 종류 (1차)

| action.kind | 파라미터 | 설명 |
|---|---|---|
| `deal_damage` | `amount, target, weakness_apply?` | 데미지 |
| `heal` | `amount, target` | 회복 |
| `draw` | `count` | 카드 드로우 |
| `discard_hand` | `count, who` | 손패 버림 (랜덤/선택) |
| `discard_attached` | `filter, count, target` | 부착물 트래시 |
| `attach_energy` | `from, type, target` | 에너지 부착 |
| `search_deck` | `filter, count, destination` | 덱 서치 |
| `switch_active` | `target` | 액티브 교체 |
| `apply_status` | `status, target, duration` | 마비/잠듦/독 |
| `coin_flip` | `count, on_heads[], on_tails[]` | 코인 (중첩 actions) |
| `modify_damage` | `delta, when, scope` | 데미지 보정 (passive) |
| `prevent_damage` | `amount, duration, target` | 데미지 경감 |

### 5.4 target 셀렉터

`self_active | opponent_active | self_bench[i] | opponent_bench[i] | self_bench_any | opponent_bench_any | all_opponent | choose`

`choose`는 플레이어 입력이 필요 → AI는 가치함수로 자동 결정.

### 5.5 filter

```jsonc
{ "category": "energy" | "pokemon" | "trainer" | "tool",
  "type": ["L", "F"],                  // 에너지 타입
  "subtype": "basic" | "stage1" | "stage2" | "ex" | "v",
  "trait": ["item", "supporter", "stadium"] }
```

---

## 6. PTCG 샘플 검증 (30장 표현 가능성)

DSL이 충분한지 확인하기 위해 PTCG 대표 카드 30장을 DSL로 표현 가능해야 한다. 표현 불가 카드 발견 시 DSL 확장 후 컬럼 추가(3단계)로 진행.

검증 카테고리:
- **베이직 포켓몬** 6장 (피카츄/이브이/리자몽EX 등 — 단순 공격, 능력 없음/있음)
- **스테이지1·2** 6장 (라이츄/뮤츠EX/리자몽 진화)
- **트레이너스 — 아이템** 6장 (몬스터볼/하이퍼볼/스위치)
- **트레이너스 — 서포터** 6장 (박사의 연구/마리/보스의 지령)
- **트레이너스 — 스타디움** 2장
- **에너지** 4장 (기본/특수)

각 카드의 DSL 예시는 `docs/SIMULATOR_SAMPLE_CARDS.md`로 분리 (1단계 진행 중 작성).

---

## 7. AI 가치함수

### 7.1 알고리즘

```
for action in getAvailableActions(state, ai_player):
  nextState = applyAction(state, action)
  score = V(nextState, ai_player)
return argmax(score)
```

복합 액션(예: 트레이너 플레이 후 공격)은 1-ply 확장 + 휴리스틱 카운터로 처리. 깊이 2 이상은 추후.

### 7.2 PTCG feature 목록 (1차)

| feature | 설명 | 기본 W |
|---|---|---|
| `prize_taken` | 내가 가져간 사이드 수 (6 - 남은 prize) | +30 |
| `opp_prize_taken` | 상대가 가져간 사이드 수 | -30 |
| `active_hp_ratio` | 내 액티브 HP 비율 (0~1) | +10 |
| `opp_active_hp_ratio` | 상대 액티브 HP 비율 | -8 |
| `bench_threat` | 내 벤치 카드의 평균 공격력 추정 | +3 |
| `hand_size` | 내 손패 수 | +1 |
| `energy_progress` | 내 부착 에너지 총합 | +2 |
| `setup_penalty` | 내 벤치가 비어있으면 (위험) | -15 |
| `terminal_win` | isTerminal 승 | +9999 |
| `terminal_loss` | isTerminal 패 | -9999 |

가중치는 `src/lib/simulator/ai/value-fn.ts`에 export하여 튜닝 가능.

---

## 8. 결정론적 RNG

```ts
// src/lib/simulator/rng.ts
export function nextRng(seed: string): { value: number; nextSeed: string };
export function shuffle<T>(arr: T[], seed: string): { result: T[]; nextSeed: string };
export function flipCoin(seed: string): { heads: boolean; nextSeed: string };
```

`seedrandom` 또는 직접 구현(murmur+linear). 모든 RNG 호출은 `state.rngSeed`를 소비하고 신규 시드로 갱신 → 리플레이 가능.

---

## 9. DB 매핑 (3단계 마이그레이션 대상)

### 9.1 `cards.effects jsonb`

```jsonc
[
  { "id": "attack:tackle", "trigger": "on_attack", "cost": {...}, "actions": [...] },
  { "id": "ability:static", "trigger": "passive", "actions": [...] }
]
```

기존 `cards.extra`와는 분리. `effects`는 엔진이 직접 파싱·실행하는 정형 데이터, `extra`는 자유 메타.

### 9.2 `simulator_decks` 테이블

| 컬럼 | 타입 | 비고 |
|---|---|---|
| id | uuid | PK |
| user_id | uuid | NOT NULL, auth.users 참조, RLS 키 |
| game | text | 'ptcg' / 'optcg' / 'dtcg' (기존 컨벤션 일치) |
| name | text | NOT NULL |
| recipe | jsonb | `[{ card_code, quantity }]` |
| is_public | boolean | default false |
| created_at / updated_at | timestamptz | default now() |

RLS:
- SELECT: 본인 또는 `is_public = true`
- INSERT/UPDATE/DELETE: 본인만 (`auth.uid() = user_id`)

GRANT: `authenticated` 전체 + `service_role` 전체. `anon`은 부여하지 않음.

---

## 10. 협업 분담 재확인

| 단계 | 담당 | 산출물 |
|---|---|---|
| 0 (이 문서) | Antigravity | `docs/SIMULATOR_SPEC.md` |
| 1 | Antigravity | `src/lib/simulator/**` TS 코드 |
| 2 | Antigravity | `packs.tsx` upsert |
| 3 | **Lovable** | 마이그레이션 + `types.ts` 재생성 |
| 4-5 | Antigravity | 엔진/AI/UI |

DB는 항상 Lovable이 단독 적용 ([`docs/DB_WORKFLOW.md`](./DB_WORKFLOW.md)).

---

_최종 갱신: 2026-06-08 / 1차 작성_
