# 수정된 플랜 — OPTCG 우선, 30장 DSL 검증 관문

**선택사항 확정**: OPTCG 첫 엔진 / simulator_decks 신설 / 가치함수 풀구현 / 효과 DSL 먼저 / **샘플 30장 검증 게이트 추가**

`SIMULATOR_SPEC.md`는 PTCG 기준으로 작성된 상태 → OPTCG 기준으로 보정 필요.

---

## 0a단계 — 스펙 문서 OPTCG로 보정 (즉시)

`docs/SIMULATOR_SPEC.md` 수정:

- 1차 타깃: PTCG → **OPTCG**
- ZoneKind 매핑 OPTCG 기준 명시 (primary=리더, secondary=캐릭터, resource=DON!!, graveyard=트래시)
- Action 타입을 OPTCG 액션으로 교체 (`play_character`, `attach_don`, `attack_with_card`, `play_event`, `counter` 등)
- 가치함수 feature를 OPTCG 기준으로 (리더 LP, 액티브 DON, 보드 파워 총합, 카운터 핸드 추정)
- 카운터 시스템 모델 추가 (인터럽트 처리: 공격 선언 → 방어자 카운터 응답 윈도우)

## 0b단계 — **샘플 30장 DSL 검증 게이트** (관문)

`docs/SIMULATOR_SAMPLE_CARDS.md` 신규. DB에 있는 OPTCG 카드 중 대표 30장 추출 후 DSL로 표현.

**카테고리 (목표 분포)**

- 리더 4장 (단색·다색, 카운터 상시 능력 포함)
- 캐릭터 — 일반 8장 (다양한 코스트·파워)
- 캐릭터 — On Play 효과 6장 (드로우/서치/제거/부스트)
- 캐릭터 — 블로커 / Activate:Main 4장
- 이벤트 4장 (제거/드로우/방해)
- 카운터 카드 4장 (+1000, +2000, 트리거 카운터)

**판정 기준**

- 30장 중 **27장(90%) 이상 DSL로 표현 가능** → 게이트 통과 → 1단계 진행
- 표현 불가 카드 3장 초과 → DSL 액션·트리거 보강 후 재검증
- 표현 불가 카드는 사유 명시 (어떤 trigger·action·target이 부족했는지)

산출물: 카드별 DSL JSON + 통과/실패 표.

## 1단계 — TS 인터페이스 코드화

`src/lib/simulator/` 디렉토리:

```
types.ts              ITcgEngine, GameState, Action, OPTCGAction
rng.ts                결정론적 RNG (seedrandom)
dsl/
  schema.ts           zod 스키마 (효과 DSL 검증)
  interpreter.ts      DSL 실행기
engines/
  optcg.ts            OPTCG 엔진 (ITcgEngine 구현)
ai/
  value-fn.ts         가치함수 + W 가중치
  agent.ts            액션 선택 루프
```

엔진은 순수 함수. DB 의존 없음.

## 2단계 — 팩 → user_collection 연동

`src/routes/packs.tsx`:

- 팩 개봉 결과를 `user_collection`에 upsert (card_code 기준 quantity 누적)
- 비로그인 시 토스트 + 로그인 모달
- 희귀도별 등장 연출 강화
- `collection.tsx`에 자동 반영 확인

## 3단계 — DB 마이그레이션 (Lovable 위임, 1회로 묶음)

`docs/DB_WORKFLOW.md` §3 포맷 준수.

**변경 내용**

- `cards.effects jsonb DEFAULT '[]'::jsonb` 추가 (기존 `extra`와 별개)
- `simulator_decks` 테이블 신규
  - id, user_id, game(text), name, recipe(jsonb), is_public, created_at, updated_at
  - RLS: 본인 CRUD + 공개 SELECT
  - GRANT: authenticated 전체, service_role 전체, anon 없음
- updated_at 트리거

**적용 시점**: 0b 게이트 통과 후. DSL 스키마가 흔들리면 마이그레이션 재실행 부담.

## 4단계 — OPTCG 엔진 + 가치함수 AI

OPTCG 핵심 규칙 구현:

- 리더 5000~6000 파워, LP=5
- 캐릭터 최대 5장, 코스트=DON!! 소모
- DON!! 어태치(+1000), 공격 시 1회 차감 없음 (영구 부여)
- 공격 → 카운터 윈도우 → 데미지 → 트리거
- 인터럽트 처리 모델 (액션 큐 + 응답 단계)

가치함수 feature (OPTCG)

- `lp_diff` 양 측 LP 차이
- `board_power_sum` 보드 파워 총합
- `don_progress` 활성 DON!! 수
- `hand_threat` 손패 평균 코스트/파워
- `counter_estimate` 손패 내 카운터 가능 카드 추정 (확률)
- `leader_active_hp` 리더 파워 - 위협
- `terminal_win/loss` ±9999

AI vs AI 자동 대전 러너 + 결과 로그.

## 5단계 — 덱 빌더 + 배틀 UI

- `recipe-editor.tsx`에 "보유량 필터" 토글 (시뮬 모드 한정)
- `src/routes/simulator.index.tsx` — 시뮬 덱 목록/생성/편집
- `src/routes/simulator.$id.tsx` — 배틀 화면
  - 모드: 수동 vs AI / AI vs AI / AI vs 사용자
  - 턴/페이즈/카운터 윈도우 UI
  - 카드 이동 애니메이션, 데미지 연출

---

## 협업 분담

| 단계                 | 담당                              |
| -------------------- | --------------------------------- |
| 0a (스펙 OPTCG 보정) | Antigravity                       |
| 0b (샘플 30장 검증)  | Antigravity, **게이트 통과 필수** |
| 1 (TS 코드)          | Antigravity                       |
| 2 (packs upsert)     | Antigravity                       |
| 3 (DB 마이그레이션)  | **Lovable**                       |
| 4-5 (엔진/AI/UI)     | Antigravity                       |

## 권장 첫 액션

이번 턴에 **0a (SIMULATOR_SPEC.md OPTCG 보정)** + **0b 검증 문서 골격(SIMULATOR_SAMPLE_CARDS.md)** 2개 동시 진행. 실제 30장 카드 추출은 다음 턴에서 DB read_query로 수행.

---

## 기술 메모

- **인터럽트 처리**: GameState에 `pendingAction` + `responseWindow` 필드 추가. 공격 → 응답 윈도우 진입 → 방어자 카운터 액션 → 데미지 산정. 이 모델은 DTCG 시큐리티에도 그대로 재사용.
- **DON!! 모델링**: DON!!은 카드가 아닌 카운터/리소스 토큰으로 처리. `resource` zone의 length가 곧 DON!! 보유량.
- **카운터 카드**: `trigger: "on_being_attacked"`, `actions: [{ kind: "modify_damage", delta: -1000 }]`. DSL 검증에서 표현 가능 여부 1순위로 확인.
- **다음 게임 확장**: DTCG 추가 시 ITcgEngine 새 구현체만 작성. UI/AI 루프/덱빌더는 무수정.
