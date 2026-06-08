/**
 * 1-ply lookahead 에이전트.
 * getAvailableActions → applyAction → evaluate → argmax.
 */

import type { Action, GameState, ITcgEngine, PlayerId } from "../types";
import { DEFAULT_WEIGHTS, evaluate, type ValueWeights } from "./value-fn";

export interface AgentOptions {
  weights?: ValueWeights;
}

export function chooseAction(
  engine: ITcgEngine,
  state: GameState,
  me: PlayerId,
  options: AgentOptions = {},
): Action | null {
  const weights = options.weights ?? DEFAULT_WEIGHTS;
  const actions = engine.getAvailableActions(state, me);
  if (actions.length === 0) return null;

  let bestAction: Action = actions[0];
  let bestScore = -Infinity;

  for (const action of actions) {
    const next = engine.applyAction(state, action);
    const score = evaluate(next, me, weights);
    if (score > bestScore) {
      bestScore = score;
      bestAction = action;
    }
  }
  return bestAction;
}

/** AI vs AI 자동 대전 러너. 무한 루프 방지 위해 maxTurns 가드. */
export function runMatch(
  engine: ITcgEngine,
  initialState: GameState,
  options: { maxTurns?: number; weights?: ValueWeights } = {},
): { final: GameState; result: ReturnType<ITcgEngine["isTerminal"]> } {
  const maxTurns = options.maxTurns ?? 200;
  let state = initialState;

  for (let i = 0; i < maxTurns; i++) {
    const terminal = engine.isTerminal(state);
    if (terminal) return { final: state, result: terminal };

    const action = chooseAction(engine, state, state.activePlayer, { weights: options.weights });
    if (!action) return { final: state, result: { draw: true } };
    state = engine.applyAction(state, action);
  }
  return { final: state, result: { draw: true } };
}
