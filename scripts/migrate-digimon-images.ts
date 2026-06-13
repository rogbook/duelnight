/**
 * 디지몬(dtcg) 카드 이미지를 외부 사이트(digimoncard.co.kr)에서 우리 Supabase Storage로 이관.
 *
 * 배경: 디지몬 카드는 image_url이 digimoncard.co.kr 외부 링크다. 그 사이트가
 * Cloudflare(해외/데이터센터) IP를 차단해 베타 서버에서 이미지가 안 보인다.
 * → 이 스크립트를 "한국 IP인 로컬 PC"에서 실행해 원본을 받아 우리 스토리지에 올리고 URL을 교체한다.
 *
 * 단계(전부 재실행 안전):
 *   A. 대상 카드 조회 → 원본 PNG 다운로드(이미 받은 건 건너뜀)
 *   B. PowerShell(System.Drawing)로 일괄 JPEG 변환(최대 500px, q82 ≈ 50KB)
 *   C. 변환본을 Storage(card-images/digimon/<code>.jpg)에 업로드 + cards.image_url 갱신
 *
 * 사용: bun run migrate-digimon            (dry-run: 대상 수만 출력)
 *       bun run migrate-digimon --execute  (실제 이관)
 */
import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { loadLocalEnv } from "./migrate-images";

const TARGET_REF = "nrtdhkjeziknmafauypv";
const BUCKET = "card-images";
const SRC_HOST = "digimoncard.co.kr";
const STORAGE_PREFIX = "digimon";
const DOWNLOAD_CONCURRENCY = 6;
const UPLOAD_CONCURRENCY = 6;
const TMP = path.resolve(process.cwd(), "backups", "digimon-migrate");
const SRC_DIR = path.join(TMP, "src");
const OUT_DIR = path.join(TMP, "out");
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

type CardRow = { code: string; image_url: string };

function requireEnv(name: string): string {
  const v = process.env[name]?.trim();
  if (!v) throw new Error(`환경 변수 ${name}이 필요합니다.`);
  return v;
}

