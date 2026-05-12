import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const RARITIES = ["C", "UC", "R", "SR", "SEC"] as const;
const COLORS = ["red", "blue", "green", "purple", "yellow", "black"] as const;
const ATTRIBUTES = ["슬래시", "타격", "참격", "특수", "지혜", "비전"];
const NAME_POOL = [
  "루피", "조로", "나미", "우솝", "상디", "쵸파", "로빈", "프랭키",
  "브룩", "징베", "에이스", "사보", "샹크스", "미호크", "한콕", "로",
];

async function assertAdmin(supabase: any, userId: string) {
  const { data } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (!data) throw new Response("관리자만 호출할 수 있어요", { status: 403 });
}

const genInput = z.object({
  setCode: z.string().trim().min(1).max(16).regex(/^[A-Z0-9_-]+$/i),
  count: z.number().int().min(1).max(50),
});

function rand<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/** 관리자: 더미 카드 일괄 생성 (UPSERT). */
export const generateCards = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => genInput.parse(i))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);

    // 기존 코드 조회 → 다음 시퀀스 번호 확보
    const { data: existing } = await supabase
      .from("cards")
      .select("code")
      .eq("set_code", data.setCode);
    const used = new Set((existing ?? []).map((r: any) => r.code));
    let next = 1;
    const rows: any[] = [];
    for (let i = 0; i < data.count; i++) {
      while (used.has(`${data.setCode}-${String(next).padStart(3, "0")}`)) next++;
      const code = `${data.setCode}-${String(next).padStart(3, "0")}`;
      used.add(code);
      const rarity = rand(RARITIES);
      const isLeader = i === 0 && !(existing ?? []).some((r: any) => r.code.endsWith("-001"));
      rows.push({
        code,
        set_code: data.setCode,
        game: "optcg",
        name: `${rand(NAME_POOL)} ${code}`,
        rarity: isLeader ? "L" : rarity,
        type: isLeader ? "leader" : "character",
        colors: [rand(COLORS)],
        cost: isLeader ? null : Math.floor(Math.random() * 8) + 1,
        power: (Math.floor(Math.random() * 9) + 2) * 1000,
        counter: isLeader ? null : [0, 1000, 2000][Math.floor(Math.random() * 3)],
        attribute: rand(ATTRIBUTES),
        effect: "(자동 생성된 더미 카드)",
        image_url: `/cards/${code}.png`,
      });
    }
    const { error } = await supabase
      .from("cards")
      .upsert(rows, { onConflict: "code" });
    if (error) throw new Response(error.message, { status: 400 });
    return { inserted: rows.length, codes: rows.map((r) => r.code) };
  });

/** 관리자: 누락된 더미 시드 보충 (공지 1건 + 데모 세트 카드). */
export const reseedDemo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);

    const summary: Record<string, number> = { announcements: 0, cards: 0 };

    // 1) 데모 공지가 1건도 없으면 추가
    const { count: annCount } = await supabase
      .from("announcements")
      .select("id", { count: "exact", head: true });
    if ((annCount ?? 0) === 0) {
      const { error } = await supabase.from("announcements").insert({
        title: "TCG Hub에 오신 것을 환영합니다",
        body: "전적 기록·덱 빌더·팩 시뮬레이터를 자유롭게 사용해 보세요.",
        author_id: userId,
        pinned: true,
      });
      if (!error) summary.announcements = 1;
    }

    // 2) DEMO 세트 카드 5장 보충
    const { data: demo } = await supabase
      .from("cards")
      .select("code")
      .eq("set_code", "DEMO");
    const have = new Set((demo ?? []).map((r: any) => r.code));
    const rows: any[] = [];
    for (let i = 1; i <= 5; i++) {
      const code = `DEMO-${String(i).padStart(3, "0")}`;
      if (have.has(code)) continue;
      rows.push({
        code,
        set_code: "DEMO",
        game: "optcg",
        name: `${rand(NAME_POOL)} ${code}`,
        rarity: rand(RARITIES),
        type: i === 1 ? "leader" : "character",
        colors: [rand(COLORS)],
        cost: i === 1 ? null : Math.floor(Math.random() * 8) + 1,
        power: (Math.floor(Math.random() * 9) + 2) * 1000,
        counter: i === 1 ? null : 1000,
        attribute: rand(ATTRIBUTES),
        effect: "(데모 시드 카드)",
        image_url: `/cards/DEMO-${i}.png`,
      });
    }
    if (rows.length > 0) {
      const { error } = await supabase
        .from("cards")
        .upsert(rows, { onConflict: "code" });
      if (!error) summary.cards = rows.length;
    }
    return summary;
  });
