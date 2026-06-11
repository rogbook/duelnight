import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { useUniqueSets } from "@/hooks/use-unique-sets";
import { useI18n } from "@/i18n/language-context";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { normalizeImageUrl } from "@/components/cards/card-uploader";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Loader2,
  Save,
  FolderOpen,
  ImageOff,
  ArrowRight,
  Trash2,
  Plus,
  Gamepad2,
  Pencil,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type CardRow = Database["public"]["Tables"]["cards"]["Row"];
type GameRow = Database["public"]["Tables"]["games"]["Row"];

const BUILTIN_GAME_CODES = new Set(["optcg", "ptcg", "dtcg"]);

export function SetConfigView() {
  const { language } = useI18n();
  const [games, setGames] = useState<GameRow[]>([]);
  const [gamesLoading, setGamesLoading] = useState(false);
  const [activeGame, setActiveGame] = useState<string>("");

  const { sets, loading: setsLoading, refreshSets } = useUniqueSets(activeGame || null);
  const [activeSet, setActiveSet] = useState<string>("");
  const [cards, setCards] = useState<CardRow[]>([]);
  const [cardsLoading, setCardsLoading] = useState(false);
  const [savingCode, setSavingCode] = useState<string | null>(null);
  const [editedSets, setEditedSets] = useState<Record<string, string>>({});

  const [newSetName, setNewSetName] = useState("");
  const [addingSet, setAddingSet] = useState(false);
  const [deletingSet, setDeletingSet] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [savingRename, setSavingRename] = useState(false);

  // 게임 추가 다이얼로그 상태
  const [gameDialogOpen, setGameDialogOpen] = useState(false);
  const [newGame, setNewGame] = useState({ code: "", label_ko: "", label_en: "", label_ja: "" });
  const [creatingGame, setCreatingGame] = useState(false);
  const [deletingGame, setDeletingGame] = useState(false);

  const gameLabel = (g: GameRow) =>
    language === "en" ? g.label_en : language === "ja" ? g.label_ja : g.label_ko;

  const activeGameRow = useMemo(
    () => games.find((g) => g.code === activeGame) ?? null,
    [games, activeGame],
  );

  // 게임 목록 로드
  const fetchGames = async () => {
    setGamesLoading(true);
    try {
      const { data, error } = await supabase
        .from("games")
        .select("*")
        .order("sort_order", { ascending: true })
        .order("code", { ascending: true });
      if (error) throw error;
      setGames(data ?? []);
      if (data && data.length > 0 && !activeGame) {
        setActiveGame(data[0].code);
      }
    } catch (e) {
      toast.error("게임 목록 로드 실패: " + (e as Error).message);
    } finally {
      setGamesLoading(false);
    }
  };

  useEffect(() => {
    fetchGames();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 게임 변경 시 활성 세트 초기화
  useEffect(() => {
    setActiveSet("");
    setCards([]);
  }, [activeGame]);

  // 세트 목록이 불러와졌을 때 첫 번째 세트를 활성화
  useEffect(() => {
    if (sets.length > 0 && !activeSet) {
      setActiveSet(sets[0]);
    } else if (sets.length === 0) {
      setActiveSet("");
      setCards([]);
    }
  }, [sets, activeSet]);

  // 세트 추가
  const handleCreateSet = async () => {
    const trimmedName = newSetName.trim();
    if (!trimmedName) {
      toast.error("세트 이름을 입력해 주세요.");
      return;
    }
    if (!activeGame) {
      toast.error("먼저 게임을 선택해 주세요.");
      return;
    }
    const isDup = sets.some((s) => s.toLowerCase() === trimmedName.toLowerCase());
    if (isDup) {
      toast.error("이 게임에 이미 존재하는 세트 이름입니다.");
      return;
    }

    setAddingSet(true);
    try {
      const { error } = await supabase
        .from("card_sets")
        .insert({ name: trimmedName, game: activeGame });
      if (error) throw error;

      toast.success(`신규 세트 [${trimmedName}]가 생성되었습니다.`);
      setNewSetName("");
      await refreshSets();
      setActiveSet(trimmedName);
    } catch (e) {
      toast.error("세트 추가 실패: " + (e as Error).message);
    } finally {
      setAddingSet(false);
    }
  };

  // 세트 이름 수정
  const handleRenameSet = async () => {
    const newName = renameValue.trim();
    if (!activeSet || activeSet === "미분류") {
      toast.error("수정할 수 없는 세트입니다.");
      return;
    }
    if (!newName) {
      toast.error("세트 이름을 입력해 주세요.");
      return;
    }
    if (newName === activeSet) {
      setRenaming(false);
      return;
    }
    if (sets.some((s) => s.toLowerCase() === newName.toLowerCase())) {
      toast.error("이 게임에 이미 존재하는 세트 이름입니다.");
      return;
    }
    setSavingRename(true);
    try {
      // 1) card_sets 이름 변경
      const { error: setErr } = await supabase
        .from("card_sets")
        .update({ name: newName })
        .eq("name", activeSet)
        .eq("game", activeGame);
      if (setErr) throw setErr;
      // 2) 소속 카드들의 set_code를 새 이름으로 갱신
      const { error: cardErr } = await supabase
        .from("cards")
        .update({ set_code: newName })
        .eq("set_code", activeSet);
      if (cardErr) throw cardErr;

      toast.success(`세트 이름이 [${newName}](으)로 변경되었습니다.`);
      setRenaming(false);
      await refreshSets();
      setActiveSet(newName);
    } catch (e) {
      toast.error("세트 이름 변경 실패: " + (e as Error).message);
    } finally {
      setSavingRename(false);
    }
  };

  // 세트 삭제
  const handleDeleteSet = async () => {
    if (!activeSet || activeSet === "미분류") {
      toast.error("삭제할 수 없는 세트이거나 세트가 선택되지 않았습니다.");
      return;
    }
    const confirmDel = window.confirm(
      `정말 [${activeSet}] 세트를 삭제하시겠습니까?\n이 세트에 등록된 카드는 모두 '미분류' 세트로 안전하게 이동하며, 해당 세트는 목록에서 완전히 소멸됩니다.`,
    );
    if (!confirmDel) return;

    setDeletingSet(true);
    try {
      await supabase.from("card_sets").upsert([{ name: "미분류", game: activeGame }], {
        onConflict: "game,name",
        ignoreDuplicates: true,
      });

      const { error: updErr } = await supabase
        .from("cards")
        .update({ set_code: "미분류" })
        .eq("set_code", activeSet);
      if (updErr) throw updErr;

      const { error: delErr } = await supabase
        .from("card_sets")
        .delete()
        .eq("name", activeSet)
        .eq("game", activeGame);
      if (delErr) throw delErr;

      toast.success(`[${activeSet}] 세트가 삭제되었습니다.`);
      await refreshSets();
      setActiveSet("");
    } catch (e) {
      toast.error("세트 삭제 실패: " + (e as Error).message);
    } finally {
      setDeletingSet(false);
    }
  };

  // 게임 추가
  const handleCreateGame = async () => {
    const code = newGame.code.trim().toLowerCase();
    const ko = newGame.label_ko.trim();
    const en = newGame.label_en.trim();
    const ja = newGame.label_ja.trim();
    if (!code || !ko || !en || !ja) {
      toast.error("모든 항목을 입력해 주세요.");
      return;
    }
    if (!/^[a-z0-9_]+$/.test(code)) {
      toast.error("게임 코드는 영문 소문자/숫자/언더스코어만 사용할 수 있습니다.");
      return;
    }
    setCreatingGame(true);
    try {
      const { error } = await supabase.from("games").insert({
        code,
        label_ko: ko,
        label_en: en,
        label_ja: ja,
        sort_order: 100,
        is_builtin: false,
      });
      if (error) throw error;
      toast.success(`게임 [${ko}]가 추가되었습니다.`);
      setGameDialogOpen(false);
      setNewGame({ code: "", label_ko: "", label_en: "", label_ja: "" });
      await fetchGames();
      setActiveGame(code);
    } catch (e) {
      toast.error("게임 추가 실패: " + (e as Error).message);
    } finally {
      setCreatingGame(false);
    }
  };

  // 게임 삭제 (커스텀 게임만)
  const handleDeleteGame = async () => {
    if (!activeGameRow || activeGameRow.is_builtin || BUILTIN_GAME_CODES.has(activeGameRow.code)) {
      toast.error("기본 게임은 삭제할 수 없습니다.");
      return;
    }
    if (sets.length > 0) {
      toast.error("이 게임에 등록된 세트를 먼저 모두 삭제해 주세요.");
      return;
    }
    const confirmDel = window.confirm(`게임 [${gameLabel(activeGameRow)}]를 삭제하시겠습니까?`);
    if (!confirmDel) return;
    setDeletingGame(true);
    try {
      const { error } = await supabase.from("games").delete().eq("code", activeGameRow.code);
      if (error) throw error;
      toast.success("게임이 삭제되었습니다.");
      await fetchGames();
      setActiveGame(games[0]?.code !== activeGameRow.code ? (games[0]?.code ?? "") : "");
    } catch (e) {
      toast.error("게임 삭제 실패: " + (e as Error).message);
    } finally {
      setDeletingGame(false);
    }
  };

  // 활성 세트의 카드 조회
  const fetchCardsOfSet = async (setCode: string) => {
    if (!setCode) {
      setCards([]);
      return;
    }
    setCardsLoading(true);
    try {
      const { data, error } = await supabase
        .from("cards")
        .select("*")
        .eq("set_code", setCode)
        .order("code", { ascending: true });
      if (error) throw error;
      setCards(data ?? []);
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

  const handleSaveSetChange = async (cardCode: string) => {
    const newSetCode = editedSets[cardCode]?.trim();
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
      toast.success(`${cardCode} 카드의 세트가 [${newSetCode}]로 이전되었습니다.`);
      await refreshSets();
      if (newSetCode !== activeSet) {
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
    <div className="space-y-4">
      {/* 게임 탭 바 */}
      <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-border bg-card p-1.5">
        {gamesLoading && games.length === 0 ? (
          <div className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" /> 게임 로딩 중...
          </div>
        ) : (
          games.map((g) => (
            <button
              key={g.code}
              type="button"
              onClick={() => setActiveGame(g.code)}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors flex items-center gap-1.5 ${
                activeGame === g.code
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              }`}
            >
              <Gamepad2 className="h-3 w-3" />
              {gameLabel(g)}
              <span className="text-[10px] opacity-70">({g.code})</span>
            </button>
          ))
        )}
        <Button
          variant="outline"
          size="sm"
          onClick={() => setGameDialogOpen(true)}
          className="h-7 px-2.5 text-xs"
        >
          <Plus className="h-3 w-3 mr-1" /> 게임 추가
        </Button>
        {activeGameRow &&
          !activeGameRow.is_builtin &&
          !BUILTIN_GAME_CODES.has(activeGameRow.code) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleDeleteGame}
              disabled={deletingGame}
              className="h-7 px-2 text-xs text-destructive hover:bg-destructive/10"
            >
              {deletingGame ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Trash2 className="h-3 w-3" />
              )}
            </Button>
          )}
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-4">
        {/* 좌측: 세트 목록 */}
        <Card className="md:col-span-1 border-border/80 shadow-md bg-gradient-to-b from-card to-muted/20">
          <CardHeader className="pb-3 border-b border-border/60">
            <CardTitle className="text-sm font-bold flex items-center gap-1.5 text-foreground/90">
              <FolderOpen className="h-4 w-4 text-primary" />
              {activeGameRow ? gameLabel(activeGameRow) : "게임"} 세트 ({sets.length})
            </CardTitle>
            <CardDescription className="text-[11px]">
              선택한 게임의 세트를 관리합니다.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-4 px-2 max-h-[600px] overflow-y-auto space-y-1">
            {setsLoading && sets.length === 0 ? (
              <div className="py-8 flex items-center justify-center text-xs text-muted-foreground gap-1.5">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> 세트 로드 중...
              </div>
            ) : sets.length === 0 ? (
              <div className="py-8 text-center text-xs text-muted-foreground">
                이 게임에 등록된 세트가 없습니다.
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
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded-full transition-colors ${
                      activeSet === s
                        ? "bg-primary-foreground/20 text-primary-foreground"
                        : "bg-muted-foreground/10 text-muted-foreground group-hover:bg-muted-foreground/20"
                    }`}
                  >
                    상세
                  </span>
                </button>
              ))
            )}

            <div className="mt-4 pt-4 border-t border-border/60 px-1 space-y-2">
              <Label className="text-[11px] font-bold text-muted-foreground flex items-center gap-1">
                <Plus className="h-3 w-3 text-primary" /> 신규 세트 추가
              </Label>
              <div className="flex gap-1">
                <Input
                  value={newSetName}
                  onChange={(e) => setNewSetName(e.target.value)}
                  placeholder="세트명 (예: OP05 부스터)"
                  className="h-8 text-xs bg-background border-border/80"
                  disabled={addingSet || !activeGame}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && newSetName.trim()) {
                      e.preventDefault();
                      handleCreateSet();
                    }
                  }}
                />
                <Button
                  size="sm"
                  onClick={handleCreateSet}
                  disabled={addingSet || !newSetName.trim() || !activeGame}
                  className="h-8 px-3 text-xs shrink-0"
                >
                  {addingSet ? <Loader2 className="h-3 w-3 animate-spin" /> : "추가"}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 우측: 선택된 세트의 카드 관리 */}
        <Card className="md:col-span-3 border-border/80 shadow-md">
          <CardHeader className="pb-3 border-b border-border/60 flex flex-row flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle className="text-base font-bold text-foreground/90 flex items-center gap-2">
                {renaming ? (
                  <span className="flex items-center gap-1">
                    <Input
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleRenameSet();
                        if (e.key === "Escape") setRenaming(false);
                      }}
                      autoFocus
                      disabled={savingRename}
                      placeholder="세트명"
                      className="h-7 w-64 text-xs"
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleRenameSet}
                      disabled={savingRename}
                      className="h-7 w-7 p-0 text-primary hover:bg-primary/10 rounded-full shrink-0"
                      title="저장"
                    >
                      {savingRename ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Save className="h-4 w-4" />
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setRenaming(false)}
                      disabled={savingRename}
                      className="h-7 w-7 p-0 text-muted-foreground hover:bg-accent rounded-full shrink-0"
                      title="취소"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </span>
                ) : (
                  <>
                    <Badge
                      variant="outline"
                      className="px-2 py-0.5 text-xs bg-primary/10 text-primary border-primary/20 font-bold"
                    >
                      {activeSet || "선택된 세트 없음"}
                    </Badge>
                    {activeSet && activeSet !== "미분류" && (
                      <>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setRenameValue(activeSet);
                            setRenaming(true);
                          }}
                          className="h-7 w-7 p-0 text-muted-foreground hover:bg-accent hover:text-foreground rounded-full shrink-0"
                          title="세트 이름 수정"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={handleDeleteSet}
                          disabled={deletingSet}
                          className="h-7 w-7 p-0 text-destructive hover:bg-destructive/10 hover:text-destructive rounded-full shrink-0"
                          title="세트 삭제"
                        >
                          {deletingSet ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4" />
                          )}
                        </Button>
                      </>
                    )}
                  </>
                )}
                <span className="text-xs font-semibold text-muted-foreground/80">
                  소속 카드 ({cards.length}장)
                </span>
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
                      <div className="flex h-12 w-9 shrink-0 items-center justify-center overflow-hidden rounded border border-border/80 bg-muted">
                        {img ? (
                          <img src={img} alt={c.name} className="h-full w-full object-cover" />
                        ) : (
                          <ImageOff className="h-3.5 w-3.5 text-muted-foreground/60" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-bold text-muted-foreground/80">
                            {c.code}
                          </span>
                          <span className="truncate text-xs font-semibold text-foreground/90">
                            {c.name}
                          </span>
                        </div>
                        <div className="mt-0.5 flex items-center gap-1.5 text-[10px] text-muted-foreground">
                          <span>{c.game}</span>
                          <span>·</span>
                          <span>{c.rarity || "레어도 미지정"}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 w-full sm:w-auto shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-border/40">
                        <div className="flex items-center gap-1">
                          <span className="text-[10px] font-bold text-muted-foreground/70">
                            {c.set_code}
                          </span>
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
                              <SelectItem key={s} value={s}>
                                {s}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button
                          size="sm"
                          variant={isChanged ? "default" : "outline"}
                          disabled={!isChanged || savingCode === c.code}
                          onClick={() => handleSaveSetChange(c.code)}
                          className="h-7 px-2.5 text-[11px]"
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

      {/* 게임 추가 다이얼로그 */}
      <Dialog open={gameDialogOpen} onOpenChange={setGameDialogOpen}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>신규 게임 추가</DialogTitle>
            <DialogDescription>
              관리자만 새 카드 게임을 등록할 수 있습니다. 게임을 추가하면 해당 게임 전용 세트를
              구성할 수 있습니다.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label className="text-xs">게임 코드 (영문, 예: ygotcg)</Label>
              <Input
                value={newGame.code}
                onChange={(e) => setNewGame((g) => ({ ...g, code: e.target.value }))}
                placeholder="ygotcg"
                className="h-8 text-sm"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">한국어 이름</Label>
              <Input
                value={newGame.label_ko}
                onChange={(e) => setNewGame((g) => ({ ...g, label_ko: e.target.value }))}
                placeholder="유희왕"
                className="h-8 text-sm"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">English Name</Label>
              <Input
                value={newGame.label_en}
                onChange={(e) => setNewGame((g) => ({ ...g, label_en: e.target.value }))}
                placeholder="Yu-Gi-Oh!"
                className="h-8 text-sm"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">日本語名</Label>
              <Input
                value={newGame.label_ja}
                onChange={(e) => setNewGame((g) => ({ ...g, label_ja: e.target.value }))}
                placeholder="遊戯王"
                className="h-8 text-sm"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setGameDialogOpen(false)}
              disabled={creatingGame}
            >
              취소
            </Button>
            <Button onClick={handleCreateGame} disabled={creatingGame}>
              {creatingGame ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
              게임 추가
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
