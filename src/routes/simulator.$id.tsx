import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, useEffect, useRef, useMemo } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
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
  Target,
  X,
  Skull,
  Copy,
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
import type { Json } from "@/integrations/supabase/types";
import type {
  GameState,
  Action,
  CardInstance,
  DeckRecipe,
  PlayerId,
  PlayerState,
} from "@/lib/simulator/types";

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
  const { id } = Route.useParams();
  const { p1, p2, mode = "manual" } = Route.useSearch();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { t } = useI18n();
  const isMobile = useIsMobile();

  const isPvp = id !== "play";

  const [loading, setLoading] = useState(true);
  const [loadingText, setLoadingText] = useState("대국 정보 불러오는 중...");

  // PvP 관련 추가 상태
  const [pvpMatch, setPvpMatch] = useState<Tables<"simulator_matches"> | null>(null);
  const [localAppliedCount, setLocalAppliedCount] = useState<number>(0);
  const [guestSelectedDeckId, setGuestSelectedDeckId] = useState<string>("");
  const [realtimeConnected, setRealtimeConnected] = useState<boolean>(true);

  // 게임 세션 상태
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [isAutoPlaying, setIsAutoPlaying] = useState(!isPvp && mode === "auto");
  const [speedMs, setSpeedMs] = useState<number>(1000); // AI 진행 속도
  const [selectedHandIid, setSelectedHandIid] = useState<string | null>(null);
  const [logOpen, setLogOpen] = useState(false);
  const isHost = isPvp && user?.id === pvpMatch?.host_id;
  const myPlayerId: PlayerId = isPvp ? (isHost ? "p1" : "p2") : "p1";
  const opponentPlayerId: PlayerId = myPlayerId === "p1" ? "p2" : "p1";
  const autoPlayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const logEndRef = useRef<HTMLDivElement | null>(null);

  // 대국 보드판 컨테이너 Ref
  const boardRef = useRef<HTMLDivElement>(null);

  // UX & 연출 관련 추가 상태
  const [selectedCardForPreview, setSelectedCardForPreview] = useState<CardInstance | null>(null);
  const [selectedAttackerIid, setSelectedAttackerIid] = useState<string | null>(null);
  const [activeTurnBanner, setActiveTurnBanner] = useState<{
    text: string;
    subText: string;
    activePlayer: PlayerId;
  } | null>(null);
  const [activeAttackAnim, setActiveAttackAnim] = useState<{
    attackerIid: string;
    targetIid: string;
  } | null>(null);
  const [shakePid, setShakePid] = useState<PlayerId | null>(null);
  const [trashGlowPid, setTrashGlowPid] = useState<PlayerId | null>(null);
  const [svgCoords, setSvgCoords] = useState<
    { x1: number; y1: number; x2: number; y2: number; targetIid: string }[]
  >([]);

  // Supabase simulator_matches 로드 및 실시간 구독
  useEffect(() => {
    if (!isPvp || !user) return;

    let isMounted = true;

    const fetchMatch = async () => {
      setLoadingText("PvP 대국 매치 데이터 불러오는 중...");
      try {
        const { data, error } = await supabase
          .from("simulator_matches")
          .select("*")
          .eq("id", id)
          .single();

        if (error) throw error;

        if (isMounted) {
          setPvpMatch(data);
          const actions = (data.action_log as any) || [];
          setLocalAppliedCount(actions.length);
        }
      } catch (err: any) {
        toast.error("PvP 매치 데이터 로드 실패: " + err.message);
        navigate({ to: "/simulator" });
      }
    };

    fetchMatch();

    // postgres_changes로 simulator_matches의 status 등 변경 실시간 감지 (호스트 대기 화면 해제용)
    const matchChannel = supabase
      .channel(`match-changes-${id}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "simulator_matches",
          filter: `id=eq.${id}`,
        },
        (payload) => {
          if (isMounted) {
            const updated = payload.new as Tables<"simulator_matches">;
            setPvpMatch(updated);
          }
        },
      )
      .subscribe();

    return () => {
      isMounted = false;
      supabase.removeChannel(matchChannel);
    };
  }, [id, isPvp, user, navigate]);

  // 사용자 시뮬레이터 덱 쿼리 (게스트 덱 선택용)
  const { data: userDecks = [] } = useQuery({
    queryKey: ["simulator-decks", user?.id],
    enabled: isPvp && !isHost && !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("simulator_decks")
        .select("*")
        .eq("user_id", user!.id)
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  // 모든 사용 가능한 덱 목록
  const allAvailableDecks = useMemo(() => {
    if (!isPvp || isHost) return [];
    const list: {
      id: string;
      name: string;
      isPrebuilt: boolean;
      recipe: DeckRecipe;
      leaderCode: string | null;
    }[] = [];

    for (const d of userDecks) {
      list.push({
        id: d.id,
        name: d.name,
        isPrebuilt: false,
        recipe: d.recipe as Json & DeckRecipe,
        leaderCode: d.leader_code,
      });
    }

    for (const p of PREBUILT_DECKS) {
      list.push({
        id: p.id,
        name: `[기본] ${p.name}`,
        isPrebuilt: true,
        recipe: p.recipe,
        leaderCode: p.leaderCode,
      });
    }

    return list;
  }, [userDecks, isPvp, isHost]);

  // 기본 덱 선택 처리
  useEffect(() => {
    if (isPvp && !isHost && allAvailableDecks.length > 0 && !guestSelectedDeckId) {
      setGuestSelectedDeckId(allAvailableDecks[0].id);
    }
  }, [allAvailableDecks, isPvp, isHost, guestSelectedDeckId]);

  // 게스트 대국방 입장 핸들러
  const handleGuestJoin = async () => {
    if (!user) {
      toast.error("로그인이 필요한 서비스입니다.");
      return;
    }
    if (!guestSelectedDeckId) {
      toast.error("플레이할 내 덱을 선택해 주세요.");
      return;
    }

    const selectedDeck = allAvailableDecks.find((d) => d.id === guestSelectedDeckId);
    if (!selectedDeck) return;

    const leaderCode = selectedDeck.leaderCode || selectedDeck.recipe?.leaderCode;
    if (!leaderCode) {
      toast.error("리더 카드가 설정되지 않은 덱입니다. 덱을 편집해 주세요.");
      return;
    }

    try {
      const { data, error } = await supabase
        .from("simulator_matches")
        .update({
          guest_id: user.id,
          guest_recipe: selectedDeck.recipe as any,
          guest_leader_code: leaderCode,
          status: "playing",
        })
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;

      toast.success("대국방에 입장하였습니다!");
      setPvpMatch(data);
    } catch (err: any) {
      toast.error("대국 입장 실패: " + err.message);
    }
  };

  // 턴 전환 감지 연출
  const prevActivePlayerRef = useRef<PlayerId | null>(null);
  const prevTurnRef = useRef<number | null>(null);

  useEffect(() => {
    if (!gameState) return;
    const currentActivePlayer = gameState.activePlayer;
    const currentTurn = gameState.turn;

    if (
      prevActivePlayerRef.current !== currentActivePlayer ||
      prevTurnRef.current !== currentTurn
    ) {
      const isP1 = currentActivePlayer === "p1";
      const bannerText = isP1 ? t("simulator.myTurn") : t("simulator.aiTurn");
      const bannerSubText = `TURN ${currentTurn}`;

      setActiveTurnBanner({
        text: bannerText,
        subText: bannerSubText,
        activePlayer: currentActivePlayer,
      });

      const timer = setTimeout(() => {
        setActiveTurnBanner(null);
      }, 1500);

      return () => clearTimeout(timer);
    }

    prevActivePlayerRef.current = currentActivePlayer;
    prevTurnRef.current = currentTurn;
  }, [gameState?.activePlayer, gameState?.turn, t]);

  // 로그 분석 연출 (피격 셰이크, 공격 돌진, 트래시 반짝임)
  const prevLogLengthRef = useRef<number>(0);
  const animTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!gameState || !gameState.log) return;
    const currentLength = gameState.log.length;
    const prevLength = prevLogLengthRef.current;

    if (currentLength > prevLength) {
      const newLogs = gameState.log.slice(prevLength);

      // 우선순위가 가장 높은 연출 대상 1건을 추출
      const damageLog = [...newLogs].reverse().find((l) => l.type === "damage_taken");
      const koLog = [...newLogs].reverse().find((l) => l.type === "character_ko");
      const attackLog = [...newLogs].reverse().find((l) => l.type === "attack_declared");

      if (animTimerRef.current) {
        clearTimeout(animTimerRef.current);
      }

      if (damageLog) {
        setShakePid(damageLog.player); // 피해를 입은 플레이어 ID
        animTimerRef.current = setTimeout(() => {
          setShakePid(null);
        }, 500);
      } else if (koLog) {
        setTrashGlowPid(koLog.player); // 트래시된 캐릭터 소유 플레이어 ID
        animTimerRef.current = setTimeout(() => {
          setTrashGlowPid(null);
        }, 500);
      } else if (attackLog) {
        const { attackerIid, targetIid } = attackLog.payload || {};
        if (attackerIid && targetIid) {
          setActiveAttackAnim({ attackerIid, targetIid });
          animTimerRef.current = setTimeout(() => {
            setActiveAttackAnim(null);
          }, 600);
        }
      }
    }

    prevLogLengthRef.current = currentLength;
  }, [gameState?.log]);

  // 1. P1 덱 레시피 로드
  const { data: p1Deck } = useQuery({
    queryKey: ["sim-match-deck-p1", p1, isPvp, pvpMatch?.host_recipe],
    enabled: isPvp ? !!pvpMatch?.host_recipe : !!p1,
    queryFn: async () => {
      if (isPvp) {
        return pvpMatch!.host_recipe as any as DeckRecipe;
      }
      if (p1!.startsWith("prebuilt-")) {
        return PREBUILT_DECKS.find((d) => d.id === p1)?.recipe ?? null;
      }
      const { data, error } = await supabase
        .from("simulator_decks")
        .select("*")
        .eq("id", p1!)
        .single();
      if (error) throw error;
      return data.recipe as Json & DeckRecipe;
    },
  });

  // 2. P2 덱 레시피 로드
  const { data: p2Deck } = useQuery({
    queryKey: ["sim-match-deck-p2", p2, isPvp, pvpMatch?.guest_recipe],
    enabled: isPvp ? !!pvpMatch?.guest_recipe : !!p2,
    queryFn: async () => {
      if (isPvp) {
        return pvpMatch!.guest_recipe as any as DeckRecipe;
      }
      if (p2!.startsWith("prebuilt-")) {
        return PREBUILT_DECKS.find((d) => d.id === p2)?.recipe ?? null;
      }
      const { data, error } = await supabase
        .from("simulator_decks")
        .select("*")
        .eq("id", p2!)
        .single();
      if (error) throw error;
      return data.recipe as Json & DeckRecipe;
    },
  });

  // 3. 카드 메타데이터 캐시 적재 및 게임 초기화
  useEffect(() => {
    if (!p1Deck || !p2Deck) return;
    if (gameState) return; // 이미 초기화되었다면 중복 초기화 방지
    if (isPvp && (!pvpMatch || pvpMatch.status !== "playing")) return; // PvP 대기 상태면 보류

    const initBattle = async () => {
      setLoadingText(t("simulator.loadingEffects"));
      try {
        const p1Codes = p1Deck.cards.map((c) => c.card_code);
        if (p1Deck.leaderCode) p1Codes.push(p1Deck.leaderCode);
        const p2Codes = p2Deck.cards.map((c) => c.card_code);
        if (p2Deck.leaderCode) p2Codes.push(p2Deck.leaderCode);

        const allCodes = Array.from(new Set([...p1Codes, ...p2Codes]));

        const { data: cardRows, error } = await supabase
          .from("cards")
          .select(
            "code, name, cost, power, counter, type, colors, effects, image_url, traits, effect",
          )
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
            traits: row.traits ?? [],
            effects: (row.effects as any) ?? [],
            imageUrl: row.image_url ?? null,
            effectText: row.effect ?? null,
          };
        }

        const startSeed =
          isPvp && pvpMatch ? pvpMatch.seed : "seed-" + Math.floor(Math.random() * 1000000);
        let currentState = optcgEngine.init([p1Deck, p2Deck], startSeed);

        // PvP 새로고침 시 기존 액션 로그 리play 복구
        if (isPvp && pvpMatch) {
          const actions = (pvpMatch.action_log as any) || [];
          for (const act of actions) {
            currentState = optcgEngine.applyAction(currentState, act);
          }
          setLocalAppliedCount(actions.length);
        }

        setGameState(currentState);
        setLoading(false);
      } catch (err: any) {
        toast.error("대국 준비 오류: " + err.message);
        navigate({ to: "/simulator" });
      }
    };

    initBattle();
  }, [p1Deck, p2Deck, isPvp, pvpMatch, gameState, navigate, t]);

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

  // Realtime Broadcast 채널을 통한 액션 동기화 및 누락 폴백
  useEffect(() => {
    if (!isPvp || !gameState) return;

    let isMounted = true;
    let syncTimeout: ReturnType<typeof setTimeout> | null = null;

    // 누락 복구 폴백 함수
    const syncWithDb = async () => {
      try {
        const { data, error } = await supabase
          .from("simulator_matches")
          .select("action_log")
          .eq("id", id)
          .single();

        if (error) throw error;
        if (!isMounted) return;

        const dbLog = (data.action_log as any) || [];
        console.log(
          "Syncing with DB. DB actions:",
          dbLog.length,
          "Local applied:",
          localAppliedCount,
        );

        if (dbLog.length > localAppliedCount) {
          setGameState((prev) => {
            if (!prev) return prev;
            let current = prev;
            for (let i = localAppliedCount; i < dbLog.length; i++) {
              current = optcgEngine.applyAction(current, dbLog[i]);
            }
            return current;
          });
          setLocalAppliedCount(dbLog.length);
        }
      } catch (err) {
        console.error("Sync log fail:", err);
      }
    };

    const channel = supabase.channel(`sim-match-${id}`, {
      config: {
        broadcast: {
          self: true, // 발신자도 수신받아 로컬 처리
        },
      },
    });

    channel
      .on("broadcast", { event: "game-action" }, (payload) => {
        if (!isMounted) return;
        const { seq, action } = payload.payload;
        console.log(`Action received. seq: ${seq}, localCount: ${localAppliedCount}`);

        if (seq === localAppliedCount) {
          setGameState((prev) => {
            if (!prev) return prev;
            return optcgEngine.applyAction(prev, action);
          });
          setLocalAppliedCount((c) => c + 1);
        } else if (seq > localAppliedCount) {
          console.warn("Gap detected! seq:", seq, "applied:", localAppliedCount);
          if (syncTimeout) clearTimeout(syncTimeout);
          syncTimeout = setTimeout(() => {
            if (isMounted) syncWithDb();
          }, 1200);
        } else {
          console.log("Duplicate action skipped. seq:", seq);
        }
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          setRealtimeConnected(true);
        } else if (status === "CLOSED" || status === "CHANNEL_ERROR") {
          setRealtimeConnected(false);
        }
      });

    return () => {
      isMounted = false;
      if (syncTimeout) clearTimeout(syncTimeout);
      supabase.removeChannel(channel);
    };
  }, [id, isPvp, gameState, localAppliedCount]);

  const handlePerformAction = async (action: Action) => {
    setSelectedHandIid(null);
    setSelectedAttackerIid(null); // 공격자 선택 초기화

    if (isPvp) {
      const currentSeq = localAppliedCount;

      // 1. DB action_log 비동기 append (발신자 책임)
      try {
        const { data: matchData } = await supabase
          .from("simulator_matches")
          .select("action_log")
          .eq("id", id)
          .single();

        const currentLog = (matchData?.action_log as any[]) || [];
        const nextLog = [...currentLog, action];

        await supabase
          .from("simulator_matches")
          .update({ action_log: nextLog as any })
          .eq("id", id);
      } catch (err) {
        console.error("DB log append error:", err);
      }

      // 2. Realtime Broadcast 전송
      const tempChannel = supabase.channel(`sim-match-${id}`);
      tempChannel.subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await tempChannel.send({
            type: "broadcast",
            event: "game-action",
            payload: { seq: currentSeq, action },
          });
          supabase.removeChannel(tempChannel);
        }
      });
    } else {
      setGameState(gameState ? optcgEngine.applyAction(gameState, action) : null);
    }
  };

  const terminalResult = gameState ? optcgEngine.isTerminal(gameState) : null;
  const isTerminalResult = !!terminalResult;
  const p1State = gameState?.players.p1;
  const p2State = gameState?.players.p2;
  const isMyTurn = gameState?.activePlayer === myPlayerId;
  const myCounterWindow =
    !!gameState?.pendingResponse && gameState.pendingResponse.defenderPlayer === myPlayerId;

  // 멀리건 단계: 게임 시작 시 손패 유지/교체 (전용 오버레이로만 처리, 하단 액션바 숨김)
  const isMulliganPhase = gameState?.phase === "mulligan";
  const myMulliganTurn =
    isMulliganPhase &&
    (isPvp
      ? optcgEngine.getAvailableActions(gameState, myPlayerId).some((a) => a.type === "mulligan")
      : isMyTurn) &&
    !isAutoPlaying;

  // 내 수동 가능 액션
  const myAvailableActions = useMemo(
    () =>
      gameState &&
      !isTerminalResult &&
      !isAutoPlaying &&
      ((isMyTurn && !gameState.pendingResponse) || myCounterWindow)
        ? optcgEngine.getAvailableActions(gameState, myPlayerId)
        : [],
    [gameState, isTerminalResult, isAutoPlaying, isMyTurn, myCounterWindow, myPlayerId],
  );

  // 공격 액션들
  const attackActions = useMemo(
    () => myAvailableActions.filter((a) => a.type === "attack"),
    [myAvailableActions],
  );
  // 공격 가능한 아군 카드 iid 셋
  const attackerIids = useMemo(
    () => new Set(attackActions.map((a) => a.attackerIid)),
    [attackActions],
  );
  // 현재 선택한 공격자의 공격 대상 iid 셋
  const targetIidsForSelected = useMemo(
    () =>
      new Set(
        selectedAttackerIid
          ? attackActions
              .filter((a) => a.attackerIid === selectedAttackerIid)
              .map((a) => a.targetIid)
          : [],
      ),
    [selectedAttackerIid, attackActions],
  );

  // SVG 화살표 좌표 계산
  useEffect(() => {
    if (!selectedAttackerIid || !boardRef.current) {
      setSvgCoords([]);
      return;
    }

    const updateCoordinates = () => {
      if (!boardRef.current || !selectedAttackerIid) return;
      const boardRect = boardRef.current.getBoundingClientRect();
      const attackerEl = boardRef.current.querySelector(`[data-iid="${selectedAttackerIid}"]`);
      if (!attackerEl) return;
      const attackerRect = attackerEl.getBoundingClientRect();
      const x1 = attackerRect.left + attackerRect.width / 2 - boardRect.left;
      const y1 = attackerRect.top + attackerRect.height / 2 - boardRect.top;

      const newCoords = Array.from(targetIidsForSelected)
        .map((targetIid) => {
          const targetEl = boardRef.current?.querySelector(`[data-iid="${targetIid}"]`);
          if (!targetEl) return null;
          const targetRect = targetEl.getBoundingClientRect();
          const x2 = targetRect.left + targetRect.width / 2 - boardRect.left;
          const y2 = targetRect.top + targetRect.height / 2 - boardRect.top;
          return { x1, y1, x2, y2, targetIid };
        })
        .filter(Boolean) as { x1: number; y1: number; x2: number; y2: number; targetIid: string }[];

      setSvgCoords(newCoords);
    };

    updateCoordinates();

    const resizeObserver = new ResizeObserver(() => {
      updateCoordinates();
    });
    if (boardRef.current) {
      resizeObserver.observe(boardRef.current);
    }

    window.addEventListener("resize", updateCoordinates);
    window.addEventListener("scroll", updateCoordinates, { passive: true });

    const timer = setTimeout(updateCoordinates, 150);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", updateCoordinates);
      window.removeEventListener("scroll", updateCoordinates);
      clearTimeout(timer);
    };
  }, [selectedAttackerIid, gameState, targetIidsForSelected]);

  // PvP 대기/입장 UI 가드
  if (isPvp && pvpMatch && pvpMatch.status === "waiting") {
    const inviteLink =
      typeof window !== "undefined" ? `${window.location.origin}/simulator/${id}` : "";

    const handleCopyLink = async () => {
      try {
        await navigator.clipboard.writeText(inviteLink);
        toast.success(t("simulator.inviteLinkCopied"));
      } catch (err: any) {
        toast.error("복사 실패: " + err.message);
      }
    };

    if (isHost) {
      // 1. 호스트 대기 화면
      return (
        <div className="mx-auto w-full max-w-md px-4 py-12 flex flex-col items-center justify-center min-h-[60vh] text-center gap-6">
          <div className="p-4 rounded-full bg-violet-500/10 border border-violet-500/20 text-violet-500 animate-pulse">
            <User className="h-12 w-12" />
          </div>
          <div className="space-y-2">
            <h2 className="text-xl font-black text-game-text">{t("simulator.pvpSection")}</h2>
            <p className="text-sm text-game-text-dim leading-relaxed">
              {t("simulator.waitingGuest")}
            </p>
          </div>
          <div className="w-full bg-game-card border border-game-line p-4 rounded-2xl flex flex-col gap-3">
            <div className="text-[11px] font-mono select-all break-all bg-game-bg/60 p-3 rounded-xl border border-game-line/50 text-left text-game-text-mid">
              {inviteLink}
            </div>
            <Button
              onClick={handleCopyLink}
              className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-violet-600 to-indigo-600 text-white font-bold h-11 border-0"
            >
              <Copy className="h-4 w-4" /> {t("simulator.copyInviteLink")}
            </Button>
          </div>
          <Link
            to="/simulator"
            className="text-xs text-game-text-dim hover:text-game-text transition-colors flex items-center gap-1 mt-2"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> 로비로 돌아가기
          </Link>
        </div>
      );
    } else {
      // 2. 게스트 입장 화면
      return (
        <div className="mx-auto w-full max-w-md px-4 py-12 flex flex-col items-center justify-center min-h-[60vh] text-center gap-6">
          <div className="p-4 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-500">
            <Swords className="h-12 w-12 animate-bounce" />
          </div>
          <div className="space-y-2">
            <h2 className="text-xl font-black text-game-text">{t("simulator.pvpSection")}</h2>
            <p className="text-sm text-game-text-dim leading-relaxed">
              {t("simulator.guestJoinPrompt")}
            </p>
          </div>
          <div className="w-full bg-game-card border border-game-line p-5 rounded-2xl flex flex-col gap-4">
            <div className="space-y-1.5 text-left">
              <Label htmlFor="pvp-guest-deck" className="text-xs font-bold text-game-text-dim">
                {t("simulator.selectMyDeckPvp")}
              </Label>
              <Select value={guestSelectedDeckId} onValueChange={setGuestSelectedDeckId}>
                <SelectTrigger
                  id="pvp-guest-deck"
                  className="w-full h-11 text-xs border-game-line bg-game-bg text-game-text"
                >
                  <SelectValue placeholder="덱 선택" />
                </SelectTrigger>
                <SelectContent className="bg-game-card border-game-line">
                  {allAvailableDecks.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.name} {d.leaderCode ? `(${d.leaderCode})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              onClick={handleGuestJoin}
              className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-indigo-600 to-violet-600 text-white font-bold h-11 border-0"
            >
              <Play className="h-4 w-4 fill-current" /> {t("simulator.joinRoom")}
            </Button>
          </div>
          <Link
            to="/simulator"
            className="text-xs text-game-text-dim hover:text-game-text transition-colors flex items-center gap-1 mt-2"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> 로비로 돌아가기
          </Link>
        </div>
      );
    }
  }

  if (loading || !gameState) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center gap-4">
        <RefreshCw className="h-10 w-10 text-primary animate-spin" />
        <p className="text-sm font-bold text-muted-foreground">{loadingText}</p>
      </div>
    );
  }

  // 선택된 손패 카드와 연결된 플레이 액션(코스트 선택지 포함)
  const selectedCardActions = selectedHandIid
    ? myAvailableActions.filter(
        (a) =>
          (a.type === "play_character" || a.type === "play_event" || a.type === "play_stage") &&
          a.iid === selectedHandIid,
      )
    : [];

  // 손패 외 보드 액션(부착/공격/턴종료/카운터 응답)
  const boardActions = myAvailableActions.filter(
    (a) => a.type !== "play_character" && a.type !== "play_event" && a.type !== "play_stage",
  );

  // 손패 카드별로 "낼 수 있는지" 빠르게 판단하기 위한 집합
  const playableHandIids = new Set(
    myAvailableActions
      .filter(
        (a) => a.type === "play_character" || a.type === "play_event" || a.type === "play_stage",
      )
      .map((a) => a.iid),
  );

  return (
    <div className="mx-auto w-full max-w-6xl px-2 sm:px-4 py-2 sm:py-4 pb-32 lg:pb-6 flex flex-col gap-3 min-h-[90vh] bg-game-bg text-game-text">
      {/* CSS 커스텀 애니메이션 주입 */}
      <style
        dangerouslySetInnerHTML={{
          __html: `
        @keyframes attack-p1 {
          0% { transform: translateY(0); }
          25% { transform: translateY(-25px) scale(1.02); }
          75% { transform: translateY(-25px) scale(1.02); }
          100% { transform: translateY(0); }
        }
        @keyframes attack-p2 {
          0% { transform: translateY(0); }
          25% { transform: translateY(25px) scale(1.02); }
          75% { transform: translateY(25px) scale(1.02); }
          100% { transform: translateY(0); }
        }
        .animate-attack-p1 {
          animation: attack-p1 0.5s cubic-bezier(0.25, 0.8, 0.25, 1) forwards;
        }
        .animate-attack-p2 {
          animation: attack-p2 0.5s cubic-bezier(0.25, 0.8, 0.25, 1) forwards;
        }
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          15%, 45%, 75% { transform: translateX(-4px); }
          30%, 60%, 90% { transform: translateX(4px); }
        }
        .animate-shake {
          animation: shake 0.4s cubic-bezier(.36,.07,.19,.97) both;
        }
        @keyframes banner-in-out {
          0% { transform: translate(-50%, -50%) scale(0.8); opacity: 0; }
          12% { transform: translate(-50%, -50%) scale(1.02); opacity: 1; }
          85% { transform: translate(-50%, -50%) scale(1); opacity: 1; }
          100% { transform: translate(-50%, -50%) scale(1.08); opacity: 0; }
        }
        .animate-banner {
          animation: banner-in-out 1.5s cubic-bezier(0.25, 0.8, 0.25, 1) forwards;
        }
        @keyframes dash {
          to {
            stroke-dashoffset: -40;
          }
        }
        .animate-dash {
          stroke-dasharray: 6, 6;
          animation: dash 1.2s linear infinite;
        }
        @media (prefers-reduced-motion: reduce) {
          .animate-attack-p1, .animate-attack-p2, .animate-shake, .animate-banner, .animate-dash {
            animation: none !important;
            transition: none !important;
            transform: none !important;
          }
          .animate-banner {
            opacity: 1 !important;
            transform: translate(-50%, -50%) scale(1) !important;
            animation: none !important;
          }
        }
      `,
        }}
      />

      {/* ── 상단 헤더 ── */}
      <div className="sticky top-0 z-30 -mx-2 sm:mx-0 px-2 sm:px-0 py-2 bg-game-bg/95 backdrop-blur flex items-center justify-between gap-2 border-b border-game-line sm:border-0">
        <div className="flex items-center gap-2 min-w-0">
          <Link
            to="/simulator"
            className="p-2 border border-game-line rounded-lg bg-game-card hover:bg-game-line-accent text-game-text-mid hover:text-game-text transition-all shrink-0"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div className="min-w-0">
            <h1 className="text-sm sm:text-base font-black tracking-tight flex items-center gap-1.5 truncate">
              <Swords className="h-4 w-4 text-game-loss shrink-0" />{" "}
              <span className="truncate">{t("simulator.title")}</span>
            </h1>
            <p className="text-[10px] sm:text-xs text-game-text-dim truncate">
              {t("simulator.turn", {
                turn: gameState.turn,
                phase:
                  gameState.phase === "main"
                    ? t("simulator.phaseMain")
                    : t("simulator.phaseAttack"),
              })}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {mode === "auto" && (
            <div className="flex items-center gap-0.5 bg-game-card border border-game-line p-0.5 rounded-lg text-[11px]">
              <button
                onClick={() => setIsAutoPlaying((p) => !p)}
                className={`flex items-center gap-1 px-2 py-1.5 rounded-md font-bold transition-all ${
                  isAutoPlaying
                    ? "bg-game-blue text-white shadow"
                    : "hover:bg-game-line-accent text-game-text-dim"
                }`}
              >
                {isAutoPlaying ? (
                  <Pause className="h-3.5 w-3.5" />
                ) : (
                  <Play className="h-3.5 w-3.5 fill-current" />
                )}
              </button>
              <div className="h-4 w-px bg-game-line mx-0.5" />
              {[1500, 1000, 500].map((ms) => (
                <button
                  key={ms}
                  onClick={() => setSpeedMs(ms)}
                  className={`px-1.5 py-1.5 rounded-md transition-all ${
                    speedMs === ms
                      ? "font-bold text-game-blue bg-game-bg shadow-sm"
                      : "text-game-text-dim hover:text-game-text"
                  }`}
                >
                  {(ms / 1000).toFixed(1)}s
                </button>
              ))}
            </div>
          )}

          <button
            onClick={() => {
              if (confirm(t("simulator.concedeConfirm"))) navigate({ to: "/simulator" });
            }}
            className="flex items-center gap-1.5 px-2.5 py-2 bg-game-loss/10 text-game-loss border border-game-loss/20 hover:bg-game-loss hover:text-white rounded-lg text-[11px] font-bold transition-all min-h-10"
          >
            <LogOut className="h-3.5 w-3.5" />{" "}
            <span className="hidden sm:inline">{t("simulator.concede")}</span>
          </button>
        </div>
      </div>

      {/* ── 배틀 보드(플레이매트) ── */}
      <div
        ref={boardRef}
        className={`relative mx-auto w-full max-w-lg rounded-[2rem] border-2 border-game-line overflow-hidden shadow-2xl bg-game-bg-deep transition-all duration-300 ${
          shakePid ? "animate-shake" : ""
        }`}
      >
        {/* 매트 외곽 오벌 링 + 중앙 비네팅 */}
        <div className="pointer-events-none absolute inset-2 rounded-[1.6rem] border border-game-line/30" />
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_45%,rgba(0,0,0,0.35))]" />

        {/* ── SVG 화살표 오버레이 ── */}
        <svg className="pointer-events-none absolute inset-0 z-20 w-full h-full">
          <defs>
            <marker
              id="arrow"
              viewBox="0 0 10 10"
              refX="6"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="var(--color-game-loss, #d05050)" />
            </marker>
          </defs>
          {svgCoords.map((c, idx) => {
            const dx = c.x2 - c.x1;
            const dy = c.y2 - c.y1;
            const cx = (c.x1 + c.x2) / 2 + dy * 0.15;
            const cy = (c.y1 + c.y2) / 2 - dx * 0.15;
            const pathD = `M ${c.x1} ${c.y1} Q ${cx} ${cy} ${c.x2} ${c.y2}`;
            return (
              <path
                key={idx}
                d={pathD}
                stroke="var(--color-game-loss, #d05050)"
                strokeWidth="3"
                markerEnd="url(#arrow)"
                fill="none"
                className="animate-dash"
              />
            );
          })}
        </svg>

        <div className="relative flex flex-col">
          {/* ─ 상대 진영 ─ */}
          <PlayerSide
            state={gameState.players[opponentPlayerId]}
            isOpponent
            isActive={gameState.activePlayer === opponentPlayerId}
            attackerIids={attackerIids}
            targetIidsForSelected={targetIidsForSelected}
            selectedAttackerIid={selectedAttackerIid}
            activeAttackAnim={activeAttackAnim}
            trashGlowPid={trashGlowPid}
            onAttackerClick={(e, iid) => {
              e.stopPropagation();
              setSelectedAttackerIid((prev) => (prev === iid ? null : iid));
            }}
            onTargetClick={(e, targetIid) => {
              e.stopPropagation();
              if (!selectedAttackerIid) return;
              const act = attackActions.find(
                (a) => a.attackerIid === selectedAttackerIid && a.targetIid === targetIid,
              );
              if (act) {
                setSelectedAttackerIid(null);
                handlePerformAction(act);
              }
            }}
            onCardPreview={(card) => setSelectedCardForPreview(card)}
          />

          {/* ─ 중앙 곡선 밴드 ─ */}
          <div
            className={`relative z-10 mx-3 my-1 rounded-full bg-game-card/85 backdrop-blur-sm border px-3 py-1.5 shadow-lg transition-all duration-300 ${
              myCounterWindow
                ? "border-game-loss ring-1 ring-game-loss/30 animate-pulse-ring"
                : "border-game-line"
            }`}
          >
            {gameState.pendingResponse ? (
              <CounterBand pending={gameState.pendingResponse} state={gameState} />
            ) : (
              <div className="flex items-center justify-center gap-2 text-[11px] sm:text-xs font-bold text-game-text">
                <span
                  className={`inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full ${
                    isMyTurn ? "bg-game-blue/20 text-game-blue" : "bg-game-loss/20 text-game-loss"
                  }`}
                >
                  {isMyTurn ? (
                    <User className="h-3.5 w-3.5" />
                  ) : isPvp ? (
                    <User className="h-3.5 w-3.5" />
                  ) : (
                    <Cpu className="h-3.5 w-3.5" />
                  )}
                  {isMyTurn
                    ? t("simulator.myTurn")
                    : isPvp
                      ? t("simulator.opponent") + " 턴"
                      : t("simulator.aiTurn")}
                </span>
                {isMyTurn && !isTerminalResult && (
                  <span className="text-game-text-dim hidden sm:inline">
                    {t("simulator.tapGuide")}
                  </span>
                )}
              </div>
            )}
          </div>

          {/* ─ 내 진영 ─ */}
          <PlayerSide
            state={gameState.players[myPlayerId]}
            isOpponent={false}
            isActive={isMyTurn}
            selectedHandIid={selectedHandIid}
            playableHandIids={playableHandIids}
            onHandSelect={(iid) => setSelectedHandIid((cur) => (cur === iid ? null : iid))}
            attackerIids={attackerIids}
            targetIidsForSelected={targetIidsForSelected}
            selectedAttackerIid={selectedAttackerIid}
            activeAttackAnim={activeAttackAnim}
            trashGlowPid={trashGlowPid}
            onAttackerClick={(e, iid) => {
              e.stopPropagation();
              setSelectedAttackerIid((prev) => (prev === iid ? null : iid));
            }}
            onTargetClick={(e, targetIid) => {
              e.stopPropagation();
              if (!selectedAttackerIid) return;
              const act = attackActions.find(
                (a) => a.attackerIid === selectedAttackerIid && a.targetIid === targetIid,
              );
              if (act) {
                setSelectedAttackerIid(null);
                handlePerformAction(act);
              }
            }}
            onCardPreview={(card) => setSelectedCardForPreview(card)}
          />
        </div>
      </div>

      {/* ── 턴 전환 배너 오버레이 ── */}
      {activeTurnBanner && (
        <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
          <div
            className={`px-8 py-6 rounded-2xl border-2 shadow-2xl animate-banner text-center ${
              activeTurnBanner.activePlayer === myPlayerId
                ? "bg-game-blue/90 border-game-blue text-white"
                : "bg-game-loss/90 border-game-loss text-white"
            }`}
          >
            <h2 className="text-3xl font-black tracking-wider uppercase drop-shadow-md">
              {activeTurnBanner.text}
            </h2>
            <p className="text-sm font-bold opacity-80 mt-1">{activeTurnBanner.subText}</p>
          </div>
        </div>
      )}

      {/* ── 웅장한 대국 결과 오버레이 ── */}
      {isTerminalResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-md bg-game-card border border-game-line rounded-3xl p-6 shadow-2xl text-center space-y-4 animate-scale-in">
            <div className="flex justify-center">
              {"winner" in terminalResult! && terminalResult!.winner === myPlayerId ? (
                <div className="relative">
                  <div className="absolute -inset-1 rounded-full bg-game-gold/30 blur-md animate-pulse" />
                  <div className="relative p-4 rounded-full bg-game-gold/10 text-game-gold border border-game-gold/30">
                    <Sparkles className="h-10 w-10 animate-bounce" />
                  </div>
                </div>
              ) : (
                <div className="p-4 rounded-full bg-game-loss/10 text-game-loss border border-game-loss/30">
                  <Skull className="h-10 w-10 animate-pulse" />
                </div>
              )}
            </div>

            <h2
              className={`text-4xl font-black tracking-tight ${
                "winner" in terminalResult! && terminalResult!.winner === myPlayerId
                  ? "text-game-gold drop-shadow"
                  : "text-game-loss"
              }`}
            >
              {"winner" in terminalResult! && terminalResult!.winner === "p1"
                ? t("simulator.victory")
                : t("simulator.defeat")}
            </h2>

            <div className="py-2 px-4 bg-game-bg rounded-xl space-y-1 text-sm font-bold text-game-text-mid">
              <p>
                {t("simulator.winner", {
                  winner:
                    "winner" in terminalResult! && terminalResult!.winner === myPlayerId
                      ? t("simulator.me")
                      : t("simulator.opponent"),
                })}
              </p>
              <p className="text-xs text-game-text-dim">
                {t("simulator.turnsCount", { turns: gameState.turn })}
              </p>
            </div>

            <div className="space-y-1.5 text-left">
              <h3 className="text-xs font-black text-game-text-dim uppercase tracking-wider">
                {t("simulator.logSummary")}
              </h3>
              <div className="max-h-[140px] overflow-y-auto p-3 bg-game-bg/60 border border-game-line rounded-xl space-y-2 text-[10px] font-mono leading-relaxed">
                {gameState.log.slice(-5).map((evt, idx) => (
                  <div
                    key={idx}
                    className="border-b border-game-line/30 pb-1 last:border-b-0 last:pb-0"
                  >
                    <span className="text-game-text-dim">[T{evt.turn}]</span>{" "}
                    <span className="text-game-text-mid">{formatEventLog(evt)}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <Link
                to="/simulator"
                className="flex-1 py-3 border border-game-line bg-game-bg text-game-text hover:bg-game-line-accent rounded-xl text-xs font-black transition-colors"
              >
                {t("simulator.lobby")}
              </Link>
              <button
                onClick={() => window.location.reload()}
                className="flex-1 py-3 bg-game-blue text-white hover:bg-game-blue-deep rounded-xl text-xs font-black shadow-md transition-colors"
              >
                {t("simulator.rematch")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 멀리건 오버레이 (게임 시작, 자동 관전 모드 제외) ── */}
      {!isTerminalResult && isMulliganPhase && !isAutoPlaying && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-md bg-game-card border border-game-line rounded-3xl p-6 shadow-2xl space-y-4 animate-scale-in">
            <div className="text-center space-y-1">
              <h2 className="text-xl font-black text-game-text">{t("simulator.mulliganTitle")}</h2>
              <p className="text-xs text-game-text-dim">{t("simulator.mulliganDesc")}</p>
            </div>
            {myMulliganTurn ? (
              <>
                <div className="flex flex-wrap justify-center gap-2 py-2">
                  {(gameState.players[myPlayerId]?.zones.hand ?? []).map((c) => {
                    const m = getCardMeta(c.code);
                    return (
                      <div
                        key={c.iid}
                        className="w-16 overflow-hidden rounded-lg border border-game-line bg-game-bg p-1 text-center"
                      >
                        {m.imageUrl ? (
                          <img
                            src={displayImageSrc(m.imageUrl)}
                            alt={m.name}
                            className="w-full rounded"
                          />
                        ) : (
                          <div className="py-3 text-[9px] text-game-text-mid">{m.name}</div>
                        )}
                      </div>
                    );
                  })}
                </div>
                <div className="flex gap-3 pt-1">
                  <button
                    onClick={() => handlePerformAction({ type: "mulligan", redraw: true })}
                    className="flex-1 rounded-xl border border-game-line bg-game-bg py-3 text-xs font-black text-game-text transition-colors hover:bg-game-line-accent"
                  >
                    {t("simulator.mulliganRedraw")}
                  </button>
                  <button
                    onClick={() => handlePerformAction({ type: "mulligan", redraw: false })}
                    className="flex-1 rounded-xl bg-game-blue py-3 text-xs font-black text-white shadow-md transition-colors hover:bg-game-blue-deep"
                  >
                    {t("simulator.mulliganKeep")}
                  </button>
                </div>
              </>
            ) : (
              <p className="py-4 text-center text-xs text-game-text-dim">
                {t("simulator.mulliganWait")}
              </p>
            )}
          </div>
        </div>
      )}

      {/* ── 로그(접이식 / 모바일은 드로어) ── */}
      {isMobile ? (
        <Drawer open={logOpen} onOpenChange={setLogOpen}>
          <DrawerTrigger asChild>
            <button className="w-full p-3 flex items-center justify-between rounded-2xl border border-game-line bg-game-card/60 hover:bg-game-line-accent/40 text-game-text transition-colors">
              <span className="text-xs font-black uppercase tracking-wider flex items-center gap-2">
                <ScrollText className="h-4 w-4 text-game-blue" /> {t("simulator.log")}
              </span>
              <span className="text-[10px] text-game-text-dim">
                {t("simulator.logCount", { count: gameState.log.length })}
              </span>
            </button>
          </DrawerTrigger>
          <DrawerContent className="px-4 pb-6 max-h-[85vh] bg-game-card border-game-line">
            <DrawerHeader className="px-0">
              <DrawerTitle className="text-sm font-black uppercase tracking-wider flex items-center gap-2 text-game-text">
                <ScrollText className="h-4 w-4 text-game-blue" /> {t("simulator.log")} (
                {gameState.log.length})
              </DrawerTitle>
            </DrawerHeader>
            <div className="overflow-y-auto my-2 space-y-2 font-mono text-[11px] leading-relaxed border-t border-game-line pt-3">
              {gameState.log.map((evt, idx) => (
                <div key={idx} className="border-b border-game-line/20 pb-1.5">
                  <span className="text-[10px] text-game-text-dim select-none">
                    [T{evt.turn} {evt.player.toUpperCase()}]
                  </span>{" "}
                  <span className="text-game-text/90">{formatEventLog(evt)}</span>
                </div>
              ))}
              <div ref={logEndRef} />
            </div>
          </DrawerContent>
        </Drawer>
      ) : (
        <div className="rounded-2xl border border-game-line bg-game-card/60 overflow-hidden text-game-text">
          <button
            onClick={() => setLogOpen((o) => !o)}
            className="w-full p-3 flex items-center justify-between hover:bg-game-line-accent/40 transition-colors"
          >
            <span className="text-xs font-black uppercase tracking-wider flex items-center gap-2">
              <ScrollText className="h-4 w-4 text-game-blue" /> {t("simulator.log")}
            </span>
            <span className="text-[10px] text-game-text-dim">
              {logOpen
                ? t("simulator.logClose")
                : t("simulator.logCount", { count: gameState.log.length })}
            </span>
          </button>
          {logOpen && (
            <div className="max-h-[38vh] overflow-y-auto p-3 space-y-2 font-mono text-[11px] leading-relaxed border-t border-game-line">
              {gameState.log.map((evt, idx) => (
                <div key={idx} className="border-b border-game-line/20 pb-1.5">
                  <span className="text-[10px] text-game-text-dim select-none">
                    [T{evt.turn} {evt.player.toUpperCase()}]
                  </span>{" "}
                  <span className="text-game-text/90">{formatEventLog(evt)}</span>
                </div>
              ))}
              <div ref={logEndRef} />
            </div>
          )}
        </div>
      )}

      {/* ── 하단 고정 액션 바 ── */}
      {!isTerminalResult &&
        !isMulliganPhase &&
        (selectedCardActions.length > 0 || boardActions.length > 0) && (
          <div className="fixed bottom-0 left-0 right-0 z-40 bg-game-card/95 backdrop-blur border-t-2 border-game-blue/40 shadow-[0_-4px_20px_rgba(0,0,0,0.35)] pb-[env(safe-area-inset-bottom)]">
            <div className="mx-auto w-full max-w-6xl px-3 py-2.5 space-y-2">
              {/* 선택된 손패 카드 전용 액션 */}
              {selectedCardActions.length > 0 && (
                <div className="flex items-center gap-2 overflow-x-auto pb-1">
                  <span className="text-[10px] font-bold text-game-blue shrink-0 flex items-center gap-1">
                    <Sparkles className="h-3.5 w-3.5" />
                    {t("simulator.playLabel")}
                  </span>
                  {selectedCardActions.map((act, i) => (
                    <button
                      key={i}
                      onClick={() => handlePerformAction(act)}
                      className="px-3 py-2 rounded-lg text-xs font-bold border shadow-sm min-h-10 whitespace-nowrap bg-game-win/10 text-game-win border-game-win/30 hover:bg-game-win hover:text-white transition-all duration-200"
                    >
                      {getActionLabel(act, gameState)}
                    </button>
                  ))}
                  <button
                    onClick={() => setSelectedHandIid(null)}
                    className="px-2.5 py-2 rounded-lg text-xs font-bold border border-game-line text-game-text-dim hover:bg-game-line-accent hover:text-game-text transition-all shrink-0"
                  >
                    {t("simulator.cancel")}
                  </button>
                </div>
              )}

              {/* 보드 액션 */}
              <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none">
                {boardActions.map((act, i) => {
                  const isCounterOrBlock =
                    act.type === "play_counter" || act.type === "use_blocker";
                  return (
                    <button
                      key={i}
                      onClick={() => handlePerformAction(act)}
                      className={`px-3 py-2 rounded-lg text-xs font-bold border shadow-sm min-h-10 whitespace-nowrap transition-all duration-200 ${
                        isCounterOrBlock && myCounterWindow
                          ? "bg-game-blue text-white border-game-blue shadow-[0_0_15px_rgba(55,138,221,0.6)] animate-pulse"
                          : getActionColorClass(act.type)
                      }`}
                    >
                      {getActionLabel(act, gameState)}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

      {/* ── 카드 확대 미리보기 모달 / Drawer ── */}
      {selectedCardForPreview &&
        (() => {
          const meta = getCardMeta(selectedCardForPreview.code);
          const power = getBattlePower(selectedCardForPreview);
          const src = displayImageSrc(meta.imageUrl);
          const isLeader = meta.type === "leader";

          const previewContent = (
            <div className="flex flex-col gap-4 text-left">
              <div className="flex gap-4">
                {/* 카드 이미지 / 대체 아트 */}
                <div className="relative w-28 h-40 rounded-xl border border-game-line overflow-hidden shadow shrink-0 bg-game-bg-deep flex items-center justify-center">
                  {src ? (
                    <img src={src} alt={meta.name} className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-[10px] font-extrabold text-game-text-dim text-center px-1">
                      {meta.name}
                    </span>
                  )}
                  {isLeader && (
                    <span className="absolute top-1 right-1 bg-rose-500 text-white text-[9px] font-black px-1.5 py-0.5 rounded shadow">
                      LEADER
                    </span>
                  )}
                </div>

                {/* 메타데이터 */}
                <div className="flex flex-col justify-between min-w-0 py-0.5">
                  <div>
                    <h3 className="text-base font-black text-game-text truncate">{meta.name}</h3>
                    <p className="text-xs font-bold text-game-text-dim mt-0.5">
                      {meta.traits.join(" / ") || "-"}
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[11px] font-bold text-game-text-mid mt-2">
                    <div>
                      <span className="text-game-text-dim mr-1.5">{t("simulator.playCost")}:</span>
                      <span className="text-game-blue">{meta.cost}</span>
                    </div>
                    {meta.power > 0 && (
                      <div>
                        <span className="text-game-text-dim mr-1.5">{t("simulator.power")}:</span>
                        <span className="text-game-loss">{power}</span>
                      </div>
                    )}
                    {!isLeader && (
                      <div>
                        <span className="text-game-text-dim mr-1.5">{t("simulator.counter")}:</span>
                        <span className="text-game-win">+{meta.counterValue}</span>
                      </div>
                    )}
                    <div>
                      <span className="text-game-text-dim mr-1.5">{t("simulator.vs")}:</span>
                      <span className="capitalize">{meta.type}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* 효과 텍스트 */}
              <div className="bg-game-bg border border-game-line p-3 rounded-xl">
                <h4 className="text-xs font-black text-game-text-dim uppercase tracking-wider mb-1.5">
                  {t("simulator.effects")}
                </h4>
                <p className="text-xs font-medium text-game-text-mid leading-relaxed whitespace-pre-line">
                  {meta.effectText || t("simulator.noEffects")}
                </p>
              </div>

              {/* 닫기 버튼 */}
              <button
                onClick={() => setSelectedCardForPreview(null)}
                className="w-full py-3 bg-game-card border border-game-line hover:bg-game-line-accent text-game-text text-xs font-black rounded-xl transition-colors mt-2 shadow-sm"
              >
                {t("simulator.close")}
              </button>
            </div>
          );

          if (isMobile) {
            return (
              <Drawer
                open={!!selectedCardForPreview}
                onOpenChange={(open) => !open && setSelectedCardForPreview(null)}
              >
                <DrawerContent className="px-5 pb-6 bg-game-card border-game-line">
                  <DrawerHeader className="px-0">
                    <DrawerTitle className="text-sm font-black uppercase tracking-wider text-game-text">
                      {t("simulator.cardPreview")}
                    </DrawerTitle>
                  </DrawerHeader>
                  <div className="mt-2">{previewContent}</div>
                </DrawerContent>
              </Drawer>
            );
          }

          return (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in"
              onClick={() => setSelectedCardForPreview(null)}
            >
              <div
                className="w-full max-w-sm bg-game-card border border-game-line rounded-3xl p-6 shadow-2xl space-y-4 animate-scale-in"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex justify-between items-center border-b border-game-line pb-2">
                  <h3 className="text-sm font-black text-game-text uppercase tracking-wider">
                    {t("simulator.cardPreview")}
                  </h3>
                  <button
                    onClick={() => setSelectedCardForPreview(null)}
                    className="p-1 rounded-lg hover:bg-game-line-accent text-game-text-dim transition-colors"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                {previewContent}
              </div>
            </div>
          );
        })()}
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
  attackerIids,
  targetIidsForSelected,
  selectedAttackerIid,
  activeAttackAnim,
  trashGlowPid,
  onAttackerClick,
  onTargetClick,
  onCardPreview,
}: {
  state: PlayerState;
  isOpponent: boolean;
  isActive: boolean;
  selectedHandIid?: string | null;
  playableHandIids?: Set<string>;
  onHandSelect?: (iid: string) => void;
  attackerIids?: Set<string>;
  targetIidsForSelected?: Set<string>;
  selectedAttackerIid?: string | null;
  activeAttackAnim?: { attackerIid: string; targetIid: string } | null;
  trashGlowPid?: PlayerId | null;
  onAttackerClick?: (e: React.MouseEvent, iid: string) => void;
  onTargetClick?: (e: React.MouseEvent, iid: string) => void;
  onCardPreview?: (card: CardInstance) => void;
}) {
  const { t } = useI18n();
  const leader = state.zones.primary[0];
  const chars = state.zones.secondary;
  const life = state.zones.life.length;
  const donTotal = state.donActive + state.donRested;
  const pid = isOpponent ? "p2" : "p1";

  // 벤치(캐릭터 5슬롯)
  const bench = (
    <div className="flex items-center justify-start lg:justify-center gap-2 overflow-x-auto py-1.5 scrollbar-thin w-full">
      {Array.from({ length: 5 }).map((_, i) =>
        chars[i] ? (
          <BattleUnit
            key={chars[i].iid}
            unit={chars[i]}
            attackerIids={attackerIids}
            targetIidsForSelected={targetIidsForSelected}
            selectedAttackerIid={selectedAttackerIid}
            activeAttackAnim={activeAttackAnim}
            onAttackerClick={onAttackerClick}
            onTargetClick={onTargetClick}
            onCardPreview={onCardPreview}
            isOpponent={isOpponent}
          />
        ) : (
          <EmptySlot key={i} label={t("simulator.zoneCharacter")} />
        ),
      )}
    </div>
  );

  // 리더 카드 렌더링 헬퍼
  const leaderCardEl = leader ? (
    <LeaderCard
      unit={leader}
      life={life}
      glowing={!isOpponent}
      attackerIids={attackerIids}
      targetIidsForSelected={targetIidsForSelected}
      selectedAttackerIid={selectedAttackerIid}
      activeAttackAnim={activeAttackAnim}
      onAttackerClick={onAttackerClick}
      onTargetClick={onTargetClick}
      onCardPreview={onCardPreview}
      isOpponent={isOpponent}
    />
  ) : (
    <EmptySlot isLeader label={t("simulator.zoneLeader")} />
  );

  // 메인 자원 라인: [라이프] [DON!!] [리더] [덱] [트래시]
  const mainRow = (
    <div className="flex flex-row items-end justify-center gap-1.5 sm:gap-2.5 py-1 w-full select-none">
      <LifeZone count={life} />
      <DonZone active={state.donActive} total={donTotal} />
      <div className="relative shrink-0">{leaderCardEl}</div>
      <Pile kind="deck" count={state.zones.deck.length} />
      <Pile kind="trash" count={state.zones.graveyard.length} glow={trashGlowPid === pid} />
    </div>
  );

  // 스테이지 빈 자리
  const stageSlot = (
    <div className={`flex w-full ${isOpponent ? "justify-start pl-8" : "justify-end pr-8"} py-0.5`}>
      <EmptySlot label={t("simulator.zoneStage")} className="opacity-75" />
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
      onCardPreview={onCardPreview}
    />
  );

  // 정보 헤더 (이름 배너)
  const infoHeader = (
    <div className="flex items-center justify-between w-full px-2 py-0.5 select-none">
      <NameBanner isOpponent={isOpponent} isActive={isActive} life={life} />
      <span className="text-[10px] font-extrabold text-game-text-dim/80">
        DON!! {state.donActive}/{donTotal}
      </span>
    </div>
  );

  return (
    <div
      className={`relative px-2 sm:px-4 py-3.5 flex flex-col gap-2 transition-all duration-300 ${
        isOpponent
          ? "bg-gradient-to-b from-game-loss/12 via-game-loss/4 to-transparent border-b border-game-line/15"
          : "bg-gradient-to-t from-game-blue/12 via-game-blue/4 to-transparent border-t border-game-line/15"
      }`}
    >
      {/* 플레이매트 가이드 패널 윤곽선 */}
      <div className="absolute inset-1.5 rounded-3xl border border-game-line/10 bg-game-card/5 pointer-events-none select-none" />

      {isOpponent ? (
        <div className="relative z-10 flex flex-col gap-2 w-full">
          {hand}
          {infoHeader}
          {bench}
          {mainRow}
          {stageSlot}
        </div>
      ) : (
        <div className="relative z-10 flex flex-col gap-2 w-full">
          {stageSlot}
          {mainRow}
          {bench}
          {infoHeader}
          {hand}
        </div>
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
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold text-game-text bg-game-card/90 border border-game-line shadow ${
        isActive ? "ring-2 " + (isOpponent ? "ring-game-loss/80" : "ring-game-blue/80") : ""
      }`}
    >
      {isOpponent ? (
        <Cpu className="h-3.5 w-3.5 text-game-loss" />
      ) : (
        <User className="h-3.5 w-3.5 text-game-blue" />
      )}
      <span>{isOpponent ? "AI 상대" : "나"}</span>
      <span className="flex items-center gap-0.5 text-rose-500">
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
function Pile({ kind, count, glow }: { kind: "deck" | "trash"; count: number; glow?: boolean }) {
  const { t } = useI18n();
  const isDeck = kind === "deck";
  const label = isDeck ? t("simulator.zoneDeck") : t("simulator.zoneTrash");

  if (count === 0) {
    return <EmptySlot label={label} />;
  }

  // 겹친 카드 더미 효과를 위해 스택 수 계산 (최대 3개 레이어)
  const layers = Math.min(3, Math.ceil(count / 5));

  return (
    <div
      className="relative w-12 h-[68px] sm:w-14 sm:h-20 shrink-0"
      title={isDeck ? "덱" : "트래시"}
    >
      {/* 바닥 스택 효과 */}
      {Array.from({ length: layers - 1 }).map((_, idx) => {
        const offset = (idx + 1) * 1.5;
        return (
          <div
            key={idx}
            style={{ transform: `translate(${offset}px, ${offset}px)` }}
            className={`absolute inset-0 rounded-lg border pointer-events-none ${
              isDeck ? "bg-indigo-950 border-indigo-800/40" : "bg-zinc-800 border-zinc-700/40"
            }`}
          />
        );
      })}

      {/* 최상단 메인 카드 */}
      <div
        className={`absolute inset-0 rounded-lg border flex flex-col items-center justify-center transition-all duration-300 ${
          isDeck
            ? "bg-gradient-to-br from-indigo-600 to-indigo-900 border-indigo-400/50 text-white"
            : glow
              ? "bg-game-loss border-game-loss shadow-[0_0_12px_rgba(208,80,80,0.8)] animate-pulse text-white"
              : "bg-gradient-to-br from-zinc-800 to-zinc-950 border-game-line text-game-text-dim"
        }`}
      >
        {isDeck ? (
          <Layers className="h-4 w-4 text-white/70 animate-pulse-ring" />
        ) : (
          <Trash2 className={`h-4 w-4 ${glow ? "text-white" : "text-game-text-dim/80"}`} />
        )}

        {/* Count 배지 */}
        <span className="absolute bottom-1 right-1 text-[8px] font-black bg-black/75 px-1 py-0.5 rounded text-white border border-white/10 scale-90">
          {count}
        </span>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────
// 라이프 카드 더미 (스택)
// ──────────────────────────────────────────────────────────
function LifeZone({ count }: { count: number }) {
  const { t } = useI18n();
  if (count === 0) {
    return <EmptySlot label={t("simulator.zoneLife")} />;
  }

  // 라이프 수만큼 겹친 더미 렌더링 (최대 5개까지 겹쳐서 표시, 그 이상은 5개로 한계)
  const maxRender = Math.min(count, 5);

  return (
    <div className="relative w-12 h-[68px] sm:w-14 sm:h-20 shrink-0" title={`라이프: ${count}`}>
      {Array.from({ length: maxRender }).map((_, idx) => {
        // 인덱스가 높을수록(최상단 카드) 우상단으로 오프셋
        const offset = idx * 1.5;
        const isTop = idx === maxRender - 1;
        return (
          <div
            key={idx}
            style={{
              transform: `translate(${-offset}px, ${-offset}px)`,
              zIndex: idx,
            }}
            className={`absolute inset-0 rounded-lg border transition-all duration-300 ${
              isTop
                ? "bg-gradient-to-br from-rose-900 via-rose-950 to-purple-950 border-rose-500/70 shadow-md"
                : "bg-rose-950 border-rose-800/40"
            }`}
          >
            {isTop && (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-white/90">
                <Heart className="h-3.5 w-3.5 fill-rose-600 text-rose-600 animate-pulse" />
                <span className="text-[9px] font-black mt-0.5 scale-90">{count}</span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ──────────────────────────────────────────────────────────
// DON!! 코스트 에리어 (미니 칩 더미)
// ──────────────────────────────────────────────────────────
function DonZone({ active, total }: { active: number; total: number }) {
  const { t } = useI18n();
  const rest = total - active;

  if (total === 0) {
    return <EmptySlot label={t("simulator.zoneDon")} />;
  }

  // w-12 h-[68px] sm:w-14 sm:h-20 영역 안에 액티브(좌)와 레스트(우) 칩을 수직으로 겹겹이 쌓아 배치
  const activeChips = Array.from({ length: active });
  const restChips = Array.from({ length: rest });

  return (
    <div
      className="relative w-12 h-[68px] sm:w-14 sm:h-20 rounded-lg border border-game-line/35 bg-game-card/5 p-1 shrink-0 overflow-hidden flex justify-between gap-0.5"
      title={`DON!! 액티브: ${active} / 토탈: ${total}`}
    >
      {/* 액티브 칩 스택 (좌측) */}
      <div className="relative flex-1 h-full">
        {activeChips.map((_, idx) => {
          const topOffset = idx * 5; // 촘촘히 겹치기
          return (
            <div
              key={idx}
              style={{
                top: `${topOffset}px`,
                zIndex: idx,
              }}
              className="absolute left-0 right-0 h-4 rounded-[2px] bg-gradient-to-br from-yellow-300 to-amber-500 border border-yellow-200/60 shadow-sm flex items-center justify-center scale-95"
            >
              <span className="text-[7px] font-extrabold text-black/95 tracking-tighter scale-90">
                DON!!
              </span>
            </div>
          );
        })}
      </div>

      {/* 레스트 칩 스택 (우측, 90도 회전하여 눕힘) */}
      <div className="relative flex-1 h-full">
        {restChips.map((_, idx) => {
          const topOffset = idx * 5;
          return (
            <div
              key={idx}
              style={{
                top: `${topOffset}px`,
                zIndex: idx,
              }}
              className="absolute left-0 right-0 h-4 rounded-[2px] bg-gradient-to-br from-amber-800 to-yellow-950 border border-amber-800/40 shadow-sm flex items-center justify-center scale-95 rotate-90 opacity-80"
            >
              <span className="text-[6px] font-bold text-amber-300/80 tracking-tighter scale-90">
                REST
              </span>
            </div>
          );
        })}
      </div>

      {/* DON!! 덱 잔량 표기 */}
      <span className="absolute bottom-0.5 right-0.5 text-[7px] font-black bg-black/60 text-yellow-500 px-0.5 rounded scale-75 select-none pointer-events-none">
        {10 - total}
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
  attackerIids,
  targetIidsForSelected,
  selectedAttackerIid,
  activeAttackAnim,
  onAttackerClick,
  onTargetClick,
  onCardPreview,
  isOpponent,
}: {
  unit: CardInstance;
  life: number;
  glowing: boolean;
  attackerIids?: Set<string>;
  targetIidsForSelected?: Set<string>;
  selectedAttackerIid?: string | null;
  activeAttackAnim?: { attackerIid: string; targetIid: string } | null;
  onAttackerClick?: (e: React.MouseEvent, iid: string) => void;
  onTargetClick?: (e: React.MouseEvent, iid: string) => void;
  onCardPreview?: (card: CardInstance) => void;
  isOpponent?: boolean;
}) {
  const meta = getCardMeta(unit.code);
  const power = getBattlePower(unit);
  const donAttached = unit.attached.filter((t) => t.code === "DON!!").length;
  const lowLife = life <= 1;

  const isAttacking = activeAttackAnim?.attackerIid === unit.iid;
  const isTargeted = targetIidsForSelected?.has(unit.iid);
  const isSelectedAttacker = selectedAttackerIid === unit.iid;

  return (
    <div
      className={`relative transition-all duration-300 ${
        isAttacking ? (isOpponent ? "animate-attack-p2 z-30" : "animate-attack-p1 z-30") : ""
      }`}
    >
      {glowing && !isSelectedAttacker && !isTargeted && (
        <div className="absolute -inset-1.5 rounded-2xl bg-cyan-400/30 blur-md animate-pulse" />
      )}
      <div
        data-iid={unit.iid}
        onClick={() => onCardPreview?.(unit)}
        className={`relative w-24 h-32 sm:w-28 sm:h-40 rounded-xl border-2 overflow-hidden shadow-xl cursor-pointer transition-all ${
          unit.rested
            ? "opacity-70 border-game-line rotate-[6deg]"
            : isSelectedAttacker
              ? "border-game-loss ring-4 ring-game-loss shadow-[0_0_15px_rgba(208,80,80,0.8)] scale-105"
              : isTargeted
                ? "border-game-loss ring-4 ring-game-loss animate-pulse shadow-[0_0_15px_rgba(208,80,80,0.8)] scale-105"
                : glowing
                  ? "border-cyan-400"
                  : "border-game-line"
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

        {/* 조준경 버튼 (공격 대상) */}
        {isTargeted && onTargetClick && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onTargetClick(e, unit.iid);
            }}
            className="absolute inset-0 z-30 flex items-center justify-center bg-black/45 hover:bg-black/55 transition-colors"
          >
            <div className="p-2 rounded-full bg-game-loss text-white animate-bounce shadow-lg">
              <Target className="h-6 w-6" />
            </div>
          </button>
        )}
      </div>

      {/* 칼 버튼 (공격 개시) */}
      {!isOpponent && attackerIids?.has(unit.iid) && onAttackerClick && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onAttackerClick(e, unit.iid);
          }}
          className={`absolute -top-2 -left-2 z-30 p-1.5 rounded-full border shadow-lg transition-all ${
            isSelectedAttacker
              ? "bg-game-loss text-white border-game-loss scale-110"
              : "bg-game-card text-game-loss border-game-line hover:scale-105"
          }`}
        >
          <Swords className="h-4 w-4" />
        </button>
      )}

      {/* 라이프 = HP 배지(카드 우상단) */}
      <span
        className={`absolute -top-2 -right-2 flex items-center gap-0.5 text-white text-xs font-black px-1.5 py-0.5 rounded-full shadow-lg ring-2 ring-white/40 ${
          lowLife ? "bg-game-loss animate-pulse" : "bg-rose-500"
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
  onCardPreview,
}: {
  hand: CardInstance[];
  selectedHandIid?: string | null;
  playableHandIids?: Set<string>;
  onHandSelect?: (iid: string) => void;
  onCardPreview?: (card: CardInstance) => void;
}) {
  if (hand.length === 0) {
    return <div className="flex justify-center py-3 text-[10px] text-game-text-dim">손패 없음</div>;
  }
  return (
    <div className="flex justify-center items-end overflow-x-auto pt-1 scrollbar-none">
      <div className="flex items-end">
        {hand.map((c, i) => {
          const meta = getCardMeta(c.code);
          const playable = playableHandIids?.has(c.iid);
          const selected = selectedHandIid === c.iid;
          return (
            <button
              key={c.iid}
              onClick={() => {
                onHandSelect?.(c.iid);
                onCardPreview?.(c);
              }}
              title={meta.name}
              style={{ zIndex: selected ? 30 : i }}
              className={`relative w-16 h-24 sm:w-[72px] sm:h-[104px] rounded-lg border-2 overflow-hidden shrink-0 shadow-lg transition-all duration-200 ${
                i > 0 ? "-ml-5 sm:-ml-6" : ""
              } ${
                selected
                  ? "border-game-blue ring-2 ring-game-blue -translate-y-3"
                  : playable
                    ? "border-game-blue shadow-[0_0_10px_rgba(55,138,221,0.5)] hover:-translate-y-2 cursor-pointer"
                    : "border-game-line opacity-40 hover:-translate-y-1 cursor-pointer"
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
                <span className="absolute top-0.5 right-0.5 h-2 w-2 rounded-full bg-game-blue ring-1 ring-white/50 animate-pulse" />
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
            className={`w-7 h-10 rounded-sm bg-gradient-to-br from-slate-700 to-slate-900 border border-game-line/30 shadow-md ${
              i > 0 ? "-ml-3" : ""
            }`}
          />
        ))}
      </div>
      <span className="ml-2 self-center text-[9px] font-bold text-game-text-dim">{count}</span>
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

function EmptySlot({
  isLeader,
  label,
  className = "",
}: {
  isLeader?: boolean;
  label?: string;
  className?: string;
}) {
  return (
    <div
      className={`relative shrink-0 rounded-lg border border-dashed border-game-line/35 bg-game-card/5 flex items-center justify-center ${
        isLeader ? "w-24 h-32 sm:w-28 sm:h-40 rounded-xl" : "w-12 h-[68px] sm:w-14 sm:h-20"
      } ${className}`}
    >
      {label && (
        <span className="text-[9px] sm:text-[10px] font-extrabold text-game-text-dim/30 tracking-tight text-center px-0.5 select-none pointer-events-none uppercase">
          {label}
        </span>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────
// 벤치(캐릭터) 유닛 카드 — 작게 + 파워 배지 플로팅
// ──────────────────────────────────────────────────────────
function BattleUnit({
  unit,
  attackerIids,
  targetIidsForSelected,
  selectedAttackerIid,
  activeAttackAnim,
  onAttackerClick,
  onTargetClick,
  onCardPreview,
  isOpponent,
}: {
  unit: CardInstance;
  attackerIids?: Set<string>;
  targetIidsForSelected?: Set<string>;
  selectedAttackerIid?: string | null;
  activeAttackAnim?: { attackerIid: string; targetIid: string } | null;
  onAttackerClick?: (e: React.MouseEvent, iid: string) => void;
  onTargetClick?: (e: React.MouseEvent, iid: string) => void;
  onCardPreview?: (card: CardInstance) => void;
  isOpponent?: boolean;
}) {
  const meta = getCardMeta(unit.code);
  const power = getBattlePower(unit);
  const donAttached = unit.attached.filter((t) => t.code === "DON!!").length;

  const isAttacking = activeAttackAnim?.attackerIid === unit.iid;
  const isTargeted = targetIidsForSelected?.has(unit.iid);
  const isSelectedAttacker = selectedAttackerIid === unit.iid;

  return (
    <div
      className={`relative shrink-0 transition-all duration-300 ${
        isAttacking ? (isOpponent ? "animate-attack-p2 z-30" : "animate-attack-p1 z-30") : ""
      }`}
    >
      <div
        data-iid={unit.iid}
        onClick={() => onCardPreview?.(unit)}
        className={`relative w-12 h-[68px] sm:w-14 sm:h-20 rounded-lg border overflow-hidden shadow-md cursor-pointer transition-all ${
          unit.rested
            ? "opacity-70 border-game-line rotate-[8deg]"
            : isSelectedAttacker
              ? "border-game-loss ring-2 ring-game-loss shadow-[0_0_10px_rgba(208,80,80,0.8)] scale-105"
              : isTargeted
                ? "border-game-loss ring-2 ring-game-loss animate-pulse shadow-[0_0_10px_rgba(208,80,80,0.8)] scale-105"
                : "border-game-line"
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

        {/* 조준경 버튼 (공격 대상) */}
        {isTargeted && onTargetClick && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onTargetClick(e, unit.iid);
            }}
            className="absolute inset-0 z-30 flex items-center justify-center bg-black/45 hover:bg-black/55 transition-colors"
          >
            <div className="p-1 rounded-full bg-game-loss text-white animate-bounce shadow-lg">
              <Target className="h-4 w-4" />
            </div>
          </button>
        )}
      </div>

      {/* 칼 버튼 (공격 개시) */}
      {!isOpponent && attackerIids?.has(unit.iid) && onAttackerClick && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onAttackerClick(e, unit.iid);
          }}
          className={`absolute -top-2 -left-2 z-30 p-1 rounded-full border shadow-lg transition-all ${
            isSelectedAttacker
              ? "bg-game-loss text-white border-game-loss scale-110"
              : "bg-game-card text-game-loss border-game-line hover:scale-105"
          }`}
        >
          <Swords className="h-3 w-3" />
        </button>
      )}

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
  const { t } = useI18n();

  return (
    <div className="flex items-center justify-center gap-2 text-[11px] flex-wrap text-game-text">
      <ShieldAlert className="h-4 w-4 text-amber-500 shrink-0" />
      <span className="font-bold text-amber-500">{t("simulator.battle")}</span>
      <span className="text-game-text-dim">
        <span className="font-bold text-game-text">{attackerName}</span> {t("simulator.attacker")}{" "}
        <span className="font-black text-game-loss">{pending.baseAttackerPower}</span>{" "}
        {t("simulator.vs")} {t("simulator.defender")}{" "}
        <span className="font-black text-game-blue">{def}</span>{" "}
        <span className="text-[10px]">
          ({isLeaderTarget ? t("simulator.leader") : t("simulator.character")}{" "}
          {t("simulator.target")})
        </span>
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
