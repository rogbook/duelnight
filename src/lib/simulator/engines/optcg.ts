/**
 * OPTCG 게임 엔진 실구현.
 * 스펙: docs/SIMULATOR_SPEC.md §1~3, 6
 */

import type {
  Action,
  CardInstance,
  DeckRecipe,
  EngineMeta,
  GameState,
  ITcgEngine,
  PlayerId,
  PlayerState,
  TerminalResult,
  Zones,
} from "../types";
import { shuffle } from "../rng";
import { applyEffect, type EffectContext } from "../dsl/interpreter";

const STARTING_HAND = 5;
const STARTING_LIFE_FALLBACK = 5;

// ── 카드 메타데이터 전역 캐시 ──────────────────────────────────────────────────
export const CARD_METADATA_CACHE: Record<
  string,
  {
    name: string;
    cost: number;
    power: number;
    counterValue: number;
    type: "leader" | "character" | "event" | "stage";
    colors: string[];
    effects?: any[];
    imageUrl?: string | null;
  }
> = {};

// 헬퍼: 캐시에서 메타데이터 읽어오기 (실패 시 기본 캐릭터 대체로 충돌 방지)
export function getCardMeta(code: string) {
  return (
    CARD_METADATA_CACHE[code] ?? {
      name: code,
      cost: 3,
      power: 5000,
      counterValue: 1000,
      type: "character" as const,
      colors: ["red"],
      effects: [],
      imageUrl: null,
    }
  );
}



const meta: EngineMeta = {
  gameCode: "optcg",
  zoneLabels: {
    primary: "리더",
    secondary: "캐릭터 에리어",
    resource: "DON!!",
    graveyard: "트래시",
    hand: "손패",
    deck: "덱",
    life: "라이프",
  },
  startingLife: STARTING_LIFE_FALLBACK,
  maxCharacterArea: 5,
  startingHandSize: STARTING_HAND,
};

function emptyZones(): Zones {
  return {
    primary: [],
    secondary: [],
    resource: [],
    graveyard: [],
    hand: [],
    deck: [],
    life: [],
  };
}

function expandRecipe(recipe: DeckRecipe): string[] {
  const out: string[] = [];
  for (const { card_code, quantity } of recipe.cards) {
    for (let i = 0; i < quantity; i++) out.push(card_code);
  }
  return out;
}

function buildPlayer(id: PlayerId, recipe: DeckRecipe, seed: string): { state: PlayerState; nextSeed: string } {
  const zones = emptyZones();

  // 리더 배치 및 라이프 설정
  let startingLife = STARTING_LIFE_FALLBACK;
  if (recipe.leaderCode) {
    const meta = getCardMeta(recipe.leaderCode);
    // 보통 다색 리더는 라이프 4, 단색 리더는 라이프 5
    startingLife = meta.colors.length > 1 ? 4 : 5;

    zones.primary.push({
      iid: `${id}-leader`,
      code: recipe.leaderCode,
      rested: false,
      attached: [],
      counters: {},
      power: meta.power,
    });
  }

  const codes = expandRecipe(recipe);
  const { result: shuffled, nextSeed } = shuffle(codes, seed);

  const instances = shuffled.map((code, i) => {
    const meta = getCardMeta(code);
    return {
      iid: `${id}-c${i}`,
      code,
      rested: false,
      attached: [],
      counters: {},
      power: meta.power,
    };
  });

  // 라이프 및 손패 드로우
  zones.life = instances.splice(0, startingLife);
  zones.hand = instances.splice(0, STARTING_HAND);
  zones.deck = instances;

  const state: PlayerState = {
    id,
    zones,
    donDeck: 10,
    donActive: 0,
    donRested: 0,
    turnFlags: { activatedThisTurn: [], donAttachedThisTurn: 0 },
  };

  return { state, nextSeed };
}

