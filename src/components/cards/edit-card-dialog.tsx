import { useState } from "react";
import { ImagePlus, Loader2, Save, X } from "lucide-react";
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
import { normalizeImageUrl } from "@/components/cards/card-uploader";
import { ImageUploadDialog } from "@/components/cards/image-upload-dialog";

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
    code: card.code,
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
    traits: (card.traits ?? []).join(", "),
  });
  const [saving, setSaving] = useState(false);

  const onSave = async () => {
    if (!form.name.trim() || !form.set_code.trim() || !form.code.trim()) {
      toast.error("코드 · 이름 · 세트는 필수입니다");
      return;
    }
    setSaving(true);
    try {
      const num = (v: string) => {
        const n = Number(v);
        return v.trim() === "" || !Number.isFinite(n) ? null : n;
      };
      const colors = form.colors.split(/[,|;/]/).map((s) => s.trim()).filter(Boolean);
      const newCode = form.code.trim();
      const codeChanged = newCode !== card.code;

      if (codeChanged) {
        const { data: dup } = await supabase
          .from("cards")
          .select("code")
          .eq("code", newCode)
          .maybeSingle();
        if (dup) {
          toast.error(`이미 존재하는 코드입니다: ${newCode}`);
          setSaving(false);
          return;
        }
      }

      const newName = form.name.trim();
      const newSet = form.set_code.trim();
      if (newSet !== card.set_code || newName !== card.name) {
        const { data: dupSet } = await supabase
          .from("cards")
          .select("code")
          .eq("set_code", newSet)
          .eq("name", newName)
          .neq("id", card.id)
          .maybeSingle();
        if (dupSet) {
          toast.error(`이미 같은 세트(${newSet})에 동일한 이름의 카드가 있습니다: ${dupSet.code}`);
          setSaving(false);
          return;
        }
      }

      const { error } = await supabase
        .from("cards")
        .update({
          code: newCode,
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
          image_url: normalizeImageUrl(form.image_url.trim()) || null,
          traits: Array.from(new Set(form.traits.split(/[|,;/]/).map((s) => s.trim()).filter(Boolean))),
        })
        .eq("id", card.id);
      if (error) throw error;
      toast.success("카드 수정 완료" + (codeChanged ? ` (코드 변경: ${card.code} → ${newCode})` : ""));
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
            <Label className="text-xs">카드 코드 *</Label>
            <Input
              value={form.code}
              onChange={(e) => setForm({ ...form, code: e.target.value })}
              placeholder="예: OP01-001"
            />
            <p className="mt-1 text-[10px] text-muted-foreground">변경 시 중복 확인 후 저장됩니다</p>
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
            <Label className="text-xs">이미지 URL (구글 드라이브 공유 링크 자동 변환)</Label>
            <Input
              value={form.image_url}
              onChange={(e) => setForm({ ...form, image_url: e.target.value })}
              onBlur={(e) => setForm({ ...form, image_url: normalizeImageUrl(e.target.value) ?? "" })}
              placeholder="https://... 또는 https://drive.google.com/file/d/.../view"
            />
            {form.image_url && (
              <img src={normalizeImageUrl(form.image_url) ?? form.image_url} alt="" className="mt-2 h-32 rounded border border-border object-contain" />
            )}
          </div>
          <div className="sm:col-span-2">
            <Label className="text-xs">특징 (쉼표 또는 | 로 구분)</Label>
            <Input
              value={form.traits}
              onChange={(e) => setForm({ ...form, traits: e.target.value })}
              placeholder="밀짚모자 해적단, 초신성"
            />
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
