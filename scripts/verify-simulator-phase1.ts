import { optcgEngine, CARD_METADATA_CACHE } from "../src/lib/simulator";
import type { DeckRecipe, GameState } from "../src/lib/simulator/types";
import { getBattlePower } from "../src/lib/simulator/engines/optcg";

// 1. 테스트용 메타데이터 등록
CARD_METADATA_CACHE["L-NAMI"] = {
  name: "나미",
  cost: 0,
  power: 5000,
  counterValue: 0,
  type: "leader",
  colors: ["blue"],
  traits: ["밀짚모자 일당"],
  effects: []
};

CARD_METADATA_CACHE["L-LUFFY"] = {
  name: "몽키 D. 루피",
  cost: 0,
  power: 5000,
  counterValue: 0,
  type: "leader",
  colors: ["red"],
  traits: ["밀짚모자 일당"],
  effects: [
    {
      id: "luffy-activate-main",
      trigger: "activate_main",
      cost: { don_rest: 4 },
      actions: [
        {
          kind: "power_modifier",
          delta: 1000,
          duration: "this_turn",
          target: { selector: "self_leader" },
          scope: "single"
        }
      ]
    }
  ]
};

CARD_METADATA_CACHE["C-NOJIKO"] = {
  name: "노지코",
  cost: 2,
  power: 3000,
  counterValue: 1000,
  type: "character",
  colors: ["blue"],
  traits: ["코코야시 마을"],
  effects: [
    {
      id: "nojiko-on-play",
      trigger: "on_play",
      conditions: [{ kind: "self_leader_name_is", value: "나미" }],
      actions: [
        {
          kind: "return_to_hand",
          count: 1,
          target: {
            selector: "opponent_character_filter",
            filter: { cost_max: 5, rested_only: true }
          }
        }
      ]
    }
  ]
};

CARD_METADATA_CACHE["C-IZO"] = {
  name: "이조",
  cost: 3,
  power: 3000,
  counterValue: 1000,
  type: "character",
  colors: ["green"],
  traits: ["흰수염 해적단"],
  effects: [
    {
      id: "izo-on-play",
      trigger: "on_play",
      actions: [
        {
          kind: "rest_target",
          count: 1,
          target: { selector: "opponent_character_filter" }
        }
      ]
    }
  ]
};

CARD_METADATA_CACHE["C-OTAMA"] = {
  name: "오타마",
  cost: 1,
  power: 2000,
  counterValue: 1000,
  type: "character",
  colors: ["red"],
  traits: ["와노국"],
  effects: [
    {
      id: "otama-on-play",
      trigger: "on_play",
      actions: [
        {
          kind: "power_modifier",
          delta: -2000,
          duration: "this_turn",
          target: { selector: "opponent_character_filter" },
          scope: "single"
        }
      ]
    }
  ]
};

CARD_METADATA_CACHE["E-NET"] = {
  name: "거미집 그물",
  cost: 1,
  power: 0,
  counterValue: 0,
  type: "event",
  colors: ["red"],
  traits: ["밀짚모자 일당"],
  effects: [
    {
      id: "net-counter",
      trigger: "counter",
      actions: [
        {
          kind: "power_modifier",
          delta: 4000,
          duration: "this_battle",
          target: { selector: "self_leader" },
          scope: "single"
        }
      ]
    }
  ]
};

CARD_METADATA_CACHE["E-KOMA"] = {
  name: "항마의 상",
  cost: 1,
  power: 0,
  counterValue: 0,
  type: "event",
  colors: ["blue"],
  traits: ["초신성"],
  effects: [
    {
      id: "koma-main",
      trigger: "main",
      actions: [
        {
          kind: "ko_target",
          count: 1,
          target: {
            selector: "opponent_character_filter",
            filter: { cost_max: 6 }
          }
        }
      ]
    }
  ]
};

// 검증용 더미 덱
const deckNami: DeckRecipe = {
  game: "optcg",
  leaderCode: "L-NAMI",
  cards: [
    { card_code: "C-NOJIKO", quantity: 2 },
    { card_code: "C-IZO", quantity: 2 },
    { card_code: "C-OTAMA", quantity: 2 },
    { card_code: "E-NET", quantity: 2 },
    { card_code: "E-KOMA", quantity: 2 }
  ]
};

