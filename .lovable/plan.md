# 범용 TCG AI · 팩 시뮬레이터 구현 플랜

선택사항: **PTCG 우선** / **simulator_decks 신설** / **가치함수 풀구현** / **효과 DSL 먼저 설계**

---

## 0단계 — 효과 DSL & 엔진 인터페이스 스펙 (DB 변경 없음)

문서 작업만 수행. `docs/SIMULATOR_SPEC.md` 신규.

- **효과 DSL**: JSON 기반, `trigger` + `conditions[]` + `actions[]` 구조
  - trigger: `on_play | on_attack | on_damage | on_turn_start | ability`
  - action: `draw | discard | heal | damage_modifier | search | attach_energy | switch_active` 등
  - PTCG 카드 30장 샘플로 DSL 표현 가능성 검증 (베이직/스테이지1/트레이너스/에너지 각 카테고리)
- **ITcgEngine 인터페이스**: `init(decks) → GameState`, `getAvailableActions(state, player) → Action[]`, `applyAction(state, action) → GameState`, `isTerminal(state) → Winner | null`
- **GameState 모델**: `Zones { primary, secondary[], resource[], graveyard, hand, deck, prize }`, `Counters { damage, status[], energy_attached[] }`
- **결정론성**: `rngSeed` 필드로 셔플/코인 재현 가능

산출물: 스펙 문서 1개. Lovable·Antigravity·사용자 모두 참조.

## 1단계 — TS 타입/인터페이스 코드화 (DB 변경 없음)

`src/lib/simulator/` 생성:

```text
src/lib/simulator/
  types.ts            ITcgEngine, GameState, Action, Zone, CardInstance
  dsl/
    schema.ts         zod 스키마 (효과 DSL 검증)
    interpreter.ts    DSL action 실행기
  engines/
    ptcg.ts           PTCG 규칙 엔진 (ITcgEngine 구현)
  ai/
    value-fn.ts       가치함수 V = Σ Wi·feature_i
    agent.ts          getAvailableActions → score → argmax
```

엔진은 순수 함수 (DB 의존 없음) → 단위 테스트 용이.

## 2단계 — 팩 → user_collection 연동 (기존 테이블, DB 변경 없음)

`src/routes/packs.tsx` 보강:
- 팩 개봉 결과를 `user_collection`에 `upsert` (card_code 기준 quantity 증가)
- 비로그인 시 안내 토스트 + 로그인 유도
- 획득 연출 개선 (희귀도별 등장 애니메이션)
- `src/routes/collection.tsx`에 자동 반영 확인

## 3단계 — DB 스키마 추가 (Lovable에 위임)

DSL 스펙이 확정된 뒤 1회로 묶어서 적용. `docs/DB_WORKFLOW.md` 포맷 준수.

추가 컬럼/테이블:
- `cards.effects jsonb` — DSL 효과 배열 (기존 `extra`와 분리, 쿼리/검증 용이)
- `simulator_decks` 신규 테이블 — id, user_id, game(text, 기존 컨벤션 일치), name, recipe(jsonb), is_public, created_at, updated_at
- RLS: 본인만 CRUD, 공개 덱은 모두 SELECT
- GRANT: authenticated 전체 + service_role 전체

`attributes` 컬럼은 추가하지 않음 (기존 `power/counter/cost/colors/traits/attribute/extra`로 충분).

## 4단계 — PTCG 엔진 + 룰베이스 → 가치함수 AI

- PTCG 핵심 규칙: 액티브/벤치(최대5)/에너지 부착/진화/사이드 6장/약점·저항
- 효과 DSL 인터프리터 연결
- 가치함수 feature 후보: 상대 사이드 남은 수, 내 액티브 HP 비율, 벤치 위협도, 손패 카드 우위, 에너지 진행도
- 가중치 W는 상수 export → 추후 튜닝 가능
- AI vs AI 자동 대전 러너 + 결과 로그

## 5단계 — 덱 빌더 + 배틀 UI

- `recipe-editor.tsx`: "보유 카드만 보기" 토글 + 보유 수량 초과 add 차단
- `src/routes/simulator.index.tsx`: 시뮬 덱 목록/생성
- `src/routes/simulator.$id.tsx`: 배틀 화면 (수동 vs AI / AI vs AI 모드)
- 턴 진행, 데미지 카운터, 사이드 카드 시각화

---

## 협업 분담 (docs/DB_WORKFLOW.md 준수)

| 단계 | 담당 | 작업 |
|---|---|---|
| 0 | 사용자 합의 + Antigravity | 스펙 문서 작성 |
| 1 | Antigravity | TS 코드 |
| 2 | Antigravity | packs.tsx upsert |
| 3 | **Lovable** | 마이그레이션 적용 + types.ts 재생성 |
| 4-5 | Antigravity | 엔진/AI/UI |

## 권장 첫 액션

**0단계 효과 DSL 스펙 문서 작성**부터 시작. PTCG 샘플 카드 30장으로 DSL 표현력을 검증한 뒤에야 3단계 DB 마이그레이션이 안전합니다. 컬럼 추가 후 DSL을 바꾸면 재마이그레이션이 필요하므로 순서가 중요합니다.

---

## 기술 메모

- **JSONB vs 별도 테이블**: `effects`는 카드당 평균 2~5개, 카드 단건 조회 시 항상 함께 필요 → JSONB가 조인 비용 절감.
- **DSL vs 코드**: DSL 우선 선택은 카드 데이터를 비개발자(어드민)가 입력/수정 가능하게 만들기 위한 결정. TS 함수 하드코딩은 카드마다 배포가 필요해짐.
- **결정론적 RNG**: seedrandom 같은 경량 라이브러리로 셔플/코인 재현. 리플레이 기능과 AI 디버깅에 필수.
- **엔진 분리 원칙**: PTCG 엔진은 PTCG 규칙만, ITcgEngine 인터페이스만 코어가 알도록 → 다른 게임 추가 시 코어 무수정.
