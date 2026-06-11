import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, useMemo, useEffect } from "react";
import {
  Gamepad,
  Plus,
  Trash2,
  Pencil,
  ArrowLeft,
  Play,
  Sparkles,
  Layers,
  Search,
  Check,
  Info,
} from "lucide-react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { PREBUILT_DECKS, type PrebuiltDeck } from "@/lib/simulator/prebuilt-decks";
import type { Tables } from "@/integrations/supabase/types";
import { useI18n } from "@/i18n/language-context";
import { colorHex, colorLabel, type Game } from "@/lib/deck-colors";
import { checkCanAdd } from "@/lib/deck-rules";

type SimulatorDeck = Tables<"simulator_decks">;
type CardRow = Tables<"cards">;

export const Route = createFileRoute("/simulator/")({
  head: () => {
    let locale = "ko";
    if (typeof window !== "undefined") {
      locale = localStorage.getItem("duelnight.i18n.locale") || "ko";
    }
    const titles: Record<string, string> = {
      ko: "AI 대국 시뮬레이터 — DuelNight",
      en: "AI Battle Simulator — DuelNight",
      ja: "AI対戦シミュレーター — DuelNight",
    };
    const descs: Record<string, string> = {
      ko: "OPTCG 카드로 구성된 덱을 사용하여 인메모리 AI와 시뮬레이션 대국을 즐겨보세요.",
      en: "Play simulation matches against in-memory AI using OPTCG custom decks.",
      ja: "OPTCGカードで構成されたデッキを使用して、インメモリーAIとの対戦シミュレーションをお楽しみください。",
    };
    return {
      meta: [
        { title: titles[locale] || titles.ko },
        { name: "description", content: descs[locale] || descs.ko },
      ],
    };
  },
  component: SimulatorIndexPage,
});

function SimulatorIndexPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { t } = useI18n();

  // 대국 관련 상태
  const [p1DeckId, setP1DeckId] = useState<string>("");
  const [p2DeckId, setP2DeckId] = useState<string>("");
  const [battleMode, setBattleMode] = useState<"manual" | "auto">("manual");

  // 덱 생성 관련 상태
  const [newDeckName, setNewDeckName] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  // 덱 편집 관련 상태
  const [editingDeckId, setEditingDeckId] = useState<string | null>(null);

  // 사용자 시뮬레이터 덱 쿼리
  const { data: userDecks = [], refetch: refetchDecks } = useQuery<SimulatorDeck[]>({
    queryKey: ["simulator-decks", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("simulator_decks")
        .select("*")
        .eq("user_id", user!.id)
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as SimulatorDeck[];
    },
  });

  // 모든 사용 가능한 덱 목록 (유저 덱 + 프리빌트 덱)
  const allAvailableDecks = useMemo(() => {
    const list: {
      id: string;
      name: string;
      isPrebuilt: boolean;
      recipe: any;
      leaderCode: string | null;
    }[] = [];

    // 유저 덱
    for (const d of userDecks) {
      list.push({
        id: d.id,
        name: d.name,
        isPrebuilt: false,
        recipe: d.recipe,
        leaderCode: d.leader_code,
      });
    }

    // 프리빌트 덱
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
  }, [userDecks]);

  // 기본 선택 처리
  useEffect(() => {
    if (allAvailableDecks.length > 0) {
      if (!p1DeckId) setP1DeckId(allAvailableDecks[0].id);
      if (!p2DeckId)
        setP2DeckId(
          allAvailableDecks.length > 1 ? allAvailableDecks[1].id : allAvailableDecks[0].id,
        );
    }
  }, [allAvailableDecks, p1DeckId, p2DeckId]);

  // 덱 삭제 뮤테이션
  const deleteDeckMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("simulator_decks").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("덱이 성공적으로 삭제되었습니다.");
      qc.invalidateQueries({ queryKey: ["simulator-decks"] });
    },
    onError: (err: any) => {
      toast.error("덱 삭제 실패: " + err.message);
    },
  });

  // 새 시뮬레이터 덱 생성
  const handleCreateDeck = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      toast.error("로그인이 필요합니다.");
      return;
    }
    if (!newDeckName.trim()) {
      toast.error("덱 이름을 입력해 주세요.");
      return;
    }

    setIsCreating(true);
    try {
      const { data, error } = await supabase
        .from("simulator_decks")
        .insert({
          user_id: user.id,
          name: newDeckName.trim(),
          game: "optcg",
          recipe: { game: "optcg", cards: [] },
          is_public: false,
        })
        .select()
        .single();

      if (error) throw error;

      toast.success("시뮬레이터 덱이 생성되었습니다.");
      setNewDeckName("");
      qc.invalidateQueries({ queryKey: ["simulator-decks"] });
      // 바로 편집으로 전환
      setEditingDeckId(data.id);
    } catch (err: any) {
      toast.error("덱 생성 실패: " + err.message);
    } finally {
      setIsCreating(false);
    }
  };

  const selectedP1Deck = allAvailableDecks.find((d) => d.id === p1DeckId);
  const selectedP2Deck = allAvailableDecks.find((d) => d.id === p2DeckId);

  // 대국 시작 핸들러
  const handleStartBattle = () => {
    if (!p1DeckId || !p2DeckId) {
      toast.error("플레이어 1과 플레이어 2의 덱을 선택해 주세요.");
      return;
    }

    // 선택된 덱 검증 (카드가 50장 투입되고 리더가 지정되어 있어야 함)
    const validateDeck = (deck: (typeof allAvailableDecks)[0] | undefined, pName: string) => {
      if (!deck) return false;
      const cards = deck.recipe?.cards ?? [];
      const leaderCode = deck.leaderCode || deck.recipe?.leaderCode;
      const total = cards.reduce((acc: number, c: any) => acc + c.quantity, 0);

      if (!leaderCode) {
        toast.error(`${pName}의 리더 카드가 설정되지 않았습니다. 덱을 편집해 주세요.`);
        return false;
      }
      if (total !== 50) {
        toast.warning(
          `${pName}의 카드 수가 ${total}장입니다. (원피스 카드 게임 규칙상 50장이어야 대국 가능하지만, 시뮬레이션 시작은 허용합니다)`,
        );
      }
      return true;
    };

    if (!validateDeck(selectedP1Deck, "플레이어 1 덱")) return;
    if (!validateDeck(selectedP2Deck, "플레이어 2 덱")) return;

    // 배틀 룸으로 이동
    navigate({
      to: "/simulator/$id",
      params: { id: "play" },
      search: {
        p1: p1DeckId,
        p2: p2DeckId,
        mode: battleMode,
      },
    });
  };

  // 덱 편집 중인 경우 편집 화면을 렌더링
  if (editingDeckId) {
    const deckToEdit = userDecks.find((d) => d.id === editingDeckId);
    if (deckToEdit) {
      return (
        <div className="mx-auto w-full max-w-7xl px-4 py-6">
          <button
            onClick={() => {
              setEditingDeckId(null);
              refetchDecks();
            }}
            className="mb-4 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-4 w-4" /> 대국 로비로 돌아가기
          </button>
          <SimulatorRecipeEditor deck={deckToEdit} onSaveComplete={() => setEditingDeckId(null)} />
        </div>
      );
    }
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-8">
      <PageHeader
        title="AI 대국 시뮬레이터"
        description="OPTCG 카드로 구성된 덱을 시험해보거나, AI vs AI 자동 관전 대국을 통해 밸런스와 전략을 분석해 보세요."
      >
        <div className="flex items-center gap-2">
          <Link
            to="/packs"
            className="inline-flex items-center justify-center rounded-md border border-border bg-card px-3 py-1.5 text-xs font-semibold hover:bg-accent hover:text-accent-foreground"
          >
            <Sparkles className="mr-1.5 h-3.5 w-3.5 text-yellow-500" /> 카드 팩 개봉하기
          </Link>
        </div>
      </PageHeader>

      <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-12">
        {/* ── 왼쪽 단: 대국 로비 및 설정 ── */}
        <div className="space-y-6 lg:col-span-7">
          {/* 대국 설정 카드 */}
          <div className="rounded-2xl border border-border bg-card/60 p-6 backdrop-blur-sm shadow-md">
            <h2 className="text-base font-bold flex items-center gap-2 mb-4">
              <Gamepad className="h-5 w-5 text-primary" /> 대국 대진 설정
            </h2>

            <div className="space-y-4">
              {/* 플레이어 1 선택 */}
              <div className="space-y-1.5">
                <Label htmlFor="p1-deck-select" className="text-xs font-bold text-muted-foreground">
                  플레이어 1 덱 (나의 플레이 영역)
                </Label>
                <Select value={p1DeckId} onValueChange={setP1DeckId}>
                  <SelectTrigger id="p1-deck-select" className="w-full h-10 text-xs">
                    <SelectValue placeholder="덱 선택" />
                  </SelectTrigger>
                  <SelectContent>
                    {allAvailableDecks.map((d) => (
                      <SelectItem key={d.id} value={d.id}>
                        {d.name} {d.leaderCode ? `(${d.leaderCode})` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* 플레이어 2 선택 */}
              <div className="space-y-1.5">
                <Label htmlFor="p2-deck-select" className="text-xs font-bold text-muted-foreground">
                  플레이어 2 덱 (AI 대전 상대)
                </Label>
                <Select value={p2DeckId} onValueChange={setP2DeckId}>
                  <SelectTrigger id="p2-deck-select" className="w-full h-10 text-xs">
                    <SelectValue placeholder="덱 선택" />
                  </SelectTrigger>
                  <SelectContent>
                    {allAvailableDecks.map((d) => (
                      <SelectItem key={d.id} value={d.id}>
                        {d.name} {d.leaderCode ? `(${d.leaderCode})` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* 대국 모드 선택 */}
              <div className="space-y-2">
                <Label className="text-xs font-bold text-muted-foreground">대국 진행 모드</Label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setBattleMode("manual")}
                    className={`rounded-lg border p-3 text-left transition-all ${
                      battleMode === "manual"
                        ? "border-primary bg-primary/5 ring-1 ring-primary"
                        : "border-border bg-card/40 hover:bg-card"
                    }`}
                  >
                    <div className="text-xs font-bold">수동 플레이</div>
                    <div className="mt-1 text-[10px] text-muted-foreground">
                      플레이어 1은 직접 카드를 조작하고, 플레이어 2는 AI가 조작합니다.
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setBattleMode("auto")}
                    className={`rounded-lg border p-3 text-left transition-all ${
                      battleMode === "auto"
                        ? "border-primary bg-primary/5 ring-1 ring-primary"
                        : "border-border bg-card/40 hover:bg-card"
                    }`}
                  >
                    <div className="text-xs font-bold">AI vs AI 자동 관전</div>
                    <div className="mt-1 text-[10px] text-muted-foreground">
                      플레이어 1, 2 모두 인메모리 AI가 가치 가중치를 바탕으로 자동 격돌합니다.
                    </div>
                  </button>
                </div>
              </div>

              {/* 시작 버튼 */}
              <Button
                onClick={handleStartBattle}
                size="lg"
                className="w-full h-11 text-xs font-bold flex items-center justify-center gap-2"
              >
                <Play className="h-4 w-4 fill-current" /> 대국 시작하기
              </Button>
            </div>
          </div>

          {/* 프리빌트(기본제공) 덱 목록 */}
          <div className="space-y-3">
            <h3 className="text-sm font-bold text-muted-foreground">체험용 기본 덱</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {PREBUILT_DECKS.map((pd) => (
                <div
                  key={pd.id}
                  className="rounded-xl border border-border bg-card/40 p-4 shadow-sm"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <h4 className="text-xs font-bold">{pd.name}</h4>
                      <p className="mt-1 text-[10px] text-muted-foreground line-clamp-2 leading-relaxed">
                        {pd.description}
                      </p>
                    </div>
                  </div>
                  <div className="mt-3 flex items-center gap-1.5 text-[10px] text-muted-foreground border-t border-border/20 pt-2">
                    <span className="font-bold text-primary">리더: {pd.leaderCode}</span>
                    <span>·</span>
                    <span>카드 50장</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── 오른쪽 단: 사용자 시뮬레이터 덱 목록 ── */}
        <div className="space-y-6 lg:col-span-5">
          {/* 새 덱 생성 카드 (로그인 유저전용) */}
          <div className="rounded-2xl border border-border bg-card/60 p-6 backdrop-blur-sm shadow-md">
            <h2 className="text-base font-bold flex items-center gap-2 mb-3">
              <Layers className="h-5 w-5 text-primary" /> 나의 시뮬레이터 덱
            </h2>

            {user ? (
              <div className="space-y-4">
                <form onSubmit={handleCreateDeck} className="flex gap-2">
                  <Input
                    placeholder="새 덱 이름 입력..."
                    value={newDeckName}
                    onChange={(e) => setNewDeckName(e.target.value)}
                    className="h-9 text-xs"
                    disabled={isCreating}
                  />
                  <Button type="submit" size="sm" className="h-9 text-xs" disabled={isCreating}>
                    <Plus className="mr-1 h-3.5 w-3.5" /> 생성
                  </Button>
                </form>

                {userDecks.length === 0 ? (
                  <div className="py-8 text-center rounded-xl border border-dashed border-border bg-muted/10">
                    <p className="text-xs text-muted-foreground">
                      생성된 시뮬레이터 덱이 없습니다.
                    </p>
                  </div>
                ) : (
                  <ul className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                    {userDecks.map((d) => {
                      const recipeCards = (d.recipe as any)?.cards ?? [];
                      const count = recipeCards.reduce(
                        (acc: number, c: any) => acc + c.quantity,
                        0,
                      );
                      return (
                        <li
                          key={d.id}
                          className="flex items-center justify-between p-3 rounded-lg border border-border bg-card hover:border-primary/20 transition-colors"
                        >
                          <div className="min-w-0 flex-1">
                            <span className="block text-xs font-bold truncate">{d.name}</span>
                            <span className="mt-0.5 inline-flex gap-1.5 text-[9px] text-muted-foreground">
                              <span>리더: {d.leader_code || "설정 필요"}</span>
                              <span>·</span>
                              <span>카드: {count}장</span>
                            </span>
                          </div>
                          <div className="flex items-center gap-1 shrink-0 ml-2">
                            <button
                              onClick={() => setEditingDeckId(d.id)}
                              title="덱 편집"
                              className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={() => {
                                if (confirm("정말 이 덱을 삭제하시겠습니까?")) {
                                  deleteDeckMutation.mutate(d.id);
                                }
                              }}
                              title="덱 삭제"
                              className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-destructive transition-colors"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            ) : (
              <div className="py-10 text-center rounded-xl border border-dashed border-border bg-muted/10">
                <p className="text-xs text-muted-foreground leading-relaxed">
                  로그인하시면 나만의 카드 컬렉션을 활용해
                  <br />
                  직접 커스텀 시뮬레이터 덱을 구축할 수 있습니다.
                </p>
                <Link
                  to="/login"
                  className="mt-4 inline-flex items-center justify-center rounded-md bg-foreground px-4 py-2 text-xs font-medium text-background hover:opacity-90 transition-opacity"
                >
                  로그인하러 가기
                </Link>
              </div>
            )}
          </div>

          {/* 정보 팁 박스 */}
          <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 text-xs text-amber-800 dark:text-amber-300">
            <h4 className="font-bold flex items-center gap-1.5">
              <Info className="h-4 w-4 text-amber-600 dark:text-amber-400" /> 시뮬레이터 덱 규칙
              안내
            </h4>
            <ul className="mt-2 space-y-1.5 list-disc pl-4 leading-relaxed text-[11px]">
              <li>
                시뮬레이터 덱은 반드시 1장의 리더 카드와 50장의 덱 카드로 구성되어야 완벽한 덱이
                됩니다.
              </li>
              <li>
                "보유 카드만 보기" 기능을 켜면, 팩 시뮬레이터에서 개봉하여 나의 컬렉션에 등록된
                수량만큼만 덱에 카드를 투입할 수 있습니다.
              </li>
              <li>동일한 카드는 덱에 최대 4장까지 투입할 수 있습니다.</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────
// 덱 편집기 (SimulatorRecipeEditor) 컴포넌트 실구현
// ──────────────────────────────────────────────────────────
function SimulatorRecipeEditor({
  deck,
  onSaveComplete,
}: {
  deck: SimulatorDeck;
  onSaveComplete: () => void;
}) {
  const qc = useQueryClient();
  const { user } = useAuth();

  // 검색/필터 상태
  const [q, setQ] = useState("");
  const [filterType, setFilterType] = useState("all");
  const [filterColor, setFilterColor] = useState("all");
  const [filterSet, setFilterSet] = useState("all");
  const [filterOwnedOnly, setFilterOwnedOnly] = useState(true);

  // 로컬 덱 상태 (리더 코드 & 카드 배열)
  const initialRecipe = useMemo(() => {
    const r = deck.recipe as any;
    return {
      leaderCode: deck.leader_code || r?.leaderCode || null,
      cards: (r?.cards || []) as { card_code: string; quantity: number }[],
    };
  }, [deck]);

  const [leaderCode, setLeaderCode] = useState<string | null>(initialRecipe.leaderCode);
  const [deckCards, setDeckCards] = useState<{ card_code: string; quantity: number }[]>(
    initialRecipe.cards,
  );
  const [isSaving, setIsSaving] = useState(false);

  // 카드 메타데이터 캐시 로드용 쿼리
  const codes = useMemo(() => {
    const list = deckCards.map((c) => c.card_code);
    if (leaderCode) list.push(leaderCode);
    return list;
  }, [deckCards, leaderCode]);

  const { data: cardMetaMap = {} } = useQuery<Record<string, CardRow>>({
    queryKey: ["deck-cards-meta-sim", deck.id, [...codes].sort().join(",")],
    enabled: codes.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.from("cards").select("*").in("code", codes);
      if (error) throw error;
      const m: Record<string, CardRow> = {};
      for (const c of data ?? []) m[c.code] = c as CardRow;
      return m;
    },
  });

  // 유저 보유 카드 컬렉션 조회
  const { data: owned = new Map<string, number>() } = useQuery({
    queryKey: ["collection", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_collection")
        .select("card_code, quantity")
        .eq("user_id", user!.id);
      if (error) throw error;
      const m = new Map<string, number>();
      for (const r of data ?? []) m.set(r.card_code, r.quantity);
      return m;
    },
  });

  // 카드 풀 검색 쿼리
  const { data: searchResults = [], isFetching } = useQuery({
    queryKey: ["sim-deck-search", q, filterType, filterColor, filterSet],
    queryFn: async () => {
      let qb = supabase
        .from("cards")
        .select("*")
        .eq("game", "optcg")
        .order("name", { ascending: true })
        .limit(150);

      if (q.trim()) qb = qb.or(`name.ilike.%${q.trim()}%,code.ilike.%${q.trim()}%`);
      if (filterType !== "all") qb = qb.eq("type", filterType as any);
      if (filterColor !== "all") qb = qb.contains("colors", [filterColor]);
      if (filterSet !== "all") qb = qb.eq("set_code", filterSet);

      const { data, error } = await qb;
      if (error) throw error;
      return data ?? [];
    },
  });

  // 보유 필터링을 반영한 검색 결과
  const filteredResults = useMemo(() => {
    return searchResults.filter((card) => {
      if (filterOwnedOnly) {
        return (owned.get(card.code) ?? 0) > 0;
      }
      return true;
    });
  }, [searchResults, filterOwnedOnly, owned]);

  // 세트 종류 로드
  const { data: sets = [] } = useQuery<string[]>({
    queryKey: ["card-sets-sim"],
    queryFn: async () => {
      const { data } = await supabase.from("cards").select("set_code").eq("game", "optcg");
      return [...new Set((data ?? []).map((c) => c.set_code).filter(Boolean) as string[])].sort();
    },
  });

  const totalCards = useMemo(() => deckCards.reduce((s, c) => s + c.quantity, 0), [deckCards]);
  const getQty = (code: string) => deckCards.find((c) => c.card_code === code)?.quantity ?? 0;

  // 카드 추가
  const addCard = (card: CardRow) => {
    if (card.type === "leader") {
      setLeaderCode(card.code);
      toast.success(`리더 카드가 ${card.name} (${card.code})로 설정되었습니다.`);
      return;
    }

    const currentQty = getQty(card.code);

    // 보유 수량 검증
    if (filterOwnedOnly && user) {
      const ownedQty = owned.get(card.code) ?? 0;
      if (currentQty >= ownedQty) {
        toast.error(
          `보유 수량(${ownedQty}장)을 초과하여 추가할 수 없습니다. 팩 시뮬레이터에서 팩을 더 개봉해 보세요.`,
        );
        return;
      }
    }

    // 4장 제한 검증
    if (currentQty >= 4) {
      toast.error("원피스 카드 게임 규칙상 동일한 카드는 최대 4장까지 투입 가능합니다.");
      return;
    }

    // 전체 카드 50장 제한 검증
    if (totalCards >= 50) {
      toast.error("덱 카드는 최대 50장까지 추가할 수 있습니다.");
      return;
    }

    setDeckCards((prev) => {
      const existing = prev.find((c) => c.card_code === card.code);
      if (existing) {
        return prev.map((c) =>
          c.card_code === card.code ? { ...c, quantity: c.quantity + 1 } : c,
        );
      }
      return [...prev, { card_code: card.code, quantity: 1 }];
    });
  };

  // 수량 조절
  const updateQty = (code: string, delta: number) => {
    setDeckCards((prev) => {
      return prev
        .map((c) => {
          if (c.card_code === code) {
            const nextQty = c.quantity + delta;

            // 보유 수량 증가 시 검증
            if (delta > 0 && filterOwnedOnly && user) {
              const ownedQty = owned.get(code) ?? 0;
              if (nextQty > ownedQty) {
                toast.error(`보유 수량(${ownedQty}장)을 초과하여 늘릴 수 없습니다.`);
                return c;
              }
            }

            if (delta > 0 && nextQty > 4) {
              toast.error("동일 카드는 최대 4장까지만 투입 가능합니다.");
              return c;
            }

            if (delta > 0 && totalCards >= 50) {
              toast.error("덱은 최대 50장까지만 투입 가능합니다.");
              return c;
            }

            return { ...c, quantity: nextQty };
          }
          return c;
        })
        .filter((c) => c.quantity > 0);
    });
  };

  // 카드 완전 제거
  const removeCard = (code: string) => {
    setDeckCards((prev) => prev.filter((c) => c.card_code !== code));
  };

  // 저장 요청
  const handleSaveDeck = async () => {
    setIsSaving(true);
    try {
      const recipeObj = {
        game: "optcg",
        leaderCode: leaderCode,
        cards: deckCards,
      };

      const { error } = await supabase
        .from("simulator_decks")
        .update({
          recipe: recipeObj,
          leader_code: leaderCode,
        })
        .eq("id", deck.id);

      if (error) throw error;

      toast.success("덱 레시피가 정상적으로 저장되었습니다.");
      qc.invalidateQueries({ queryKey: ["simulator-decks"] });
      onSaveComplete();
    } catch (err: any) {
      toast.error("저장 실패: " + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="rounded-2xl border border-border bg-card p-6 shadow-lg space-y-6">
      <div className="flex items-center justify-between border-b border-border pb-4">
        <div>
          <h2 className="text-lg font-black tracking-tight">{deck.name} - 레시피 편집</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            리더 카드 1장과 덱 카드 50장으로 최적의 조합을 구성해 보세요.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="text-xs h-9" onClick={onSaveComplete}>
            취소
          </Button>
          <Button size="sm" className="text-xs h-9" onClick={handleSaveDeck} disabled={isSaving}>
            레시피 저장하기
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* ── 왼쪽 열: 투입 리스트 (50장 리스트 및 리더) ── */}
        <div className="lg:col-span-5 space-y-4">
          <div className="rounded-xl border border-border bg-card/40 p-4">
            <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-3 flex items-center justify-between">
              <span>투입 요약</span>
              <span className="text-[11px] font-bold text-primary normal-case">
                현재 수량: {totalCards} / 50장
              </span>
            </h3>

            {/* 리더 카드 표시 슬롯 */}
            <div className="mb-4">
              <span className="block text-[10px] font-bold text-muted-foreground mb-1">
                리더 카드
              </span>
              {leaderCode ? (
                <div className="flex items-center justify-between p-2.5 rounded-lg border border-primary bg-primary/5">
                  <div className="min-w-0 flex-1">
                    <span className="text-xs font-bold block truncate">
                      {cardMetaMap[leaderCode]?.name || leaderCode}
                    </span>
                    <span className="text-[9px] text-muted-foreground block">{leaderCode}</span>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-destructive shrink-0"
                    onClick={() => setLeaderCode(null)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ) : (
                <div className="p-3 text-center border-2 border-dashed border-border rounded-lg text-xs text-muted-foreground bg-muted/5">
                  설정된 리더가 없습니다. 아래에서 리더 카드를 클릭해 등록해 주세요.
                </div>
              )}
            </div>

            {/* 덱 카드 투입 목록 */}
            <div>
              <span className="block text-[10px] font-bold text-muted-foreground mb-1.5">
                덱 투입 카드
              </span>
              {deckCards.length === 0 ? (
                <div className="py-12 text-center text-xs text-muted-foreground">
                  오른쪽 카드 목록에서 카드를 추가해 주세요.
                </div>
              ) : (
                <ul className="divide-y divide-border/40 max-h-[400px] overflow-y-auto pr-1 space-y-0.5">
                  {deckCards.map((dc) => {
                    const card = cardMetaMap[dc.card_code];
                    const ownedQty = owned.get(dc.card_code) ?? 0;
                    return (
                      <li
                        key={dc.card_code}
                        className="flex items-center justify-between py-2 text-xs"
                      >
                        <div className="min-w-0 flex-1 pr-3">
                          <span className="font-semibold block truncate">
                            {card?.name || dc.card_code}
                          </span>
                          <span className="text-[9px] text-muted-foreground block">
                            {dc.card_code} {card?.colors ? `· ${card.colors.join("/")}` : ""}
                            {user && ` · 보유: ${ownedQty}장`}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => updateQty(dc.card_code, -1)}
                            className="h-6 w-6 rounded border border-border bg-card flex items-center justify-center font-bold hover:bg-accent hover:text-accent-foreground text-xs"
                          >
                            -
                          </button>
                          <span className="w-6 text-center font-bold text-xs">{dc.quantity}</span>
                          <button
                            type="button"
                            onClick={() => updateQty(dc.card_code, 1)}
                            className="h-6 w-6 rounded border border-border bg-card flex items-center justify-center font-bold hover:bg-accent hover:text-accent-foreground text-xs"
                          >
                            +
                          </button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-muted-foreground hover:text-destructive ml-1"
                            onClick={() => removeCard(dc.card_code)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        </div>

        {/* ── 오른쪽 열: 카드 검색 및 클릭 추가 ── */}
        <div className="lg:col-span-7 space-y-4">
          {/* 필터 폼 */}
          <div className="space-y-2.5">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="이름 또는 코드로 카드 검색..."
                className="pl-8 h-9 text-xs"
              />
            </div>

            <div className="flex flex-wrap gap-2 items-center">
              {/* 종류 필터 */}
              <Select value={filterType} onValueChange={setFilterType}>
                <SelectTrigger className="h-8 text-[11px] w-[95px]">
                  <SelectValue placeholder="종류" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">전체 종류</SelectItem>
                  <SelectItem value="leader">리더</SelectItem>
                  <SelectItem value="character">캐릭터</SelectItem>
                  <SelectItem value="event">이벤트</SelectItem>
                  <SelectItem value="stage">스테이지</SelectItem>
                </SelectContent>
              </Select>

              {/* 색상 필터 */}
              <Select value={filterColor} onValueChange={setFilterColor}>
                <SelectTrigger className="h-8 text-[11px] w-[95px]">
                  <SelectValue placeholder="색상" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">전체 색상</SelectItem>
                  <SelectItem value="red">
                    <div className="flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full bg-red-600" /> 적색 (Red)
                    </div>
                  </SelectItem>
                  <SelectItem value="green">
                    <div className="flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full bg-green-600" /> 녹색 (Green)
                    </div>
                  </SelectItem>
                  <SelectItem value="blue">
                    <div className="flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full bg-blue-600" /> 청색 (Blue)
                    </div>
                  </SelectItem>
                  <SelectItem value="purple">
                    <div className="flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full bg-purple-600" /> 자색 (Purple)
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>

              {/* 세트 필터 */}
              <Select value={filterSet} onValueChange={setFilterSet}>
                <SelectTrigger className="h-8 text-[11px] w-[95px]">
                  <SelectValue placeholder="세트" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">전체 세트</SelectItem>
                  {sets.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* 보유 카드 필터 checkbox */}
              {user && (
                <div className="flex items-center gap-1.5 ml-auto pl-2">
                  <input
                    type="checkbox"
                    id="sim-filter-owned-only"
                    checked={filterOwnedOnly}
                    onChange={(e) => setFilterOwnedOnly(e.target.checked)}
                    className="h-3.5 w-3.5 rounded border-gray-300 text-primary focus:ring-primary cursor-pointer"
                  />
                  <Label
                    htmlFor="sim-filter-owned-only"
                    className="text-[11px] font-medium text-muted-foreground whitespace-nowrap cursor-pointer select-none"
                  >
                    보유 카드만 보기
                  </Label>
                </div>
              )}
            </div>
          </div>

          {/* 카드 목록 결과 */}
          <div className="border border-border rounded-xl p-3 bg-card/20 max-h-[460px] overflow-y-auto">
            {isFetching && (
              <p className="text-xs text-center py-12 text-muted-foreground">
                카드를 조회하는 중...
              </p>
            )}
            {!isFetching && filteredResults.length === 0 && (
              <p className="text-xs text-center py-12 text-muted-foreground">
                검색 결과가 없습니다.
              </p>
            )}

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
              {filteredResults.map((card) => {
                const qtyInDeck = getQty(card.code);
                const ownedQty = owned.get(card.code) ?? 0;
                const isLeader = card.type === "leader";
                const activeLeader = leaderCode === card.code;

                return (
                  <button
                    key={card.code}
                    onClick={() => addCard(card)}
                    className={`group relative text-left rounded-lg overflow-hidden border p-1.5 transition-all bg-card hover:ring-2 hover:ring-primary/45 ${
                      isLeader
                        ? activeLeader
                          ? "border-primary bg-primary/5 ring-1 ring-primary"
                          : "border-border/60 hover:border-primary/40"
                        : qtyInDeck > 0
                          ? "border-primary/70"
                          : "border-border/60 hover:border-border"
                    }`}
                  >
                    {/* 카드 이미지 (있는 경우) */}
                    <div className="aspect-[2/3] w-full rounded bg-muted/40 overflow-hidden relative border border-border/10">
                      {card.image_url ? (
                        <img
                          src={card.image_url}
                          alt={card.name}
                          className="h-full w-full object-cover transition-transform group-hover:scale-105"
                          loading="lazy"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center p-2 text-[10px] text-muted-foreground text-center">
                          {card.name}
                        </div>
                      )}

                      {/* 배지 표시 */}
                      {isLeader ? (
                        <span className="absolute top-1 left-1 bg-amber-500 text-white font-extrabold text-[8px] px-1 rounded-sm shadow">
                          LEADER
                        </span>
                      ) : qtyInDeck > 0 ? (
                        <span className="absolute top-1 right-1 bg-primary text-primary-foreground font-black text-[9px] h-4 w-4 rounded-full flex items-center justify-center shadow">
                          {qtyInDeck}
                        </span>
                      ) : null}
                    </div>

                    <div className="mt-1.5 px-0.5 min-w-0">
                      <span className="text-[10px] font-bold block truncate" title={card.name}>
                        {card.name}
                      </span>
                      <span className="text-[8px] text-muted-foreground block leading-none mt-0.5">
                        {card.code} · Cost {card.cost ?? 0}
                      </span>
                      {user && !isLeader && (
                        <span className="text-[8px] text-muted-foreground font-medium block leading-none mt-1">
                          보유: {ownedQty}장
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
