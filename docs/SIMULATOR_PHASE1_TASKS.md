# 시뮬레이터 Phase 1 작업 지시서 — "효과가 실제 발동하는 AI 대국" (2026-06-13)

> 상위 기획: [SIMULATOR_GAME_PLAN.md](./SIMULATOR_GAME_PLAN.md) §5 Phase 1. 사용자 승인 완료.
> **담당: 1A·1B = Antigravity(또는 Codex), 1C = Claude.** 검증·병합: Claude → 외부 테스터 평가.
> 모든 작업은 **브랜치에 push 후 보고** (main 직접 push 금지). 각 단계 `bun run build` 통과 필수.

## 0. 왜 이 순서인가 (2026-06-13 코드 정밀 진단)

`cards.effects`가 0건이라 적재부터 하려 했으나, 인터프리터·엔진을 정밀 진단한 결과 **데이터를 먼저 넣으면 잘못된 룰로 동작**한다:

| # | 현재 구현 상태 (실측) | 위치 | 증상 |
|---|---|---|---|
| 1 | `applyEffect`가 `conditions`를 평가하지 않음 | `dsl/interpreter.ts:410` | "리더가 나미면" 조건이 무조건 발동 |
| 2 | `resolveTargetIids`가 `count`·`cost_max`·`trait` 필터 무시 (rested_only만 구현) | `dsl/interpreter.ts:67-109` | "상대 1장 -2000"이 **상대 전체** 디버프 |
| 3 | 효과 `cost`(don_rest 등)를 지불하지 않음 | `dsl/interpreter.ts` | 비용 무시 발동 |
| 4 | `power_modifier`의 `this_turn`/`this_battle` 만료 없음 (refresh가 summon_sick만 초기화) | `engines/optcg.ts:337-343` | 임시 버프가 영구 지속 |
| 5 | `play_event`·`play_stage`·`activate_main`이 `applyAction`에 미구현 (액션 목록엔 나오나 적용 시 no-op) | `engines/optcg.ts:289-746` | 이벤트를 내도 아무 일 없음 |

→ **1A(엔진 보강) 완료 후에 1C(효과 본대 적재)**. 단, 블로커는 효과 "존재"만으로 인식되므로(`optcg.ts:217`) 5장은 이미 적재 완료(`20260613100000` 마이그레이션).

---

## 1A. 엔진 보강 (Antigravity) — 5건

> 공통 규칙: `dsl/schema.ts`(zod)·`dsl/interpreter.ts`·`docs/SIMULATOR_SPEC.md` §5를 **한 번에 정합**되게 갱신. 순수 함수·결정론 RNG 유지(랜덤은 반드시 `rng.ts` 경유). 새 패키지 금지.

### 1A-1. conditions 평가

- `applyEffect` 시작 시 `effect.conditions` 전부 평가, 하나라도 거짓이면 효과 미발동(로그 `effect_condition_fail`).
- 구현할 condition kind: 기존 스키마 6종(`self_leader_name_is`, `self_leader_color_is`, `self_has_trait_in_play`, `opponent_character_count_at_least`, `self_life_at_most`, `self_don_active_at_least`) + 신규 `self_leader_trait_has`(잠바이용).
- 리더 이름/특성은 `CARD_METADATA_CACHE`(getCardMeta)에서 조회. **메타에 trait가 없으면** cards 테이블 `extra`/관련 컬럼 확인 후 메타 캐시에 trait 필드 추가(`simulator.$id.tsx`의 select에 컬럼 추가 허용 — 단 쿼리 구조 변경은 금지).

### 1A-2. 대상 해석기: count·filter 적용

- `resolveTargetIids(ctx, targetRef, count)`로 시그니처 확장: 후보를 filter(cost_max/cost_min/trait/color/type — getCardMeta 기반)로 거른 뒤 **최대 count개만** 반환.
- 호출부(ko_target/return_to_hand/rest_target/active_target/power_modifier)가 `action.count`를 전달. `power_modifier`의 `scope:"all_matching"`일 때만 전체.
- 대상 선택 v1: **자동 선택**(유효 후보 중 첫 번째; 상대 대상 디버프류는 파워 최대 우선)으로 단순화. 유저 선택 UI는 Phase 2.

### 1A-3. 효과 cost 지불

- `applyEffect` 전 cost 검증·지불: `don_rest`(액티브→레스트), `discard_hand`(앞에서부터 v1), `return_don`(액티브 우선 회수). 지불 불가 시 효과 미발동.
- `activate_main` 액션을 `applyAction`에 구현: cost 지불 → 효과 적용 → `turnFlags.activatedThisTurn`에 sourceIid 추가(이미 getAvailableActions가 이 플래그로 턴 1회 제한 중).

### 1A-4. 임시 버프 만료 + 카운터 윈도우 연동

