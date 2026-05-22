/**
 * DuelNight 원격 DB 백업 및 PII 마스킹 스냅샷 자동화 도구
 * (Remote DB Backup & Anonymized Snapshot Automation)
 *
 * 이 스크립트는 원격 Supabase DB의 주요 테이블 데이터를 페칭하여
 * 개인정보(PII)를 안전하게 마스킹한 뒤, 로컬 백업 디렉토리에
 * JSON 스냅샷 파일로 덤프 저장하는 통합 백업 솔루션입니다.
 */

import * as fs from "fs";
import * as path from "path";
import { createClient } from "@supabase/supabase-js";

import { fileURLToPath } from "url";

// ANSI 색상 코드
const colors = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  cyan: "\x1b[36m",
  bold: "\x1b[1m",
};

// ES 모듈 호환 경로 획득
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, "..");
const BACKUP_DIR = path.join(PROJECT_ROOT, "backups");

// .env 파일이 존재하는 경우 직접 파싱하여 환경 변수 보정
function loadEnvFile() {
  const envPath = path.join(PROJECT_ROOT, ".env");
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, "utf-8");
    envContent.split("\n").forEach((line) => {
      const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
      if (match) {
        const key = match[1];
        let value = match[2] || "";
        // 따옴표 제거
        if (value.startsWith('"') && value.endsWith('"')) {
          value = value.substring(1, value.length - 1);
        } else if (value.startsWith("'") && value.endsWith("'")) {
          value = value.substring(1, value.length - 1);
        }
        if (!process.env[key]) {
          process.env[key] = value;
        }
      }
    });
  }
}

// PII 데이터 마스킹 처리 함수
function maskProfiles(profiles: any[]) {
  return profiles.map((p) => ({
    ...p,
    display_name: `플레이어_${p.id.substring(0, 4)}`,
    username: `user_${p.id.substring(0, 8)}`,
    avatar_url: null,
    bio: "개인정보 보호 정책에 따라 익명화 처리되었습니다.",
  }));
}

function maskUserDriveTokens(tokens: any[]) {
  return tokens.map((t) => ({
    ...t,
    access_token: "dummy_anonymized_access_token_value_masked_by_antigravity",
    refresh_token: "dummy_anonymized_refresh_token_value_masked_by_antigravity",
    connected_email: "anonymized_user@example.com",
  }));
}

function maskPayments(payments: any[]) {
  return payments.map((p) => ({
    ...p,
    imp_uid: "imp_dummy_anonymized",
    order_id: "order_dummy_anonymized",
    receipt_url: "https://example.com/receipt/anonymized",
  }));
}

function maskNotifications(notifications: any[]) {
  return notifications.map((n) => ({
    ...n,
    body: "개인 정보가 포함될 수 있어 내용이 마스킹 처리되었습니다.",
  }));
}

async function main() {
  console.log(`
${colors.cyan}${colors.bold}=============================================================
             DuelNight 통합 DB 백업 및 익명화 파이프라인             
=============================================================${colors.reset}
  `);

  loadEnvFile();

  // 환경변수 추출 (VITE_ 접두사도 호환 지원)
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  // 서비스 롤 키가 없으면 anon 키로 대체 시도하나 RLS로 인해 백업이 온전치 않을 수 있으므로 경고
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  const isUsingServiceRole = !!process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    console.error(`${colors.red}✖ 오류: Supabase 접속을 위한 환경변수가 설정되지 않았습니다.${colors.reset}`);
    console.error(`${colors.yellow}💡 해결 방법: 프로젝트 루트의 .env 파일에 SUPABASE_URL 및 SUPABASE_SERVICE_ROLE_KEY를 정의해 주세요.${colors.reset}\n`);
    process.exit(1);
  }

  if (!isUsingServiceRole) {
    console.warn(`${colors.yellow}⚠️ 경고: SUPABASE_SERVICE_ROLE_KEY가 감지되지 않아 퍼블릭 API Key를 사용합니다.${colors.reset}`);
    console.warn(`${colors.yellow}일부 비공개 테이블(RLS 적용 테이블)은 백업되지 않을 수 있습니다.${colors.reset}\n`);
  }

  // 백업 디렉토리 없으면 자동 생성
  if (!fs.existsSync(BACKUP_DIR)) {
    console.log(`${colors.yellow}ℹ️  백업 폴더 생성 중: ${BACKUP_DIR}${colors.reset}`);
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
  }

  console.log(`${colors.yellow}ℹ️  Supabase URL: ${supabaseUrl}에 연결 중...${colors.reset}`);
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  // 백업 대상 테이블 목록 정의
  const tables = [
    { name: "profiles", hasPII: true },
    { name: "user_drive_tokens", hasPII: true },
    { name: "payments", hasPII: true },
    { name: "notifications", hasPII: true },
    { name: "cards", hasPII: false },
    { name: "decks", hasPII: false },
    { name: "deck_cards", hasPII: false },
    { name: "announcements", hasPII: false },
    { name: "lfg_posts", hasPII: false }
  ];

  const snapshot: Record<string, any[]> = {};
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filename = `db-snapshot-${timestamp}.json`;
  const outputPath = path.join(BACKUP_DIR, filename);

  console.log(`\n${colors.cyan}🚀 원격 Supabase 데이터베이스 테이블 덤프 시작...${colors.reset}`);

  try {
    for (const table of tables) {
      console.log(`   - [페칭] ${table.name} 테이블 데이터 수집 중...`);
      const { data, error } = await supabase.from(table.name).select("*");

      if (error) {
        console.error(`     ${colors.red}✖ ${table.name} 백업 실패: ${error.message}${colors.reset}`);
        continue;
      }

      let processedData = data || [];

      if (table.hasPII && processedData.length > 0) {
        console.log(`     ${colors.yellow}🛡️  ${table.name} 내 개인정보(PII) 감지됨. 즉시 익명화 필터링 적용 중...${colors.reset}`);
        if (table.name === "profiles") {
          processedData = maskProfiles(processedData);
        } else if (table.name === "user_drive_tokens") {
          processedData = maskUserDriveTokens(processedData);
        } else if (table.name === "payments") {
          processedData = maskPayments(processedData);
        } else if (table.name === "notifications") {
          processedData = maskNotifications(processedData);
        }
        console.log(`     ${colors.green}✓ ${table.name} ${processedData.length}건 마스킹 및 수집 완료.${colors.reset}`);
      } else {
        console.log(`     ${colors.green}✓ ${table.name} ${processedData.length}건 수집 완료 (마스킹 불필요).${colors.reset}`);
      }

      snapshot[table.name] = processedData;
    }

    // JSON 스냅샷 저장
    console.log(`\n${colors.yellow}ℹ️  익명화된 스냅샷 파일 저장 중...${colors.reset}`);
    fs.writeFileSync(outputPath, JSON.stringify(snapshot, null, 2), "utf-8");

    console.log(`
${colors.green}${colors.bold}🎉 [백업 성공] 안전하게 마스킹 처리된 DB 스냅샷이 생성되었습니다!${colors.reset}
📍 백업 위치: ${colors.cyan}${outputPath}${colors.reset}
💾 용량: ${(fs.statSync(outputPath).size / 1024).toFixed(2)} KB
    `);

  } catch (error: any) {
    console.error(`\n${colors.red}✖ 백업 도중 치명적인 오류가 발생했습니다: ${error.message}${colors.reset}\n`);
    process.exit(2);
  }
}

main();
