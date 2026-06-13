/**
 * digimoncard.co.kr 카드리스트 카테고리에서 카드 "내용+이미지"를 수집해 DB로 가져온다.
 * (권동휘 요청 2026-06-12 — 수작업 입력 대체. 한국 IP인 로컬 PC에서 실행할 것)
 *
 * 동작(재실행 안전):
 *   1. 카테고리 전 페이지를 돌며 카드 파싱 (코드·이름·레어도·타입·DP·코스트·효과·이미지)
 *   2. DB에 이미 있는 코드는 건너뜀 (기존 데이터 불변)
 *   3. 없는 코드만: 이미지 다운로드 → JPEG 변환(digimon-convert.ps1) → Storage 업로드 → 카드 행 삽입
 *      (필드 규격은 기존 dtcg 카드와 동일: type 매핑, extra jsonb 구조)
 *
 * 사용: bun run import-digimon-set --category 47744           (dry-run)
 *       bun run import-digimon-set --category 47744 --execute
 */
import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { loadLocalEnv } from "./migrate-images";

const TARGET_REF = "nrtdhkjeziknmafauypv";
const BUCKET = "card-images";
const STORAGE_PREFIX = "digimon";
const BASE = "https://digimoncard.co.kr";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
const MAX_PAGES = 30;
const TMP = path.resolve(process.cwd(), "backups", "digimon-import");

/** 사이트 카드타입 → cards.type enum (기존 DB 관례와 동일) */
const TYPE_MAP: Record<string, string> = {
  디지몬: "character",
  테이머: "character",
  옵션: "event",
  디지타마: "stage",
};

type Scraped = {
  code: string;
  name: string;
  rarity: string | null;
  category: string;
  level: string | null;
  imageUrl: string;
  fields: Record<string, string>; // dt/dd
};

function dash(v: string | undefined | null): string | null {
  const s = (v ?? "").trim();
  return !s || s === "-" ? null : s;
}

function toInt(v: string | null): number | null {
  if (!v) return null;
  const n = Number(v.replaceAll(",", ""));
  return Number.isFinite(n) ? n : null;
}

function parsePage(html: string): Scraped[] {
  const out: Scraped[] = [];
  for (const it of html.split(/<li class="image_lists_item/).slice(1)) {
    const img = it.match(/src="((?:https:\/\/digimoncard\.co\.kr)?\/files\/attach\/images[^"]+)"/);
    const nameLine = it.match(/class="card_name"[^>]*>\s*([A-Z]+\d*-\d+[A-Z]?\d*)\s+([^<]+)</);
    const rarity = it.match(/class="cardno">[^<]*<\/li>\s*<li>([^<]*)</);
    const category = it.match(/class="cardtype">([^<]*)</);
    const level = it.match(/class="cardlv">([^<]*)</);
    if (!img || !nameLine) continue;

    const fields: Record<string, string> = {};
    for (const m of it.matchAll(/<dt[^>]*>([^<]*)<\/dt>\s*<dd[^>]*>([\s\S]*?)<\/dd>/g)) {
      fields[m[1].trim()] = m[2]
        .replace(/<[^>]+>/g, "")
        .replace(/&\w+;/g, "")
        .trim();
    }
    out.push({
      code: nameLine[1].trim(),
      name: nameLine[2].trim(),
      rarity: dash(rarity?.[1]),
      category: (category?.[1] ?? "").trim(),
      level: dash(level?.[1]),
      imageUrl: img[1].startsWith("http") ? img[1] : BASE + img[1],
      fields,
    });
  }
  return out;
}

