/**
 * OPTCG 가치함수. V(state, player) = Σ Wi · feature_i.
 * 스펙: docs/SIMULATOR_SPEC.md §7
 *
 * 가중치는 default export 가능하며, AI 튜닝을 위해 외부에서 덮어쓸 수 있다.
 */

import type { GameState, PlayerId } from "../types";

export interface ValueWeights {
  life_diff: number;
  board_power_sum: number;
  opp_board_power_sum: number;
  active_don: number;
  hand_size: number;
  opp_hand_size: number;
  counter_capacity: number;
  bench_count: number;
  tempo_threat: number;
  terminal_win: number;
  terminal_loss: number;
}

export const DEFAULT_WEIGHTS: ValueWeights = {
  life_diff: 40,
  board_power_sum: 5,
  opp_board_power_sum: -4,
  active_don: 2,
  hand_size: 3,
  opp_hand_size: -2,
  counter_capacity: 2,
  bench_count: 4,
  tempo_threat: -3,
  terminal_win: 9999,
  terminal_loss: -9999,
};

function sumPower(cards: { power?: number }[]): number {
  return cards.reduce((acc, c) => acc + (c.power ?? 0), 0);
}

export interface Features {
  life_diff: number;
  board_power_sum: number;
  opp_board_power_sum: number;
  active_don: number;
  hand_size: number;
  opp_hand_size: number;
  counter_capacity: number;
  bench_count: number;
  tempo_threat: number;
  terminal_win: number;
  terminal_loss: number;
}

export function extractFeatures(state: GameState, me: PlayerId): Features {
  const opp: PlayerId = me === "p1" ? "p2" : "p1";
  const my = state.players[me];
  const op = state.players[opp];

  const myBench = my.zones.secondary;
  const opBench = op.zones.secondary;

  // counter_capacity: 손패의 카운터 추정치. 4단계에서 cards 메타 조회로 정밀화.
  // 현 시점은 손패 수 × 1000 기본값.
  const counterCapacity = my.zones.hand.length * 1000;

  // tempo_threat: 상대 액티브 캐릭터 수 (레스트 아닌 것)
  const tempoThreat = opBench.filter((c) => !c.rested).length;

  return {
    life_diff: my.zones.life.length - op.zones.life.length,
    board_power_sum: sumPower(myBench) / 1000,
    opp_board_power_sum: sumPower(opBench) / 1000,
    active_don: my.donActive,
    hand_size: my.zones.hand.length,
    opp_hand_size: op.zones.hand.length,
    counter_capacity: counterCapacity / 1000,
    bench_count: myBench.length,
    tempo_threat: tempoThreat,
    terminal_win: 0,
    terminal_loss: 0,
  };
}

export function evaluate(
  state: GameState,
  me: PlayerId,
  weights: ValueWeights = DEFAULT_WEIGHTS,
): number {
  const f = extractFeatures(state, me);
  let score = 0;
  for (const key of Object.keys(weights) as (keyof ValueWeights)[]) {
    score += weights[key] * f[key];
  }
  return score;
}
