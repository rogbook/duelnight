/**
 * DSL 인터프리터 — 카드 효과를 GameState에 적용.
 * 스펙: docs/SIMULATOR_SPEC.md §3·5
 */

import type { CardInstance, GameState, PlayerId } from "../types";
import type { CardEffect, EffectAction, TargetRefType } from "./schema";
import { nextInt } from "../rng";
import { getCardMeta, getBattlePower } from "../engines/optcg";

export interface EffectContext {
  state: GameState;
  controller: PlayerId; // 효과를 발동한 플레이어
  sourceIid: string | null; // 효과 발생원 카드 인스턴스
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
function resolveTargetIids(
  ctx: EffectContext,
  targetRef: TargetRefType,
  count: number = 1,
  scope?: "single" | "all_matching",
): string[] {
  const { state, controller, sourceIid } = ctx;
  const opp = controller === "p1" ? "p2" : "p1";
  const myPlayer = state.players[controller];
  const oppPlayer = state.players[opp];

  // 1. 이미 iid가 직접 주입되어 있는 경우 우선 처리 (유저 선택 결과)
  if (targetRef.iid) {
    return [targetRef.iid];
  }

  let candidates: CardInstance[] = [];

  switch (targetRef.selector) {
    case "self_leader":
      candidates = myPlayer.zones.primary;
      break;
    case "opponent_leader":
      candidates = oppPlayer.zones.primary;
      break;
    case "self_active":
      if (sourceIid) {
        const sourceCard = [...myPlayer.zones.primary, ...myPlayer.zones.secondary].find(
          (c) => c.iid === sourceIid,
        );
        if (sourceCard) candidates = [sourceCard];
      }
      break;
    case "self_character_any":
      candidates = myPlayer.zones.secondary;
      break;
    case "opponent_character_any":
      candidates = oppPlayer.zones.secondary;
      break;
    case "self_character_filter":
      candidates = myPlayer.zones.secondary;
      break;
    case "opponent_character_filter":
      candidates = oppPlayer.zones.secondary;
      break;
    default:
      return [];
  }

  // 필터 적용
  const filter = targetRef.filter;
  if (filter) {
    candidates = candidates.filter((card) => {
      const meta = getCardMeta(card.code);

      // rested_only
      if (filter.rested_only !== undefined) {
        if (card.rested !== filter.rested_only) return false;
      }
      // cost_max / cost_min
      if (filter.cost_max !== undefined) {
        if ((meta.cost ?? 0) > filter.cost_max) return false;
      }
      if (filter.cost_min !== undefined) {
        if ((meta.cost ?? 0) < filter.cost_min) return false;
      }
      // power_max / power_min
      const currentPower = card.power ?? meta.power ?? 0;
      if (filter.power_max !== undefined) {
        if (currentPower > filter.power_max) return false;
      }
      if (filter.power_min !== undefined) {
        if (currentPower < filter.power_min) return false;
      }
      // color
      if (filter.color !== undefined && filter.color.length > 0) {
        if (!meta.colors.some((col) => (filter.color as string[]).includes(col))) return false;
      }
      // trait
      if (filter.trait !== undefined && filter.trait.length > 0) {
        const cardTraits = meta.traits ?? [];
        if (!cardTraits.some((t) => filter.trait?.includes(t))) return false;
      }
      // type
      if (filter.type !== undefined && filter.type.length > 0) {
        if (!(filter.type as string[]).includes(meta.type)) return false;
      }

      return true;
    });
  }

  // "all_matching" 스코프일 때는 후보 전체 반환
  if (scope === "all_matching") {
    return candidates.map((c) => c.iid);
  }

  // count개 선택 v1: 자동 선택 단순화
  const isOpponentTarget = targetRef.selector.startsWith("opponent");
  if (isOpponentTarget) {
    candidates = [...candidates].sort((a, b) => {
      const powerA = a.power ?? getCardMeta(a.code).power ?? 0;
      const powerB = b.power ?? getCardMeta(b.code).power ?? 0;
      return powerB - powerA; // 파워 내림차순 (파워 최대 우선)
    });
  }

  return candidates.slice(0, count).map((c) => c.iid);
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
    const targetPid =
      action.who === "self" ? ctx.controller : ctx.controller === "p1" ? "p2" : "p1";
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

  look_deck(ctx, _action) {
    return ctx.state;
  },
  look_life(ctx, _action) {
    return ctx.state;
  },
  add_to_life(ctx, _action) {
    return ctx.state;
  },
  modify_damage(ctx, _action) {
    return ctx.state;
  },
  choose_one(ctx, _action) {
    return ctx.state;
  },

  // KO 처리
  ko_target(ctx, action) {
    if (action.kind !== "ko_target") return ctx.state;
    const targets = resolveTargetIids(ctx, action.target, action.count);
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
    const targets = resolveTargetIids(ctx, action.target, action.count);
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
    const targets = resolveTargetIids(ctx, action.target, action.count);
    let state = ctx.state;
    for (const iid of targets) {
      state = updateCardInState(state, iid, (c) => ({ ...c, rested: true }));
    }
    return state;
  },

  // 활성 상태로 세움
  active_target(ctx, action) {
    if (action.kind !== "active_target") return ctx.state;
    const targets = resolveTargetIids(ctx, action.target, action.count);
    let state = ctx.state;
    for (const iid of targets) {
      state = updateCardInState(state, iid, (c) => ({ ...c, rested: false }));
    }
    return state;
  },

  // 파워 증감
  power_modifier(ctx, action) {
    if (action.kind !== "power_modifier") return ctx.state;

    // 카운터 윈도우 중(state.pendingResponse 존재) 이고 action.duration이 "this_battle" 인 경우
    // 카드 counters 대신 pendingResponse.appliedModifiers에 누적
    if (ctx.state.pendingResponse && action.duration === "this_battle") {
      const pendingResponse = { ...ctx.state.pendingResponse };

      let sourceName = "이벤트";
      if (ctx.sourceIid) {
        const sourceHandCard = ctx.state.players[ctx.controller].zones.hand.find(
          (c) => c.iid === ctx.sourceIid,
        );
        if (sourceHandCard) {
          sourceName = getCardMeta(sourceHandCard.code).name;
        }
      }

      pendingResponse.appliedModifiers = [
        ...pendingResponse.appliedModifiers,
        { source: sourceName, delta: action.delta },
      ];

      return {
        ...ctx.state,
        pendingResponse,
      };
    }

    const targets = resolveTargetIids(
      ctx,
      action.target,
      action.scope === "all_matching" ? 999 : 1,
      action.scope,
    );
    let state = ctx.state;
    for (const iid of targets) {
      state = updateCardInState(state, iid, (c) => {
        const nextCounters = { ...c.counters };
        if (action.duration === "this_turn") {
          const currentVal = nextCounters.power_mod_turn ?? 0;
          nextCounters.power_mod_turn = currentVal + action.delta;
        } else {
          const currentVal = nextCounters.power_mod_perm ?? 0;
          nextCounters.power_mod_perm = currentVal + action.delta;
        }

        const updatedCard = {
          ...c,
          counters: nextCounters,
        };
        updatedCard.power = getBattlePower(updatedCard);
        return updatedCard;
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

// ── 해석기 전용 액션 핸들러 동적 등록 ───────────────────
const actionHandlers: Partial<Record<EffectAction["kind"], ActionHandler>> = {};

export function registerActionHandler<K extends EffectAction["kind"]>(
  kind: K,
  handler: ActionHandler,
): void {
  actionHandlers[kind] = handler;
}

// 인터프리터 액션 핸들러 일괄 등록
for (const [kind, handler] of Object.entries(handlers)) {
  registerActionHandler(kind as EffectAction["kind"], handler);
}

function evaluateConditions(
  ctx: EffectContext,
  conditions: NonNullable<CardEffect["conditions"]>,
): boolean {
  const { state, controller } = ctx;
  const myPlayer = state.players[controller];
  const opp = controller === "p1" ? "p2" : "p1";
  const oppPlayer = state.players[opp];

  const myLeaderCard = myPlayer.zones.primary[0];
  const myLeaderMeta = myLeaderCard ? getCardMeta(myLeaderCard.code) : null;

  for (const cond of conditions) {
    const value = cond.value;

    switch (cond.kind) {
      case "self_leader_name_is": {
        if (!myLeaderMeta) return false;
        if (myLeaderMeta.name !== value) return false;
        break;
      }
      case "self_leader_color_is": {
        if (!myLeaderMeta) return false;
        if (typeof value === "string") {
          if (!myLeaderMeta.colors.includes(value)) return false;
        } else if (Array.isArray(value)) {
          if (!value.some((c) => myLeaderMeta.colors.includes(c))) return false;
        }
        break;
      }
      case "self_leader_trait_has": {
        if (!myLeaderMeta) return false;
        const traits = myLeaderMeta.traits ?? [];
        if (typeof value === "string") {
          if (!traits.includes(value)) return false;
        } else if (Array.isArray(value)) {
          if (!value.some((t) => traits.includes(t))) return false;
        }
        break;
      }
      case "self_has_trait_in_play": {
        const inPlayCards = [
          ...(myPlayer.zones.primary ?? []),
          ...(myPlayer.zones.secondary ?? []),
        ];
        const hasTrait = inPlayCards.some((card) => {
          const meta = getCardMeta(card.code);
          const traits = meta.traits ?? [];
          if (typeof value === "string") {
            return traits.includes(value);
          } else if (Array.isArray(value)) {
            return value.some((t) => traits.includes(t));
          }
          return false;
        });
        if (!hasTrait) return false;
        break;
      }
      case "opponent_character_count_at_least": {
        const count = oppPlayer.zones.secondary.length;
        if (count < Number(value)) return false;
        break;
      }
      case "self_life_at_most": {
        const lifeCount = myPlayer.zones.life.length;
        if (lifeCount > Number(value)) return false;
        break;
      }
      case "self_don_active_at_least": {
        if (myPlayer.donActive < Number(value)) return false;
        break;
      }
      default:
        break;
    }
  }

  return true;
}

function canPayCost(state: GameState, pid: PlayerId, cost: CardEffect["cost"]): boolean {
  if (!cost) return true;
  const player = state.players[pid];

  if (cost.don_rest && cost.don_rest > 0) {
    if (player.donActive < cost.don_rest) return false;
  }

  if (cost.discard_hand && cost.discard_hand > 0) {
    if (player.zones.hand.length < cost.discard_hand) return false;
  }

  if (cost.return_don && cost.return_don > 0) {
    const totalDon = player.donActive + player.donRested;
    if (totalDon < cost.return_don) return false;
  }

  return true;
}

function payCost(state: GameState, pid: PlayerId, cost: CardEffect["cost"]): GameState {
  if (!cost) return state;
  const nextState = { ...state };
  const player = { ...nextState.players[pid] };
  const zones = { ...player.zones };

  if (cost.don_rest && cost.don_rest > 0) {
    player.donActive -= cost.don_rest;
    player.donRested += cost.don_rest;
  }

  if (cost.discard_hand && cost.discard_hand > 0) {
    const hand = [...zones.hand];
    const graveyard = [...zones.graveyard];
    const discarded = hand.splice(0, cost.discard_hand);
    graveyard.push(...discarded);
    zones.hand = hand;
    zones.graveyard = graveyard;
  }

  if (cost.return_don && cost.return_don > 0) {
    let toReturn = cost.return_don;
    const activeReturn = Math.min(toReturn, player.donActive);
    player.donActive -= activeReturn;
    toReturn -= activeReturn;

    const restedReturn = Math.min(toReturn, player.donRested);
    player.donRested -= restedReturn;
    toReturn -= restedReturn;

    player.donDeck += activeReturn + restedReturn;
  }

  player.zones = zones;
  nextState.players = {
    ...nextState.players,
    [pid]: player,
  };

  return nextState;
}

export function applyEffect(ctx: EffectContext, effect: CardEffect): GameState {
  let state = ctx.state;

  // 1A-1. conditions 평가
  if (effect.conditions && effect.conditions.length > 0) {
    const allPassed = evaluateConditions(ctx, effect.conditions);
    if (!allPassed) {
      return {
        ...state,
        log: [
          ...state.log,
          {
            turn: state.turn,
            player: ctx.controller,
            type: "effect_condition_fail",
            payload: { effectId: effect.id, sourceIid: ctx.sourceIid },
          },
        ],
      };
    }
  }

  // 1A-3. 효과 cost 검증 및 지불
  if (effect.cost) {
    if (!canPayCost(state, ctx.controller, effect.cost)) {
      return {
        ...state,
        log: [
          ...state.log,
          {
            turn: state.turn,
            player: ctx.controller,
            type: "effect_cost_fail",
            payload: { effectId: effect.id, sourceIid: ctx.sourceIid },
          },
        ],
      };
    }
    state = payCost(state, ctx.controller, effect.cost);
    ctx.state = state;
  }

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
