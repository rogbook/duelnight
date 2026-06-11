/**
 * 카드 효과(시뮬레이터 DSL) 편집기 — 관리자용.
 * 실제 엔진 스키마(CardEffectsSchema)로 실시간 검증해 "틀린 효과는 저장 불가".
 * 비개발자도 쓰도록 자주 쓰는 효과 스니펫 버튼 + 치트시트 제공.
 * cards.effects(jsonb)에 단독 저장(부모 다이얼로그 저장 흐름과 분리 → 충돌·부작용 없음).
 */
import { useState } from "react";
import { toast } from "sonner";
import { Loader2, Save, Check, AlertTriangle, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CardEffectsSchema } from "@/lib/simulator/dsl/schema";

/** 자주 쓰는 효과 템플릿 (모두 스키마 통과 보장). */
const SNIPPETS: { label: string; effect: Record<string, unknown> }[] = [
  {
    label: "드로우",
    effect: {
      id: "draw1",
      label: "등장 시 1장 드로우",
      trigger: "on_play",
      actions: [{ kind: "draw", count: 1 }],
    },
  },
  {
    label: "상대 KO",
    effect: {
      id: "ko1",
      label: "등장 시 상대 코스트3 이하 1장 KO",
      trigger: "on_play",
      actions: [
        {
          kind: "ko_target",
          count: 1,
          target: { selector: "opponent_character_filter", filter: { cost_max: 3 } },
        },
      ],
    },
  },
  {
    label: "파워 +1000",
    effect: {
      id: "pow1",
      label: "등장 시 이 캐릭터 +1000",
      trigger: "on_play",
      actions: [
        {
          kind: "power_modifier",
          delta: 1000,
          duration: "this_turn",
          target: { selector: "self_active" },
          scope: "single",
        },
      ],
    },
  },
  {
    label: "덱 서치",
    effect: {
      id: "search1",
      label: "등장 시 덱에서 캐릭터 1장 서치",
      trigger: "on_play",
      actions: [
        {
          kind: "search_deck",
          filter: { type: ["character"] },
          count: 1,
          destination: "hand",
          then_order: "shuffle",
        },
      ],
    },
  },
  {
    label: "블로커",
    effect: {
      id: "blocker",
      label: "블로커",
      trigger: "passive",
      actions: [
        {
          kind: "gain_keyword",
          keyword: "blocker",
          duration: "permanent",
          target: { selector: "self_active" },
        },
      ],
    },
  },
  {
    label: "라이프 추가",
    effect: {
      id: "life1",
      label: "등장 시 손에서 라이프 1장 추가",
      trigger: "on_play",
      actions: [{ kind: "add_to_life", from: "hand", count: 1 }],
    },
  },
  {
    label: "러시",
    effect: {
      id: "rush",
      label: "러시",
      trigger: "passive",
      actions: [
        {
          kind: "gain_keyword",
          keyword: "rush",
          duration: "permanent",
          target: { selector: "self_active" },
        },
      ],
    },
  },
  {
    label: "더블어택",
    effect: {
      id: "double",
      label: "더블어택",
      trigger: "passive",
      actions: [
        {
          kind: "gain_keyword",
          keyword: "double_attack",
          duration: "permanent",
          target: { selector: "self_active" },
        },
      ],
    },
  },
  {
    label: "상대 손패 -1",
    effect: {
      id: "disc1",
      label: "등장 시 상대 손패 1장 버리기",
      trigger: "on_play",
      actions: [{ kind: "discard_hand", count: 1, who: "opponent", choose: "opponent_choice" }],
    },
  },
  {
    label: "손으로 되돌리기",
    effect: {
      id: "bounce1",
      label: "등장 시 상대 코스트2 이하 1장 손으로",
      trigger: "on_play",
      actions: [
        {
          kind: "return_to_hand",
          count: 1,
          target: { selector: "opponent_character_filter", filter: { cost_max: 2 } },
        },
      ],
    },
  },
  {
    label: "상대 레스트",
    effect: {
      id: "rest1",
      label: "등장 시 상대 캐릭터 1장 레스트",
      trigger: "on_play",
      actions: [{ kind: "rest_target", count: 1, target: { selector: "opponent_character_any" } }],
    },
  },
  {
    label: "카운터 +2000",
    effect: {
      id: "counter2k",
      label: "[카운터] 이 캐릭터 +2000",
      trigger: "counter",
      actions: [
        {
          kind: "power_modifier",
          delta: 2000,
          duration: "this_battle",
          target: { selector: "self_active" },
          scope: "single",
        },
      ],
    },
  },
];

const TRIGGERS =
  "on_play · on_ko · on_block · on_attack · on_being_attacked · on_trigger · on_turn_start · on_turn_end · activate_main · counter · passive";