async function fetchCategory(category: string): Promise<Scraped[]> {
  const all = new Map<string, Scraped>();
  for (let page = 1; page <= MAX_PAGES; page++) {
    const url = `${BASE}/index.php?mid=cardlist&category=${category}&page=${page}`;
    const res = await fetch(url, {
      headers: { "User-Agent": UA },
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) throw new Error(`페이지 ${page} HTTP ${res.status}`);
    const cards = parsePage(await res.text());
    const before = all.size;
    for (const c of cards) all.set(c.code, c);
    console.log(`  page ${page}: ${cards.length}장 (누적 고유 ${all.size})`);
    if (cards.length === 0 || all.size === before) break; // 끝 페이지(반복) 감지
  }
  return [...all.values()];
}

function toCardRow(s: Scraped, setCode: string) {
  const f = s.fields;
  const textTop = dash(f["상단 텍스트"]);
  const textBottom = dash(f["하단 텍스트"]);
  const security = dash(f["시큐리티 효과"]);
  const traits = dash(f["유형"]);
  return {
    code: s.code,
    game: "dtcg",
    set_code: setCode,
    name: s.name,
    type: TYPE_MAP[s.category] ?? "character",
    colors: [],
    cost: toInt(dash(f["등장 코스트"])),
    power: toInt(dash(f["DP"])),
    attribute: dash(f["속성"]),
    rarity: s.rarity,
    effect: textTop ?? textBottom ?? security,
    traits: traits
      ? traits
          .split("/")
          .map((t) => t.trim())
          .filter(Boolean)
      : [],
    extra: {
      form: dash(f["형태"]),
      category: s.category,
      text_top: textTop,
      text_bottom: textBottom,
      evo_cost_1: dash(f["진화 코스트 1"]),
      evo_cost_2: dash(f["진화 코스트 2"]),
      ...(security ? { security } : {}),
    },
    status: "approved",
  };
}

async function mapConcurrent<T>(items: T[], limit: number, worker: (t: T) => Promise<void>) {
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (cursor < items.length) await worker(items[cursor++]);
    }),
  );
}

function requireEnv(name: string): string {
  const v = process.env[name]?.trim();
  if (!v) throw new Error(`환경 변수 ${name} 필요`);
  return v;
}