- `power_modifier`를 duration별 분리 기록(예: `counters.power_mod_turn` / `power_mod_perm`). `getBattlePower` 합산 갱신, `end_main`의 refresh에서 `power_mod_turn` 초기화. **양쪽 플레이어 턴 종료 시점 기준은 OPTCG 룰대로 "그 턴 종료 시"**(= 현재 refresh 위치면 충분).
- **카운터 윈도우 중**(`state.pendingResponse` 존재) `this_battle` power_modifier는 카드 counters 대신 `pendingResponse.appliedModifiers`에 `{source, delta}`로 누적 → 기존 전투 산정(`pass_counter`)에 자동 반영. 방어자 대상이 defenderIid가 아니면(예: 다른 캐릭터 +) v1에선 defenderIid에만 적용 허용.
- 현재 `power_modifier` 핸들러가 `card.power`와 `counters.power_mod`에 **이중 기록**하는 구조(interpreter.ts:280-297)도 이번에 한 곳으로 정리.

### 1A-5. 이벤트 카드 플레이 구현

- `TriggerSchema`에 `"main"` 추가(이벤트의 【메인】 효과).
- `applyAction`에 `play_event` 구현: 코스트 지불(donActive→Rested) → 손패 제거 → `main` 트리거 효과 적용 → 트래시. 효과 없으면 그냥 트래시(현재처럼 no-op로 손패에 남는 것 금지 — getAvailableActions에서 main 효과 없는 이벤트는 제외해도 됨).
- `play_stage`는 **Phase 1 제외**(상태 모델에 스테이지 존 없음 — 액션 목록에서 제거해 no-op 노출만 막을 것).

### 1A 수용 기준 (전부 통과해야 1C 진행)

- [ ] `bun run build` 통과.
- [ ] 단위 테스트 또는 검증 스크립트로 다음 시나리오 증명(결정론 시드 고정):
  1. 조건 불충족 효과 미발동 (노지코를 나미 외 리더로)
  2. "상대 1장 레스트"가 정확히 1장만 레스트 (이조)
  3. don_rest 4 미만 보유 시 기동 효과 발동 불가, 4 이상 시 don 차감 (루피 리더)
  4. this_turn 디버프가 다음 턴 refresh 후 원복 (오타마)
  5. 카운터 이벤트 +4000이 **그 전투에만** 반영되고 종료 후 흔적 없음 (거미집 그물)
  6. 이벤트 사용 시 don 지불·트래시 이동·KO 적용 (항마의 상)

---

## 1B. 덱 레시피 가져오기 (Antigravity 또는 Codex) — 1A와 병행 가능

위치: `src/routes/simulator.index.tsx` (덱 목록 영역). **로직 재사용**: 기존 `simulator_decks` insert 뮤테이션·`checkCanAdd`(deck-rules) 재사용, 새 패키지 금지.

1. **내 덱 가져오기**: 버튼 → 내 `decks` 목록(game='optcg'만) 다이얼로그 → 선택 시 `deck_cards`를 `recipe`(`[{card_code, quantity}]`) + `leader_code`로 변환해 `simulator_decks`에 insert. 리더 없는 덱은 가져오기 불가 안내.
2. **텍스트 임포트**: 다이얼로그에 붙여넣기 → 줄 형식 `4xOP01-001` / `4 OP01-001` / `4x OP01-001` 모두 허용(정규식 1개). 리더는 `1xOP01-001 (Leader)` 표기 또는 첫 leader 타입 자동 인식. 존재하지 않는 카드 코드는 줄 단위로 무시하고 결과 요약 toast("48장 적용, 2줄 무시").
3. **텍스트 익스포트**: 시뮬 덱 카드의 ⋯ 메뉴에 "레시피 복사" — 위 형식으로 클립보드 복사.
4. i18n: 신규 문구 ko/en/ja 3개 언어 모두.

수용 기준: 덱빌더에서 만든 OPTCG 덱을 가져와 그 덱으로 AI 대국 시작 가능 / 임포트→익스포트 왕복 시 동일 레시피.

---

## 1C. 효과 데이터 적재 (Claude) — 1A 머지 후

[SIMULATOR_SAMPLE_CARDS.md](./SIMULATOR_SAMPLE_CARDS.md) 30장 중 **1A 보강 범위로 정확히 표현 가능한 카드만** 적재. 현 스키마 형태(target은 `{selector, filter}` 객체)로 변환해 마이그레이션 작성.

| 구분 | 카드 | 상태 |
|---|---|---|
| ✅ 적재 완료 (안전분) | 이데오·징베·키드·잠바이·리쿠 — 블로커 마커 | `20260613100000` |
| 🎯 1A 후 적재 (본대 ~10장) | 루피 리더(기동)·노지코·오타마·이조(등장시)·리쿠/잠바이 부가효과·거미집 그물·지옥의 심판·화이트 스네이크(카운터)·항마의 상(메인) | 1A 수용 기준 통과 후 |
| ⏸ 보류 (Phase 2+) | 조로·오뎅·로(passive·미지원 action), 고든·후즈후·Mr.1(search/optional cost), 우솝·키드 부가(on_event), 스테이지 2장, 미스 올 선데이 | 인터프리터 추가 보강 필요 — 보류 사유를 효과 커버리지 표로 관리 |

## 검증·병합 절차

1. 1A·1B 브랜치 push → 보고 → Claude가 코드 리뷰 + 시나리오 검증(`verify`).
2. 병합 후 Claude가 1C 본대 적재 → 프리빌트 덱 AI 대국으로 효과 발동 확인.
3. 사용자·외부 테스터 평가 → 피드백 반영 후 Phase 2(게임 UX) 지시서 발행.