const ACTIONS =
  "draw · discard_hand · look_deck · search_deck · ko_target · return_to_hand · rest_target · active_target · power_modifier · attach_don · return_don_to_deck · gain_keyword · look_life · add_to_life · modify_damage · choose_one";

function stringify(v: unknown): string {
  try {
    return JSON.stringify(v ?? [], null, 2);
  } catch {
    return "[]";
  }
}

/** 텍스트(JSON) → 검증 결과. */
function validate(text: string): { ok: boolean; data?: unknown[]; error?: string } {
  const trimmed = text.trim();
  if (!trimmed || trimmed === "[]") return { ok: true, data: [] };
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch (e) {
    return { ok: false, error: "JSON 형식 오류: " + (e as Error).message };
  }
  const res = CardEffectsSchema.safeParse(parsed);
  if (!res.success) {
    const first = res.error.issues[0];
    return {
      ok: false,
      error: `스키마 오류: ${first.path.join(".") || "(root)"} — ${first.message}`,
    };
  }
  return { ok: true, data: res.data as unknown[] };
}

export function CardEffectsEditor({ cardId, initial }: { cardId: string; initial?: unknown }) {
  const [text, setText] = useState<string>(stringify(initial));
  const [saving, setSaving] = useState(false);
  const v = validate(text);
  const count = v.ok ? (v.data?.length ?? 0) : null;

  const addSnippet = (effect: Record<string, unknown>) => {
    const cur = validate(text);
    if (!cur.ok) {
      toast.error("현재 내용에 오류가 있어 스니펫을 추가할 수 없어요. 먼저 오류를 고쳐주세요.");
      return;
    }
    // 중복 추가 시 id 충돌 방지 — 고유 접미사 부여
    const uniq = {
      ...effect,
      id: `${String(effect.id)}_${Math.random().toString(36).slice(2, 6)}`,
    };
    const arr = [...(cur.data ?? []), uniq];
    setText(stringify(arr));
  };

  const onSave = async () => {
    const res = validate(text);
    if (!res.ok) {
      toast.error(res.error ?? "효과 형식이 올바르지 않습니다.");
      return;
    }
    setSaving(true);
    try {
      // effects 컬럼은 jsonb. 타입 정합을 위해 unknown 캐스트.
      const { error } = await supabase
        .from("cards")
        .update({ effects: (res.data ?? []) as never })
        .eq("id", cardId);
      if (error) throw error;
      toast.success(`효과 ${res.data?.length ?? 0}개 저장됨`);
    } catch (e) {
      toast.error("효과 저장 실패: " + (e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Label className="text-xs">시뮬레이터 효과 (DSL)</Label>
        <span className={`text-[11px] ${v.ok ? "text-emerald-500" : "text-destructive"}`}>
          {v.ok ? (
            <span className="inline-flex items-center gap-1">
              <Check className="h-3 w-3" />
              유효 · 효과 {count}개
            </span>
          ) : (
            <span className="inline-flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" />
              {v.error}
            </span>
          )}
        </span>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {SNIPPETS.map((s) => (
          <Button
            key={s.label}
            type="button"
            variant="outline"
            size="sm"
            className="h-7 text-[11px]"
            onClick={() => addSnippet(s.effect)}
          >
            <Plus className="mr-1 h-3 w-3" />
            {s.label}
          </Button>
        ))}
      </div>

      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={8}
        spellCheck={false}
        className="w-full font-mono text-[11px] leading-relaxed"
        placeholder="[]  ← 효과 없음. 위 버튼으로 추가하거나 직접 JSON 작성"
      />

      <details className="rounded-md border border-border bg-muted/30 p-2 text-[11px] text-muted-foreground">
        <summary className="cursor-pointer select-none font-medium text-foreground">
          작성 도움말 (트리거·액션 목록)
        </summary>
        <div className="mt-2 space-y-1">
          <p>
            <b>trigger</b>: {TRIGGERS}
          </p>
          <p>
            <b>action.kind</b>: {ACTIONS}
          </p>
          <p className="text-muted-foreground/80">
            각 효과는 <code>{`{ id, trigger, actions:[...] }`}</code> 형태. 자세한 파라미터는
            docs/SIMULATOR_SPEC.md 참고. 저장은 스키마 검증을 통과해야만 됩니다.
          </p>
        </div>
      </details>

      <div className="flex justify-end">
        <Button type="button" size="sm" onClick={onSave} disabled={saving || !v.ok}>
          {saving ? (
            <Loader2 className="mr-1 h-4 w-4 animate-spin" />
          ) : (
            <Save className="mr-1 h-4 w-4" />
          )}
          효과 저장
        </Button>
      </div>
    </div>
  );
}
