import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, useMemo, useEffect, useRef } from "react";
import { ArrowLeft, Swords, RefreshCw, LogOut, ShieldAlert, Cpu, User, Play, Pause, FastForward } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { useI18n } from "@/i18n/language-context";
import { PREBUILT_DECKS } from "@/lib/simulator/prebuilt-decks";
import { optcgEngine, CARD_METADATA_CACHE, getCardMeta, getBattlePower } from "@/lib/simulator/engines/optcg";
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
  const { t } = useI18n();

  const [loading, setLoading] = useState(true);
  const [loadingText, setLoadingText] = useState("대국 정보 불러오는 중...");
  
  // 게임 세션 관련 상태
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [isAutoPlaying, setIsAutoPlaying] = useState(mode === "auto");
  const [speedMs, setSpeedMs] = useState<number>(1000); // AI 진행 속도
  const autoPlayTimerRef = useRef<NodeJS.Timeout | null>(null);
  const logEndRef = useRef<HTMLDivElement | null>(null);

  // 1. P1 덱 레시피 로드
  const { data: p1Deck } = useQuery({
    queryKey: ["sim-match-deck-p1", p1],
    enabled: !!p1,
    queryFn: async () => {
      if (p1!.startsWith("prebuilt-")) {
        return PREBUILT_DECKS.find((d) => d.id === p1)?.recipe ?? null;
      }
      const { data, error } = await supabase.from("simulator_decks").select("*").eq("id", p1!).single();
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
      const { data, error } = await supabase.from("simulator_decks").select("*").eq("id", p2!).single();
      if (error) throw error;
      return data.recipe as any;
    },
  });

  // 3. 카드 메타데이터 캐시 로드 및 게임 초기화
  useEffect(() => {
    if (!p1Deck || !p2Deck) return;

    const initBattle = async () => {
      setLoadingText("카드 효과 사전 적재 중...");
      try {
        // 모든 투입 코드 추출
        const p1Codes = p1Deck.cards.map((c: any) => c.card_code);
        if (p1Deck.leaderCode) p1Codes.push(p1Deck.leaderCode);
        
        const p2Codes = p2Deck.cards.map((c: any) => c.card_code);
        if (p2Deck.leaderCode) p2Codes.push(p2Deck.leaderCode);

        const allCodes = Array.from(new Set([...p1Codes, ...p2Codes]));

        // Supabase에서 메타데이터 검색
        const { data: cardRows, error } = await supabase
          .from("cards")
          .select("code, name, cost, power, counter, type, colors, effects")
          .in("code", allCodes);

        if (error) throw error;

        // 글로벌 캐시 적재
        for (const row of cardRows ?? []) {
          CARD_METADATA_CACHE[row.code] = {
            name: row.name ?? row.code,
            cost: row.cost ?? 0,
            power: row.power ?? (row.type === "leader" ? 5000 : 0),
            counterValue: row.counter ?? 0,
            type: row.type as any,
            colors: row.colors ?? [],
            effects: (row.effects as any) ?? [],
          };
        }


        // 게임 인메모리 엔진 구동
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

  // 로그 스크롤 이동
  useEffect(() => {
    if (logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [gameState?.log]);

  // AI 의사결정 타이머 루프
  useEffect(() => {
    if (!gameState) return;

    // 터미널 상태 판정
    const terminal = optcgEngine.isTerminal(gameState);
    if (terminal) {
      setIsAutoPlaying(false);
      if (autoPlayTimerRef.current) clearTimeout(autoPlayTimerRef.current);
      return;
    }

    // AI 진행 필요 여부
    const isP2Turn = gameState.activePlayer === "p2";
    const isP2Countering = gameState.pendingResponse && gameState.pendingResponse.defenderPlayer === "p2";
    
    // AI vs AI 모드인 경우
    const shouldAiPlay = isAutoPlaying || isP2Turn || isP2Countering;

    if (shouldAiPlay) {
      const activeAiPlayer = isP2Countering ? "p2" : (isP2Turn ? "p2" : "p1");
      
      autoPlayTimerRef.current = setTimeout(() => {
        const action = chooseAction(optcgEngine, gameState, activeAiPlayer);
        if (action) {
          const next = optcgEngine.applyAction(gameState, action);
          setGameState(next);
        } else {
          // 기권 또는 패스
          const passAction = optcgEngine.getAvailableActions(gameState, activeAiPlayer).find(a => a.type === "pass_counter" || a.type === "end_main");
          if (passAction) {
            setGameState(optcgEngine.applyAction(gameState, passAction));
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

  // 액션 수행 핸들러
  const handlePerformAction = (action: Action) => {
    const next = optcgEngine.applyAction(gameState, action);
    setGameState(next);
  };

  const isTerminalResult = optcgEngine.isTerminal(gameState);
  const activePlayerState = gameState.players[gameState.activePlayer];
  const p1State = gameState.players.p1;
  const p2State = gameState.players.p2;

  // 현재 P1이 수동 대응 가능한 액션 조회
  const p1AvailableActions = !isTerminalResult && !isAutoPlaying && 
    ((gameState.activePlayer === "p1" && !gameState.pendingResponse) || 
     (gameState.pendingResponse && gameState.pendingResponse.defenderPlayer === "p1"))
    ? optcgEngine.getAvailableActions(gameState, "p1")
    : [];

  return (
    <div className="mx-auto w-full max-w-7xl px-3 sm:px-4 py-3 sm:py-6 pb-28 lg:pb-6 flex flex-col gap-4 sm:gap-6">
      {/* ── 헤더 영역 (모바일에서 상단 sticky) ── */}
      <div className="sticky top-0 z-30 -mx-3 sm:-mx-4 px-3 sm:px-4 py-2 sm:py-0 sm:static bg-background/85 backdrop-blur sm:bg-transparent sm:backdrop-blur-0 flex flex-wrap items-center justify-between gap-2 sm:gap-4 border-b border-border pb-2 sm:pb-4">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <Link to="/simulator" className="p-2 border border-border rounded-lg bg-card hover:bg-accent text-muted-foreground hover:text-foreground transition-all shrink-0">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div className="min-w-0">
            <h1 className="text-sm sm:text-lg font-black tracking-tight flex items-center gap-2 truncate">
              <Swords className="h-4 w-4 sm:h-5 sm:w-5 text-red-500 shrink-0" /> <span className="truncate">시뮬레이션 매치 룸</span>
            </h1>
            <p className="text-[10px] sm:text-xs text-muted-foreground mt-0.5 truncate">
              Turn {gameState.turn} · {gameState.phase === "main" ? "메인" : "전투대응"} ·{" "}
              <span className="font-extrabold text-primary">
                {gameState.activePlayer === "p1" ? "P1(나)" : "P2(AI)"} 턴
              </span>
            </p>
          </div>
        </div>

        {/* 관전/자동 속도 컨트롤 */}
        <div className="flex items-center gap-2 flex-wrap">
          {mode === "auto" && (
            <div className="flex items-center gap-1 bg-muted p-0.5 rounded-lg text-[11px] sm:text-xs">
              <button
                onClick={() => setIsAutoPlaying(prev => !prev)}
                className={`flex items-center gap-1.5 px-2 sm:px-3 py-1.5 rounded-md font-bold transition-all ${
                  isAutoPlaying ? "bg-primary text-primary-foreground shadow" : "hover:bg-card text-muted-foreground"
                }`}
              >
                {isAutoPlaying ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5 fill-current" />}
                <span className="hidden sm:inline">{isAutoPlaying ? "일시정지" : "자동재생"}</span>
              </button>
              <div className="h-4 w-[1px] bg-border mx-1" />
              {[1500, 1000, 500].map((ms) => (
                <button
                  key={ms}
                  onClick={() => setSpeedMs(ms)}
                  className={`px-2 py-1.5 rounded-md ${speedMs === ms ? "font-bold text-foreground" : "text-muted-foreground"}`}
                >
                  {(ms / 1000).toFixed(1)}s
                </button>
              ))}
            </div>
          )}

          <button
            onClick={() => {
              if (confirm("대국을 기권하고 로비로 돌아가시겠습니까?")) {
                navigate({ to: "/simulator" });
              }
            }}
            className="flex items-center gap-1.5 px-2.5 sm:px-3 py-2 bg-destructive/10 text-destructive hover:bg-destructive hover:text-white rounded-lg text-[11px] sm:text-xs font-bold transition-all min-h-10"
          >
            <LogOut className="h-3.5 w-3.5" /> <span className="hidden sm:inline">기권 및 퇴장</span><span className="sm:hidden">기권</span>
          </button>
        </div>
      </div>


      {/* ── 승패 종료 알림 배너 ── */}
      {isTerminalResult && (
        <div className="rounded-xl border border-primary/20 bg-primary/5 p-6 text-center shadow-lg space-y-3">
          <h2 className="text-xl font-black text-primary animate-bounce">
            🎉 대국이 종료되었습니다! 🎉
          </h2>
          <p className="text-sm font-bold text-muted-foreground">
            우승 플레이어: {"winner" in isTerminalResult && isTerminalResult.winner === "p1" ? "Player 1 (User) 🏆" : "Player 2 (AI) 🏆"}
          </p>
          <div className="flex justify-center gap-3 mt-4">
            <Link to="/simulator" className="px-4 py-2 border border-border bg-card rounded-lg text-xs font-bold hover:bg-accent">
              로비로 이동
            </Link>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-xs font-bold hover:opacity-90 shadow"
            >
              재대국 하기
            </button>
          </div>
        </div>
      )}

      {/* ── 시뮬레이터 배틀 보드 ── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-6 items-start">
        {/* ── 배틀 필드 보드 (12열 중 8열) ── */}
        <div className="lg:col-span-8 flex flex-col gap-4 sm:gap-6 min-w-0">
          
          {/* ── PLAYER 2 (상단: AI) ── */}
          <div className="rounded-2xl border border-border bg-card/40 p-3 sm:p-4 relative space-y-3 sm:space-y-4">
            <div className="absolute top-2 right-2 sm:top-3 sm:right-4 flex items-center gap-1 sm:gap-1.5 text-[9px] sm:text-[10px] font-bold text-red-500 bg-red-500/10 px-1.5 sm:px-2 py-0.5 rounded-full">
              <Cpu className="h-3 w-3 sm:h-3.5 sm:w-3.5" /> AI (P2)
            </div>

            <PlayerStatRow playerState={p2State} isTop={true} />

            {/* AI 필드 에리어 */}
            <div className="grid grid-cols-[auto_1fr] gap-2 sm:gap-3 items-center min-h-[120px] sm:min-h-[140px] border-t border-border/20 pt-3 sm:pt-4">

              {/* 리더 슬롯 */}
              <div className="flex flex-col items-center">
                <span className="text-[9px] font-bold text-muted-foreground mb-1">LEADER</span>
                {p2State.zones.primary[0] && (
                  <BattleUnit unit={p2State.zones.primary[0]} />
                )}
              </div>

              {/* 캐릭터 에리어 (최대 5개) */}
              <div className="flex gap-2 sm:gap-3 overflow-x-auto pb-1 min-w-0">
                {p2State.zones.secondary.length === 0 ? (
                  <div className="flex-1 flex items-center justify-center border border-dashed border-border/40 rounded-xl text-[10px] text-muted-foreground min-h-[100px] sm:min-h-[120px] px-4">
                    배틀 영역이 비어 있습니다.
                  </div>
                ) : (
                  p2State.zones.secondary.map((c) => (
                    <BattleUnit key={c.iid} unit={c} />
                  ))
                )}
              </div>

            </div>

            {/* AI 핸드 에리어 (비공개 또는 반투명) */}
            <div className="border-t border-border/20 pt-3 flex items-center gap-2">
              <span className="text-[10px] font-bold text-muted-foreground">손패 ({p2State.zones.hand.length}):</span>
              <div className="flex gap-1.5 overflow-x-auto py-1">
                {p2State.zones.hand.map((c, i) => (
                  <div
                    key={c.iid}
                    className="w-10 h-14 rounded border border-border bg-card/60 flex flex-col items-center justify-center text-[7px] text-muted-foreground relative opacity-60 hover:opacity-100 transition-opacity"
                    title={getCardMeta(c.code).name}
                  >
                    <span className="font-extrabold truncate w-full px-1 text-center">
                      {getCardMeta(c.code).name}
                    </span>
                    <span className="absolute bottom-0.5 text-[6px] text-primary">{c.code}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* ── 대국 현황 중재선 (Pending Counter Info) ── */}
          {gameState.pendingResponse && (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3.5 flex items-center justify-between text-xs">
              <div className="flex items-center gap-2.5">
                <ShieldAlert className="h-4 w-4 text-amber-500 shrink-0" />
                <div>
                  <span className="font-bold text-amber-500">배틀 대응 발생!</span>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    공격력 {gameState.pendingResponse.baseAttackerPower} vs 방어력{" "}
                    {gameState.pendingResponse.baseDefenderPower +
                      gameState.pendingResponse.appliedModifiers.reduce((acc, m) => acc + m.delta, 0)}{" "}
                    (기본 수비력 {gameState.pendingResponse.baseDefenderPower}
                    {gameState.pendingResponse.appliedModifiers.length > 0 &&
                      ` + 카운터 ${gameState.pendingResponse.appliedModifiers.reduce((acc, m) => acc + m.delta, 0)}`}
                    )
                  </p>
                </div>
              </div>
              <div className="text-[10px] font-bold bg-amber-500/10 text-amber-500 px-2 py-1 rounded">
                수비 대상: {gameState.pendingResponse.defenderIid.endsWith("-leader") ? "리더" : "캐릭터"}
              </div>
            </div>
          )}

          {/* ── PLAYER 1 (하단: USER) ── */}
          <div className="rounded-2xl border border-border bg-card/40 p-3 sm:p-4 relative space-y-3 sm:space-y-4">
            <div className="absolute top-2 right-2 sm:top-3 sm:right-4 flex items-center gap-1 sm:gap-1.5 text-[9px] sm:text-[10px] font-bold text-blue-500 bg-blue-500/10 px-1.5 sm:px-2 py-0.5 rounded-full">
              <User className="h-3 w-3 sm:h-3.5 sm:w-3.5" /> USER (P1)
            </div>

            <PlayerStatRow playerState={p1State} isTop={false} />

            {/* USER 필드 에리어 */}
            <div className="grid grid-cols-[auto_1fr] gap-2 sm:gap-3 items-center min-h-[120px] sm:min-h-[140px] border-t border-border/20 pt-3 sm:pt-4">
              {/* 리더 슬롯 */}
              <div className="flex flex-col items-center">
                <span className="text-[9px] font-bold text-muted-foreground mb-1">LEADER</span>
                {p1State.zones.primary[0] && (
                  <BattleUnit unit={p1State.zones.primary[0]} />
                )}
              </div>

              {/* 캐릭터 에리어 */}
              <div className="flex gap-2 sm:gap-3 overflow-x-auto pb-1 min-w-0">
                {p1State.zones.secondary.length === 0 ? (
                  <div className="flex-1 flex items-center justify-center border border-dashed border-border/40 rounded-xl text-[10px] text-muted-foreground min-h-[100px] sm:min-h-[120px] px-4">
                    배틀 영역이 비어 있습니다.
                  </div>
                ) : (
                  p1State.zones.secondary.map((c) => (
                    <BattleUnit key={c.iid} unit={c} />
                  ))
                )}
              </div>
            </div>


            {/* USER 핸드 에리어 */}
            <div className="border-t border-border/20 pt-3 flex items-center gap-2">
              <span className="text-[10px] font-bold text-muted-foreground shrink-0">내 손패 ({p1State.zones.hand.length}):</span>
              <div className="flex gap-2 overflow-x-auto py-1 flex-1">
                {p1State.zones.hand.length === 0 ? (
                  <span className="text-[10px] text-muted-foreground">손패가 없습니다.</span>
                ) : (
                  p1State.zones.hand.map((c) => {
                    const meta = getCardMeta(c.code);
                    return (
                      <div
                        key={c.iid}
                        className="w-12 h-[68px] sm:w-16 sm:h-24 rounded-lg border border-border bg-card p-1 flex flex-col justify-between shrink-0 shadow-sm relative group cursor-pointer hover:border-primary/50"
                        title={meta.name}
                      >

                        <div className="min-w-0">
                          <span className="text-[8px] font-extrabold truncate block leading-tight">
                            {meta.name}
                          </span>
                          <span className="text-[7px] text-muted-foreground block leading-none mt-0.5">
                            {c.code}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-[7px] border-t border-border/30 pt-1 mt-auto">
                          <span className="bg-muted px-1 rounded font-bold">Cost {meta.cost}</span>
                          {meta.power > 0 && <span className="font-bold text-red-500">{meta.power}</span>}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>

          {/* ── 수동 조작 액션 리스트 Panel — 모바일은 하단 sticky ── */}
          {p1AvailableActions.length > 0 && (
            <div className="rounded-2xl border border-border bg-card p-3 sm:p-4 space-y-2 sm:space-y-3 shadow-md lg:static fixed bottom-0 left-0 right-0 z-40 lg:z-auto rounded-b-none lg:rounded-2xl border-t-2 lg:border pb-[calc(0.75rem+env(safe-area-inset-bottom))] lg:pb-4">
              <h3 className="text-[11px] sm:text-xs font-bold text-muted-foreground flex items-center gap-1.5">
                <User className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-blue-500" /> 수동 조작 액션 (P1)
              </h3>
              <div className="flex flex-wrap gap-1.5 sm:gap-2 max-h-32 lg:max-h-none overflow-y-auto">
                {p1AvailableActions.map((act, index) => {
                  const label = getActionLabel(act);
                  const colorClass = getActionColorClass(act.type);
                  return (
                    <button
                      key={index}
                      onClick={() => handlePerformAction(act)}
                      className={`px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-lg text-[11px] sm:text-xs font-bold transition-all border shadow-sm min-h-10 ${colorClass}`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* ── 실시간 대국 로그 창 — 모바일은 접이식 ── */}
        <details open className="lg:col-span-4 lg:open:!block group rounded-2xl border border-border bg-card/60 backdrop-blur shadow-md overflow-hidden">
          <summary className="cursor-pointer lg:cursor-default list-none p-3 sm:p-4 border-b border-border bg-card flex items-center justify-between">
            <h3 className="text-xs font-black uppercase tracking-wider flex items-center gap-2">
              <Swords className="h-4 w-4 text-primary" /> 실시간 대국 로그
            </h3>
            <span className="text-[10px] text-muted-foreground lg:hidden">탭하여 열기/닫기</span>
          </summary>
          <div className="flex flex-col lg:h-[650px] max-h-[40vh] lg:max-h-none">
            {/* 로그 리스트 */}
            <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-2 sm:space-y-3 font-mono text-[11px] leading-relaxed">
              {gameState.log.map((evt, idx) => {
                const text = formatEventLog(evt);
                return (
                  <div key={idx} className="border-b border-border/20 pb-2">
                    <span className="text-[10px] text-muted-foreground select-none">
                      [T{evt.turn} {evt.player.toUpperCase()}]
                    </span>{" "}
                    <span className="text-foreground/90">{text}</span>
                  </div>
                );
              })}
              <div ref={logEndRef} />
            </div>
          </div>
        </details>
      </div>
    </div>
  );
}


// ──────────────────────────────────────────────────────────
// 헬퍼 컴포넌트: 플레이어 정보 행
// ──────────────────────────────────────────────────────────
function PlayerStatRow({ playerState, isTop }: { playerState: PlayerState; isTop: boolean }) {
  return (
    <div className={`flex flex-wrap items-center justify-between gap-4 py-2 text-xs border-b border-border/20 pb-3 ${isTop ? "flex-row" : "flex-row"}`}>
      <div className="flex items-center gap-4">
        <div className="space-y-0.5">
          <span className="text-[9px] text-muted-foreground uppercase font-bold">라이프</span>
          <div className="flex gap-1">
            {playerState.zones.life.length === 0 ? (
              <span className="text-[10px] text-destructive font-black">0 LIFE (🚨 패배 위기)</span>
            ) : (
              Array.from({ length: playerState.zones.life.length }).map((_, i) => (
                <div key={i} className="h-3 w-5 bg-yellow-500/80 border border-yellow-600 rounded-sm shadow-sm" />
              ))
            )}
          </div>
        </div>

        <div className="h-6 w-[1px] bg-border/40" />

        <div>
          <span className="text-[9px] text-muted-foreground uppercase font-bold block">DON!! 활성 / 총</span>
          <span className="font-extrabold text-xs text-yellow-500">
            {playerState.donActive} Active <span className="text-muted-foreground font-normal">/ {playerState.donActive + playerState.donRested}</span>
          </span>
        </div>
      </div>

      <div className="flex items-center gap-4 text-[10px] text-muted-foreground">
        <div>덱: <span className="font-bold text-foreground">{playerState.zones.deck.length}장</span></div>
        <div>트래시: <span className="font-bold text-foreground">{playerState.zones.graveyard.length}장</span></div>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────
// 헬퍼 컴포넌트: 필드 유닛 카드
// ──────────────────────────────────────────────────────────
function BattleUnit({ unit }: { unit: CardInstance }) {
  const meta = getCardMeta(unit.code);
  const power = getBattlePower(unit);
  const donAttached = unit.attached.filter((t) => t.code === "DON!!").length;

  return (
    <div
      className={`relative w-16 h-24 sm:w-20 sm:h-28 rounded-lg border bg-card p-1.5 flex flex-col justify-between shrink-0 shadow transition-all ${
        unit.rested ? "opacity-65 border-border scale-95" : "border-primary"
      }`}
      style={{
        transform: unit.rested ? "rotate(10deg)" : "none",
      }}
      title={meta.name}
    >
      <div className="min-w-0 leading-none">
        <span className="text-[9px] font-extrabold truncate block leading-tight">{meta.name}</span>
        <span className="text-[7px] text-muted-foreground block mt-0.5">{unit.code}</span>
      </div>

      {/* 부착된 DON!! 표시 */}
      {donAttached > 0 && (
        <span className="absolute top-1.5 right-1.5 bg-yellow-500 text-white font-extrabold text-[8px] px-1 rounded-sm shadow flex items-center gap-0.5">
          <FastForward className="h-2 w-2" /> D+{donAttached}
        </span>
      )}

      {/* 상태 배지 */}
      {unit.rested && (
        <span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-black/85 text-destructive font-black text-[9px] px-1.5 py-0.5 rounded shadow tracking-widest border border-destructive/20 select-none">
          RESTED
        </span>
      )}

      <div className="flex items-center justify-between text-[8px] border-t border-border/30 pt-1 mt-auto leading-none">
        <span className="bg-muted px-1 rounded font-bold">Cost {meta.cost}</span>
        <span className="font-extrabold text-red-500">{power}</span>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────
// 헬퍼: 액션 레이블 한국어 포맷
// ──────────────────────────────────────────────────────────
function getActionLabel(act: Action): string {
  switch (act.type) {
    case "play_character": {
      const name = getCardMeta(getCardIidCode(act.iid)).name;
      return `🃏 캐릭터 플레이: ${name} (DON!! ${act.donToPay})`;
    }
    case "play_event": {
      const name = getCardMeta(getCardIidCode(act.iid)).name;
      return `⚡ 이벤트 사용: ${name} (DON!! ${act.donToPay})`;
    }
    case "play_stage": {
      const name = getCardMeta(getCardIidCode(act.iid)).name;
      return `🏰 스테이지 플레이: ${name} (DON!! ${act.donToPay})`;
    }
    case "attach_don":
      return `💪 DON!! 부착 (x${act.count})`;
    case "attack":
      return `🎯 공격 선언!`;
    case "use_blocker":
      return `🛡️ 블로커 사용`;
    case "play_counter": {
      const name = getCardMeta(getCardIidCode(act.iid)).name;
      return `⚡ 카운터: ${name}`;
    }
    case "pass_counter":
      return "🤝 카운터 패스";
    case "end_main":
      return "⏰ 턴 종료";
    case "concede":
      return "🏳️ 기권";
    default:
      return "액션";
  }
}

// IID에서 카드 코드 파싱하는 단순 헬퍼
function getCardIidCode(iid: string): string {
  // 예: p1-c3 또는 p1-leader. 실제로 카드 정보를 조회하기 위해선 iid를 코드에 연결하거나
  // iid가 포함된 전체 플레이어 덱 등을 거쳐 코드를 역산해야 합니다.
  // 여기서는 단순히 iid의 코드 정보를 map에서 역산하여 가져옵니다.
  return iid;
}

// ──────────────────────────────────────────────────────────
// 헬퍼: 액션 버튼 색상 지정
// ──────────────────────────────────────────────────────────
function getActionColorClass(type: Action["type"]): string {
  switch (type) {
    case "play_character":
    case "play_event":
    case "play_stage":
      return "bg-green-500/10 text-green-500 border-green-500/30 hover:bg-green-500 hover:text-white";
    case "attack":
      return "bg-red-500/10 text-red-500 border-red-500/30 hover:bg-red-500 hover:text-white";
    case "use_blocker":
    case "play_counter":
      return "bg-blue-500/10 text-blue-500 border-blue-500/30 hover:bg-blue-500 hover:text-white";
    case "end_main":
    case "pass_counter":
      return "bg-muted text-muted-foreground border-border hover:bg-foreground hover:text-background";
    default:
      return "bg-card text-foreground hover:bg-accent";
  }
}

// ──────────────────────────────────────────────────────────
// 헬퍼: 대국 이벤트 로그 메시지 서식화
// ──────────────────────────────────────────────────────────
function formatEventLog(evt: any): string {
  const pName = evt.player === "p1" ? "Player 1 (User)" : "Player 2 (AI)";
  switch (evt.type) {
    case "game_start":
      return "⚔️ 시뮬레이션 대국이 시작되었습니다!";
    case "turn_start":
      return `━━━━━━━━ 턴 ${evt.turn} (${pName}) 시작 ━━━━━━━━`;
    case "play_character":
      return `🃏 ${pName}님이 캐릭터 [${getCardMeta(evt.payload?.code).name}]을(를) 필드에 등장시켰습니다.`;
    case "attach_don":
      return `💪 ${pName}님이 유닛에게 DON!! ${evt.payload?.count}장을 부착했습니다.`;
    case "attack_declared":
      return `🎯 ${pName}님이 공격을 선언했습니다!`;
    case "use_blocker":
      return `🛡️ ${pName}님이 블로커 유닛으로 공격을 방어하기 시작했습니다.`;
    case "play_counter":
      return `⚡ ${pName}님이 손패에서 카운터 카드 [${getCardMeta(evt.payload?.code).name}]를 사용해 전력을 보강했습니다.`;
    case "damage_taken":
      return `💥 피격! 라이프가 1 감소했습니다. (남은 라이프: ${evt.payload?.leftLife}장)`;
    case "character_ko":
      return `💀 캐릭터 [${getCardMeta(evt.payload?.code).name}]이(가) KO되어 트래시(Graveyard)로 이동했습니다.`;
    case "attack_defended":
      return "🛡️ 수비측이 공격을 성공적으로 무력화했습니다.";
    case "concede":
      return `🏳️ ${pName}님이 기권을 선언했습니다.`;
    default:
      return `${pName}: ${evt.type} 액션을 수행함`;
  }
}
