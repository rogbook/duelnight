import { useState } from "react";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

type CardRow = Database["public"]["Tables"]["cards"]["Row"];
type Game = Database["public"]["Enums"]["tcg_game"];
type CardType = Database["public"]["Enums"]["card_type"];

const GAME_LABEL: Record<Game, string> = { optcg: "원피스", ptcg: "포켓몬", dtcg: "디지몬" };
const TYPE_LABEL: Record<CardType, string> = {
  leader: "리더", character: "캐릭터", event: "이벤트", stage: "스테이지", don: "DON!!",
};
const TYPES: CardType[] = ["leader", "character", "event", "stage", "don"];
const GAMES: Game[] = ["optcg", "ptcg", "dtcg"];

export function EditCardDialog({
  card, onClose, onSaved,
}: { card: CardRow; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    name: card.name,
    game: card.game as Game,
    type: card.type as CardType,
    set_code: card.set_code,
    colors: (card.colors ?? []).join(", "),
    cost: card.cost?.toString() ?? "",
    power: card.power?.toString() ?? "",
    counter: card.counter?.toString() ?? "",
    attribute: card.attribute ?? "",
    rarity: card.rarity ?? "",
    effect: card.effect ?? "",
    image_url: card.image_url ?? "",
  });
  const [saving, setSaving] = useState(false);

  const onSave = async () => {
    if (!form.name.trim() || !form.set_code.trim()) {
      toast.error("이름과 세트는 필수입니다");
      return;
    }
    setSaving(true);
    try {
      const num = (v: string) => {
        const n = Number(v);
        return v.trim() === "" || !Number.isFinite(n) ? null : n;
      };
      const colors = form.colors.split(/[,|;/]/).map((s) => s.trim()).filter(Boolean);
      const { error } = await supabase
        .from("cards")
        .update({
          name: form.name.trim(),
          game: form.game,
          type: form.type,
          set_code: form.set_code.trim(),
          colors,
          cost: num(form.cost),
          power: num(form.power),
          counter: num(form.counter),
          attribute: form.attribute.trim() || null,
          rarity: form.rarity.trim() || null,
          effect: form.effect.trim() || null,
          image_url: form.image_url.trim() || null,
        })
        .eq("code", card.code);
      if (error) throw error;
      toast.success("카드 수정 완료");
      onSaved();
    } catch (err) {
      toast.error("저장 실패: " + (err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>카드 편집 · {card.code}</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-1 gap-3 py-2 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label className="text-xs">이름 *</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div>
            <Label className="text-xs">게임</Label>
            <Select value={form.game} onValueChange={(v) => setForm({ ...form, game: v as Game })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {GAMES.map((g) => <SelectItem key={g} value={g}>{GAME_LABEL[g]}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">종류</Label>
            <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v as CardType })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {TYPES.map((t) => <SelectItem key={t} value={t}>{TYPE_LABEL[t]}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">세트 *</Label>
            <Input value={form.set_code} onChange={(e) => setForm({ ...form, set_code: e.target.value })} />
          </div>
          <div>
            <Label className="text-xs">색상 (쉼표 구분)</Label>
            <Input value={form.colors} onChange={(e) => setForm({ ...form, colors: e.target.value })} placeholder="red, blue" />
          </div>
          <div>
            <Label className="text-xs">비용</Label>
            <Input type="number" value={form.cost} onChange={(e) => setForm({ ...form, cost: e.target.value })} />
          </div>
          <div>
            <Label className="text-xs">파워</Label>
            <Input type="number" value={form.power} onChange={(e) => setForm({ ...form, power: e.target.value })} />
          </div>
          <div>
            <Label className="text-xs">카운터</Label>
            <Input type="number" value={form.counter} onChange={(e) => setForm({ ...form, counter: e.target.value })} />
          </div>
          <div>
            <Label className="text-xs">속성</Label>
            <Input value={form.attribute} onChange={(e) => setForm({ ...form, attribute: e.target.value })} />
          </div>
          <div>
            <Label className="text-xs">레어도</Label>
            <Input value={form.rarity} onChange={(e) => setForm({ ...form, rarity: e.target.value })} />
          </div>
          <div className="sm:col-span-2">
            <Label className="text-xs">이미지 URL</Label>
            <Input value={form.image_url} onChange={(e) => setForm({ ...form, image_url: e.target.value })} />
            {form.image_url && (
              <img src={form.image_url} alt="" className="mt-2 h-32 rounded border border-border object-contain" />
            )}
          </div>
          <div className="sm:col-span-2">
            <Label className="text-xs">효과</Label>
            <Textarea
              value={form.effect}
              onChange={(e) => setForm({ ...form, effect: e.target.value })}
              rows={4}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>취소</Button>
          <Button onClick={onSave} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Save className="h-4 w-4 mr-1" />}
            저장
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