async function run() {
  loadLocalEnv();
  const args = process.argv.slice(2);
  const execute = args.includes("--execute");
  const catIdx = args.indexOf("--category");
  const category = catIdx >= 0 ? args[catIdx + 1] : "";
  if (!/^\d+$/.test(category)) throw new Error("--category <숫자> 가 필요합니다.");

  const url = requireEnv("SUPABASE_URL");
  if (!url.includes(TARGET_REF)) throw new Error(`대상이 ${TARGET_REF}가 아님`);
  const db: SupabaseClient = createClient(url, requireEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  console.log(`카테고리 ${category} 수집 중...`);
  const scraped = await fetchCategory(category);
  console.log(`수집: ${scraped.length}장 고유 코드`);
  if (scraped.length === 0) throw new Error("수집 결과 0장 — 파싱 구조 변경 가능성");

  // 세트명: 입수 정보 "...팩 NAME [BTK-NN]" → "BTK-NN ...팩 NAME" (기존 표기와 동일 형식)
  const src = scraped.find((s) => /\[[A-Z]+-\d+\]/.test(s.fields["입수 정보"] ?? ""));
  const info = src?.fields["입수 정보"] ?? "";
  const setMatch = info.match(/(부스터 팩|스타트 덱|테마 부스터)?\s*([^[]+)\[([A-Z]+-\d+)\]/);
  const setCode = setMatch
    ? `${setMatch[3]} ${(setMatch[1] ?? "").trim()} ${setMatch[2].trim()}`
        .replace(/\s+/g, " ")
        .trim()
    : `category-${category}`;
  console.log(`세트명: ${setCode}`);

  const codes = scraped.map((s) => s.code);
  const existing = new Set<string>();
  for (let i = 0; i < codes.length; i += 500) {
    const { data, error } = await db
      .from("cards")
      .select("code")
      .in("code", codes.slice(i, i + 500));
    if (error) throw new Error(`기존 코드 조회 실패: ${error.message}`);
    for (const r of data ?? []) existing.add(r.code as string);
  }
  const newOnes = scraped.filter((s) => !existing.has(s.code));
  console.log(`DB에 이미 있음: ${existing.size}장 (건너뜀) / 신규 추가 대상: ${newOnes.length}장`);
  if (!execute) {
    console.log(
      "dry-run. 신규 예시:",
      newOnes.slice(0, 8).map((s) => `${s.code} ${s.name}`),
    );
    return;
  }
  if (newOnes.length === 0) return console.log("추가할 카드 없음(이미 완료).");

  // 세트 등록(없으면)
  const { data: setRow } = await db
    .from("card_sets")
    .select("id")
    .eq("name", setCode)
    .maybeSingle();
  if (!setRow) {
    const { error } = await db.from("card_sets").insert({ name: setCode, game: "dtcg" });
    if (error) console.error("card_sets 추가 실패(무시):", error.message);
  }

  // A. 이미지 다운로드
  const srcDir = path.join(TMP, category, "src");
  const outDir = path.join(TMP, category, "out");
  fs.mkdirSync(srcDir, { recursive: true });
  let dlFail: string[] = [];
  console.log("A. 이미지 다운로드...");
  await mapConcurrent(newOnes, 6, async (s) => {
    const dest = path.join(srcDir, `${s.code}.png`);
    if (fs.existsSync(dest) && fs.statSync(dest).size > 0) return;
    try {
      const res = await fetch(s.imageUrl, {
        headers: { "User-Agent": UA, Referer: `${BASE}/` },
        signal: AbortSignal.timeout(20000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      fs.writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
    } catch (e) {
      dlFail.push(`${s.code}: ${e instanceof Error ? e.message : e}`);
    }
  });
  console.log(`   실패 ${dlFail.length}건`, dlFail.slice(0, 5));

  // B. JPEG 변환
  console.log("B. JPEG 변환...");
  const conv = spawnSync(
    "powershell.exe",
    [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      path.resolve("scripts", "digimon-convert.ps1"),
      "-SrcDir",
      srcDir,
      "-OutDir",
      outDir,
    ],
    { stdio: "inherit" },
  );
  if (conv.status !== 0) throw new Error("변환 실패");

  // C. 업로드 + 카드 삽입
  console.log("C. 업로드 + 카드 행 삽입...");
  let ok = 0;
  const fail: string[] = [];
  await mapConcurrent(newOnes, 5, async (s) => {
    try {
      const jpg = path.join(outDir, `${s.code}.jpg`);
      if (!fs.existsSync(jpg)) throw new Error("변환본 없음");
      const objectPath = `${STORAGE_PREFIX}/${s.code}.jpg`;
      const { error: upErr } = await db.storage
        .from(BUCKET)
        .upload(objectPath, fs.readFileSync(jpg), { contentType: "image/jpeg", upsert: true });
      if (upErr) throw new Error(`업로드: ${upErr.message}`);
      const { data: pub } = db.storage.from(BUCKET).getPublicUrl(objectPath);
      const row = { ...toCardRow(s, setCode), image_url: pub.publicUrl };
      const { error: insErr } = await db.from("cards").upsert(row, { onConflict: "code" });
      if (insErr) throw new Error(`DB: ${insErr.message}`);
      ok++;
    } catch (e) {
      fail.push(`${s.code}: ${e instanceof Error ? e.message : e}`);
    }
  });
  console.log(`완료: 추가 ${ok}장, 실패 ${fail.length}건`);
  if (fail.length) console.log("실패:", fail.slice(0, 10));
  fs.mkdirSync(TMP, { recursive: true });
  fs.writeFileSync(
    path.join(TMP, `report-${category}-${Date.now()}.json`),
    JSON.stringify(
      { setCode, scraped: scraped.length, existing: existing.size, added: ok, dlFail, fail },
      null,
      2,
    ),
  );
}

if (import.meta.main) {
  run().catch((e) => {
    console.error(`가져오기 실패: ${e instanceof Error ? e.message : e}`);
    process.exitCode = 1;
  });
}
