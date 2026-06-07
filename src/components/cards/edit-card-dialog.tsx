import { useEffect, useState } from "react";
import { ImagePlus, Loader2, Save, Star, X, Keyboard } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
import { useUniqueSets } from "@/hooks/use-unique-sets";

type CardRow = Database["public"]["Tables"]["cards"]["Row"];
type Game = Database["public"]["Enums"]["tcg_game"];
type CardType = Database["public"]["Enums"]["card_type"];

const GAME_LABEL: Record<Game, string> = { optcg: "원피스", ptcg: "포켓몬", dtcg: "디지몬" };
const TYPE_LABEL: Record<CardType, string> = {
  leader: "리더", character: "캐릭터", event: "이벤트", stage: "스테이지", don: "DON!!",
};
const TYPES: CardType[] = ["leader", "character", "event", "stage", "don"];
const GAMES: Game[] = ["optcg", "ptcg", "dtcg"];

// 디지몬 전용
const DIGIMON_CATEGORIES = ["디지타마", "디지몬", "옵션", "테이머", "듀얼"];
const DIGIMON_FORMS = ["유년기", "성장기", "성숙기", "완전체", "궁극체"];
const DIGIMON_CATEGORY_TYPE: Record<string, CardType> = {
  디지타마: "stage", 디지몬: "character", 옵션: "event", 테이머: "character", 듀얼: "character",
};

