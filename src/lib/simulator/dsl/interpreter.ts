/**
 * DSL 인터프리터 — 카드 효과를 GameState에 적용.
 * 스펙: docs/SIMULATOR_SPEC.md §3·5
 */

import type { CardInstance, GameState, PlayerId } from "../types";
import type { CardEffect, EffectAction, TargetRefType } from "./schema";
import { nextInt } from "../rng";

export interface EffectContext {
  state: GameState;
  controller: PlayerId;          // 효과를 발동한 플레이어
  sourceIid: string | null;      // 효과 발생원 카드 인스턴스
}

export type ActionHandler = (ctx: EffectContext, action: EffectAction) => GameState;

// ── 헬퍼: GameState에서 ID로 카드 인스턴스 찾고 업데이트하는 함수 ──────────────────
function updateCardInState(
  state: GameState,
  iid: string,
  updater: (card: CardInstance) => CardInstance,
): GameState {
  const nextPlayers = { ...state.players };

  for (const pid of ["p1", "p2"] as PlayerId[]) {
    const player = nextPlayers[pid];
    const zones = { ...player.zones };
    let found = false;

    // 1. Primary Zone (리더)
    if (zones.primary[0]?.iid === iid) {
      zones.primary = [updater(zones.primary[0])];
      found = true;
    }
    // 2. Secondary Zone (캐릭터 에리어)
    if (!found) {
      const idx = zones.secondary.findIndex((c) => c.iid === iid);
      if (idx !== -1) {
        const nextSec = [...zones.secondary];
        nextSec[idx] = updater(nextSec[idx]);
        zones.secondary = nextSec;
        found = true;
      }
    }
    // 3. Hand (손패)
    if (!found) {
      const idx = zones.hand.findIndex((c) => c.iid === iid);
      if (idx !== -1) {
        const nextHand = [...zones.hand];
        nextHand[idx] = updater(nextHand[idx]);
        zones.hand = nextHand;
        found = true;
      }
    }

    if (found) {
      nextPlayers[pid] = { ...player, zones };
      break;
    }
  }

  return { ...state, players: nextPlayers };
}

// ── 헬퍼: 대상 선택자(Target Selector) 해석 ──────────────────────────────────
function resolveTargetIids(ctx: EffectContext, targetRef: TargetRefType): string[] {
  const { state, controller, sourceIid } = ctx;
  const opp = controller === "p1" ? "p2" : "p1";
  const myPlayer = state.players[controller];
  const oppPlayer = state.players[opp];

  // 1. 이미 iid가 직접 주입되어 있는 경우 우선 처리 (유저 선택 결과)
  if (targetRef.iid) {
    return [targetRef.iid];
  }

  switch (targetRef.selector) {
    case "self_leader":
      return myPlayer.zones.primary[0] ? [myPlayer.zones.primary[0].iid] : [];
    case "opponent_leader":
      return oppPlayer.zones.primary[0] ? [oppPlayer.zones.primary[0].iid] : [];
    case "self_active":
      return sourceIid ? [sourceIid] : [];
    case "self_character_any":
      return myPlayer.zones.secondary.map((c) => c.iid);
    case "opponent_character_any":
      return oppPlayer.zones.secondary.map((c) => c.iid);
    case "self_character_filter": {
      let list = myPlayer.zones.secondary;
      if (targetRef.filter?.rested_only) {
        list = list.filter((c) => c.rested);
      }
      if (targetRef.filter?.cost_max !== undefined) {
        // 비용 검증 등은 4단계 실물 카드 매핑 도입 후 구체화
      }
      return list.map((c) => c.iid);
    }
    case "opponent_character_filter": {
      let list = oppPlayer.zones.secondary;
      if (targetRef.filter?.rested_only) {
        list = list.filter((c) => c.rested);
      }
      return list.map((c) => c.iid);
    }
    default:
      return [];
  }
}

