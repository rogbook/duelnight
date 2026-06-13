/**
 * 카드 효과 DSL 카탈로그 → zod 검증 → 마이그레이션 SQL 생성.
 *
 * 효과를 추가할 때 EFFECTS에 한 줄 더 적고 실행하면:
 *  1. CardEffectsSchema(zod)로 전수 검증 (실패 시 적재 중단)
 *  2. supabase/migrations/ 에 UPDATE SQL 파일 생성
 * → 검증된 DSL과 DB에 적재되는 DSL이 항상 동일 소스.
 *
 * 실행: bun scripts/build-effect-migration.ts
 * 스펙: docs/SIMULATOR_SPEC.md §5 / 지시서: docs/SIMULATOR_PHASE1_TASKS.md §1C
 */

import { writeFileSync } from "fs";
import { join } from "path";
import { CardEffectsSchema } from "../src/lib/simulator/dsl/schema";

// 적재 대상: 1A 보강 범위로 정확히 표현 가능하고, verify-simulator-phase1.ts가 메커니즘을 증명한 카드만.
const EFFECTS: Record<string, unknown[]> = {
  // 이조 — 【등장 시】 상대 코스트 4 이하 1장 레스트
  "OP01-033": [
    {
      id: "on_play:izo_rest",
      label: "등장 시 상대 코스트4이하 레스트",
      trigger: "on_play",
      actions: [
        {
          kind: "rest_target",
          count: 1,
          target: { selector: "opponent_character_filter", filter: { cost_max: 4 } },
        },
      ],
    },
  ],

  // 오타마 — 【등장 시】 이번 턴 상대 캐릭터 1장 파워 -2000
  "OP01-006": [
    {
      id: "on_play:otama_debuff",
      label: "등장 시 파워 -2000",
      trigger: "on_play",
      actions: [
        {
          kind: "power_modifier",
          delta: -2000,
          duration: "this_turn",
          scope: "single",
          target: { selector: "opponent_character_filter", filter: {} },
        },
      ],
    },
  ],

  // 항마의 상 — 【메인】 상대 레스트 + 코스트 5 이하 2장 KO
  "OP01-056": [
    {
      id: "main:exorcism_ko",
      label: "레스트 코스트5이하 2장 KO",
      trigger: "main",
      actions: [
        {
          kind: "ko_target",
          count: 2,
          target: {
            selector: "opponent_character_filter",
            filter: { cost_max: 5, rested_only: true },
          },
        },
      ],
    },
  ],

  // 노지코 — 【등장 시】 리더가 「나미」면 상대 코스트 5 이하 1장 바운스
  "OP03-048": [
    {
      id: "on_play:nojiko_bounce",
      label: "나미 리더 시 코스트5이하 바운스",
      trigger: "on_play",
      conditions: [{ kind: "self_leader_name_is", value: "나미" }],
      actions: [
        {
          kind: "return_to_hand",
          count: 1,
          target: { selector: "opponent_character_filter", filter: { cost_max: 5 } },
        },
      ],
    },
  ],

  // 거미집 그물 — 【카운터】 이번 배틀 자신 +4000 후 캐릭터 1장 액티브 / 【트리거】 리더 +2000
  "OP04-035": [
    {
      id: "counter:web_4000",
      label: "카운터 파워 +4000",
      trigger: "counter",
      actions: [
        {
          kind: "power_modifier",
          delta: 4000,
          duration: "this_battle",
          scope: "single",
          target: { selector: "self_leader" },
        },
        { kind: "active_target", count: 1, target: { selector: "self_character_any" } },
      ],
    },
    {
      id: "trigger:web_2000",
      label: "트리거 리더 +2000",
      trigger: "on_trigger",
      actions: [
        {
          kind: "power_modifier",
          delta: 2000,
          duration: "this_turn",
          scope: "single",
          target: { selector: "self_leader" },
        },
      ],
    },
  ],

  // 몽키 D 루피(리더) — 【기동:메인】【턴1회】 ④: 초신성/밀짚모자 코스트5이하 1장 액티브 + 파워 +1000
  "OP01-003": [
    {
      id: "activate:luffy_active_buff",
      label: "기동 액티브 + 파워 +1000",
      trigger: "activate_main",
      cost: { don_rest: 4 },
      actions: [
        {
          kind: "active_target",
          count: 1,
          target: {
            selector: "self_character_filter",
            filter: { cost_max: 5, trait: ["초신성", "밀짚모자 일당"] },
          },
        },
        {
          kind: "power_modifier",
          delta: 1000,
          duration: "this_turn",
          scope: "single",
          target: {
            selector: "self_character_filter",
            filter: { cost_max: 5, trait: ["초신성", "밀짚모자 일당"] },
          },
        },
      ],
    },
  ],
};

const MIGRATION_NAME = "20260613110000_seed_optcg_effects_phase1c";

function main() {
  console.log("=== 카드 효과 DSL 검증 ===\n");
  let allValid = true;
  const updates: string[] = [];

  for (const [code, effects] of Object.entries(EFFECTS)) {
    const result = CardEffectsSchema.safeParse(effects);
    if (!result.success) {
      allValid = false;
      console.error(`❌ ${code} — 스키마 위반:`);
      for (const issue of result.error.issues) {
        console.error(`   · ${issue.path.join(".")}: ${issue.message}`);
      }
      continue;
    }
    console.log(`✅ ${code} — 효과 ${effects.length}건 검증 통과`);
    // 작은따옴표는 SQL 리터럴 이스케이프
    const json = JSON.stringify(effects).replace(/'/g, "''");
    updates.push(
      `UPDATE cards SET effects = '${json}'::jsonb WHERE game = 'optcg' AND code = '${code}';`,
    );
  }

  if (!allValid) {
    console.error("\n검증 실패 — 마이그레이션을 생성하지 않습니다.");
    process.exit(1);
  }

  const header = [
    "-- 시뮬레이터 효과 적재 Phase 1C — 검증 완료 6장",
    "-- 생성: scripts/build-effect-migration.ts (CardEffectsSchema 검증 통과분)",
    "-- 지시서: docs/SIMULATOR_PHASE1_TASKS.md §1C",
    "",
  ].join("\n");
  const sql = header + updates.join("\n") + "\n";

  const outPath = join(process.cwd(), "supabase", "migrations", `${MIGRATION_NAME}.sql`);
  writeFileSync(outPath, sql, "utf8");
  console.log(`\n전체 ${updates.length}장 검증 통과. SQL 생성:\n  ${outPath}`);
}

main();
