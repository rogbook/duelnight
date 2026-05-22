/**
 * DuelNight 개인정보 마스킹 및 민감 정보 제거 스크립트
 * (PII Anonymization Script for DB Snapshots and Direct Cleanup)
 *
 * 이 스크립트는 로컬 개발 서버용 DB 혹은 외부 공유용 SQL 백업 데이터에서
 * 사용자 개인정보(이메일, 표시명, 바이오, OAuth 토큰, 결제 내역 등)를
 * 안전하게 가짜 데이터(Fake Data)로 마스킹하거나 제거하는 데 사용됩니다.
 *
 * [지원 모드]
 *   1. Direct DB Mode : Supabase 서비스 롤(Service Role) 권한으로 직접 DB를 클렌징
 *   2. SQL File Mode : 로컬에 있는 raw .sql 파일 내의 이메일 및 개인정보를 Regex 매칭으로 일괄 치환
 *
 * [사용법]
 *   - Direct DB 모드:
 *     export SUPABASE_URL="https://your-project.supabase.co"
 *     export SUPABASE_SERVICE_ROLE_KEY="your-secret-service-role-key"
 *     npx tsx scripts/anonymize-snapshot.ts --db
 *
 *   - SQL 파일 마스킹 모드:
 *     npx tsx scripts/anonymize-snapshot.ts --file input.sql output-anonymized.sql
 */

import * as fs from "fs";
import * as path from "path";
import { createClient } from "@supabase/supabase-js";

// ANSI 색상 코드 정의
const colors = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  cyan: "\x1b[36m",
  bold: "\x1b[1m",
};

function printBanner() {
  console.log(`
${colors.cyan}${colors.bold}=============================================================
             DuelNight PII 개인정보 마스킹 도구             
               (Anonymization & Masking Tool)             
=============================================================${colors.reset}
  `);
}

async function runDirectDBMode() {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    console.error(
      `${colors.red}✖ 오류: SUPABASE_URL 및 SUPABASE_SERVICE_ROLE_KEY 환경변수가 정의되지 않았습니다.${colors.reset}`
    );
    console.error(
      `${colors.yellow}💡 도움말: Direct DB Mode는 반드시 서비스 롤 키(Service Role Key)가 필요합니다 (RLS 바이패스).${colors.reset}\n`
    );
    process.exit(1);
  }

  console.log(`${colors.yellow}ℹ️  Supabase URL: ${supabaseUrl}에 연결 중...${colors.reset}`);
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  try {
    // 1. profiles 테이블 마스킹
    console.log(`\n${colors.cyan}[1/4] profiles 테이블 개인정보 마스킹 시작...${colors.reset}`);
    const { data: profiles, error: pError } = await supabase
      .from("profiles")
      .select("id, display_name, username");

    if (pError) throw new Error(`profiles 조회 실패: ${pError.message}`);

    if (profiles && profiles.length > 0) {
      console.log(`   총 ${profiles.length}개의 프로필 데이터를 처리합니다.`);
      let maskedCount = 0;
      for (const profile of profiles) {
        const maskedName = `플레이어_${profile.id.substring(0, 4)}`;
        const maskedUsername = `user_${profile.id.substring(0, 8)}`;

        const { error: updateErr } = await supabase
          .from("profiles")
          .update({
            display_name: maskedName,
            username: maskedUsername,
            avatar_url: null,
            bio: "이 사용자의 자기소개는 개인정보 보호 정책에 따라 익명화되었습니다.",
          })
          .eq("id", profile.id);

        if (updateErr) {
          console.error(`   ✖ 프로필 업데이트 실패 (ID: ${profile.id}): ${updateErr.message}`);
        } else {
          maskedCount++;
        }
      }
      console.log(`${colors.green}   ✓ 성공적으로 ${maskedCount}개 프로필 마스킹 완료.${colors.reset}`);
    } else {
      console.log("   profiles 테이블이 비어 있습니다.");
    }

    // 2. user_drive_tokens 테이블 클렌징
    console.log(`\n${colors.cyan}[2/4] Google Drive OAuth 토큰 완전 익명화...${colors.reset}`);
    const { data: tokens, error: tError } = await supabase
      .from("user_drive_tokens")
      .select("user_id");

    if (tError) throw new Error(`user_drive_tokens 조회 실패: ${tError.message}`);

    if (tokens && tokens.length > 0) {
      console.log(`   총 ${tokens.length}개의 OAuth 토큰 레코드를 리셋합니다.`);
      const { error: resetErr } = await supabase
        .from("user_drive_tokens")
        .update({
          access_token: "dummy_anonymized_access_token_value_masked_by_antigravity",
          refresh_token: "dummy_anonymized_refresh_token_value_masked_by_antigravity",
          connected_email: "anonymized_user@example.com",
          scope: "https://www.googleapis.com/auth/drive.appdata",
        });

      if (resetErr) {
        console.error(`   ✖ 토큰 테이블 업데이트 실패: ${resetErr.message}`);
      } else {
        console.log(`${colors.green}   ✓ 모든 OAuth 연동 정보 및 개인 이메일 리셋 성공.${colors.reset}`);
      }
    } else {
      console.log("   연동된 Google Drive OAuth 토큰이 없습니다.");
    }

    // 3. payments 결제 내역 마스킹
    console.log(`\n${colors.cyan}[3/4] payments 결제 영수증 및 트랜잭션 마스킹...${colors.reset}`);
    const { data: payments, error: payError } = await supabase
      .from("payments")
      .select("id");

    if (payError) throw new Error(`payments 조회 실패: ${payError.message}`);

    if (payments && payments.length > 0) {
      console.log(`   총 ${payments.length}개의 결제 트랜잭션을 처리합니다.`);
      const { error: payUpdateErr } = await supabase
        .from("payments")
        .update({
          imp_uid: "imp_dummy_anonymized",
          order_id: "order_dummy_anonymized",
          receipt_url: "https://example.com/receipt/anonymized",
        });

      if (payUpdateErr) {
        console.error(`   ✖ 결제 데이터 마스킹 실패: ${payUpdateErr.message}`);
      } else {
        console.log(`${colors.green}   ✓ 포트원/아임포트 결제 영수증 경로 및 ID 익명화 완료.${colors.reset}`);
      }
    } else {
      console.log("   등록된 결제 데이터가 없습니다.");
    }

    // 4. notifications 알림 청소
    console.log(`\n${colors.cyan}[4/4] 알림 메타데이터 및 본문 개인 식별자 마스킹...${colors.reset}`);
    const { error: notifErr } = await supabase
      .from("notifications")
      .update({
        body: "개인 정보가 포함될 수 있어 내용이 마스킹 처리되었습니다.",
      });

    if (notifErr) {
      console.error(`   ✖ 알림 마스킹 실패: ${notifErr.message}`);
    } else {
      console.log(`${colors.green}   ✓ 모든 수신 알림 내용 일괄 마스킹 성공.${colors.reset}`);
    }

    console.log(`\n${colors.green}${colors.bold}🎉 [성공] Supabase 데이터베이스 PII 마스킹을 무사히 마쳤습니다.${colors.reset}\n`);

  } catch (error: any) {
    console.error(`\n${colors.red}✖ 치명적 오류 발생: ${error.message}${colors.reset}\n`);
    process.exit(2);
  }
}