// ── 개별 액션 핸들러 ────────────────────────────────────────────────────────
const handlers: Record<EffectAction["kind"], ActionHandler> = {
  // 드로우
  draw(ctx, action) {
    if (action.kind !== "draw") return ctx.state;
    const player = ctx.state.players[ctx.controller];
    const deck = [...player.zones.deck];
    const hand = [...player.zones.hand];
    const drawn = deck.splice(0, action.count);
    hand.push(...drawn);

    return {
      ...ctx.state,
      players: {
        ...ctx.state.players,
        [ctx.controller]: {
          ...player,
          zones: { ...player.zones, deck, hand },
        },
      },
    };
  },

  // 손패 폐기
  discard_hand(ctx, action) {
    if (action.kind !== "discard_hand") return ctx.state;
    const targetPid = action.who === "self" ? ctx.controller : (ctx.controller === "p1" ? "p2" : "p1");
    const player = ctx.state.players[targetPid];
    const hand = [...player.zones.hand];
    const graveyard = [...player.zones.graveyard]; // 원본 불변(순수성): 복사본에 push
    let rngSeed = ctx.state.rngSeed;

    if (action.choose === "random") {
      // 결정론적 시드 RNG 사용(리플레이/AI 재현 보장)
      for (let i = 0; i < Math.min(action.count, hand.length); i++) {
        const { value, nextSeed } = nextInt(rngSeed, hand.length);
        rngSeed = nextSeed;
        const [card] = hand.splice(value, 1);
        graveyard.push(card);
      }
    } else {
      // 순차적 버리기 (앞에서부터)
      const discarded = hand.splice(0, action.count);
      graveyard.push(...discarded);
    }

    return {
      ...ctx.state,
      rngSeed,
      players: {
        ...ctx.state.players,
        [targetPid]: {
          ...player,
          zones: { ...player.zones, hand, graveyard },
        },
      },
    };
  },

  // 카드 서치 (스켈레톤)
  search_deck(ctx, action) {
    // 덱에서 조건 카드를 찾아 패로 가져옴
    if (action.kind !== "search_deck") return ctx.state;
    return ctx.state; // 메타 데이터 통합 후 실물 카드 필터 적용 예정
  },

  look_deck(ctx, _action) { return ctx.state; },
  look_life(ctx, _action) { return ctx.state; },
  add_to_life(ctx, _action) { return ctx.state; },
  modify_damage(ctx, _action) { return ctx.state; },
  choose_one(ctx, _action) { return ctx.state; },

  // KO 처리
  ko_target(ctx, action) {
    if (action.kind !== "ko_target") return ctx.state;
    const targets = resolveTargetIids(ctx, action.target);
    let state = ctx.state;

    for (const iid of targets) {
      // 대상 캐릭터 찾아서 secondary에서 제거 후 graveyard로 이동
      for (const pid of ["p1", "p2"] as PlayerId[]) {
        const player = state.players[pid];
        const idx = player.zones.secondary.findIndex((c) => c.iid === iid);
        if (idx !== -1) {
          const nextSec = [...player.zones.secondary];
          const [card] = nextSec.splice(idx, 1);
          const nextGrave = [...player.zones.graveyard, card];
          state = {
            ...state,
            players: {
              ...state.players,
              [pid]: {
                ...player,
                zones: { ...player.zones, secondary: nextSec, graveyard: nextGrave },
              },
            },
          };
          break;
        }
      }
    }
    return state;
  },

  // 바운스 (패로 되돌리기)
  return_to_hand(ctx, action) {
    if (action.kind !== "return_to_hand") return ctx.state;
    const targets = resolveTargetIids(ctx, action.target);
    let state = ctx.state;

    for (const iid of targets) {
      for (const pid of ["p1", "p2"] as PlayerId[]) {
        const player = state.players[pid];
        const idx = player.zones.secondary.findIndex((c) => c.iid === iid);
        if (idx !== -1) {
          const nextSec = [...player.zones.secondary];
          const [card] = nextSec.splice(idx, 1);
          const nextHand = [...player.zones.hand, card];
          state = {
            ...state,
            players: {
              ...state.players,
              [pid]: {
                ...player,
                zones: { ...player.zones, secondary: nextSec, hand: nextHand },
              },
            },
          };
          break;
        }
      }
    }
    return state;
  },

  // 레스트 상태로 만듦
  rest_target(ctx, action) {
    if (action.kind !== "rest_target") return ctx.state;
    const targets = resolveTargetIids(ctx, action.target);
    let state = ctx.state;
    for (const iid of targets) {
      state = updateCardInState(state, iid, (c) => ({ ...c, rested: true }));
    }
    return state;
  },

  // 활성 상태로 세움
  active_target(ctx, action) {
    if (action.kind !== "active_target") return ctx.state;
    const targets = resolveTargetIids(ctx, action.target);
    let state = ctx.state;
    for (const iid of targets) {
      state = updateCardInState(state, iid, (c) => ({ ...c, rested: false }));
    }
    return state;
  },

  // 파워 증감
  power_modifier(ctx, action) {
    if (action.kind !== "power_modifier") return ctx.state;
    const targets = resolveTargetIids(ctx, action.target);
    let state = ctx.state;
    for (const iid of targets) {
      state = updateCardInState(state, iid, (c) => {
        const nextCounters = { ...c.counters };
        const currentMod = nextCounters.power_mod ?? 0;
        nextCounters.power_mod = currentMod + action.delta;
        return {
          ...c,
          counters: nextCounters,
          power: (c.power ?? 0) + action.delta, // 실시간 파워 보정 반영
        };
      });
    }
    return state;
  },

  // DON!! 카드 부착
  attach_don(ctx, action) {
    if (action.kind !== "attach_don") return ctx.state;
    const targets = resolveTargetIids(ctx, action.target);
    if (targets.length === 0) return ctx.state;

    const targetIid = targets[0]; // 한 개체에만 부착
    const player = ctx.state.players[ctx.controller];
    
    // 플레이어 액티브 DON!! 검증 및 차감
    if (player.donActive < action.count) return ctx.state; // DON!! 부족

    const nextActive = player.donActive - action.count;
    let state = updateCardInState(ctx.state, targetIid, (c) => {
      // DON!! 토큰 객체 생성 부착
      const donTokens = Array.from({ length: action.count }).map((_, i) => ({
        iid: `${ctx.controller}-don-token-${Date.now()}-${i}`,
        code: "DON!!",
        rested: action.state === "rested",
        attached: [],
        counters: {},
      }));
      return {
        ...c,
        attached: [...c.attached, ...donTokens],
      };
    });

    // 플레이어의 DON!! 수치 반영
    state = {
      ...state,
      players: {
        ...state.players,
        [ctx.controller]: {
          ...player,
          donActive: nextActive,
          donRested: player.donRested + (action.state === "rested" ? action.count : 0),
        },
      },
    };

    return state;
  },

  // DON!! 덱으로 회수
  return_don_to_deck(ctx, action) {
    if (action.kind !== "return_don_to_deck") return ctx.state;
    const player = ctx.state.players[ctx.controller];
    
    // 간이 구현: 액티브/레스트 돈!! 차감하여 DON!! 덱으로 회송
    const countToReturn = Math.min(action.count, player.donActive + player.donRested);
    let activeSub = 0;
    let restedSub = 0;

    if (action.state === "active") {
      activeSub = Math.min(action.count, player.donActive);
    } else if (action.state === "rested") {
      restedSub = Math.min(action.count, player.donRested);
    } else {
      activeSub = Math.min(action.count, player.donActive);
      restedSub = Math.min(action.count - activeSub, player.donRested);
    }

    return {
      ...ctx.state,
      players: {
        ...ctx.state.players,
        [ctx.controller]: {
          ...player,
          donActive: player.donActive - activeSub,
          donRested: player.donRested - restedSub,
          donDeck: player.donDeck + activeSub + restedSub,
        },
      },
    };
  },

  // 효과 키워드 획득
  gain_keyword(ctx, action) {
    if (action.kind !== "gain_keyword") return ctx.state;
    const targets = resolveTargetIids(ctx, action.target);
    let state = ctx.state;
    for (const iid of targets) {
      state = updateCardInState(state, iid, (c) => {
        const nextCounters = { ...c.counters };
        nextCounters[`keyword_${action.keyword}`] = 1;
        return {
          ...c,
          counters: nextCounters,
        };
      });
    }
    return state;
  },
};

// 인터프리터 액션 핸들러 일괄 등록
for (const [kind, handler] of Object.entries(handlers)) {
  registerActionHandler(kind as EffectAction["kind"], handler);
}

// ── 해석기 전용 액션 핸들러 동적 등록 ───────────────────
const actionHandlers: Partial<Record<EffectAction["kind"], ActionHandler>> = {};

export function registerActionHandler<K extends EffectAction["kind"]>(
  kind: K,
  handler: ActionHandler,
): void {
  actionHandlers[kind] = handler;
}

export function applyEffect(ctx: EffectContext, effect: CardEffect): GameState {
  let state = ctx.state;
  for (const action of effect.actions) {
    const handler = actionHandlers[action.kind as EffectAction["kind"]];
    if (!handler) {
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