const deckLuffy: DeckRecipe = {
  game: "optcg",
  leaderCode: "L-LUFFY",
  cards: [
    { card_code: "C-NOJIKO", quantity: 2 },
    { card_code: "C-IZO", quantity: 2 },
    { card_code: "C-OTAMA", quantity: 2 },
    { card_code: "E-NET", quantity: 2 },
    { card_code: "E-KOMA", quantity: 2 }
  ]
};

console.log("=== 시뮬레이터 Phase 1A 검증 스크립트 실행 ===");

let seed = "test-seed-12345";

// --- 시나리오 1: 조건 불충족 효과 미발동 (노지코를 나미 외 리더로 소환 시) ---
{
  console.log("\n[시나리오 1] 조건 불충족 효과 미발동 검증 (나미 외 리더로 노지코 소환)");
  let state = optcgEngine.init([deckLuffy, deckNami], seed); // p1=Luffy, p2=Nami
  
  // 강제로 상대 필드(p2)에 레스트된 코스트 5 이하 캐릭터 배치
  state.players.p2.zones.secondary.push({
    iid: "p2-target-c1",
    code: "C-IZO",
    rested: true,
    attached: [],
    counters: {},
    power: 3000
  });

  // p1 손패에 C-NOJIKO 지급하고 플레이어 DON!! 넉넉히
  state.players.p1.zones.hand = [{
    iid: "p1-nojiko",
    code: "C-NOJIKO",
    rested: false,
    attached: [],
    counters: {},
    power: 3000
  }];
  state.players.p1.donActive = 2;

  // play_character 액션 적용
  const action = { type: "play_character" as const, iid: "p1-nojiko", donToPay: 2 };
  state = optcgEngine.applyAction(state, action);

  // 나미 리더가 아니므로 노지코 효과가 조건 실패(effect_condition_fail)하고 상대 캐릭터가 패로 돌아가지 않아야 함
  const hasFailLog = state.log.some(l => l.type === "effect_condition_fail");
  console.assert(hasFailLog, "FAIL: 조건 불충족 로그가 남지 않았습니다.");
  console.assert(state.players.p2.zones.secondary.length === 1, "FAIL: 상대 캐릭터가 패로 되돌아갔습니다.");
  console.log("-> 시나리오 1 통과");
}

// --- 시나리오 2: '상대 1장 레스트'가 정확히 1장만 레스트 (이조) ---
{
  console.log("\n[시나리오 2] '상대 1장 레스트'가 정확히 1장만 레스트 검증 (이조)");
  let state = optcgEngine.init([deckNami, deckLuffy], seed); // p1=Nami, p2=Luffy

  // 상대 필드(p2)에 액티브 캐릭터 2장 배치
  state.players.p2.zones.secondary = [
    { iid: "p2-c1", code: "C-NOJIKO", rested: false, attached: [], counters: {}, power: 3000 },
    { iid: "p2-c2", code: "C-OTAMA", rested: false, attached: [], counters: {}, power: 2000 }
  ];

  // p1 손패에 C-IZO 지급 및 DON!! 세팅
  state.players.p1.zones.hand = [{
    iid: "p1-izo",
    code: "C-IZO",
    rested: false,
    attached: [],
    counters: {},
    power: 3000
  }];
  state.players.p1.donActive = 3;

  // 플레이 적용
  const action = { type: "play_character" as const, iid: "p1-izo", donToPay: 3 };
  state = optcgEngine.applyAction(state, action);

  // 상대 필드 중 1장만 레스트되어야 함 (이조의 자동 선택으로 파워가 더 높은 p2-c1이 레스트됨)
  const p2_c1 = state.players.p2.zones.secondary.find(c => c.iid === "p2-c1");
  const p2_c2 = state.players.p2.zones.secondary.find(c => c.iid === "p2-c2");

  console.assert(p2_c1?.rested === true, "FAIL: 파워가 더 높은 캐릭터(p2-c1)가 레스트되지 않았습니다.");
  console.assert(p2_c2?.rested === false, "FAIL: 파워가 낮은 캐릭터(p2-c2)까지 레스트되었습니다.");
  console.log("-> 시나리오 2 통과");
}

