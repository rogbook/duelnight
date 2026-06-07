import { useState, useEffect, useMemo } from "react";
import { Plus, Pencil, Check, X, ChevronsUpDown } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { toast } from "sonner";

import { normalizeDeckName } from "@/lib/normalize-deck";
import {
  COLORS_BY_GAME,
  HAS_LEADER,
  REQUIRES_MULTI_COLOR,
  colorHex,
  colorLabel,
  type Game,
} from "@/lib/deck-colors";
import type { Tables } from "@/integrations/supabase/types";
import { useI18n } from "@/i18n/language-context";
import { useGames } from "@/hooks/use-games";


type Deck = Tables<"decks">;

function LeaderPicker({
  game,
  value,
  onChange,
}: {
  game: Game;
  value: string;
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const { data: leaders = [], isLoading } = useQuery({
    queryKey: ["leader-options", game],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cards")
        .select("code,name,image_url")
        .eq("game", game)
        .eq("type", "leader")
        .eq("status", "approved")
        .order("name", { ascending: true })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as { code: string; name: string; image_url: string | null }[];
    },
  });

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return leaders;
    return leaders.filter((l) => l.name.toLowerCase().includes(q));
  }, [leaders, query]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background hover:bg-accent/50"
        >
          <span className={value ? "text-foreground" : "text-muted-foreground"}>
            {value || "리더 카드를 선택하세요"}
          </span>
          <ChevronsUpDown className="h-4 w-4 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <div className="border-b p-2">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="리더 이름 검색"
            className="h-8"
            autoFocus
          />
        </div>
        <div className="max-h-64 overflow-y-auto py-1">
          {isLoading ? (
            <div className="px-3 py-6 text-center text-xs text-muted-foreground">불러오는 중...</div>
          ) : filtered.length === 0 ? (
            <div className="px-3 py-6 text-center text-xs text-muted-foreground">
              {leaders.length === 0
                ? "등록된 리더 카드가 없습니다. 카드 DB에 추가해 주세요."
                : "검색 결과가 없습니다."}
            </div>
          ) : (
            filtered.map((l) => (
              <button
                key={l.code}
                type="button"
                onClick={() => {
                  onChange(l.name);
                  setOpen(false);
                }}
                className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-accent ${
                  value === l.name ? "bg-accent/60 font-medium" : ""
                }`}
              >
                {l.image_url ? (
                  <img src={l.image_url} alt={l.name} className="h-8 w-6 rounded object-cover" />
                ) : (
                  <div className="h-8 w-6 rounded bg-muted" />
                )}
                <span className="flex-1 truncate">{l.name}</span>
                <span className="text-[10px] text-muted-foreground">{l.code}</span>
                {value === l.name && <Check className="h-3.5 w-3.5 text-primary" />}
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

interface DeckDialogProps {
  mode: "create" | "edit";
  deck?: Deck;
  onSaved?: (deck: Deck) => void;
  trigger?: React.ReactNode;
}

export function DeckDialog({ mode, deck, onSaved, trigger }: DeckDialogProps) {
  const { games: gameOptions, labelOf } = useGames();
  const qc = useQueryClient();
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);


  const [game, setGame] = useState<Game>("optcg");
  const [name, setName] = useState("");
  const [leader, setLeader] = useState("");
  const [archetype, setArchetype] = useState("");
  const [notes, setNotes] = useState("");
  const [isPublic, setIsPublic] = useState(true);
  const [colors, setColors] = useState<string[]>([]);

  useEffect(() => {
    if (open) {
      if (mode === "edit" && deck) {
        setGame(deck.game as Game);
        setName(deck.name);
        setLeader(deck.leader ?? "");
        setArchetype(deck.archetype ?? "");
        setNotes(deck.notes ?? "");
        setIsPublic(deck.is_public);
        setColors(deck.colors ?? []);
      } else {
        setName("");
        setLeader("");
        setArchetype("");
        setNotes("");
        setColors([]);
      }
    }
  }, [open, mode, deck]);

  const toggleColor = (c: string) => {
    setColors((prev) =>
      prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c],
    );
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return toast.error("덱 이름을 입력해 주세요.");
    if (colors.length === 0) return toast.error("최소 1개 이상의 색상을 선택해 주세요.");
    
    setBusy(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("인증이 필요합니다.");

      const payload = {
        name: name.trim(),
        game,
        leader: HAS_LEADER[game] ? leader.trim() : null,
        archetype: archetype.trim(),
        notes: notes.trim(),
        is_public: isPublic,
        colors,
        user_id: user.id,
      };

      if (mode === "create") {
        const { data, error } = await supabase.from("decks").insert(payload).select().single();
        if (error) throw error;
        toast.success("덱이 생성되었습니다.");
        onSaved?.(data as Deck);
      } else {
        const { data, error } = await supabase
          .from("decks")
          .update(payload)
          .eq("id", deck!.id)
          .select()
          .single();
        if (error) throw error;
        toast.success("덱 정보가 수정되었습니다.");
        onSaved?.(data as Deck);
      }
      setOpen(false);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <button className="rounded p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground">
            {mode === "create" ? <Plus className="h-4 w-4" /> : <Pencil className="h-4 w-4" />}
          </button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{mode === "create" ? "새 덱 만들기" : "덱 정보 수정"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="grid grid-cols-2 gap-4 pt-2">
          <div className="col-span-2 space-y-2">
            <Label>게임 선택</Label>
            <Select
              disabled={mode === "edit"}
              value={game}
              onValueChange={(v) => {
                setGame(v as Game);
                setColors([]);
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {gameOptions.map((g) => (
                  <SelectItem key={g.code} value={g.code}>{labelOf(g.code)}</SelectItem>
                ))}
              </SelectContent>

            </Select>
          </div>

          <div className="col-span-2 space-y-2">
            <Label>덱 이름</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="멋진 덱 이름을 지어주세요"
            />
          </div>

          <div className="col-span-2 space-y-2">
            <Label>색상 선택 ({REQUIRES_MULTI_COLOR[game] ? "2개 이상" : "1개 이상"})</Label>
            <div className="flex flex-wrap gap-2">
              {COLORS_BY_GAME[game].map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => toggleColor(c.id)}
                  className={`flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs transition-colors ${
                    colors.includes(c.id)
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-background text-muted-foreground hover:bg-accent"
                  }`}
                >
                  <span
                    className="h-2 w-2 rounded-full ring-1 ring-border"
                    style={{ backgroundColor: colorHex(game, c.id) }}
                  />
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          {HAS_LEADER[game] && (
            <div className="col-span-2 space-y-2">
              <Label>리더</Label>
              <LeaderPicker game={game} value={leader} onChange={setLeader} />
            </div>
          )}

          <div className="col-span-2 space-y-2">
            <Label>아키타입</Label>
            <Input
              value={archetype}
              onChange={(e) => setArchetype(e.target.value)}
              placeholder="예: 조로 래피드, 청도미"
            />
          </div>

          <div className="col-span-2 space-y-2">
            <Label>메모</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="덱 운용법이나 상세 설명을 적어보세요"
              rows={3}
            />
          </div>

          <div className="col-span-2 flex items-center justify-between rounded-lg border border-border p-3">
            <div className="space-y-0.5">
              <Label className="text-xs">공개 여부</Label>
              <p className="text-[10px] text-muted-foreground">공개 시 다른 유저가 이 덱을 볼 수 있습니다.</p>
            </div>
            <button
              type="button"
              onClick={() => setIsPublic(!isPublic)}
              className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                isPublic ? "bg-primary" : "bg-muted"
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                  isPublic ? "translate-x-4" : "translate-x-0"
                }`}
              />
            </button>
          </div>

          <div className="col-span-2 flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>취소</Button>
            <Button type="submit" disabled={busy}>{busy ? "저장 중..." : "저장"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