function runFileMode(inputPath: string, outputPath: string) {
  const resolvedIn = path.resolve(inputPath);
  const resolvedOut = path.resolve(outputPath);

  if (!fs.existsSync(resolvedIn)) {
    console.error(`${colors.red}✖ 오류: 입력 파일 '${inputPath}'을 찾을 수 없습니다.${colors.reset}\n`);
    process.exit(1);
  }

  console.log(`${colors.yellow}ℹ️  입력 파일 읽는 중: ${resolvedIn}${colors.reset}`);
  let sql = fs.readFileSync(resolvedIn, "utf-8");

  console.log(`${colors.cyan}ℹ️  개인 정보 식별자(Regex 패턴) 치환 작업 중...${colors.reset}`);

  // 1. 이메일 주소 일괄 치환 (단, example.com이나 시스템 성격 제외)
  const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
  let emailCount = 0;
  sql = sql.replace(emailRegex, (match) => {
    if (match.endsWith("@example.com") || match.includes("lovable.test")) {
      return match;
    }
    emailCount++;
    const hash = Buffer.from(match).toString("hex").substring(0, 6);
    return `anonymized_user_${hash}@example.com`;
  });
  console.log(`   - 이메일 주소 치환: ${emailCount}건 완료`);

  // 2. Google OAuth / access_token 치환
  const oauthTokenRegex = /ya29\.[a-zA-Z0-9-_]+/g;
  let tokenCount = 0;
  sql = sql.replace(oauthTokenRegex, () => {
    tokenCount++;
    return "ya29.anonymized_dummy_google_access_token_masked_by_antigravity";
  });
  console.log(`   - Google Access Token 치환: ${tokenCount}건 완료`);

  // 3. 임의의 refresh_token / 비밀 키 의심 패턴 일괄 치환 (간단 보정)
  // 예: imp_uid 패턴 imp_xxxxxxxxxxxx
  const impUidRegex = /imp_\d{12}/g;
  sql = sql.replace(impUidRegex, "imp_dummy_anonymized_uid");

  console.log(`${colors.yellow}ℹ️  결과 파일 저장 중: ${resolvedOut}${colors.reset}`);
  fs.writeFileSync(resolvedOut, sql, "utf-8");

  console.log(`\n${colors.green}${colors.bold}🎉 [성공] SQL 파일 익명화 필터링이 완료되었습니다! (치환된 원본 백업이 보장됩니다.)${colors.reset}\n`);
}

async function main() {
  printBanner();

  const args = process.argv.slice(2);
  const mode = args[0];

  if (mode === "--db") {
    console.log(`${colors.yellow}${colors.bold}🚨 경고: Direct DB Mode를 실행합니다.${colors.reset}`);
    console.log(`${colors.yellow}이 모드는 데이터베이스의 실제 테이블 레코드를 즉시 변조합니다.${colors.reset}`);
    console.log(`${colors.cyan}프로덕션(실운영) DB에 직접 대입하지 마시고, 개발/테스트 DB에서만 실행하십시오.${colors.reset}\n`);
    await runDirectDBMode();
  } else if (mode === "--file" && args[1] && args[2]) {
    runFileMode(args[1], args[2]);
  } else {
    console.log(`${colors.bold}사용법 (Usage):${colors.reset}`);
    console.log(`  1. Supabase 데이터베이스 레코드 익명화:`);
    console.log(`     ${colors.green}npx tsx scripts/anonymize-snapshot.ts --db${colors.reset}`);
    console.log(`  2. 백업 .sql 파일 내부 이메일/토큰 익명화:`);
    console.log(`     ${colors.green}npx tsx scripts/anonymize-snapshot.ts --file <입력파일.sql> <출력파일.sql>${colors.reset}\n`);
  }
}

main();