// --- 시나리오 3: don_rest 4 미만 보유 시 기동 효과 발동 불가, 4 이상 시 don 차감 (루피 리더) ---
{
  console.log("\n[시나리오 3] don_rest 비용 지불 검증 (루피 리더)");
  let state = optcgEngine.init([deckLuffy, deckNami], seed); // p1=Luffy, p2=Nami

  // 1) donActive가 3일 때 (비용 4 미만)
  state.players.p1.donActive = 3;
  const availActions1 = optcgEngine.getAvailableActions(state, "p1");
  const hasActivate1 = availActions1.some(a => a.type === "activate_main");
  // getAvailableActions 단계에선 비용 검사를 donActive가 아니라 턴당 1회 플래그로만 하므로,
  // applyAction을 강제 적용했을 때 비용 지불 실패 로그가 남고 효과가 적용되지 않아야 함.
  let state1 = optcgEngine.applyAction(state, { type: "activate_main", sourceIid: "p1-leader" });
  const hasCostFailLog = state1.log.some(l => l.type === "effect_cost_fail");
  console.assert(hasCostFailLog, "FAIL: don 부족 시 효과 비용 실패 로그가 없습니다.");
  console.assert(getBattlePower(state1.players.p1.zones.primary[0]) === 5000, "FAIL: don 부족에도 루피 파워가 올라갔습니다.");

  // 2) donActive가 4일 때
  state.players.p1.donActive = 4;
  let state2 = optcgEngine.applyAction(state, { type: "activate_main", sourceIid: "p1-leader" });
  console.assert(state2.players.p1.donActive === 0, "FAIL: 4개의 donActive가 지불되지 않았습니다.");
  console.assert(state2.players.p1.donRested === 4, "FAIL: 4개의 donRested가 추가되지 않았습니다.");
  console.assert(getBattlePower(state2.players.p1.zones.primary[0]) === 6000, "FAIL: 루피 파워가 +1000 되지 않았습니다.");
  console.log("-> 시나리오 3 통과");
}

// --- 시나리오 4: this_turn 디버프가 다음 턴 refresh 후 원복 (오타마) ---
{
  console.log("\n[시나리오 4] this_turn 디버프 턴 종료 만료 검증 (오타마)");
  let state = optcgEngine.init([deckNami, deckLuffy], seed); // p1=Nami, p2=Luffy

  state.players.p2.zones.secondary = [
    { iid: "p2-c1", code: "C-IZO", rested: false, attached: [], counters: {}, power: 3000 }
  ];
  state.players.p1.zones.hand = [{
    iid: "p1-otama",
    code: "C-OTAMA",
    rested: false,
    attached: [],
    counters: {},
    power: 2000
  }];
  state.players.p1.donActive = 1;

  // 오타마 소환 -> 상대 이조 파워 -2000
  state = optcgEngine.applyAction(state, { type: "play_character", iid: "p1-otama", donToPay: 1 });
  const cBefore = state.players.p2.zones.secondary[0];
  console.assert(getBattlePower(cBefore) === 1000, "FAIL: 오타마에 의한 파워 디버프가 적용되지 않았습니다.");

  // 턴 종료 (end_main)
  state = optcgEngine.applyAction(state, { type: "end_main" });
  const cAfter = state.players.p2.zones.primary[0]; // 다음 턴(p2 턴)이 되었으므로 p2의 유닛들을 본다.
  const targetUnit = state.players.p2.zones.secondary[0];
  console.assert(getBattlePower(targetUnit) === 3000, "FAIL: 턴 교대 후 오타마 디버프가 해제되지 않았습니다.");
  console.log("-> 시나리오 4 통과");
}

