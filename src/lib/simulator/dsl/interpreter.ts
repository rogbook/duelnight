/**
 * DSL 인터프리터 — 카드 효과를 GameState에 적용.
 *
 * 1단계 스켈레톤: 액션별 핸들러를 등록하고 라우팅한다.
 * 풀구현은 4단계(OPTCG 엔진)에서 진행하며, 여기서는 순수 함수 형태와
 * 호출 시그니처를 확정해 엔진 코드가 의존할 수 있게 한다.
 */

import type { GameState, PlayerId } from "../types";
import type { CardEffect, EffectAction } from "./schema";

export interface EffectContext {
  state: GameState;
  controller: PlayerId;          // 효과를 발동한 플레이어
  sourceIid: string | null;      // 효과 발생원 카드 인스턴스
}

export type ActionHandler = (ctx: EffectContext, action: EffectAction) => GameState;

const handlers: Partial<Record<EffectAction["kind"], ActionHandler>> = {
  // 4단계에서 채움. 미구현 액션은 NotImplemented로 폴백.
};

export function registerActionHandler<K extends EffectAction["kind"]>(
  kind: K,
  handler: ActionHandler,
): void {
  handlers[kind] = handler;
}

export function applyEffect(ctx: EffectContext, effect: CardEffect): GameState {
  let state = ctx.state;
  for (const action of effect.actions) {
    const handler = handlers[action.kind as EffectAction["kind"]];
    if (!handler) {
      // 미구현 액션은 로그만 남기고 스킵 (개발 중 안전한 폴백)
      state = {
        ...state,
        log: [
          ...state.log,
          {
            turn: state.turn,
            player: ctx.controller,
            type: "effect_skip",
            payload: { kind: action.kind, sourceIid: ctx.sourceIid },
          },
        ],
      };
      continue;
    }
    state = handler({ ...ctx, state }, action);
  }
  return state;
}
