import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Search, Trash2, ZoomIn, AlertTriangle, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  CARD_TYPES_BY_GAME, DECK_MAX_TOTAL, DIGIMON_LEVELS,
  BAN_LIST, checkCanAdd, type Game,
} from "@/lib/deck-rules";
import { COLORS_BY_GAME, colorHex } from "@/lib/deck-colors";
import type { Tables } from "@/integrations/supabase/types";

type Deck     = Tables<"decks">;
type CardRow  = Tables<"cards">;
type DeckCard = Tables<"deck_cards">;

export function RecipeEditor({ deck }: { deck: Deck }) {
  const qc  = useQueryClient();
  const game = deck.game as Game;

  /* ── Filter state ── */
  const [q,            setQ]            = useState("");
  const [filterType,   setFilterType]   = useState("all");
  const [filterColor,  setFilterColor]  = useState("all");
  const [filterSet,    setFilterSet]    = useState("all");
  const [filterRarity, setFilterRarity] = useState("all");
  const [filterLevel,  setFilterLevel]  = useState("all");
  const [zoomCard,     setZoomCard]     = useState<{ url: string; name: string } | null>(null);

  /* ── Deck cards ── */
  const { data: deckCards = [], refetch } = useQuery<DeckCard[]>({
    queryKey: ["deck-cards", deck.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("deck_cards").select("*").eq("deck_id", deck.id)
        .order("position", { ascending: true });
      if (error) throw error;
      return (data ?? []) as DeckCard[];
    },
  });

  /* ── Card metadata map ── */
  const codes = deckCards.map((c) => c.card_code);
  const { data: cardMapData = {} as Record<string, CardRow> } = useQuery<Record<string, CardRow>>({
    queryKey: ["deck-cards-meta", deck.id, [...codes].sort().join(",")],
    enabled: codes.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.from("cards").select("*").in("code", codes);
      if (error) throw error;
      const m: Record<string, CardRow> = {};
      for (const c of data ?? []) m[c.code] = c as CardRow;
      return m;
    },
  });
  const cardMap = useMemo(
    () => ({ get: (code: string) => cardMapData[code] }),
    [cardMapData],
  );

  /* ── Search results ── */
  const { data: searchResults = [], isFetching } = useQuery({
    queryKey: ["deck-search", game, q, filterType, filterColor, filterSet, filterRarity, filterLevel],
    queryFn: async () => {
      let qb = supabase.from("cards").select("*").eq("game", game).order("name", { ascending: true }).limit(150);
      if (q.trim())           qb = qb.or(`name.ilike.%${q.trim()}%,code.ilike.%${q.trim()}%`);
      if (filterType  !== "all") qb = qb.eq("type", filterType as CardRow["type"]);
      if (filterColor !== "all") qb = qb.contains("colors", [filterColor]);
      if (filterSet   !== "all") qb = qb.eq("set_code", filterSet);
      if (filterRarity!== "all") qb = qb.eq("rarity", filterRarity);
      
      // Game-specific attribute filtering
      if (filterLevel !== "all") {
        if (game === "dtcg") {
          // 디지몬 레벨 필터링 (Lv.2, Lv.3 등)
          qb = qb.ilike("attribute", `%Lv.${filterLevel}%`);
        }
        if (game === "ptcg") {
          // 포켓몬 진화 단계 필터링 (기본, 1진화 등)
          qb = qb.ilike("attribute", `%${filterLevel}%`);
        }
      }

      const { data, error } = await qb;
      if (error) throw error;
      return data ?? [];
    },
  });

  /* ── Grouping & Stats ── */
  const groupedResults = useMemo(() => {
    const groups = new Map<string, CardRow[]>();
    for (const card of searchResults) {
      const existing = groups.get(card.name) ?? [];
      groups.set(card.name, [...existing, card as CardRow]);
    }
    return Array.from(groups.values());
  }, [searchResults]);

  const totalCards = useMemo(() => deckCards.reduce((s, c) => s + c.quantity, 0), [deckCards]);
  const digitamaCount = useMemo(() => {
    if (game !== "dtcg") return 0;
    return deckCards.reduce((s, dc) => {
      const card = cardMap.get(dc.card_code);
      return (card?.type as string) === "digitama" ? s + dc.quantity : s;
    }, 0);
  }, [deckCards, cardMap, game]);

  const hasAceInDeck = useMemo(() => {
    if (game !== "ptcg") return false;
    return deckCards.some(dc => {
      const card = cardMap.get(dc.card_code);
      return card?.type?.toLowerCase() === "ace" || card?.rarity?.toUpperCase() === "ACE";
    });
  }, [deckCards, cardMap, game]);

  const getQty = (code: string) => deckCards.find((c) => c.card_code === code)?.quantity ?? 0;
  const openZoom = (url: string | null | undefined, name: string | null | undefined) => {
    if (!url) return;
    setZoomCard({ url, name: name ?? "카드 이미지" });
  };

  /* ── Available filter options ── */
  const { data: sets = [] } = useQuery<string[]>({
    queryKey: ["card-sets", game],
    queryFn: async () => {
      const { data } = await supabase.from("cards").select("set_code").eq("game", game);
      return [...new Set((data ?? []).map((c) => c.set_code).filter(Boolean) as string[])].sort();
    },
  });
  const { data: rarities = [] } = useQuery<string[]>({
    queryKey: ["card-rarities", game],
    queryFn: async () => {
      const { data } = await supabase.from("cards").select("rarity").eq("game", game).not("rarity", "is", null);
      return [...new Set((data ?? []).map((c) => c.rarity).filter(Boolean) as string[])].sort();
    },
  });

  /* ── Handlers ── */
  const addCard = async (card: Pick<CardRow, "code" | "type" | "rarity" | "name">) => {
    const check = checkCanAdd({
      game, cardCode: card.code, cardType: card.type, rarity: card.rarity, name: card.name,
      currentQtyOfCode: getQty(card.code),
      totalCardsInDeck: totalCards,
      digitamaCountInDeck: digitamaCount,
      hasAceInDeck,
    });
    if (!check.ok) { toast.error(check.reason); return; }

    const existing = deckCards.find((c) => c.card_code === card.code);
    if (existing) { await updateQty(existing.id, existing.quantity + 1); return; }
    const { error } = await supabase.from("deck_cards").insert({
      deck_id: deck.id, card_code: card.code, quantity: 1, position: deckCards.length,
    });
    if (error) { toast.error(error.message); return; }
    refetch();
    qc.invalidateQueries({ queryKey: ["deck-cards"] });
  };

  const updateQty = async (id: string, qty: number) => {
    if (qty < 1) await supabase.from("deck_cards").delete().eq("id", id);
    else         await supabase.from("deck_cards").update({ quantity: qty }).eq("id", id);
    refetch();
  };

  const removeCard = async (id: string) => {
    await supabase.from("deck_cards").delete().eq("id", id);
    refetch();
    qc.invalidateQueries({ queryKey: ["deck-cards"] });
  };

  const colors = COLORS_BY_GAME[game] ?? [];
  const types  = CARD_TYPES_BY_GAME[game] ?? [];
  const maxTotal = DECK_MAX_TOTAL[game];
  const pokemonStages = ["기본", "1진화", "2진화", "EX", "메가진화"];

  return (
    <div className="space-y-4">
      {zoomCard && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-background/90 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label={`${zoomCard.name} 확대 이미지`}
          onClick={() => setZoomCard(null)}
        >
          <button
            type="button"
            className="absolute right-4 top-4 inline-flex h-10 w-10 items-center justify-center rounded-full border border-border bg-card text-foreground shadow-sm transition-opacity hover:opacity-80"
            onClick={() => setZoomCard(null)}
            aria-label="확대 이미지 닫기"
          >
            <X className="h-5 w-5" />
          </button>
          <img
            src={zoomCard.url}
            alt={`${zoomCard.name} 확대`}
            className="max-h-[88vh] max-w-[92vw] rounded-lg border border-border bg-card object-contain shadow-lg"
            onClick={(event) => event.stopPropagation()}
          />
        </div>
      )}

      {/* ── Deck Status ── */}
      <div className="rounded-md border border-border bg-muted/20 p-3">
        <div className="flex items-center justify-between text-xs font-medium">
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">내 덱:</span>
            <span className={totalCards > maxTotal ? "text-destructive font-bold" : ""}>{totalCards}</span>
            <span className="text-muted-foreground">/ {maxTotal}</span>
          </div>
          {game === "dtcg" && <span>디지타마 {digitamaCount} / 5</span>}
          {game === "ptcg" && hasAceInDeck && <span className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full font-bold border border-blue-200">ACE SPEC</span>}
        </div>

        {/* 비주얼 레시피: 수량만큼 카드 이미지를 펼쳐서 표시 */}
        {deckCards.length > 0 && (
          <div className="mt-3 grid grid-cols-5 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 gap-1.5">
            {deckCards.flatMap(dc => {
              const card = cardMap.get(dc.card_code);
              return Array.from({ length: dc.quantity }).map((_, i) => (
                <button
                  key={`${dc.id}-${i}`}
                  type="button"
                  onClick={() => openZoom(card?.image_url, card?.name ?? dc.card_code)}
                  className="relative aspect-[2/3] overflow-hidden rounded border border-border bg-muted shadow-sm hover:ring-2 hover:ring-primary/40 transition-all touch-manipulation"
                  title={`${card?.name ?? dc.card_code} (${i + 1}/${dc.quantity})`}
                  aria-label={card?.name ?? dc.card_code}
                >
                  {card?.image_url ? (
                    <img src={card.image_url} alt={card.name ?? dc.card_code} loading="lazy" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center p-1 text-[8px] text-muted-foreground text-center break-all">
                      {card?.name ?? dc.card_code}
                    </div>
                  )}
                </button>
              ));
            })}
          </div>
        )}

        {/* 편집용 리스트 (수량 +/- / 삭제) */}
        <ul className="mt-3 space-y-1.5 max-h-48 overflow-y-auto pr-1">
          {deckCards.map(dc => {
            const card = cardMap.get(dc.card_code);
            return (
              <li key={dc.id} className="flex items-center gap-2 text-xs bg-card p-1.5 rounded border border-border">
                {card?.image_url ? (
                   <button type="button" className="h-8 w-6 shrink-0 overflow-hidden rounded" onClick={() => openZoom(card.image_url, card.name ?? dc.card_code)} aria-label={`${card.name ?? dc.card_code} 확대 보기`}>
                     <img src={card.image_url} alt={card.name ?? dc.card_code} className="h-full w-full object-cover" />
                   </button>
                ) : (
                   <div className="h-8 w-6 bg-muted rounded" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="truncate font-medium">{card?.name ?? dc.card_code}</p>
                </div>
                <div className="flex items-center gap-1.5">
                  <button onClick={() => updateQty(dc.id, dc.quantity - 1)} className="h-8 w-8 inline-flex items-center justify-center hover:bg-muted rounded touch-manipulation" aria-label="수량 감소">−</button>
                  <span className="w-5 text-center tabular-nums">{dc.quantity}</span>
                  <button onClick={() => card && addCard(card)} className="h-8 w-8 inline-flex items-center justify-center hover:bg-muted rounded touch-manipulation" aria-label="수량 증가">+</button>
                  <button onClick={() => removeCard(dc.id)} className="h-8 w-8 ml-1 inline-flex items-center justify-center text-muted-foreground hover:text-destructive touch-manipulation" aria-label="카드 제거"><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
              </li>
            );
          })}
        </ul>
      </div>


      {/* ── Search & Filter ── */}
      <div className="space-y-2.5">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input value={q} onChange={e => setQ(e.target.value)} placeholder="카드 이름 또는 코드로 검색" className="pl-8 h-9 text-xs" />
        </div>
        
        <div className="flex flex-wrap gap-1.5">
          <Select value={filterType} onValueChange={setFilterType}>
            <SelectTrigger className="h-8 text-[11px] w-auto min-w-[85px]"><SelectValue placeholder="종류" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">전체 종류</SelectItem>
              {types.map(t => <SelectItem key={t.id} value={t.id}>{t.label}</SelectItem>)}
            </SelectContent>
          </Select>

          {colors.length > 0 && (
            <Select value={filterColor} onValueChange={setFilterColor}>
              <SelectTrigger className="h-8 text-[11px] w-auto min-w-[85px]"><SelectValue placeholder="색상/타입" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">전체 색상</SelectItem>
                {colors.map(c => (
                   <SelectItem key={c.id} value={c.id}>
                     <div className="flex items-center gap-2">
                       <div className="w-2 h-2 rounded-full" style={{ backgroundColor: colorHex(game, c.id) }} />
                       {c.label}
                     </div>
                   </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {game === "dtcg" && (
            <Select value={filterLevel} onValueChange={setFilterLevel}>
              <SelectTrigger className="h-8 text-[11px] w-auto min-w-[70px]"><SelectValue placeholder="레벨" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Lv.전체</SelectItem>
                {DIGIMON_LEVELS.map(lv => <SelectItem key={lv} value={lv}>Lv.{lv}</SelectItem>)}
              </SelectContent>
            </Select>
          )}

          {game === "ptcg" && (
            <Select value={filterLevel} onValueChange={setFilterLevel}>
              <SelectTrigger className="h-8 text-[11px] w-auto min-w-[85px]"><SelectValue placeholder="진화 단계" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">진화 전체</SelectItem>
                {pokemonStages.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          )}

          <Select value={filterSet} onValueChange={setFilterSet}>
            <SelectTrigger className="h-8 text-[11px] w-auto min-w-[85px]"><SelectValue placeholder="세트" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">전체 세트</SelectItem>
              {sets.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* ── Results ── */}
      <div className="space-y-3 max-h-[450px] overflow-y-auto pr-1">
        {isFetching && <p className="text-xs text-center py-6 text-muted-foreground">카드를 찾는 중...</p>}
        {!isFetching && groupedResults.length === 0 && <p className="text-xs text-center py-6 text-muted-foreground">검색 결과가 없습니다.</p>}
        
        {groupedResults.map((versions) => {
          const main = versions[0];
          const banned = BAN_LIST.has(main.code);
          const isLeaderColor = game === "optcg" && deck.colors?.some(c => main.colors?.includes(c));

          return (
            <div key={main.name} className={`rounded-xl border p-3.5 space-y-3.5 transition-colors ${isLeaderColor ? "border-primary/40 bg-primary/5 shadow-sm" : "border-border bg-card"}`}>
              <div className="flex gap-4">
                <button onClick={() => openZoom(main.image_url, main.name)} className="relative shrink-0 group self-start">
                  <img src={main.image_url ?? ""} className="h-24 w-16 rounded-md object-cover shadow-md" />
                  <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity rounded-md"><ZoomIn className="h-5 w-5 text-white" /></div>
                </button>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-sm truncate text-foreground">{main.name}</h3>
                    {isLeaderColor && <span className="text-[9px] bg-primary text-primary-foreground px-1.5 py-0.5 rounded-full font-bold">리더색</span>}
                  </div>
                  <div className="flex flex-wrap gap-x-2 gap-y-1 mt-1 text-[10px] text-muted-foreground">
                    <span className="font-medium text-foreground">{main.type}</span>
                    <span>|</span>
                    <span>{main.set_code}</span>
                    {main.rarity && <span>| {main.rarity}</span>}
                  </div>

                  <div className="mt-2.5 space-y-1">
                    {game === "dtcg" && (
                      <div className="flex gap-2">
                        {main.attribute && <span className="text-[10px] bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded border border-blue-100">{main.attribute}</span>}
                        {main.power && <span className="text-[10px] bg-orange-50 text-orange-600 px-1.5 py-0.5 rounded border border-orange-100">{main.power} DP</span>}
                      </div>
                    )}
                    {game === "ptcg" && (
                      <div className="flex flex-wrap gap-2">
                        {main.attribute && <span className="text-[10px] bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded">{main.attribute}</span>}
                        {main.power && <span className="text-[10px] font-bold text-red-600">HP {main.power}</span>}
                      </div>
                    )}
                    {game === "optcg" && main.power && (
                      <span className="text-[10px] font-bold text-foreground">Power {main.power}</span>
                    )}
                    {main.effect && (
                      <p className="text-[10px] text-muted-foreground line-clamp-2 leading-relaxed mt-1 italic">{main.effect}</p>
                    )}
                  </div>

                  {banned && (
                    <div className="mt-3 flex items-start gap-1.5 rounded-lg bg-destructive/10 p-2 text-[10px] text-destructive border border-destructive/20 font-medium">
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                      <p>이 카드는 금지/제한 리스트에 영향을 받습니다.</p>
                    </div>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-1.5">
                {versions.map(v => (
                  <div key={v.code} className="flex items-center justify-between bg-muted/30 rounded-lg px-3 py-2 text-[11px] border border-transparent hover:border-border transition-all">
                    <div className="flex flex-col">
                      <span className="font-bold">{v.rarity || "Normal"}</span>
                      <span className="text-[9px] text-muted-foreground">{v.code}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      {getQty(v.code) > 0 && <span className="font-black text-primary text-xs">× {getQty(v.code)}</span>}
                      <button onClick={() => addCard(v)} className="bg-foreground text-background px-3 py-1.5 rounded-md text-[10px] font-bold hover:scale-105 active:scale-95 transition-transform">추가하기</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <div className="pt-2">
        <button 
          onClick={() => {
            qc.invalidateQueries({ queryKey: ["decks"] });
            toast.success("덱 레시피가 저장되었습니다.");
          }}
          className="w-full bg-primary text-primary-foreground py-2.5 rounded-lg font-bold text-sm shadow-md hover:opacity-90 transition-opacity"
        >
          편집 완료 및 저장
        </button>
      </div>
    </div>
  );
}