async function mapConcurrent<T>(
  items: T[],
  limit: number,
  worker: (item: T, i: number) => Promise<void>,
): Promise<void> {
  let cursor = 0;
  async function run() {
    while (cursor < items.length) {
      const i = cursor++;
      await worker(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
}

async function fetchTargets(db: SupabaseClient): Promise<CardRow[]> {
  const rows: CardRow[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db
      .from("cards")
      .select("code, image_url")
      .eq("game", "dtcg")
      .ilike("image_url", `%${SRC_HOST}%`)
      .order("code", { ascending: true })
      .range(from, from + 999);
    if (error) throw new Error(`카드 조회 실패: ${error.message}`);
    const page = (data ?? []) as CardRow[];
    rows.push(...page);
    if (page.length < 1000) break;
  }
  return rows;
}

async function downloadAll(targets: CardRow[]): Promise<{ ok: number; fail: string[] }> {
  fs.mkdirSync(SRC_DIR, { recursive: true });
  let ok = 0;
  const fail: string[] = [];
  await mapConcurrent(targets, DOWNLOAD_CONCURRENCY, async (card) => {
    const dest = path.join(SRC_DIR, `${card.code}.png`);
    if (fs.existsSync(dest) && fs.statSync(dest).size > 0) {
      ok++;
      return;
    }
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const res = await fetch(card.image_url, {
          headers: { "User-Agent": UA, Referer: `https://${SRC_HOST}/` },
          signal: AbortSignal.timeout(20000),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const buf = Buffer.from(await res.arrayBuffer());
        if (buf.length < 100) throw new Error("빈 응답");
        fs.writeFileSync(dest, buf);
        ok++;
        return;
      } catch (e) {
        if (attempt === 3) fail.push(`${card.code}: ${e instanceof Error ? e.message : e}`);
        else await new Promise((r) => setTimeout(r, attempt * 800));
      }
    }
  });
  return { ok, fail };
}

function convertAll(): void {
  const script = path.resolve(process.cwd(), "scripts", "digimon-convert.ps1");
  const r = spawnSync(
    "powershell.exe",
    [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      script,
      "-SrcDir",
      SRC_DIR,
      "-OutDir",
      OUT_DIR,
    ],
    { stdio: "inherit" },
  );
  if (r.status !== 0) throw new Error("PowerShell 변환 실패");
}

async function uploadAndRewrite(
  db: SupabaseClient,
  targets: CardRow[],
): Promise<{ uploaded: number; updated: number; fail: string[] }> {
  let uploaded = 0;
  let updated = 0;
  const fail: string[] = [];
  await mapConcurrent(targets, UPLOAD_CONCURRENCY, async (card) => {
    const jpg = path.join(OUT_DIR, `${card.code}.jpg`);
    if (!fs.existsSync(jpg)) {
      fail.push(`${card.code}: 변환본 없음`);
      return;
    }
    const objectPath = `${STORAGE_PREFIX}/${card.code}.jpg`;
    try {
      const bytes = fs.readFileSync(jpg);
      const { error: upErr } = await db.storage
        .from(BUCKET)
        .upload(objectPath, bytes, { contentType: "image/jpeg", upsert: true });
      if (upErr) throw new Error(`업로드: ${upErr.message}`);
      uploaded++;

      const { data: pub } = db.storage.from(BUCKET).getPublicUrl(objectPath);
      const { error: dbErr } = await db
        .from("cards")
        .update({ image_url: pub.publicUrl })
        .eq("code", card.code)
        .eq("image_url", card.image_url);
      if (dbErr) throw new Error(`DB: ${dbErr.message}`);
      updated++;
    } catch (e) {
      fail.push(`${card.code}: ${e instanceof Error ? e.message : e}`);
    }
  });
  return { uploaded, updated, fail };
}

async function run() {
  loadLocalEnv();
  const execute = process.argv.includes("--execute");
  const url = requireEnv("SUPABASE_URL");
  const key = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  if (!url.includes(TARGET_REF)) throw new Error(`대상이 ${TARGET_REF}가 아닙니다: ${url}`);
  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  console.log("대상 디지몬 카드 조회 중...");
  const targets = await fetchTargets(db);
  console.log(`대상 ${targets.length}장 (image_url이 ${SRC_HOST})`);
  if (!execute) {
    console.log("dry-run입니다. 실제 이관은 --execute 를 붙이세요.");
    return;
  }
  if (targets.length === 0) {
    console.log("이관할 대상이 없습니다(이미 완료).");
    return;
  }

  console.log("A. 원본 다운로드(한국 IP)...");
  const dl = await downloadAll(targets);
  console.log(`   다운로드 성공 ${dl.ok}, 실패 ${dl.fail.length}`);
  if (dl.fail.length) console.log("   실패 예:", dl.fail.slice(0, 5));

  console.log("B. JPEG 변환(PowerShell)...");
  convertAll();

  console.log("C. 업로드 + URL 갱신...");
  const up = await uploadAndRewrite(db, targets);
  console.log(`   업로드 ${up.uploaded}, URL갱신 ${up.updated}, 실패 ${up.fail.length}`);
  if (up.fail.length) console.log("   실패 예:", up.fail.slice(0, 10));

  const reportPath = path.join(
    TMP,
    `report-${new Date().toISOString().replaceAll(/[:.]/g, "-")}.json`,
  );
  fs.writeFileSync(
    reportPath,
    JSON.stringify({ targets: targets.length, download: dl, upload: up }, null, 2),
  );
  console.log(`완료. 보고서: ${reportPath}`);
}

if (import.meta.main) {
  run().catch((e) => {
    console.error(`디지몬 이미지 이관 실패: ${e instanceof Error ? e.message : e}`);
    process.exitCode = 1;
  });
}
