import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, useEffect, useRef } from "react";
import {
  ArrowLeft,
  Swords,
  RefreshCw,
  LogOut,
  ShieldAlert,
  Cpu,
  User,
  Play,
  Pause,
  Heart,
  Coins,
  Layers,
  Trash2,
  ScrollText,
  Sparkles,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { useI18n } from "@/i18n/language-context";
import { displayImageSrc } from "@/lib/image-proxy";
import { PREBUILT_DECKS } from "@/lib/simulator/prebuilt-decks";
import {
  optcgEngine,
  CARD_METADATA_CACHE,
  getCardMeta,
  getBattlePower,
} from "@/lib/simulator/engines/optcg";
import { chooseAction } from "@/lib/simulator/ai/agent";
import type { GameState, Action, CardInstance, PlayerId, PlayerState } from "@/lib/simulator/types";

interface SimulatorSearchParams {
  p1?: string;
  p2?: string;
  mode?: "manual" | "auto";
}

export const Route = createFileRoute("/simulator/$id")({
  validateSearch: (search: Record<string, unknown>): SimulatorSearchParams => {
    return {
      p1: search.p1 as string | undefined,
      p2: search.p2 as string | undefined,
      mode: search.mode as "manual" | "auto" | undefined,
    };
  },
  component: SimulatorMatchRoomPage,
});

function SimulatorMatchRoomPage() {
  const { p1, p2, mode = "manual" } = Route.useSearch();
  const navigate = useNavigate();
  useI18n();

  const [loading, setLoading] = useState(true);
  const [loadingText, setLoadingText] = useState("대국 정보 불러오는 중...");

  // 게임 세션 상태
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [isAutoPlaying, setIsAutoPlaying] = useState(mode === "auto");
  const [speedMs, setSpeedMs] = useState<number>(1000); // AI 진행 속도
  const [selectedHandIid, setSelectedHandIid] = useState<string | null>(null);
  const [logOpen, setLogOpen] = useState(false);
  const autoPlayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const logEndRef = useRef<HTMLDivElement | null>(null);

  // 1. P1 덱 레시피 로드
  const { data: p1Deck } = useQuery({
    queryKey: ["sim-match-deck-p1", p1],
    enabled: !!p1,
    queryFn: async () => {
      if (p1!.startsWith("prebuilt-")) {
        return PREBUILT_DECKS.find((d) => d.id === p1)?.recipe ?? null;
      }
      const { data, error } = await supabase
        .from("simulator_decks")
        .select("*")
        .eq("id", p1!)
        .single();
      if (error) throw error;
      return data.recipe as any;
    },
  });

  // 2. P2 덱 레시피 로드
  const { data: p2Deck } = useQuery({
    queryKey: ["sim-match-deck-p2", p2],
    enabled: !!p2,
    queryFn: async () => {
      if (p2!.startsWith("prebuilt-")) {
        return PREBUILT_DECKS.find((d) => d.id === p2)?.recipe ?? null;
      }
      const { data, error } = await supabase
        .from("simulator_decks")
        .select("*")
        .eq("id", p2!)
        .single();
      if (error) throw error;
      return data.recipe as any;
    },
  });

  // 3. 카드 메타데이터 캐시 적재 및 게임 초기화
  useEffect(() => {
    if (!p1Deck || !p2Deck) return;

    const initBattle = async () => {
      setLoadingText("카드 효과 사전 적재 중...");
      try {
        const p1Codes = p1Deck.cards.map((c: any) => c.card_code);
        if (p1Deck.leaderCode) p1Codes.push(p1Deck.leaderCode);
        const p2Codes = p2Deck.cards.map((c: any) => c.card_code);
        if (p2Deck.leaderCode) p2Codes.push(p2Deck.leaderCode);

        const allCodes = Array.from(new Set([...p1Codes, ...p2Codes]));

        const { data: cardRows, error } = await supabase
          .from("cards")
          .select("code, name, cost, power, counter, type, colors, effects, image_url")
          .in("code", allCodes);

        if (error) throw error;

        for (const row of cardRows ?? []) {
          CARD_METADATA_CACHE[row.code] = {
            name: row.name ?? row.code,
            cost: row.cost ?? 0,
            power: row.power ?? (row.type === "leader" ? 5000 : 0),
            counterValue: row.counter ?? 0,
            type: row.type as any,
            colors: row.colors ?? [],
            effects: (row.effects as any) ?? [],
            imageUrl: row.image_url ?? null,
          };
        }

        const startSeed = "seed-" + Math.floor(Math.random() * 1000000);
        const initialState = optcgEngine.init([p1Deck, p2Deck], startSeed);

        setGameState(initialState);
        setLoading(false);
      } catch (err: any) {
        toast.error("대국 준비 오류: " + err.message);
        navigate({ to: "/simulator" });
      }
    };

    initBattle();
  }, [p1Deck, p2Deck, navigate]);

  // 로그 자동 스크롤
  useEffect(() => {
    if (logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [gameState?.log, logOpen]);

  // AI 의사결정 타이머 루프
  useEffect(() => {
    if (!gameState) return;

    const terminal = optcgEngine.isTerminal(gameState);
    if (terminal) {
      setIsAutoPlaying(false);
      if (autoPlayTimerRef.current) clearTimeout(autoPlayTimerRef.current);
      return;
    }

    // 지금 행동할 주체: 대응(카운터) 윈도우가 열려 있으면 '항상 수비자', 아니면 활성 플레이어.
    const actor: PlayerId = gameState.pendingResponse
      ? gameState.pendingResponse.defenderPlayer
      : gameState.activePlayer;

    // AI가 대신 둘지 여부: 자동재생이면 양쪽 모두, 수동이면 상대(p2)만. p1(나)은 사람이 조작.
    const aiShouldAct = isAutoPlaying || actor === "p2";

    if (aiShouldAct) {
      autoPlayTimerRef.current = setTimeout(() => {
        const action = chooseAction(optcgEngine, gameState, actor);
        if (action) {
          setGameState(optcgEngine.applyAction(gameState, action));
        } else {
          // 안전 폴백: 진행 가능한 패스/턴종료/기권으로 교착 방지
          const fallback = optcgEngine
            .getAvailableActions(gameState, actor)
            .find(
              (a) => a.type === "pass_counter" || a.type === "end_main" || a.type === "concede",
            );
          if (fallback) {
            setGameState(optcgEngine.applyAction(gameState, fallback));
          }
        }
      }, speedMs);
    }

    return () => {
      if (autoPlayTimerRef.current) clearTimeout(autoPlayTimerRef.current);
    };
  }, [gameState, isAutoPlaying, speedMs]);

  if (loading || !gameState) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center gap-4">
        <RefreshCw className="h-10 w-10 text-primary animate-spin" />
        <p className="text-sm font-bold text-muted-foreground">{loadingText}</p>
      </div>
    );
  }

  const handlePerformAction = (action: Action) => {
    setSelectedHandIid(null);
    setGameState(optcgEngine.applyAction(gameState, action));
  };

  const terminalResult = optcgEngine.isTerminal(gameState);
  const isTerminalResult = !!terminalResult;
  const p1State = gameState.players.p1;
  const p2State = gameState.players.p2;
  const isMyTurn = gameState.activePlayer === "p1";
  const myCounterWindow =
    !!gameState.pendingResponse && gameState.pendingResponse.defenderPlayer === "p1";

  // P1 수동 가능 액션
  const p1AvailableActions =
    !isTerminalResult &&
    !isAutoPlaying &&
    ((isMyTurn && !gameState.pendingResponse) || myCounterWindow)
      ? optcgEngine.getAvailableActions(gameState, "p1")
      : [];

  // 선택된 손패 카드와 연결된 플레이 액션(코스트 선택지 포함)
  const selectedCardActions = selectedHandIid
    ? p1AvailableActions.filter(
        (a) =>
          (a.type === "play_character" || a.type === "play_event" || a.type === "play_stage") &&
          a.iid === selectedHandIid,
      )
    : [];

  // 손패 외 보드 액션(부착/공격/턴종료/카운터 응답)
  const boardActions = p1AvailableActions.filter(
    (a) => a.type !== "play_character" && a.type !== "play_event" && a.type !== "play_stage",
  );

  // 손패 카드별로 "낼 수 있는지" 빠르게 판단하기 위한 집합
  const playableHandIids = new Set(
    p1AvailableActions
      .filter(
        (a) => a.type === "play_character" || a.type === "play_event" || a.type === "play_stage",
      )
      .map((a) => (a as any).iid as string),
  );

  return (
    <div className="mx-auto w-full max-w-6xl px-2 sm:px-4 py-2 sm:py-4 pb-32 lg:pb-6 flex flex-col gap-3">
      {/* ── 상단 헤더 ── */}
      <div className="sticky top-0 z-30 -mx-2 sm:mx-0 px-2 sm:px-0 py-2 bg-background/90 backdrop-blur flex items-center justify-between gap-2 border-b border-border/60 sm:border-0">
        <div className="flex items-center gap-2 min-w-0">
          <Link
            to="/simulator"
            className="p-2 border border-border rounded-lg bg-card hover:bg-accent text-muted-foreground hover:text-foreground transition-all shrink-0"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div className="min-w-0">
            <h1 className="text-sm sm:text-base font-black tracking-tight flex items-center gap-1.5 truncate">
              <Swords className="h-4 w-4 text-red-500 shrink-0" />{" "}
              <span className="truncate">AI 대국</span>
            </h1>
            <p className="text-[10px] sm:text-xs text-muted-foreground truncate">
              Turn {gameState.turn} · {gameState.phase === "main" ? "메인" : "전투"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {mode === "auto" && (
            <div className="flex items-center gap-0.5 bg-muted p-0.5 rounded-lg text-[11px]">
              <button
                onClick={() => setIsAutoPlaying((p) => !p)}
                className={`flex items-center gap-1 px-2 py-1.5 rounded-md font-bold transition-all ${
                  isAutoPlaying
                    ? "bg-primary text-primary-foreground shadow"
                    : "hover:bg-card text-muted-foreground"
                }`}
              >
                {isAutoPlaying ? (
                  <Pause className="h-3.5 w-3.5" />
                ) : (
                  <Play className="h-3.5 w-3.5 fill-current" />
                )}
              </button>
              <div className="h-4 w-px bg-border mx-0.5" />
              {[1500, 1000, 500].map((ms) => (
                <button
                  key={ms}
                  onClick={() => setSpeedMs(ms)}
                  className={`px-1.5 py-1.5 rounded-md ${
                    speedMs === ms ? "font-bold text-foreground" : "text-muted-foreground"
                  }`}
                >
                  {(ms / 1000).toFixed(1)}s
                </button>
              ))}
            </div>
          )}

          <button
            onClick={() => {
              if (confirm("대국을 기권하고 로비로 돌아가시겠습니까?"))
                navigate({ to: "/simulator" });
            }}
            className="flex items-center gap-1.5 px-2.5 py-2 bg-destructive/10 text-destructive hover:bg-destructive hover:text-white rounded-lg text-[11px] font-bold transition-all min-h-10"
          >
            <LogOut className="h-3.5 w-3.5" /> <span className="hidden sm:inline">기권</span>
          </button>
        </div>
      </div>

      {/* ── 배틀 보드(플레이매트) ── */}
      <div className="relative mx-auto w-full max-w-lg rounded-[2rem] border-2 border-border/50 overflow-hidden shadow-2xl bg-gradient-to-b from-orange-300/30 via-card to-sky-300/30 dark:from-orange-500/[0.15] dark:via-card dark:to-sky-500/[0.15]">
        {/* 매트 외곽 오벌 링 + 중앙 비네팅 */}
        <div className="pointer-events-none absolute inset-2 rounded-[1.6rem] border border-white/25 dark:border-white/10" />
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_45%,hsl(var(--background)/0.45))]" />

        <div className="relative flex flex-col">
          {/* ─ 상대(AI) 진영 ─ */}
          <PlayerSide state={p2State} isOpponent isActive={gameState.activePlayer === "p2"} />

          {/* ─ 중앙 곡선 밴드 ─ */}
          <div className="relative z-10 mx-3 my-1 rounded-full bg-background/60 backdrop-blur-sm border border-border/50 px-3 py-1.5 shadow-lg">
            {gameState.pendingResponse ? (
              <CounterBand pending={gameState.pendingResponse} state={gameState} />
            ) : (
              <div className="flex items-center justify-center gap-2 text-[11px] sm:text-xs font-bold">
                <span
                  className={`inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full ${
                    isMyTurn ? "bg-blue-500/20 text-blue-500" : "bg-red-500/20 text-red-500"
                  }`}
                >
                  {isMyTurn ? <User className="h-3.5 w-3.5" /> : <Cpu className="h-3.5 w-3.5" />}
                  {isMyTurn ? "내 턴" : "AI 턴..."}
                </span>
                {isMyTurn && !isTerminalResult && (
                  <span className="text-muted-foreground hidden sm:inline">
                    손패를 탭해 카드를 내세요
                  </span>
                )}
              </div>
            )}
          </div>

          {/* ─ 내(P1) 진영 ─ */}
          <PlayerSide
            state={p1State}
            isOpponent={false}
            isActive={isMyTurn}
            selectedHandIid={selectedHandIid}
            playableHandIids={playableHandIids}
            onHandSelect={(iid) => setSelectedHandIid((cur) => (cur === iid ? null : iid))}
          />
        </div>
      </div>

      {/* ── 종료 배너 ── */}
      {isTerminalResult && (
        <div className="rounded-2xl border border-primary/30 bg-primary/5 p-6 text-center shadow-lg space-y-3">
          <h2 className="text-xl font-black text-primary">🎉 대국 종료!</h2>
          <p className="text-sm font-bold text-muted-foreground">
            우승:{" "}
            {"winner" in terminalResult! && terminalResult!.winner === "p1"
              ? "🏆 나 (P1)"
              : "🏆 AI (P2)"}
          </p>
          <div className="flex justify-center gap-3 pt-1">
            <Link
              to="/simulator"
              className="px-4 py-2 border border-border bg-card rounded-lg text-xs font-bold hover:bg-accent"
            >
              로비로
            </Link>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-xs font-bold hover:opacity-90 shadow"
            >
              재대국
            </button>
          </div>
        </div>
      )}

      {/* ── 로그(접이식) ── */}
      <div className="rounded-2xl border border-border bg-card/60 overflow-hidden">
        <button
          onClick={() => setLogOpen((o) => !o)}
          className="w-full p-3 flex items-center justify-between hover:bg-accent/40 transition-colors"
        >
          <span className="text-xs font-black uppercase tracking-wider flex items-center gap-2">
            <ScrollText className="h-4 w-4 text-primary" /> 대국 로그
          </span>
          <span className="text-[10px] text-muted-foreground">
            {logOpen ? "닫기 ▲" : `열기 ▼ (${gameState.log.length})`}
          </span>
        </button>
        {logOpen && (
          <div className="max-h-[38vh] overflow-y-auto p-3 space-y-2 font-mono text-[11px] leading-relaxed border-t border-border">
            {gameState.log.map((evt, idx) => (
              <div key={idx} className="border-b border-border/20 pb-1.5">
                <span className="text-[10px] text-muted-foreground select-none">
                  [T{evt.turn} {evt.player.toUpperCase()}]
                </span>{" "}
                <span className="text-foreground/90">{formatEventLog(evt)}</span>
              </div>
            ))}
            <div ref={logEndRef} />
          </div>
        )}
      </div>

      {/* ── 하단 고정 액션 바 ── */}
      {!isTerminalResult && (selectedCardActions.length > 0 || boardActions.length > 0) && (
        <div className="fixed bottom-0 left-0 right-0 z-40 bg-card/95 backdrop-blur border-t-2 border-primary/30 shadow-[0_-4px_20px_rgba(0,0,0,0.15)] pb-[env(safe-area-inset-bottom)]">
          <div className="mx-auto w-full max-w-6xl px-3 py-2.5 space-y-2">
            {/* 선택된 손패 카드 전용 액션 */}
            {selectedCardActions.length > 0 && (
              <div className="flex items-center gap-2 overflow-x-auto pb-1">
                <span className="text-[10px] font-bold text-primary shrink-0 flex items-center gap-1">
                  <Sparkles className="h-3.5 w-3.5" />
                  내기:
                </span>
                {selectedCardActions.map((act, i) => (
                  <button
                    key={i}
                    onClick={() => handlePerformAction(act)}
                    className="px-3 py-2 rounded-lg text-xs font-bold border shadow-sm min-h-10 whitespace-nowrap bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/30 hover:bg-green-500 hover:text-white transition-all"
                  >
                    {getActionLabel(act, gameState)}
                  </button>
                ))}
                <button
                  onClick={() => setSelectedHandIid(null)}
                  className="px-2.5 py-2 rounded-lg text-xs font-bold border border-border text-muted-foreground hover:bg-accent shrink-0"
                >
                  취소
                </button>
              </div>
            )}

            {/* 보드 액션 */}
            <div className="flex items-center gap-1.5 overflow-x-auto">
              {boardActions.map((act, i) => (
                <button
                  key={i}
                  onClick={() => handlePerformAction(act)}
                  className={`px-3 py-2 rounded-lg text-xs font-bold border shadow-sm min-h-10 whitespace-nowrap transition-all ${getActionColorClass(
                    act.type,
                  )}`}
                >
                  {getActionLabel(act, gameState)}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────
// 한 플레이어 진영(상대=상단 / 나=하단)
// ──────────────────────────────────────────────────────────
function PlayerSide({
  state,
  isOpponent,
  isActive,
  selectedHandIid,
  playableHandIids,
  onHandSelect,
}: {
  state: PlayerState;
  isOpponent: boolean;
  isActive: boolean;
  selectedHandIid?: string | null;
  playableHandIids?: Set<string>;
  onHandSelect?: (iid: string) => void;
}) {
  const leader = state.zones.primary[0];
  const chars = state.zones.secondary;
  const life = state.zones.life.length;
  const donTotal = state.donActive + state.donRested;

  // 상태 줄: 이름 배너 + 덱/트래시 + DON 배지 (상대=왼쪽 DON / 나=오른쪽 DON, 레퍼런스 배치)
  const statusRow = (
    <div className="flex items-center justify-between gap-2">
      {isOpponent ? (
        <DonBadge active={state.donActive} total={donTotal} />
      ) : (
        <NameBanner isOpponent={false} isActive={isActive} life={life} />
      )}
      <div className="flex items-center gap-1.5">
        <Pile kind="deck" count={state.zones.deck.length} />
        <Pile kind="trash" count={state.zones.graveyard.length} />
      </div>
      {isOpponent ? (
        <NameBanner isOpponent isActive={isActive} life={life} />
      ) : (
        <DonBadge active={state.donActive} total={donTotal} />
      )}
    </div>
  );

  // 벤치(캐릭터 5슬롯)
  const bench = (
    <div className="flex items-center justify-start lg:justify-center gap-1.5 overflow-x-auto py-0.5">
      {Array.from({ length: 5 }).map((_, i) =>
        chars[i] ? <BattleUnit key={chars[i].iid} unit={chars[i]} /> : <EmptySlot key={i} />,
      )}
    </div>
  );

  // 액티브(리더) — 중앙, 내 리더는 상시 글로우
  const active = (
    <div className="flex justify-center py-0.5">
      {leader ? (
        <LeaderCard unit={leader} life={life} glowing={!isOpponent} />
      ) : (
        <EmptySlot isLeader />
      )}
    </div>
  );

  // 손패
  const hand = isOpponent ? (
    <OppHand count={state.zones.hand.length} />
  ) : (
    <HandFan
      hand={state.zones.hand}
      selectedHandIid={selectedHandIid}
      playableHandIids={playableHandIids}
      onHandSelect={onHandSelect}
    />
  );

  return (
    <div
      className={`relative px-3 sm:px-5 py-2 sm:py-3 flex flex-col gap-1.5 ${
        isOpponent
          ? "bg-gradient-to-b from-orange-400/10 to-transparent"
          : "bg-gradient-to-t from-sky-400/10 to-transparent"
      }`}
    >
      {isOpponent ? (
        <>
          {hand}
          {statusRow}
          {bench}
          {active}
        </>
      ) : (
        <>
          {active}
          {bench}
          {statusRow}
          {hand}
        </>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────
// 이름 배너 (플레이어 식별 + 라이프 ❤️)
// ──────────────────────────────────────────────────────────
function NameBanner({
  isOpponent,
  isActive,
  life,
}: {
  isOpponent: boolean;
  isActive: boolean;
  life: number;
}) {
  return (
    <div
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold text-white bg-slate-800/90 shadow ${
        isActive ? "ring-2 " + (isOpponent ? "ring-red-400" : "ring-sky-400") : ""
      }`}
    >
      {isOpponent ? (
        <Cpu className="h-3.5 w-3.5 text-red-300" />
      ) : (
        <User className="h-3.5 w-3.5 text-sky-300" />
      )}
      <span>{isOpponent ? "AI 상대" : "나"}</span>
      <span className="flex items-center gap-0.5 text-rose-300">
        <Heart className="h-3 w-3 fill-current" />
        {life}
      </span>
    </div>
  );
}

// ──────────────────────────────────────────────────────────
// DON!! 리소스 배지 (포켓몬 에너지존 느낌)
// ──────────────────────────────────────────────────────────
function DonBadge({ active, total }: { active: number; total: number }) {
  return (
    <div className="relative flex flex-col items-center justify-center h-11 w-11 shrink-0 rounded-full bg-gradient-to-br from-yellow-400 to-amber-500 text-black shadow-lg ring-2 ring-yellow-200/60">
      <Coins className="h-3.5 w-3.5" />
      <span className="text-[10px] font-black leading-none">
        {active}
        <span className="text-[7px] font-bold opacity-70">/{total}</span>
      </span>
    </div>
  );
}

// ──────────────────────────────────────────────────────────
// 덱 / 트래시 더미
// ──────────────────────────────────────────────────────────
function Pile({ kind, count }: { kind: "deck" | "trash"; count: number }) {
  const isDeck = kind === "deck";
  return (
    <div className="relative w-8 h-11 shrink-0" title={isDeck ? "덱" : "트래시"}>
      <div
        className={`absolute inset-0 translate-x-0.5 translate-y-0.5 rounded-md border ${
          isDeck ? "bg-indigo-800 border-indigo-400/40" : "bg-muted border-border"
        }`}
      />
      <div
        className={`absolute inset-0 rounded-md border flex items-center justify-center ${
          isDeck
            ? "bg-gradient-to-br from-indigo-500 to-indigo-700 border-indigo-300/40"
            : "bg-card border-border"
        }`}
      >
        {isDeck ? (
          <Layers className="h-3.5 w-3.5 text-white/80" />
        ) : (
          <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
        )}
      </div>
      <span className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 text-[8px] font-black bg-background/90 rounded px-1 border border-border">
        {count}
      </span>
    </div>
  );
}

// ──────────────────────────────────────────────────────────
// 리더(액티브) 카드 — 크게 + 글로우 + 라이프 HP 배지
// ──────────────────────────────────────────────────────────
function LeaderCard({
  unit,
  life,
  glowing,
}: {
  unit: CardInstance;
  life: number;
  glowing: boolean;
}) {
  const meta = getCardMeta(unit.code);
  const power = getBattlePower(unit);
  const donAttached = unit.attached.filter((t) => t.code === "DON!!").length;
  const lowLife = life <= 1;

  return (
    <div className="relative">
      {glowing && <div className="absolute -inset-1.5 rounded-2xl bg-cyan-400/40 blur-md" />}
      <div
        className={`relative w-24 h-32 sm:w-28 sm:h-40 rounded-xl border-2 overflow-hidden shadow-xl ${
          unit.rested
            ? "opacity-70 border-border rotate-[6deg]"
            : glowing
              ? "border-cyan-300"
              : "border-primary/80"
        }`}
        title={meta.name}
      >
        <CardArt meta={meta} />
        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-transparent to-black/30 pointer-events-none" />
        <span className="absolute top-1 left-1 right-9 text-[9px] font-extrabold truncate text-white drop-shadow">
          {meta.name}
        </span>
        <span className="absolute bottom-1 left-1 bg-red-600/90 text-white text-[10px] font-black px-1.5 rounded">
          {power}
        </span>
        {donAttached > 0 && (
          <span className="absolute bottom-1 right-1 bg-yellow-500 text-black text-[9px] font-black px-1 rounded">
            +{donAttached}
          </span>
        )}
        {unit.rested && (
          <span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-black/80 text-destructive font-black text-[9px] px-1.5 py-0.5 rounded">
            REST
          </span>
        )}
      </div>
      {/* 라이프 = HP 배지(카드 우상단) */}
      <span
        className={`absolute -top-2 -right-2 flex items-center gap-0.5 text-white text-xs font-black px-1.5 py-0.5 rounded-full shadow-lg ring-2 ring-white/40 ${
          lowLife ? "bg-destructive animate-pulse" : "bg-rose-500"
        }`}
      >
        <Heart className="h-3 w-3 fill-current" />
        {life}
      </span>
    </div>
  );
}

// ──────────────────────────────────────────────────────────
// 내 손패 — 하단에 부채꼴(겹침) 배치
// ──────────────────────────────────────────────────────────
function HandFan({
  hand,
  selectedHandIid,
  playableHandIids,
  onHandSelect,
}: {
  hand: CardInstance[];
  selectedHandIid?: string | null;
  playableHandIids?: Set<string>;
  onHandSelect?: (iid: string) => void;
}) {
  if (hand.length === 0) {
    return (
      <div className="flex justify-center py-3 text-[10px] text-muted-foreground">손패 없음</div>
    );
  }
  return (
    <div className="flex justify-center items-end overflow-x-auto pt-1">
      <div className="flex items-end">
        {hand.map((c, i) => {
          const meta = getCardMeta(c.code);
          const playable = playableHandIids?.has(c.iid);
          const selected = selectedHandIid === c.iid;
          return (
            <button
              key={c.iid}
              onClick={() => onHandSelect?.(c.iid)}
              title={meta.name}
              style={{ zIndex: selected ? 30 : i }}
              className={`relative w-16 h-24 sm:w-[72px] sm:h-[104px] rounded-lg border-2 overflow-hidden shrink-0 shadow-lg transition-all ${
                i > 0 ? "-ml-5 sm:-ml-6" : ""
              } ${
                selected
                  ? "border-cyan-300 ring-2 ring-cyan-300 -translate-y-3"
                  : playable
                    ? "border-green-400/80 hover:-translate-y-2"
                    : "border-border/60 opacity-80"
              }`}
            >
              <CardArt meta={meta} />
              <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-transparent to-black/20 pointer-events-none" />
              <span className="absolute top-0.5 left-0.5 right-0.5 text-[8px] font-extrabold truncate text-white drop-shadow">
                {meta.name}
              </span>
              <div className="absolute bottom-0.5 left-0.5 right-0.5 flex items-center justify-between text-[8px]">
                <span className="bg-black/70 text-white px-1 rounded font-bold">{meta.cost}</span>
                {meta.power > 0 && (
                  <span className="bg-red-600/90 text-white px-1 rounded font-bold">
                    {meta.power}
                  </span>
                )}
              </div>
              {playable && !selected && (
                <span className="absolute top-0.5 right-0.5 h-2 w-2 rounded-full bg-green-400 ring-1 ring-white/50" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────
// 상대 손패 — 카드 뒷면만(겹침), 정보 비공개
// ──────────────────────────────────────────────────────────
function OppHand({ count }: { count: number }) {
  return (
    <div className="flex justify-center items-start">
      <div className="flex">
        {Array.from({ length: Math.min(count, 10) }).map((_, i) => (
          <div
            key={i}
            style={{ zIndex: i }}
            className={`w-7 h-10 rounded-sm bg-gradient-to-br from-slate-600 to-slate-800 border border-slate-500/40 shadow ${
              i > 0 ? "-ml-3" : ""
            }`}
          />
        ))}
      </div>
      <span className="ml-2 self-center text-[9px] font-bold text-muted-foreground">{count}</span>
    </div>
  );
}

// ──────────────────────────────────────────────────────────
// 카드 아트 (이미지/대체)
// ──────────────────────────────────────────────────────────
function CardArt({ meta }: { meta: ReturnType<typeof getCardMeta> }) {
  const src = displayImageSrc(meta.imageUrl);
  if (src) {
    return (
      <img
        src={src}
        alt={meta.name}
        loading="lazy"
        className="absolute inset-0 w-full h-full object-cover"
      />
    );
  }
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-muted text-[7px] font-extrabold text-muted-foreground text-center px-0.5">
      {meta.name}
    </div>
  );
}

function EmptySlot({ isLeader }: { isLeader?: boolean }) {
  return (
    <div
      className={`shrink-0 rounded-lg border-2 border-dashed border-white/30 bg-white/5 dark:border-white/15 ${
        isLeader ? "w-24 h-32 sm:w-28 sm:h-40 rounded-xl" : "w-12 h-[68px] sm:w-14 sm:h-20"
      }`}
    />
  );
}

// ──────────────────────────────────────────────────────────
// 벤치(캐릭터) 유닛 카드 — 작게 + 파워 배지 플로팅
// ──────────────────────────────────────────────────────────
function BattleUnit({ unit }: { unit: CardInstance }) {
  const meta = getCardMeta(unit.code);
  const power = getBattlePower(unit);
  const donAttached = unit.attached.filter((t) => t.code === "DON!!").length;

  return (
    <div className="relative shrink-0">
      <div
        className={`relative w-12 h-[68px] sm:w-14 sm:h-20 rounded-lg border overflow-hidden shadow-md ${
          unit.rested ? "opacity-70 border-border rotate-[8deg]" : "border-primary/70"
        }`}
        title={meta.name}
      >
        <CardArt meta={meta} />
        <div className="absolute inset-0 bg-gradient-to-t from-black/85 to-transparent pointer-events-none" />
        <span className="absolute bottom-0.5 left-0.5 right-0.5 text-[7px] font-bold truncate text-white drop-shadow">
          {meta.name}
        </span>
        {unit.rested && (
          <span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-black/80 text-destructive font-black text-[8px] px-1 rounded">
            R
          </span>
        )}
      </div>
      {/* 파워 배지(우상단 플로팅) */}
      <span className="absolute -top-1.5 -right-1.5 bg-red-600 text-white text-[9px] font-black px-1 rounded-full shadow ring-1 ring-white/40">
        {power}
      </span>
      {donAttached > 0 && (
        <span className="absolute -bottom-1 -right-1 bg-yellow-500 text-black text-[8px] font-black px-1 rounded-full shadow">
          +{donAttached}
        </span>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────
// 카운터 윈도우 안내 밴드
// ──────────────────────────────────────────────────────────
function CounterBand({
  pending,
  state,
}: {
  pending: NonNullable<GameState["pendingResponse"]>;
  state: GameState;
}) {
  const def =
    pending.baseDefenderPower + pending.appliedModifiers.reduce((acc, m) => acc + m.delta, 0);
  const attackerName = nameOfIid(state, pending.attackerIid);
  const isLeaderTarget = pending.defenderIid.endsWith("-leader");

  return (
    <div className="flex items-center justify-center gap-2 text-[11px] flex-wrap">
      <ShieldAlert className="h-4 w-4 text-amber-500 shrink-0" />
      <span className="font-bold text-amber-500">배틀!</span>
      <span className="text-muted-foreground">
        <span className="font-bold text-foreground">{attackerName}</span> 공격{" "}
        <span className="font-black text-red-500">{pending.baseAttackerPower}</span> vs 수비{" "}
        <span className="font-black text-blue-500">{def}</span>{" "}
        <span className="text-[10px]">({isLeaderTarget ? "리더" : "캐릭터"} 대상)</span>
      </span>
    </div>
  );
}

// ──────────────────────────────────────────────────────────
// iid → 카드 인스턴스/이름 조회
// ──────────────────────────────────────────────────────────
function findInstance(state: GameState, iid: string): CardInstance | null {
  for (const pid of ["p1", "p2"] as PlayerId[]) {
    const z = state.players[pid].zones;
    for (const arr of [z.primary, z.secondary, z.hand, z.graveyard, z.deck, z.life, z.resource]) {
      const found = arr.find((c) => c.iid === iid);
      if (found) return found;
    }
  }
  return null;
}

function nameOfIid(state: GameState, iid: string): string {
  const inst = findInstance(state, iid);
  return inst ? getCardMeta(inst.code).name : iid;
}

// ──────────────────────────────────────────────────────────
// 액션 레이블 (iid → 실제 카드명 해석)
// ──────────────────────────────────────────────────────────
function getActionLabel(act: Action, state: GameState): string {
  switch (act.type) {
    case "play_character":
      return `🃏 ${nameOfIid(state, act.iid)} (DON ${act.donToPay})`;
    case "play_event":
      return `⚡ ${nameOfIid(state, act.iid)} (DON ${act.donToPay})`;
    case "play_stage":
      return `🏰 ${nameOfIid(state, act.iid)} (DON ${act.donToPay})`;
    case "attach_don":
      return `💪 DON 부착 ×${act.count}`;
    case "activate_main":
      return `✨ ${nameOfIid(state, act.sourceIid)} 효과`;
    case "attack":
      return `🎯 공격: ${nameOfIid(state, act.attackerIid)} → ${
        act.targetIid.endsWith("-leader") ? "리더" : nameOfIid(state, act.targetIid)
      }`;
    case "use_blocker":
      return `🛡️ 블로커: ${nameOfIid(state, act.blockerIid)}`;
    case "play_counter":
      return `⚡ 카운터: ${nameOfIid(state, act.iid)}`;
    case "pass_counter":
      return "🤝 패스";
    case "end_main":
      return "⏰ 턴 종료";
    case "concede":
      return "🏳️ 기권";
    default:
      return "액션";
  }
}

// ──────────────────────────────────────────────────────────
// 액션 버튼 색상
// ──────────────────────────────────────────────────────────
function getActionColorClass(type: Action["type"]): string {
  switch (type) {
    case "attach_don":
    case "activate_main":
      return "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border-yellow-500/30 hover:bg-yellow-500 hover:text-white";
    case "attack":
      return "bg-red-500/10 text-red-500 border-red-500/30 hover:bg-red-500 hover:text-white";
    case "use_blocker":
    case "play_counter":
      return "bg-blue-500/10 text-blue-500 border-blue-500/30 hover:bg-blue-500 hover:text-white";
    case "end_main":
    case "pass_counter":
      return "bg-muted text-muted-foreground border-border hover:bg-foreground hover:text-background";
    case "concede":
      return "bg-destructive/10 text-destructive border-destructive/30 hover:bg-destructive hover:text-white";
    default:
      return "bg-card text-foreground border-border hover:bg-accent";
  }
}

// ──────────────────────────────────────────────────────────
// 로그 메시지 서식
// ──────────────────────────────────────────────────────────
function formatEventLog(evt: any): string {
  const pName = evt.player === "p1" ? "나(P1)" : "AI(P2)";
  switch (evt.type) {
    case "game_start":
      return "⚔️ 대국 시작!";
    case "turn_start":
      return `━━ 턴 ${evt.turn} (${pName}) ━━`;
    case "play_character":
      return `🃏 ${pName}: 캐릭터 [${getCardMeta(evt.payload?.code).name}] 등장`;
    case "attach_don":
      return `💪 ${pName}: DON!! ${evt.payload?.count}장 부착`;
    case "attack_declared":
      return `🎯 ${pName}: 공격 선언!`;
    case "use_blocker":
      return `🛡️ ${pName}: 블로커로 방어`;
    case "play_counter":
      return `⚡ ${pName}: 카운터 [${getCardMeta(evt.payload?.code).name}]`;
    case "damage_taken":
      return `💥 피격! 라이프 -1 (남은 ${evt.payload?.leftLife}장)`;
    case "character_ko":
      return `💀 [${getCardMeta(evt.payload?.code).name}] KO → 트래시`;
    case "attack_defended":
      return "🛡️ 공격 방어 성공";
    case "concede":
      return `🏳️ ${pName}: 기권`;
    default:
      return `${pName}: ${evt.type}`;
  }
}