export function EditCardDialog({
  card, onClose, onSaved,
}: { card: CardRow; onClose: () => void; onSaved: () => void }) {
  const { sets } = useUniqueSets();
  const [isManualSet, setIsManualSet] = useState(false);
  const displaySets = Array.from(new Set([card.set_code, ...sets])).filter(Boolean).sort((a, b) => a.localeCompare(b));

  const ex0 = (card.extra ?? {}) as Record<string, string>;
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
    // 디지몬 전용
    category: ex0.category ?? "",
    formStage: ex0.form ?? "",
    evo_cost_1: ex0.evo_cost_1 ?? "",
    evo_cost_2: ex0.evo_cost_2 ?? "",
    text_top: ex0.text_top ?? "",
    text_bottom: ex0.text_bottom ?? "",
  });
  const [extraImages, setExtraImages] = useState<string[]>([]);
  const [initialAltImages, setInitialAltImages] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [imageDialogOpen, setImageDialogOpen] = useState(false);


  // 기존 추가 일러스트 로드
  useEffect(() => {
    let alive = true;
    (async () => {
      const { data } = await supabase
        .from("card_illustrations")
        .select("image_url")
        .eq("card_code", card.code)
        .eq("status", "approved")
        .order("created_at", { ascending: true });
      if (!alive) return;
      const urls = (data ?? [])
        .map((r) => normalizeImageUrl(r.image_url) ?? r.image_url)
        .filter((u): u is string => !!u);
      setExtraImages(urls);
      setInitialAltImages(urls);
    })();
    return () => { alive = false; };
  }, [card.code]);

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


      // 디지몬 규칙: 종류→type 매핑, 상단/하단→effect 결합, extra 저장, 카운터 제거
      const isDtcg = form.game === "dtcg";
      let typeToSave = form.type;
      let effectToSave = form.effect.trim() || null;
      let counterToSave = num(form.counter);
      let extraPayload: Record<string, string> | null = null;
      if (isDtcg) {
        const clean: Record<string, string> = {};
        const entries: Record<string, string> = {
          category: form.category, form: form.formStage,
          evo_cost_1: form.evo_cost_1, evo_cost_2: form.evo_cost_2,
          text_top: form.text_top, text_bottom: form.text_bottom,
        };
        for (const [k, v] of Object.entries(entries)) {
          if (v && v.trim()) clean[k] = v.trim();
        }
        extraPayload = Object.keys(clean).length ? clean : null;
        if (form.category && DIGIMON_CATEGORY_TYPE[form.category]) typeToSave = DIGIMON_CATEGORY_TYPE[form.category];
        const top = form.text_top.trim();
        const bottom = form.text_bottom.trim();
        effectToSave = [top, bottom].filter(Boolean).join("\n\n") || null;
        counterToSave = null;
      }

      const { error } = await supabase
        .from("cards")
        .update({
          code: newCode,
          name: form.name.trim(),
          game: form.game,
          type: typeToSave,
          set_code: form.set_code.trim(),
          colors,
          cost: num(form.cost),
          power: num(form.power),
          counter: counterToSave,
          attribute: form.attribute.trim() || null,
          rarity: form.rarity.trim() || null,
          effect: effectToSave,
          image_url: normalizeImageUrl(form.image_url.trim()) || null,
          traits: Array.from(new Set(form.traits.split(/[|,;/]/).map((s) => s.trim()).filter(Boolean))),
          ...(isDtcg ? { extra: extraPayload } : {}),
        })
        .eq("id", card.id);
      if (error) throw error;

      // 추가 일러스트 reconcile (메인 외의 이미지)
      const currentExtras = Array.from(
        new Set(
          extraImages
            .map((u) => normalizeImageUrl(u) ?? u)
            .filter((u): u is string => !!u),
        ),
      );
      const initialSet = new Set(initialAltImages);
      const currentSet = new Set(currentExtras);
      const toDelete = initialAltImages.filter((u) => !currentSet.has(u));
      const toAdd = currentExtras.filter((u) => !initialSet.has(u));

      if (toDelete.length > 0) {
        const { error: delErr } = await supabase
          .from("card_illustrations")
          .delete()
          .eq("card_code", card.code)
          .in("image_url", toDelete);
        if (delErr) console.error("[card_illustrations delete]", delErr);
      }

      // 코드가 변경된 경우 기존 row의 card_code도 새 코드로 이동
      if (codeChanged && initialAltImages.length > 0) {
        const remaining = initialAltImages.filter((u) => currentSet.has(u));
        if (remaining.length > 0) {
          const { error: updErr } = await supabase
            .from("card_illustrations")
            .update({ card_code: newCode })
            .eq("card_code", card.code)
            .in("image_url", remaining);
          if (updErr) console.error("[card_illustrations rename]", updErr);
        }
      }

      if (toAdd.length > 0) {
        const { data: auth } = await supabase.auth.getUser();
        const uid = auth.user?.id ?? null;
        const payload = toAdd.map((image_url) => ({
          card_code: newCode,
          image_url,
          variant_label: "얼터",
          status: "approved" as const,
          submitted_by: uid,
          reviewed_by: uid,
          reviewed_at: new Date().toISOString(),
        }));
        const { error: insErr } = await supabase
          .from("card_illustrations")
          .upsert(payload, { onConflict: "card_code,image_url", ignoreDuplicates: true });
        if (insErr) console.error("[card_illustrations insert]", insErr);
      }

      setInitialAltImages(currentExtras);
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
          {form.game === "dtcg" ? (
            <>
              <div>
                <Label className="text-xs">종류</Label>
                <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                  <SelectTrigger><SelectValue placeholder="종류 선택" /></SelectTrigger>
                  <SelectContent>{DIGIMON_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">형태</Label>
                <Select value={form.formStage} onValueChange={(v) => setForm({ ...form, formStage: v })}>
                  <SelectTrigger><SelectValue placeholder="형태 선택" /></SelectTrigger>
                  <SelectContent>{DIGIMON_FORMS.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </>
          ) : (
            <div>
              <Label className="text-xs">종류</Label>
              <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v as CardType })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TYPES.map((t) => <SelectItem key={t} value={t}>{TYPE_LABEL[t]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
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
            <Label className="text-xs flex items-center justify-between">
              <span>세트 *</span>
              {!isManualSet && (
                <button
                  type="button"
                  onClick={() => setIsManualSet(true)}
                  className="text-[10px] text-primary hover:underline flex items-center gap-0.5"
                >
                  <Keyboard className="h-3 w-3" />직접 입력
                </button>
              )}
            </Label>
            {isManualSet ? (
              <div className="relative flex items-center">
                <Input
                  value={form.set_code}
                  onChange={(e) => setForm({ ...form, set_code: e.target.value })}
                  placeholder="예: OP01"
                />
                <button
                  type="button"
                  onClick={() => setIsManualSet(false)}
                  className="absolute right-2 text-[10px] text-muted-foreground hover:text-foreground"
                >
                  선택창으로
                </button>
              </div>
            ) : (
              <Select
                value={form.set_code}
                onValueChange={(v) => {
                  if (v === "__NEW_SET__") {
                    setIsManualSet(true);
                  } else {
                    setForm({ ...form, set_code: v });
                  }
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="세트 선택" />
                </SelectTrigger>
                <SelectContent>
                  {displaySets.map((s) => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                  <SelectItem value="__NEW_SET__" className="text-primary font-medium">
                    + 직접 입력 / 신규 세트 추가
                  </SelectItem>
                </SelectContent>
              </Select>
            )}
          </div>
          <div>
            <Label className="text-xs">색상 (쉼표 구분)</Label>
            <Input value={form.colors} onChange={(e) => setForm({ ...form, colors: e.target.value })} placeholder="red, blue" />
          </div>
          {form.game === "dtcg" ? (
            <>
              <div>
                <Label className="text-xs">DP</Label>
                <Input type="number" value={form.power} onChange={(e) => setForm({ ...form, power: e.target.value })} />
              </div>
              <div>
                <Label className="text-xs">등장 코스트</Label>
                <Input type="number" value={form.cost} onChange={(e) => setForm({ ...form, cost: e.target.value })} />
              </div>
              <div>
                <Label className="text-xs">진화 코스트 1</Label>
                <Input value={form.evo_cost_1} onChange={(e) => setForm({ ...form, evo_cost_1: e.target.value })} placeholder="예: Lv.3" />
              </div>
              <div>
                <Label className="text-xs">진화 코스트 2</Label>
                <Input value={form.evo_cost_2} onChange={(e) => setForm({ ...form, evo_cost_2: e.target.value })} placeholder="예: Lv.4 / -" />
              </div>
              <div>
                <Label className="text-xs">속성</Label>
                <Input value={form.attribute} onChange={(e) => setForm({ ...form, attribute: e.target.value })} placeholder="백신종/데이터종/바이러스종" />
              </div>
            </>
          ) : (
            <>
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
            </>
          )}
          <div>
            <Label className="text-xs">레어도</Label>
            <Input value={form.rarity} onChange={(e) => setForm({ ...form, rarity: e.target.value })} />
          </div>
          <div className="sm:col-span-2">
            <Label className="text-xs">이미지 ({(form.image_url ? 1 : 0) + extraImages.length}장)</Label>
            <div className="mt-1 flex flex-wrap items-start gap-3">
              {form.image_url ? (
                <div className="relative">
                  <img
                    src={normalizeImageUrl(form.image_url) ?? form.image_url}
                    alt=""
                    className="h-32 w-24 rounded border-2 border-primary object-cover"
                  />
                  <Badge className="absolute -top-2 left-1/2 -translate-x-1/2 text-[9px] px-1.5 py-0 h-4 gap-0.5">
                    <Star className="h-2.5 w-2.5" />메인
                  </Badge>
                  <button
                    type="button"
                    onClick={() => {
                      // 메인을 제거할 때, 추가 이미지가 있으면 첫 번째를 메인으로 승격
                      const [next, ...rest] = extraImages;
                      setForm({ ...form, image_url: next ?? "" });
                      setExtraImages(rest);
                    }}
                    className="absolute -right-2 -top-2 rounded-full bg-destructive p-0.5 text-destructive-foreground shadow"
                    title="이미지 제거"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ) : (
                <div className="flex h-32 w-24 items-center justify-center rounded border border-dashed border-border bg-muted/20 text-[10px] text-muted-foreground">
                  없음
                </div>
              )}
              {extraImages.map((url, i) => (
                <div key={`${url}-${i}`} className="relative">
                  <img
                    src={normalizeImageUrl(url) ?? url}
                    alt=""
                    className="h-32 w-24 rounded border border-border object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => setExtraImages(extraImages.filter((_, j) => j !== i))}
                    className="absolute -right-2 -top-2 rounded-full bg-destructive p-0.5 text-destructive-foreground shadow"
                    title="이미지 제거"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
              <div className="flex flex-col gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setImageDialogOpen(true)}
                >
                  <ImagePlus className="mr-1 h-4 w-4" />
                  이미지 등록
                </Button>
                <p className="text-[11px] text-muted-foreground">
                  여러 장 등록 시 첫 번째가 메인, 나머지는 추가 일러스트로 저장됩니다.
                </p>
              </div>
            </div>
          </div>
          <ImageUploadDialog
            open={imageDialogOpen}
            onOpenChange={setImageDialogOpen}
            initialImages={[form.image_url, ...extraImages].filter((u): u is string => !!u)}
            setCode={form.set_code}
            cardCode={form.code}
            onCommit={(images) => {
              setForm({ ...form, image_url: images[0] ?? "" });
              setExtraImages(images.slice(1));
            }}
          />
          <div className="sm:col-span-2">
            <Label className="text-xs">이미지 URL (직접 입력 · 선택)</Label>
            <Input
              value={form.image_url}
              onChange={(e) => setForm({ ...form, image_url: e.target.value })}
              onBlur={(e) => setForm({ ...form, image_url: normalizeImageUrl(e.target.value) ?? "" })}
              placeholder="https://... 또는 https://drive.google.com/file/d/.../view"
            />
          </div>
          <div className="sm:col-span-2">
            <Label className="text-xs">{form.game === "dtcg" ? "유형 (쉼표 또는 | 로 구분)" : "특징 (쉼표 또는 | 로 구분)"}</Label>
            <Input
              value={form.traits}
              onChange={(e) => setForm({ ...form, traits: e.target.value })}
              placeholder={form.game === "dtcg" ? "리버레이터, 파충류형" : "밀짚모자 해적단, 초신성"}
            />
          </div>
          {form.game === "dtcg" ? (
            <>
              <div className="sm:col-span-2">
                <Label className="text-xs">상단 텍스트</Label>
                <Textarea value={form.text_top} onChange={(e) => setForm({ ...form, text_top: e.target.value })} rows={3} placeholder="[등장 시] ..." />
              </div>
              <div className="sm:col-span-2">
                <Label className="text-xs">하단 텍스트</Label>
                <Textarea value={form.text_bottom} onChange={(e) => setForm({ ...form, text_bottom: e.target.value })} rows={3} placeholder="[자신의 턴] ..." />
              </div>
            </>
          ) : (
            <div className="sm:col-span-2">
              <Label className="text-xs">효과</Label>
              <Textarea
                value={form.effect}
                onChange={(e) => setForm({ ...form, effect: e.target.value })}
                rows={4}
              />
            </div>
          )}
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
