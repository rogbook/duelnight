/**
 * TCG 시뮬레이터 공통 타입 정의.
 * 스펙: docs/SIMULATOR_SPEC.md §2~4
 *
 * 게임 규칙은 ITcgEngine 구현체(engines/*.ts)가 담당하고, 이 파일은
 * 모든 엔진이 공유하는 데이터 모델만 정의한다. (순수 타입, 런타임 의존 없음)
 */

export type PlayerId = "p1" | "p2";

export type ZoneKind =
  | "primary"     // OPTCG=리더 / DTCG=배틀존
  | "secondary"   // OPTCG=캐릭터 에리어 / DTCG=벤치
  | "resource"    // OPTCG=DON!! / PTCG=에너지
  | "graveyard"   // 트래시
  | "hand"
  | "deck"
  | "life";       // OPTCG=라이프 / DTCG=시큐리티 / PTCG=사이드

export interface CardInstance {
  iid: string;                         // 게임 내 고유 인스턴스 ID
  code: string;                        // cards.code 참조
  rested: boolean;
  power?: number;                      // 수정자 반영 후 현재 파워
  attached: CardInstance[];            // 부착 카드/DON!! 토큰
  counters: Record<string, number>;    // damage, power_mod, status_flags 등
}

export interface Zones {
  primary: CardInstance[];
  secondary: CardInstance[];
  resource: CardInstance[];
  graveyard: CardInstance[];
  hand: CardInstance[];
  deck: CardInstance[];
  life: CardInstance[];
}

export interface PlayerState {
  id: PlayerId;
  zones: Zones;
  donDeck: number;        // OPTCG: 남은 DON!! 덱 (보통 10)
  donActive: number;      // 액티브 DON!!
  donRested: number;      // 레스트 DON!!
  turnFlags: {
    activatedThisTurn: string[];     // iid 목록 (Activate:Main 1회 제한)
    donAttachedThisTurn: number;
  };
}

export type TurnPhase =
  | "refresh"
  | "draw"
  | "don"
  | "main"
  | "attack_declared"
  | "end"
  | "ended";

export interface PendingResponse {
  kind: "counter_window";
  attackerIid: string;
  defenderIid: string;
  defenderPlayer: PlayerId;
  baseAttackerPower: number;
  baseDefenderPower: number;
  appliedModifiers: { source: string; delta: number }[];
}

export interface GameEvent {
  turn: number;
  player: PlayerId;
  type: string;
  payload?: Record<string, unknown>;
}

export interface GameState {
  rngSeed: string;
  turn: number;
  activePlayer: PlayerId;
  phase: TurnPhase;
  pendingResponse: PendingResponse | null;
  players: Record<PlayerId, PlayerState>;
  log: GameEvent[];
}

// ──────────────────────────────────────────────────────────
// Action 타입 (OPTCG 1차)
// ──────────────────────────────────────────────────────────

export type OPTCGAction =
  // 메인 페이즈
  | { type: "play_character"; iid: string; donToPay: number }
  | { type: "play_event"; iid: string; donToPay: number }
  | { type: "play_stage"; iid: string; donToPay: number }
  | { type: "attach_don"; targetIid: string; count: number }
  | { type: "activate_main"; sourceIid: string }
  // 어택 페이즈
  | { type: "attack"; attackerIid: string; targetIid: string }
  // 카운터 윈도우 응답
  | { type: "play_counter"; iid: string; targetIid: string }
  | { type: "use_blocker"; blockerIid: string }
  | { type: "pass_counter" }
  // 페이즈 전이
  | { type: "end_main" }
  | { type: "concede" };

export type Action = OPTCGAction;

// ──────────────────────────────────────────────────────────
// 덱 / 엔진 메타
// ──────────────────────────────────────────────────────────

export interface DeckRecipe {
  game: "optcg" | "dtcg" | "ptcg";
  leaderCode?: string;            // OPTCG 전용
  cards: { card_code: string; quantity: number }[];
}

export interface EngineMeta {
  gameCode: "optcg" | "dtcg" | "ptcg";
  zoneLabels: Record<ZoneKind, string>;
  startingLife: number;
  maxCharacterArea?: number;
  startingHandSize: number;
}

export type TerminalResult =
  | { winner: PlayerId }
  | { draw: true }
  | null;

export interface ITcgEngine<S extends GameState = GameState> {
  init(decks: [DeckRecipe, DeckRecipe], seed: string): S;
  getAvailableActions(state: S, player: PlayerId): Action[];
  applyAction(state: S, action: Action): S;
  isTerminal(state: S): TerminalResult;
  meta: EngineMeta;
}