// 개체(캐릭터/리더)의 실시간 전투 파워 계산 (DON!! 및 counters의 power_mod 포함)
export function getBattlePower(card: CardInstance): number {
  const meta = getCardMeta(card.code);
  const donPower = card.attached.filter((t) => t.code === "DON!!").length * 1000;
  const modPower = card.counters.power_mod ?? 0;
  return (meta.power ?? 0) + donPower + modPower;
}

export const optcgEngine: ITcgEngine = {
  meta,

  init(decks, seed) {
    const [r1, r2] = decks;
    const p1 = buildPlayer("p1", r1, `${seed}|p1`);
    const p2 = buildPlayer("p2", r2, `${p1.nextSeed}|p2`);

    // 게임 시작 시 선공(p1)은 1개의 DON!!을 차가받음
    p1.state.donDeck -= 1;
    p1.state.donActive += 1;

    return {
      rngSeed: p2.nextSeed,
      turn: 1,
      activePlayer: "p1",
      phase: "main",
      pendingResponse: null,
      players: { p1: p1.state, p2: p2.state },
      log: [{ turn: 1, player: "p1", type: "game_start" }],
    };
  },

  getAvailableActions(state, player): Action[] {
    const actions: Action[] = [];
    const me = state.players[player];
    const oppId: PlayerId = player === "p1" ? "p2" : "p1";
    const opp = state.players[oppId];

    // 카운터 윈도우 수비 상태인 경우
    if (state.pendingResponse) {
      if (state.pendingResponse.defenderPlayer !== player) return [];

      // 1. 패에서 카운터 수비 가능한 카드 탐색
      for (const card of me.zones.hand) {
        const meta = getCardMeta(card.code);
        // 캐릭터의 경우 counterValue가 1000, 2000인 것들
        if (meta.type === "character" && meta.counterValue > 0) {
          actions.push({ type: "play_counter", iid: card.iid, targetIid: state.pendingResponse.defenderIid });
        }
        // 이벤트 카운터의 경우 지불 DON!! 이 있고, counter 효과 스키마 보유한 것
        if (meta.type === "event" && meta.cost <= me.donActive) {
          const hasCounterEffect = meta.effects?.some((e) => e.trigger === "counter");
          if (hasCounterEffect) {
            actions.push({ type: "play_counter", iid: card.iid, targetIid: state.pendingResponse.defenderIid });
          }
        }
      }

      // 2. 블로커 사용 가능 선언 (배틀필드의 액티브 상태인 blocker 키워드 캐릭터)
      for (const card of me.zones.secondary) {
        const meta = getCardMeta(card.code);
        const hasBlocker = meta.effects?.some((e) => e.trigger === "on_block") || card.counters.keyword_blocker;
        if (hasBlocker && !card.rested) {
          actions.push({ type: "use_blocker", blockerIid: card.iid });
        }
      }

      // 3. 패스 (카운터 수비 통과)
      actions.push({ type: "pass_counter" });
      return actions;
    }

    // 활성 플레이어의 메인 페이즈인 경우
    if (state.activePlayer === player && state.phase === "main") {
      // 1. 캐릭터/이벤트/스테이지 소환
      for (const card of me.zones.hand) {
        const meta = getCardMeta(card.code);
        if (meta.cost <= me.donActive) {
          if (meta.type === "character" && me.zones.secondary.length < 5) {
            actions.push({ type: "play_character", iid: card.iid, donToPay: meta.cost });
          } else if (meta.type === "event") {
            actions.push({ type: "play_event", iid: card.iid, donToPay: meta.cost });
          } else if (meta.type === "stage") {
            actions.push({ type: "play_stage", iid: card.iid, donToPay: meta.cost });
          }
        }
      }

      // 2. DON!! 카드 부착 (액티브 DON!!을 내 캐릭터나 리더에게)
      if (me.donActive > 0) {
        const myUnits = [...me.zones.primary, ...me.zones.secondary];
        for (const unit of myUnits) {
          actions.push({ type: "attach_don", targetIid: unit.iid, count: 1 });
        }
      }

      // 3. 기동 효과 활성화 (Activate:Main)
      const myUnits = [...me.zones.primary, ...me.zones.secondary];
      for (const unit of myUnits) {
        const meta = getCardMeta(unit.code);
        const hasActivateMain = meta.effects?.some((e) => e.trigger === "activate_main");
        if (hasActivateMain && !me.turnFlags.activatedThisTurn.includes(unit.iid)) {
          actions.push({ type: "activate_main", sourceIid: unit.iid });
        }
      }

      // 4. 공격 선언 (액티브 리더/캐릭터 -> 상대 리더 또는 상대 레스트 캐릭터)
      const myAttackers = myUnits.filter((u) => !u.rested);
      const oppTargets = [...opp.zones.primary, ...opp.zones.secondary.filter((c) => c.rested)];
      for (const attacker of myAttackers) {
        // 소환된 턴의 공격 제한 해제(Rush 키워드 검사)
        const meta = getCardMeta(attacker.code);
        const hasRush = meta.effects?.some((e: any) => e.trigger === "on_play" && e.id === "rush") || attacker.counters.keyword_rush;
        const isSummonSickness = attacker.iid.startsWith(`${player}-c`) && !hasRush && attacker.counters.summon_sick === 1;

        
        if (!isSummonSickness) {
          for (const target of oppTargets) {
            actions.push({ type: "attack", attackerIid: attacker.iid, targetIid: target.iid });
          }
        }
      }

      // 5. 턴 종료
      actions.push({ type: "end_main" });
    }

    actions.push({ type: "concede" });
    return actions;
  },

  applyAction(state, action): GameState {
    const me = state.activePlayer;
    const player = state.players[me];
    const oppId: PlayerId = me === "p1" ? "p2" : "p1";
    const opp = state.players[oppId];

    // 기권
    if (action.type === "concede") {
      return {
        ...state,
        phase: "ended",
        log: [...state.log, { turn: state.turn, player: me, type: "concede" }],
      };
    }

    // 턴 종료 처리 (메인 페이즈 종료 및 턴 교대)
    if (action.type === "end_main") {
      const nextActive = oppId;
      const nextTurn = state.turn + 1;

      // 턴 플래그 초기화
      const nextPlayers = { ...state.players };
      nextPlayers[me] = {
        ...player,
        turnFlags: { activatedThisTurn: [], donAttachedThisTurn: 0 },
      };

      // 다음 턴 플레이어 리소스 갱신 (DON!! 리셋 & 충전)
      const target = nextPlayers[nextActive];
      // 부착된 돈 복귀 및 탭된 돈 활성화
      const totalDon = target.donActive + target.donRested;
      let nextDonDeck = target.donDeck;
      let newActiveDon = totalDon;

      // DON!! 2장 충전 (최대 10개)
      const chargeCount = Math.min(2, nextDonDeck);
      nextDonDeck -= chargeCount;
      newActiveDon += chargeCount;

      // 캐릭터 에리어의 DON!! 카드 회수 처리
      const cleanAttachedDon = (unit: CardInstance) => ({
        ...unit,
        attached: unit.attached.filter((t) => t.code !== "DON!!"),
      });
      target.zones.primary = target.zones.primary.map(cleanAttachedDon);
      target.zones.secondary = target.zones.secondary.map(cleanAttachedDon);

      // 모든 아군 카드 활성 상태로 릴리즈
      const refreshUnit = (u: CardInstance): CardInstance => ({ ...u, rested: false, counters: { ...u.counters, summon_sick: 0 } });
      target.zones.primary = target.zones.primary.map(refreshUnit);
      target.zones.secondary = target.zones.secondary.map(refreshUnit);

      nextPlayers[nextActive] = {
        ...target,
        donActive: Math.min(10, newActiveDon),
        donRested: 0,
        donDeck: nextDonDeck,
      };

      // 다음 턴 드로우 처리
      const deck = [...target.zones.deck];
      const hand = [...target.zones.hand];
      if (deck.length > 0) {
        const [drawn] = deck.splice(0, 1);
        hand.push(drawn);
      }
      target.zones.deck = deck;
      target.zones.hand = hand;

      return {
        ...state,
        turn: nextTurn,
        activePlayer: nextActive,
        phase: "main",
        players: nextPlayers,
        log: [...state.log, { turn: nextTurn, player: nextActive, type: "turn_start" }],
      };
    }

    // 캐릭터 소환
    if (action.type === "play_character") {
      const idx = player.zones.hand.findIndex((c) => c.iid === action.iid);
      if (idx === -1) return state;

      const nextHand = [...player.zones.hand];
      const [card] = nextHand.splice(idx, 1);
      const nextSecondary: CardInstance[] = [...player.zones.secondary, { ...card, counters: { ...card.counters, summon_sick: 1 } }];


      const nextPlayers = { ...state.players };
      nextPlayers[me] = {
        ...player,
        donActive: player.donActive - action.donToPay,
        donRested: player.donRested + action.donToPay,
        zones: { ...player.zones, hand: nextHand, secondary: nextSecondary },
      };

      let nextState: GameState = {
        ...state,
        players: nextPlayers,
        log: [...state.log, { turn: state.turn, player: me, type: "play_character", payload: { code: card.code } }],
      };


      // 등장시(on_play) 효과 발동 연산
      const meta = getCardMeta(card.code);
      const onPlayEffect = meta.effects?.find((e) => e.trigger === "on_play");
      if (onPlayEffect) {
        const ctx: EffectContext = { state: nextState, controller: me, sourceIid: card.iid };
        nextState = applyEffect(ctx, onPlayEffect);
      }

      return nextState;
    }

    // DON!! 카드 부착
    if (action.type === "attach_don") {
      if (player.donActive < action.count) return state;

      const targetIid = action.targetIid;
      const nextPlayers = { ...state.players };

      let targetUnit: CardInstance | null = null;
      // 리더에서 찾기
      if (player.zones.primary[0]?.iid === targetIid) {
        targetUnit = player.zones.primary[0];
      }
      // 캐릭터에서 찾기
      if (!targetUnit) {
        targetUnit = player.zones.secondary.find((c) => c.iid === targetIid) ?? null;
      }
      if (!targetUnit) return state;

      const donTokens = Array.from({ length: action.count }).map((_, i) => ({
        iid: `${me}-don-token-${Date.now()}-${i}`,
        code: "DON!!",
        rested: false,
        attached: [],
        counters: {},
      }));

      const updater = (u: CardInstance) => {
        if (u.iid !== targetIid) return u;
        return {
          ...u,
          attached: [...u.attached, ...donTokens],
        };
      };

      nextPlayers[me] = {
        ...player,
        donActive: player.donActive - action.count,
        zones: {
          ...player.zones,
          primary: player.zones.primary.map(updater),
          secondary: player.zones.secondary.map(updater),
        },
      };

      return {
        ...state,
        players: nextPlayers,
        log: [...state.log, { turn: state.turn, player: me, type: "attach_don", payload: { targetIid, count: action.count } }],
      };
    }

    // 공격 선언 (수비 카운터 윈도우 생성)
    if (action.type === "attack") {
      const nextPlayers = { ...state.players };
      const attackerIid = action.attackerIid;

      let attackerCard: CardInstance | null = null;
      // 1. 공격자 레스트 처리 및 인스턴스 획득
      const updater = (u: CardInstance): CardInstance => {
        if (u.iid !== attackerIid) return u;
        attackerCard = u;
        return { ...u, rested: true };
      };

      nextPlayers[me] = {
        ...player,
        zones: {
          ...player.zones,
          primary: player.zones.primary.map(updater),
          secondary: player.zones.secondary.map(updater),
        },
      };

      if (!attackerCard) return state;

      // 2. 방어 대상 정보 획득
      let defenderCard: CardInstance | null = null;
      const targetIid = action.targetIid;
      if (opp.zones.primary[0]?.iid === targetIid) defenderCard = opp.zones.primary[0];
      if (!defenderCard) defenderCard = opp.zones.secondary.find((c) => c.iid === targetIid) ?? null;

      if (!defenderCard) return state;

      const baseAttackerPower = getBattlePower(attackerCard);
      const baseDefenderPower = getBattlePower(defenderCard);

      // 카운터 윈도우(Response) 세션 시작
      const pendingResponse = {
        kind: "counter_window" as const,
        attackerIid,
        defenderIid: targetIid,
        defenderPlayer: oppId,
        baseAttackerPower,
        baseDefenderPower,
        appliedModifiers: [] as { source: string; delta: number }[],
      };


      return {
        ...state,
        players: nextPlayers,
        pendingResponse,
        phase: "attack_declared",
        log: [...state.log, { turn: state.turn, player: me, type: "attack_declared", payload: { attackerIid, targetIid } }],
      };
    }

    // 블로커 수비 선언
    if (action.type === "use_blocker") {
      if (!state.pendingResponse) return state;

      const defenderPid = state.pendingResponse.defenderPlayer;
      const defenderPlayer = state.players[defenderPid];
      const blockerIid = action.blockerIid;

      let blockerCard: CardInstance | null = null;
      const updater = (u: CardInstance) => {
        if (u.iid !== blockerIid) return u;
        blockerCard = u;
        return { ...u, rested: true };
      };

      const nextPlayers = { ...state.players };
      nextPlayers[defenderPid] = {
        ...defenderPlayer,
        zones: {
          ...defenderPlayer.zones,
          secondary: defenderPlayer.zones.secondary.map(updater),
        },
      };

      if (!blockerCard) return state;

      // 수비 대상을 블로커 카드로 이전하고 기본 수비력 재조정
      const baseDefenderPower = getBattlePower(blockerCard);
      const nextResponse = {
        ...state.pendingResponse,
        defenderIid: blockerIid,
        baseDefenderPower,
      };

      return {
        ...state,
        players: nextPlayers,
        pendingResponse: nextResponse,
        log: [...state.log, { turn: state.turn, player: defenderPid, type: "use_blocker", payload: { blockerIid } }],
      };
    }

    // 카운터 플레이 (패에서 카운터 수비력 증가)
    if (action.type === "play_counter") {
      if (!state.pendingResponse) return state;

      const defenderPid = state.pendingResponse.defenderPlayer;
      const defenderPlayer = state.players[defenderPid];
      const cardIid = action.iid;

      const idx = defenderPlayer.zones.hand.findIndex((c) => c.iid === cardIid);
      if (idx === -1) return state;

      const nextHand = [...defenderPlayer.zones.hand];
      const [card] = nextHand.splice(idx, 1);
      const meta = getCardMeta(card.code);

      const nextGrave = [...defenderPlayer.zones.graveyard, card];
      const nextPlayers = { ...state.players };

      // 코스트 차감 (이벤트 카드의 경우 DON!! 차감)
      const payDon = meta.type === "event" ? meta.cost : 0;
      nextPlayers[defenderPid] = {
        ...defenderPlayer,
        donActive: defenderPlayer.donActive - payDon,
        donRested: defenderPlayer.donRested + payDon,
        zones: {
          ...defenderPlayer.zones,
          hand: nextHand,
          graveyard: nextGrave,
        },
      };

      // 카운터 수비력 추가 모디파이어 기록
      const counterPower = meta.counterValue || 0;
      const nextResponse = { ...state.pendingResponse };
      nextResponse.appliedModifiers = [
        ...nextResponse.appliedModifiers,
        { source: card.code, delta: counterPower },
      ];

      // 이벤트 카드 효과의 경우 DSL 해석 적용 가능
      let nextState: GameState = {
        ...state,
        players: nextPlayers,
        pendingResponse: nextResponse,
        log: [...state.log, { turn: state.turn, player: defenderPid, type: "play_counter", payload: { code: card.code } }],
      };


      if (meta.type === "event") {
        const counterEffect = meta.effects?.find((e) => e.trigger === "counter");
        if (counterEffect) {
          const ctx: EffectContext = { state: nextState, controller: defenderPid, sourceIid: card.iid };
          nextState = applyEffect(ctx, counterEffect);
        }
      }

      return nextState;
    }

    // 수비 완료 선언 (전투 연산 해결)
    if (action.type === "pass_counter") {
      if (!state.pendingResponse) return state;

      const response = state.pendingResponse;
      const totalAttackPower = response.baseAttackerPower;
      const totalCounterPower = response.appliedModifiers.reduce((acc, m) => acc + m.delta, 0);
      const totalDefenderPower = response.baseDefenderPower + totalCounterPower;

      let nextState: GameState = {
        ...state,
        pendingResponse: null,
        phase: "main",
      };


      const defenderPid = response.defenderPlayer;
      const attackerPid: PlayerId = defenderPid === "p1" ? "p2" : "p1";
      const defPlayer = nextState.players[defenderPid];

      // 공격 성공 시 처리
      if (totalAttackPower > totalDefenderPower) {
        const targetIid = response.defenderIid;

        // 1. 리더 피격 시 (라이프 1 감소 및 드로우)
        if (targetIid.endsWith("-leader")) {
          const life = [...defPlayer.zones.life];
          if (life.length > 0) {
            const [damagedCard] = life.splice(0, 1);
            const hand = [...defPlayer.zones.hand, damagedCard];

            nextState.players[defenderPid] = {
              ...defPlayer,
              zones: { ...defPlayer.zones, life, hand },
            };

            nextState.log = [
              ...nextState.log,
              { turn: state.turn, player: defenderPid, type: "damage_taken", payload: { leftLife: life.length } },
            ];

            // 라이프 트리거(Trigger) 효과 발동 연산
            const meta = getCardMeta(damagedCard.code);
            const triggerEffect = meta.effects?.find((e) => e.trigger === "on_trigger");
            if (triggerEffect) {
              const ctx: EffectContext = { state: nextState, controller: defenderPid, sourceIid: damagedCard.iid };
              nextState = applyEffect(ctx, triggerEffect);
            }
          } else {
            // 라이프가 0장인 상태에서 피격당하면 게임 세션 종료 선언
            nextState.phase = "ended";
          }
        } else {
          // 2. 캐릭터 피격 시 (KO 및 트래시 이동)
          const idx = defPlayer.zones.secondary.findIndex((c) => c.iid === targetIid);
          if (idx !== -1) {
            const nextSec = [...defPlayer.zones.secondary];
            const [koCard] = nextSec.splice(idx, 1);
            const nextGrave = [...defPlayer.zones.graveyard, koCard];

            nextState.players[defenderPid] = {
              ...defPlayer,
              zones: { ...defPlayer.zones, secondary: nextSec, graveyard: nextGrave },
            };

            nextState.log = [
              ...nextState.log,
              { turn: state.turn, player: defenderPid, type: "character_ko", payload: { code: koCard.code } },
            ];
          }
        }
      } else {
        // 공격 방어 성공
        nextState.log = [
          ...nextState.log,
          { turn: state.turn, player: defenderPid, type: "attack_defended" },
        ];
      }

      return nextState;
    }

    return state;
  },

  isTerminal(state): TerminalResult {
    // 1. 기권 또는 라이프 0 피격 패배 종료 판정
    if (state.phase === "ended") {
      const loser = state.activePlayer;
      const winner: PlayerId = loser === "p1" ? "p2" : "p1";
      return { winner };
    }
    // 2. 덱 고갈 패배 판정
    for (const pid of ["p1", "p2"] as PlayerId[]) {
      const player = state.players[pid];
      if (player.zones.deck.length === 0 && player.zones.hand.length === 0 && player.zones.secondary.length === 0) {
        const winner: PlayerId = pid === "p1" ? "p2" : "p1";
        return { winner };
      }
    }

    return null;
  },
};
