/**
 * 카드 효과 DSL — zod 스키마.
 * 스펙: docs/SIMULATOR_SPEC.md §5
 *
 * cards.effects(jsonb)에 저장될 효과 배열을 검증한다.
 * 새 trigger·action을 추가할 때 이 파일 + interpreter.ts를 함께 갱신.
 */

import { z } from "zod";

// ── target 셀렉터 ────────────────────────────────────────
export const TargetSelectorSchema = z.enum([
  "self_leader",
  "opponent_leader",
  "self_active",
  "self_character_any",
  "opponent_character_any",
  "self_character_filter",
  "opponent_character_filter",
  "chosen_target",
]);

// ── filter ───────────────────────────────────────────────
export const CardFilterSchema = z.object({
  cost_max: z.number().int().min(0).max(20).optional(),
  cost_min: z.number().int().min(0).max(20).optional(),
  power_max: z.number().int().min(0).max(50000).optional(),
  power_min: z.number().int().min(0).max(50000).optional(),
  color: z.array(z.enum(["red", "green", "blue", "purple", "black", "yellow"])).max(6).optional(),
  trait: z.array(z.string().min(1).max(60)).max(20).optional(),
  type: z.array(z.enum(["character", "event", "stage", "leader"])).max(4).optional(),
  rested_only: z.boolean().optional(),
});
export type CardFilter = z.infer<typeof CardFilterSchema>;

// ── cost ─────────────────────────────────────────────────
export const CostSchema = z.object({
  don_rest: z.number().int().min(0).max(10).optional(),
  discard_hand: z.number().int().min(0).max(10).optional(),
  return_don: z.number().int().min(0).max(10).optional(),
}).strict();

// ── trigger ──────────────────────────────────────────────
export const TriggerSchema = z.enum([
  "on_play",
  "on_ko",
  "on_block",
  "on_attack",
  "on_being_attacked",
  "on_trigger",       // 라이프에서 트리거 발동
  "on_turn_start",
  "on_turn_end",
  "activate_main",
  "counter",
  "passive",
]);

// ── action.kind 별 파라미터 ────────────────────────────
const TargetRef = z.object({
  selector: TargetSelectorSchema,
  filter: CardFilterSchema.optional(),
  iid: z.string().optional(),     // self_active 등에 사용
});

export const ActionSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("draw"), count: z.number().int().min(1).max(10) }),
  z.object({
    kind: z.literal("discard_hand"),
    count: z.number().int().min(1).max(10),
    who: z.enum(["self", "opponent"]),
    choose: z.enum(["random", "owner_choice", "opponent_choice"]),
  }),
  z.object({
    kind: z.literal("look_deck"),
    count: z.number().int().min(1).max(10),
    then: z.array(z.object({ destination: z.enum(["hand", "deck_top", "deck_bottom", "graveyard"]) })).max(4),
  }),
  z.object({
    kind: z.literal("search_deck"),
    filter: CardFilterSchema,
    count: z.number().int().min(1).max(5),
    destination: z.enum(["hand", "deck_top", "deck_bottom"]),
    then_order: z.enum(["any", "shuffle"]).default("shuffle"),
  }),
  z.object({
    kind: z.literal("ko_target"),
    filter: CardFilterSchema.optional(),
    count: z.number().int().min(1).max(5),
    target: TargetRef,
  }),
  z.object({
    kind: z.literal("return_to_hand"),
    filter: CardFilterSchema.optional(),
    count: z.number().int().min(1).max(5),
    target: TargetRef,
  }),
  z.object({ kind: z.literal("rest_target"), count: z.number().int().min(1).max(5), target: TargetRef }),
  z.object({ kind: z.literal("active_target"), count: z.number().int().min(1).max(5), target: TargetRef }),
  z.object({
    kind: z.literal("power_modifier"),
    delta: z.number().int().min(-10000).max(10000),
    duration: z.enum(["this_battle", "this_turn", "permanent"]),
    target: TargetRef,
    scope: z.enum(["single", "all_matching"]).default("single"),
  }),
  z.object({
    kind: z.literal("attach_don"),
    count: z.number().int().min(1).max(5),
    target: TargetRef,
    state: z.enum(["active", "rested"]).default("active"),
  }),
  z.object({
    kind: z.literal("return_don_to_deck"),
    count: z.number().int().min(1).max(10),
    state: z.enum(["active", "rested", "any"]).default("any"),
  }),
  z.object({
    kind: z.literal("gain_keyword"),
    keyword: z.enum(["rush", "blocker", "double_attack", "speed"]),
    duration: z.enum(["this_turn", "permanent"]),
    target: TargetRef,
  }),
  z.object({
    kind: z.literal("look_life"),
    count: z.number().int().min(1).max(5),
    then: z.array(z.object({ destination: z.enum(["life_top", "life_bottom", "hand"]) })).max(3),
  }),
  z.object({
    kind: z.literal("add_to_life"),
    from: z.enum(["hand", "character_area"]),
    count: z.number().int().min(1).max(3),
  }),
  z.object({
    kind: z.literal("modify_damage"),
    delta: z.number().int().min(-10000).max(10000),
  }),
  z.object({
    kind: z.literal("choose_one"),
    options: z.array(z.lazy(() => z.array(ActionSchema).max(6))).min(2).max(4),
  }),
]);
export type EffectAction = z.infer<typeof ActionSchema>;

// ── 조건 ─────────────────────────────────────────────────
export const ConditionSchema = z.object({
  kind: z.enum([
    "self_leader_name_is",
    "self_leader_color_is",
    "self_has_trait_in_play",
    "opponent_character_count_at_least",
    "self_life_at_most",
    "self_don_active_at_least",
  ]),
  value: z.union([z.string(), z.number(), z.array(z.string())]).optional(),
}).strict();

// ── 카드 단위 효과 ─────────────────────────────────────
export const CardEffectSchema = z.object({
  id: z.string().min(1).max(80),
  label: z.string().min(1).max(120).optional(),
  trigger: TriggerSchema,
  cost: CostSchema.optional(),
  conditions: z.array(ConditionSchema).max(6).optional(),
  optional: z.boolean().optional(),     // 발동을 플레이어가 선택
  actions: z.array(ActionSchema).min(1).max(10),
}).strict();
export type CardEffect = z.infer<typeof CardEffectSchema>;

export const CardEffectsSchema = z.array(CardEffectSchema).max(10);
