import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";
import * as path from "path";

// 1. 로컬 환경 변수 로더 (.env.local 및 .env 로드)
function loadEnv() {
  const envPaths = [".env.local", ".env"];
  for (const file of envPaths) {
    const fullPath = path.resolve(process.cwd(), file);
    if (fs.existsSync(fullPath)) {
      const content = fs.readFileSync(fullPath, "utf-8");
      for (const line of content.split("\n")) {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith("#")) {
          const index = trimmed.indexOf("=");
          if (index > 0) {
            const key = trimmed.substring(0, index).trim();
            let value = trimmed.substring(index + 1).trim();
            if (
              (value.startsWith('"') && value.endsWith('"')) ||
              (value.startsWith("'") && value.endsWith("'"))
            ) {
              value = value.substring(1, value.length - 1);
            }
            if (!process.env[key]) {
              process.env[key] = value;
            }
          }
        }
      }
    }
  }
}

loadEnv();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("✖ 에러: SUPABASE_URL 및 SUPABASE_SERVICE_ROLE_KEY 환경 변수가 필요합니다.");
  console.error("  .env.local 파일에 설정되어 있는지 확인해 주세요.");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    persistSession: false,
  },
});

// 프로젝트 Reference 추출 함수
function getProjectRef(url: string): string {
  const match = url.match(/https?:\/\/([^.]+)\.supabase/);
  return match ? match[1] : "";
}

const NEW_PROJECT_REF = getProjectRef(SUPABASE_URL);

// 이전 대상 URL 판별 함수
function shouldMigrate(url: string | null): boolean {
  if (!url) return false;
  // Supabase 스토리지 도메인을 포함하고 있으며, 현재 프로젝트 ref를 포함하고 있지 않은 경우 이관 대상
  return url.includes(".supabase.co") && !url.includes(`${NEW_PROJECT_REF}.supabase.co`);
}

// 스토리지 파일 경로 파싱 함수
function getStoragePath(url: string): string | null {
  const prefix = "/storage/v1/object/public/card-images/";
  const index = url.indexOf(prefix);
  if (index !== -1) {
    return url.substring(index + prefix.length);
  }
  
  // 일반적인 pathname 파싱 시도
  try {
    const parsed = new URL(url);
    const pathParts = parsed.pathname.split("/");
    const bucketIndex = pathParts.indexOf("card-images");
    if (bucketIndex !== -1 && bucketIndex < pathParts.length - 1) {
      return pathParts.slice(bucketIndex + 1).join("/");
    }
  } catch (e) {
    // 무시
  }
  return null;
}