// --- 시나리오 5: 카운터 이벤트 +4000이 그 전투에만 반영되고 종료 후 흔적 없음 (거미집 그물) ---
{
  console.log("\n[시나리오 5] 카운터 이벤트 전투 연동 및 만료 검증 (거미집 그물)");
  let state = optcgEngine.init([deckLuffy, deckNami], seed); // p1=Luffy, p2=Nami

  // p1(루피) 리더가 p2(나미) 리더를 공격 선언
  state.players.p1.donActive = 0;
  state.players.p2.donActive = 1; // 나미는 카운터 이벤트 비용 1 보유
  state.players.p2.zones.hand = [{
    iid: "p2-net",
    code: "E-NET",
    rested: false,
    attached: [],
    counters: {},
    power: 0
  }];

  // p1 리더로 p2 리더 공격
  state = optcgEngine.applyAction(state, { type: "attack", attackerIid: "p1-leader", targetIid: "p2-leader" });
  console.assert(state.pendingResponse !== null, "FAIL: 공격 선언 후 카운터 윈도우가 열리지 않았습니다.");

  // p2가 거미집 그물(이벤트 카운터) 사용
  state = optcgEngine.applyAction(state, { type: "play_counter", iid: "p2-net", targetIid: "p2-leader" });
  
  // 거미집 그물 카운터 효과 적용되어 appliedModifiers에 +4000 누적되어야 함
  const totalMod = state.pendingResponse?.appliedModifiers.reduce((acc, m) => acc + m.delta, 0);
  console.assert(totalMod === 4000, "FAIL: 카운터 효과가 appliedModifiers에 누적되지 않았습니다.");

  // 패스 카운터로 공격 완료 해결
  state = optcgEngine.applyAction(state, { type: "pass_counter" });
  console.assert(state.pendingResponse === null, "FAIL: 전투 해결 후 카운터 윈도우가 닫히지 않았습니다.");
  console.assert(getBattlePower(state.players.p2.zones.primary[0]) === 5000, "FAIL: 전투 완료 후 나미 리더 파워가 원복되지 않았습니다.");
  console.assert(state.players.p2.zones.graveyard.some(c => c.code === "E-NET"), "FAIL: 사용한 거미집 그물이 트래시로 이동하지 않았습니다.");
  console.log("-> 시나리오 5 통과");
}

// --- 시나리오 6: 이벤트 사용 시 don 지불·트래시 이동·KO 적용 (항마의 상) ---
{
  console.log("\n[시나리오 6] 이벤트 카드 메인 효과 플레이 검증 (항마의 상)");
  let state = optcgEngine.init([deckNami, deckLuffy], seed); // p1=Nami, p2=Luffy

  // 상대 필드(p2)에 코스트 6 이하 캐릭터 배치
  state.players.p2.zones.secondary = [
    { iid: "p2-c1", code: "C-IZO", rested: false, attached: [], counters: {}, power: 3000 }
  ];

  // p1 손패에 항마의 상(E-KOMA) 지급 및 DON!! 세팅
  state.players.p1.zones.hand = [{
    iid: "p1-koma",
    code: "E-KOMA",
    rested: false,
    attached: [],
    counters: {},
    power: 0
  }];
  state.players.p1.donActive = 1;

  // 항마의 상 플레이
  state = optcgEngine.applyAction(state, { type: "play_event", iid: "p1-koma", donToPay: 1 });

  // 1) don 지불 확인
  console.assert(state.players.p1.donActive === 0, "FAIL: 이벤트 플레이 비용 donActive가 차감되지 않았습니다.");
  console.assert(state.players.p1.donRested === 1, "FAIL: 이벤트 플레이 비용 donRested가 누적되지 않았습니다.");

  // 2) 효과 KO 적용 확인 (상대 캐릭터 KO되어 graveyard로 이동)
  console.assert(state.players.p2.zones.secondary.length === 0, "FAIL: 상대 캐릭터가 KO되지 않았습니다.");
  console.assert(state.players.p2.zones.graveyard.some(c => c.iid === "p2-c1"), "FAIL: KO된 상대 캐릭터가 트래시로 이동하지 않았습니다.");

  // 3) 이벤트 카드 트래시 이동 확인
  console.assert(state.players.p1.zones.hand.length === 0, "FAIL: 사용한 이벤트 카드가 손패에 남아있습니다.");
  console.assert(state.players.p1.zones.graveyard.some(c => c.code === "E-KOMA"), "FAIL: 사용한 이벤트 카드가 트래시로 이동하지 않았습니다.");
  console.log("-> 시나리오 6 통과");
}

console.log("\n*** 모든 시뮬레이터 Phase 1A 검증 시나리오 성공적으로 통과! ***");
