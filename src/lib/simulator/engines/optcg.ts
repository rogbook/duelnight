/**
 * OPTCG 엔진 스켈레톤 — ITcgEngine 구현체.
 *
 * 1단계: 인터페이스 골격과 init() 만 채우고, 풀 로직(getAvailableActions·
 * applyAction·인터럽트·트리거)은 4단계에서 구현한다.
 * 스펙: docs/SIMULATOR_SPEC.md §3·6
 */

import type {
  Action,
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

const STARTING_HAND = 5;
const STARTING_LIFE_FALLBACK = 5;   // 리더 카드 정보에서 읽지 못한 경우

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

  // 리더 배치
  if (recipe.leaderCode) {
    zones.primary.push({
      iid: `${id}-leader`,
      code: recipe.leaderCode,
      rested: false,
      attached: [],
      counters: {},
    });
  }

  // 본 덱 셔플
  const codes = expandRecipe(recipe);
  const { result: shuffled, nextSeed } = shuffle(codes, seed);

  const instances = shuffled.map((code, i) => ({
    iid: `${id}-c${i}`,
    code,
    rested: false,
    attached: [] as PlayerState["zones"]["deck"],
    counters: {},
  }));

  // 라이프 5장 + 초기 손패 5장 (라이프는 리더 카드 effective_life에서 결정해야 하나
  // 1단계 스켈레톤은 5로 고정. 4단계에서 카드 메타 조회로 보정.)
  zones.life = instances.splice(0, STARTING_LIFE_FALLBACK);
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

export const optcgEngine: ITcgEngine = {
  meta,

  init(decks, seed) {
    const [r1, r2] = decks;
    const p1 = buildPlayer("p1", r1, `${seed}|p1`);
    const p2 = buildPlayer("p2", r2, `${p1.nextSeed}|p2`);

    return {
      rngSeed: p2.nextSeed,
      turn: 1,
      activePlayer: "p1",
      phase: "refresh",
      pendingResponse: null,
      players: { p1: p1.state, p2: p2.state },
      log: [{ turn: 1, player: "p1", type: "game_start" }],
    };
  },

  getAvailableActions(_state, _player): Action[] {
    // 4단계: 현재 페이즈/페어/리소스를 보고 실제 합법수 생성
    return [{ type: "concede" }];
  },

  applyAction(state, action): GameState {
    if (action.type === "concede") {
      return {
        ...state,
        phase: "ended",
        log: [...state.log, { turn: state.turn, player: state.activePlayer, type: "concede" }],
      };
    }
    // 4단계: 각 액션별 상태 전이 구현
    return state;
  },

  isTerminal(state): TerminalResult {
    if (state.phase === "ended") {
      const loser = state.activePlayer;
      const winner: PlayerId = loser === "p1" ? "p2" : "p1";
      return { winner };
    }
    // 라이프 결정 + 다음 드로우 불가 → 패배 등은 4단계에서 처리
    return null;
  },
};