async function run() {
  console.log("==========================================");
  console.log("  DuelNight DB 이미지 스토리지 이관 스크립트");
  console.log("==========================================");
  console.log(`대상 Supabase URL: ${SUPABASE_URL}`);
  console.log(`현재 프로젝트 Ref: ${NEW_PROJECT_REF}`);
  console.log("------------------------------------------");

  // 2. card-images 버킷이 있는지 확인 후 없으면 자동 생성
  console.log("1. Supabase Storage 버킷 상태 확인 중...");
  const { data: buckets, error: getBucketsErr } = await supabase.storage.listBuckets();
  if (getBucketsErr) {
    console.error("✖ 버킷 목록 확인 실패:", getBucketsErr.message);
    process.exit(1);
  }

  const hasBucket = buckets?.some((b) => b.name === "card-images");
  if (!hasBucket) {
    console.log("  ↳ 'card-images' 버킷이 발견되지 않았습니다. 생성 중...");
    const { error: createErr } = await supabase.storage.createBucket("card-images", {
      public: true,
      allowedMimeTypes: ["image/jpeg", "image/png", "image/webp", "image/gif"],
    });
    if (createErr) {
      console.error("✖ 'card-images' 버킷 생성 실패:", createErr.message);
      process.exit(1);
    }
    console.log("  ↳ 'card-images' 버킷이 생성되었습니다.");
  } else {
    console.log("  ↳ 'card-images' 버킷 확인 완료 (존재함)");
  }

  // 3. cards 및 card_illustrations 테이블에서 이관이 필요한 URL 가져오기
  console.log("\n2. 데이터베이스 테이블 스캔 중...");
  
  const { data: cards, error: cardsErr } = await supabase
    .from("cards")
    .select("id, code, name, image_url")
    .not("image_url", "is", null);

  if (cardsErr) {
    console.error("✖ cards 조회 실패:", cardsErr.message);
    process.exit(1);
  }

  const { data: illustrations, error: illErr } = await supabase
    .from("card_illustrations")
    .select("id, card_code, image_url")
    .not("image_url", "is", null);

  if (illErr) {
    console.error("✖ card_illustrations 조회 실패:", illErr.message);
    process.exit(1);
  }

  console.log(`  - cards 총 행 개수 (이미지 보유): ${cards?.length ?? 0}`);
  console.log(`  - card_illustrations 총 행 개수 (이미지 보유): ${illustrations?.length ?? 0}`);

  // 이관 대상 선별
  const cardsToMigrate = (cards ?? []).filter((c) => shouldMigrate(c.image_url));
  const illToMigrate = (illustrations ?? []).filter((i) => shouldMigrate(i.image_url));

  console.log(`  ↳ 이관 대상 cards: ${cardsToMigrate.length}개`);
  console.log(`  ↳ 이관 대상 card_illustrations: ${illToMigrate.length}개`);

  if (cardsToMigrate.length === 0 && illToMigrate.length === 0) {
    console.log("\n✅ 이관이 필요한 이미지가 없습니다. 이미 모두 최신 상태입니다.");
    process.exit(0);
  }

  // 중복 제거된 다운로드 대상 수집
  const uniqueUrls = new Set<string>();
  cardsToMigrate.forEach((c) => uniqueUrls.add(c.image_url!));
  illToMigrate.forEach((i) => uniqueUrls.add(i.image_url!));

  console.log(`\n3. 이미지 이관 다운로드/업로드 시작 (총 ${uniqueUrls.size}개 유니크 이미지)...`);

  const urlMap = new Map<string, string>(); // oldUrl -> newUrl mapping
  let successCount = 0;
  let failCount = 0;

  for (const oldUrl of uniqueUrls) {
    const storagePath = getStoragePath(oldUrl);
    if (!storagePath) {
      console.log(`  ✖ [경고] 경로를 파싱할 수 없는 URL 건너뜀: ${oldUrl}`);
      failCount++;
      continue;
    }

    try {
      console.log(`  [${successCount + failCount + 1}/${uniqueUrls.size}] 이관 중: ${storagePath}`);
      
      // 이미지 다운로드
      const response = await fetch(oldUrl);
      if (!response.ok) {
        throw new Error(`다운로드 실패 (HTTP Status: ${response.status})`);
      }
      
      const contentType = response.headers.get("content-type") || "image/webp";
      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      // 새 스토리지에 업로드
      const { error: uploadErr } = await supabase.storage
        .from("card-images")
        .upload(storagePath, buffer, {
          contentType,
          upsert: true,
        });

      if (uploadErr) {
        throw new Error(`업로드 실패: ${uploadErr.message}`);
      }

      // 새 퍼블릭 URL 가져오기
      const { data: pubData } = supabase.storage
        .from("card-images")
        .getPublicUrl(storagePath);
      
      const newUrl = pubData.publicUrl;
      urlMap.set(oldUrl, newUrl);
      successCount++;
      
    } catch (e: any) {
      console.error(`  ✖ [에러] ${storagePath} 이관 실패:`, e.message);
      failCount++;
    }
  }

  console.log(`\n  ↳ 이관 처리 완료 (성공: ${successCount}, 실패: ${failCount})`);

  // 4. 데이터베이스 갱신
  console.log("\n4. 데이터베이스 이미지 URL 일괄 업데이트 중...");
  
  let cardsUpdated = 0;
  let illsUpdated = 0;

  // cards 테이블 업데이트
  for (const card of cardsToMigrate) {
    const newUrl = urlMap.get(card.image_url!);
    if (newUrl) {
      const { error: updateErr } = await supabase
        .from("cards")
        .update({ image_url: newUrl })
        .eq("id", card.id);
      
      if (updateErr) {
        console.error(`  ✖ card ${card.code} 업데이트 실패:`, updateErr.message);
      } else {
        cardsUpdated++;
      }
    }
  }

  // card_illustrations 테이블 업데이트
  for (const ill of illToMigrate) {
    const newUrl = urlMap.get(ill.image_url!);
    if (newUrl) {
      const { error: updateErr } = await supabase
        .from("card_illustrations")
        .update({ image_url: newUrl })
        .eq("id", ill.id);
      
      if (updateErr) {
        console.error(`  ✖ illustration ${ill.id} 업데이트 실패:`, updateErr.message);
      } else {
        illsUpdated++;
      }
    }
  }

  console.log(`  ↳ cards 테이블 업데이트 완료: ${cardsUpdated}개 행`);
  console.log(`  ↳ card_illustrations 테이블 업데이트 완료: ${illsUpdated}개 행`);
  console.log("\n==========================================");
  console.log("🎉 이미지 이관 작업이 모두 성공적으로 완료되었습니다!");
  console.log("==========================================");
}

run().catch((e) => {
  console.error("스크립트 실행 실패:", e);
  process.exit(1);
});
