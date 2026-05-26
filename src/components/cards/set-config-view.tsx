import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { useUniqueSets } from "@/hooks/use-unique-sets";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { normalizeImageUrl } from "@/components/cards/card-uploader";
import { Loader2, Save, FolderOpen, ImageOff, ArrowRight } from "lucide-react";
import { toast } from "sonner";

type CardRow = Database["public"]["Tables"]["cards"]["Row"];
type Game = Database["public"]["Enums"]["tcg_game"];

const GAME_LABEL: Record<Game, string> = { optcg: "원피스", ptcg: "포켓몬", dtcg: "디지몬" };

export function SetConfigView() {
  const { sets, loading: setsLoading, refreshSets } = useUniqueSets();
  const [activeSet, setActiveSet] = useState<string>("");
  const [cards, setCards] = useState<CardRow[]>([]);
  const [cardsLoading, setCardsLoading] = useState(false);
  const [savingCode, setSavingCode] = useState<string | null>(null);
  const [editedSets, setEditedSets] = useState<Record<string, string>>({});

  // 세트 목록이 불러와졌을 때 첫 번째 세트를 활성화
  useEffect(() => {
    if (sets.length > 0 && !activeSet) {
      setActiveSet(sets[0]);
    }
  }, [sets, activeSet]);

  // 활성 세트가 변경될 때 소속 카드 조회
  const fetchCardsOfSet = async (setCode: string) => {
    if (!setCode) return;
    setCardsLoading(true);
    try {
      const { data, error } = await supabase
        .from("cards")
        .select("*")
        .eq("set_code", setCode)
        .order("code", { ascending: true });
      if (error) throw error;
      setCards(data ?? []);
      
      // 임시 편집 데이터 초기화
      const initialEdits: Record<string, string> = {};
      (data ?? []).forEach((c) => {
        initialEdits[c.code] = c.set_code;
      });
      setEditedSets(initialEdits);
    } catch (e) {
      toast.error("카드 조회 실패: " + (e as Error).message);
    } finally {
      setCardsLoading(false);
    }
  };

  useEffect(() => {
    fetchCardsOfSet(activeSet);
  }, [activeSet]);

  // 개별 카드 세트 수정 처리
  const handleSaveSetChange = async (cardCode: string) => {
    const newSetCode = editedSets[cardCode]?.trim().toUpperCase();
    if (!newSetCode) {
      toast.error("세트 코드는 비워둘 수 없습니다");
      return;
    }

    setSavingCode(cardCode);
    try {
      const { error } = await supabase
        .from("cards")
        .update({ set_code: newSetCode })
        .eq("code", cardCode);
      if (error) throw error;

      toast.success(`${cardCode} 카드의 세트가 [${newSetCode}]로 성공적으로 이전되었습니다.`);
      
      // 세트 목록 및 소속 카드 리스트 갱신
      await refreshSets();
      if (newSetCode !== activeSet) {
        // 소속 세트가 바뀌었다면 현재 목록에서 해당 카드를 즉시 제거
        setCards((prev) => prev.filter((c) => c.code !== cardCode));
      } else {
        await fetchCardsOfSet(activeSet);
      }
    } catch (e) {
      toast.error("저장 실패: " + (e as Error).message);
    } finally {
      setSavingCode(null);
    }
  };

  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-4">
      {/* 1. 좌측: 세트 목록 사이드바 */}
      <Card className="md:col-span-1 border-border/80 shadow-md bg-gradient-to-b from-card to-muted/20">
        <CardHeader className="pb-3 border-b border-border/60">
          <CardTitle className="text-sm font-bold flex items-center gap-1.5 text-foreground/90">
            <FolderOpen className="h-4 w-4 text-primary" />
            세트 목록 ({sets.length})
          </CardTitle>
          <CardDescription className="text-[11px]">
            관리할 세트를 골라 카드들을 조회합니다.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-4 px-2 max-h-[600px] overflow-y-auto space-y-1">
          {setsLoading && sets.length === 0 ? (
            <div className="py-8 flex items-center justify-center text-xs text-muted-foreground gap-1.5">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> 세트 로드 중...
            </div>
          ) : sets.length === 0 ? (
            <div className="py-8 text-center text-xs text-muted-foreground">
              등록된 세트가 없습니다.
            </div>
          ) : (
            sets.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setActiveSet(s)}
                className={`w-full text-left px-3 py-2 text-xs font-medium rounded-md transition-all duration-200 flex items-center justify-between group ${
                  activeSet === s
                    ? "bg-primary text-primary-foreground shadow-sm shadow-primary/20 scale-[1.01]"
                    : "hover:bg-muted text-muted-foreground hover:text-foreground"
                }`}
              >
                <span>{s}</span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full transition-colors ${
                  activeSet === s 
                    ? "bg-primary-foreground/20 text-primary-foreground" 
                    : "bg-muted-foreground/10 text-muted-foreground group-hover:bg-muted-foreground/20"
                }`}>
                  상세
                </span>
              </button>
            ))
          )}
        </CardContent>
      </Card>

      {/* 2. 우측: 선택된 세트의 카드 관리 영역 */}
      <Card className="md:col-span-3 border-border/80 shadow-md">
        <CardHeader className="pb-3 border-b border-border/60 flex flex-row flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle className="text-base font-bold text-foreground/90 flex items-center gap-2">
              <Badge variant="outline" className="px-2 py-0.5 text-xs bg-primary/10 text-primary border-primary/20 font-bold">
                {activeSet || "선택된 세트 없음"}
              </Badge>
              소속 카드 ({cards.length}장)
            </CardTitle>
            <CardDescription className="text-xs mt-1">
              각 카드별 소속 세트 코드를 편집하고 이동시킬 수 있습니다.
            </CardDescription>
          </div>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => fetchCardsOfSet(activeSet)}
            disabled={cardsLoading || !activeSet}
            className="text-[11px]"
          >
            {cardsLoading ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
            새로고침
          </Button>
        </CardHeader>
        <CardContent className="pt-4 max-h-[600px] overflow-y-auto">
          {cardsLoading && cards.length === 0 ? (
            <div className="py-16 flex flex-col items-center justify-center text-xs text-muted-foreground gap-2">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
              <span>카드를 불러오는 중입니다...</span>
            </div>
          ) : cards.length === 0 ? (
            <div className="py-16 text-center text-xs text-muted-foreground border border-dashed border-border rounded-lg bg-muted/5">
              이 세트에 등록된 카드가 비어있거나 없습니다.
            </div>
          ) : (
            <div className="space-y-2">
              {cards.map((c) => {
                const img = normalizeImageUrl(c.image_url);
                const currentEditVal = editedSets[c.code] ?? c.set_code;
                const isChanged = currentEditVal !== c.set_code;

                return (
                  <div 
                    key={c.code} 
                    className="flex flex-col sm:flex-row items-start sm:items-center gap-3 p-3 rounded-lg border border-border/70 hover:border-border bg-card/50 hover:bg-card transition-all duration-200"
                  >
                    {/* 카드 썸네일 */}
                    <div className="flex h-12 w-9 shrink-0 items-center justify-center overflow-hidden rounded border border-border/80 bg-muted">
                      {img ? (
                        <img src={img} alt={c.name} className="h-full w-full object-cover" />
                      ) : (
                        <ImageOff className="h-3.5 w-3.5 text-muted-foreground/60" />
                      )}
                    </div>

                    {/* 카드 정보 */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-bold text-muted-foreground/80">{c.code}</span>
                        <span className="truncate text-xs font-semibold text-foreground/90">{c.name}</span>
                      </div>
                      <div className="mt-0.5 flex items-center gap-1.5 text-[10px] text-muted-foreground">
                        <span>{GAME_LABEL[c.game]}</span>
                        <span>·</span>
                        <span>{c.rarity || "레어도 미지정"}</span>
                      </div>
                    </div>

                    {/* 세트 편집 인터페이스 */}
                    <div className="flex items-center gap-2 w-full sm:w-auto shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-border/40">
                      <div className="flex items-center gap-1">
                        <span className="text-[10px] font-bold text-muted-foreground/70">{c.set_code}</span>
                        <ArrowRight className="h-3 w-3 text-muted-foreground/50" />
                      </div>
                      
                      <Select
                        value={currentEditVal}
                        onValueChange={(v) => setEditedSets((prev) => ({ ...prev, [c.code]: v }))}
                      >
                        <SelectTrigger className="h-7 text-xs w-28 bg-background border-border/80">
                          <SelectValue placeholder="세트 선택" />
                        </SelectTrigger>
                        <SelectContent>
                          {sets.map((s) => (
                            <SelectItem key={s} value={s}>{s}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

                      <Button
                        size="sm"
                        variant={isChanged ? "default" : "outline"}
                        disabled={!isChanged || savingCode === c.code}
                        onClick={() => handleSaveSetChange(c.code)}
                        className="h-7 px-2.5 text-xs text-[11px]"
                      >
                        {savingCode === c.code ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <>
                            <Save className="h-3 w-3 mr-1" />
                            저장
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
