import * as fs from "node:fs";
import * as path from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getProjectRef, loadLocalEnv } from "./migrate-images";

const DEFAULT_SOURCE_URL = "https://tgybttphkmesgfbtgftt.supabase.co";
const EXPECTED_TARGET_REF = "nrtdhkjeziknmafauypv";
const PAGE_SIZE = 1_000;
const UPSERT_CHUNK_SIZE = 500;
const MAX_ERRORS_PER_TABLE = 20;
const FK_VIOLATION_CODE = "23503";

type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

type Row = Record<string, JsonValue>;

export type TableConfig = {
  name: string;
  /** upsert onConflict 컬럼 = 행 식별자 (PK 또는 unique 키) */
  conflict: string[];
  /** auth.users FK 컬럼 — 대상에 해당 사용자가 없으면 행을 보류 */
  authUserColumns?: string[];
  /** --prune 시 원본에 없는 대상 행을 삭제할 수 있는 카탈로그 테이블 */
  prunable?: boolean;
};

/**
 * FK 의존 순서대로 정렬된 동기화 대상.
 * 제외: oauth_states(만료성 임시 데이터), user_drive_tokens(OAuth 토큰 시크릿).
 * cards는 시드 데이터와 id가 달라 unique한 code를 식별자로 사용한다.
 */
export const TABLES: TableConfig[] = [
  { name: "games", conflict: ["code"], prunable: true },
  { name: "card_sets", conflict: ["id"], prunable: true },
  { name: "cards", conflict: ["code"], prunable: true },
  { name: "card_illustrations", conflict: ["id"], prunable: true },
  { name: "stores", conflict: ["id"] },
  { name: "events", conflict: ["id"] },
  { name: "announcements", conflict: ["id"], prunable: true },
  { name: "tier_lists", conflict: ["id"], prunable: true },
  { name: "profiles", conflict: ["id"], authUserColumns: ["id"] },
  { name: "user_roles", conflict: ["id"] },
  { name: "decks", conflict: ["id"], authUserColumns: ["user_id"] },
  { name: "deck_cards", conflict: ["id"] },
  { name: "matches", conflict: ["id"] },
  { name: "user_collection", conflict: ["user_id", "card_code"] },
  { name: "card_favorites", conflict: ["user_id", "card_code"] },
  { name: "card_reviews", conflict: ["id"] },
  { name: "card_audit_logs", conflict: ["id"] },
  { name: "event_favorites", conflict: ["user_id", "event_id"] },
  { name: "store_favorites", conflict: ["user_id", "store_id"] },
  { name: "friendships", conflict: ["id"] },
  { name: "user_ratings", conflict: ["user_id", "game"] },
  { name: "lfg_posts", conflict: ["id"] },
  { name: "lfg_participants", conflict: ["id"] },
  { name: "lfg_messages", conflict: ["id"] },
  { name: "lfg_comments", conflict: ["id"] },
  { name: "lfg_comment_reports", conflict: ["id"] },
  { name: "notifications", conflict: ["id"] },
  { name: "simulator_decks", conflict: ["id"], authUserColumns: ["user_id"] },
  {
    name: "conversations",
    conflict: ["id"],
    authUserColumns: ["user_lo", "user_hi"],
  },
  { name: "messages", conflict: ["id"], authUserColumns: ["sender_id"] },
  {
    name: "user_blocks",
    conflict: ["blocker_id", "blocked_id"],
    authUserColumns: ["blocker_id", "blocked_id"],
  },
  {
    name: "user_reports",
    conflict: ["id"],
    authUserColumns: ["reporter_id", "reported_id"],
  },
  {
    name: "friend_favorites",
    conflict: ["user_id", "favorite_id"],
    authUserColumns: ["user_id", "favorite_id"],
  },
  {
    name: "ai_unlimited",
    conflict: ["user_id"],
    authUserColumns: ["user_id", "granted_by"],
  },
  { name: "ai_usage", conflict: ["id"] },
  { name: "user_credits", conflict: ["user_id"], authUserColumns: ["user_id"] },
  { name: "subscriptions", conflict: ["user_id"], authUserColumns: ["user_id"] },
  {
    name: "subscription_billing",
    conflict: ["user_id"],
    authUserColumns: ["user_id"],
  },
  { name: "payments", conflict: ["id"], authUserColumns: ["user_id"] },
];

type RowError = { key: string; message: string };

type TableResult = {
  table: string;
  status: "synced" | "planned" | "failed" | "skipped";
  sourceRows: number;
  upserted: number;
  deferredNoUser: number;
  deferredFk: number;
  failed: number;
  pruneCandidates: number;
  pruned: number;
  errors: RowError[];
};

type SyncReport = {
  startedAt: string;
  finishedAt?: string;
  mode: "dry-run" | "execute";
  sourceProjectRef: string;
  targetProjectRef: string;
  options: Omit<CliOptions, "help">;
  targetAuthUserCount: number;
  tables: TableResult[];
  summary?: {
    sourceRows: number;
    upserted: number;
    deferredNoUser: number;
    deferredFk: number;
    failed: number;
    pruned: number;
  };
};

type CliOptions = {
  execute: boolean;
  prune: boolean;
  tables: string[] | null;
  reportPath: string;
  help: boolean;
};

export function parseArgs(args: string[]): CliOptions {
  const timestamp = new Date().toISOString().replaceAll(/[:.]/g, "-");
  const options: CliOptions = {
    execute: false,
    prune: false,
    tables: null,
    reportPath: path.join("backups", "db-sync", `report-${timestamp}.json`),
    help: false,
  };

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    const next = () => {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error(`${argument} 뒤에 값이 필요합니다.`);
      }
      index += 1;
      return value;
    };

    switch (argument) {
      case "--execute":
        options.execute = true;
        break;
      case "--prune":
        options.prune = true;
        break;
      case "--tables": {
        const names = next()
          .split(",")
          .map((name) => name.trim())
          .filter(Boolean);
        if (names.length === 0) {
          throw new Error("--tables 값이 비어 있습니다.");
        }
        const known = new Set(TABLES.map((table) => table.name));
        const unknown = names.filter((name) => !known.has(name));
        if (unknown.length > 0) {
          throw new Error(`알 수 없는 테이블: ${unknown.join(", ")}`);
        }
        options.tables = names;
        break;
      }
      case "--report":
        options.reportPath = next();
        break;
      case "--help":
      case "-h":
        options.help = true;
        break;
      default:
        throw new Error(`알 수 없는 옵션입니다: ${argument}`);
    }
  }

  return options;
}

function printHelp(): void {
  console.log(`
DuelNight DB 행 동기화 (옛 Lovable DB → 새 DB, 재실행 가능)

사용법:
  bun run sync-db [옵션]

기본 동작은 쓰기 없는 dry-run입니다. upsert 기반이라 여러 번 실행해도 안전합니다.
auth.users에 없는 사용자의 행은 "보류(deferred)"로 분류되며,
Auth 사용자 이관(전환 시점) 후 재실행하면 자동으로 동기화됩니다.

옵션:
  --execute          대상 DB에 실제로 upsert 실행
  --prune            카탈로그 테이블(${TABLES.filter((t) => t.prunable)
    .map((t) => t.name)
    .join(", ")})에서
                     원본에 없는 대상 행(시드 잔여물) 삭제
  --tables <a,b,c>   지정한 테이블만 동기화
  --report <path>    JSON 보고서 경로
  --help             도움말

필수 환경 변수:
  SOURCE_SUPABASE_PUBLISHABLE_KEY  (또는 SOURCE_SUPABASE_SERVICE_ROLE_KEY)
  SUPABASE_URL
  SUPABASE_SERVICE_ROLE_KEY

선택 환경 변수:
  SOURCE_SUPABASE_URL              기본 ${DEFAULT_SOURCE_URL}
  SOURCE_SUPABASE_SERVICE_ROLE_KEY 원본 비공개 테이블까지 읽을 때 사용
`);
}

/**
 * 문자열·배열·객체(JSONB 포함)를 재귀 순회하며
 * 원본 프로젝트 Storage URL을 대상 프로젝트 URL로 치환한다.
 */
export function rewriteStorageUrls<T extends JsonValue>(
  value: T,
  sourceRef: string,
  targetRef: string,
): T {
  const fromPrefix = `https://${sourceRef}.supabase.co/storage/v1/`;
  const toPrefix = `https://${targetRef}.supabase.co/storage/v1/`;

  function walk(node: JsonValue): JsonValue {
    if (typeof node === "string") {
      return node.includes(fromPrefix)
        ? node.replaceAll(fromPrefix, toPrefix)
        : node;
    }
    if (Array.isArray(node)) return node.map(walk);
    if (node !== null && typeof node === "object") {
      const result: Record<string, JsonValue> = {};
      for (const [key, child] of Object.entries(node)) {
        result[key] = walk(child);
      }
      return result;
    }
    return node;
  }

  return walk(value) as T;
}

export function chunk<T>(values: T[], size: number): T[][] {
  if (size <= 0) throw new Error("chunk 크기는 1 이상이어야 합니다.");
  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}

export function isForeignKeyViolation(error: {
  code?: string | null;
}): boolean {
  return error.code === FK_VIOLATION_CODE;
}

function rowKey(row: Row, config: TableConfig): string {
  return config.conflict.map((column) => String(row[column])).join("/");
}

function pushError(result: TableResult, key: string, message: string): void {
  if (result.errors.length < MAX_ERRORS_PER_TABLE) {
    result.errors.push({ key, message });
  }
}

async function fetchAllRows(
  client: SupabaseClient,
  config: TableConfig,
): Promise<Row[]> {
  const rows: Row[] = [];

  for (let from = 0; ; from += PAGE_SIZE) {
    let query = client.from(config.name).select("*");
    for (const column of config.conflict) {
      query = query.order(column, { ascending: true });
    }
    const { data, error } = await query.range(from, from + PAGE_SIZE - 1);
    if (error) {
      throw new Error(`${config.name} 조회 실패: ${error.message}`);
    }

    const page = (data ?? []) as Row[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
  }

  return rows;
}

async function listTargetAuthUserIds(
  target: SupabaseClient,
): Promise<Set<string>> {
  const ids = new Set<string>();

  for (let page = 1; ; page += 1) {
    const { data, error } = await target.auth.admin.listUsers({
      page,
      perPage: PAGE_SIZE,
    });
    if (error) {
      throw new Error(`대상 auth 사용자 조회 실패: ${error.message}`);
    }
    for (const user of data.users) ids.add(user.id);
    if (data.users.length < PAGE_SIZE) break;
  }

  return ids;
}

/** auth.users FK 컬럼이 대상에 없는 사용자를 가리키는 행을 보류 대상으로 분리한다. */
export function splitByAuthUsers(
  rows: Row[],
  config: TableConfig,
  authUserIds: Set<string>,
): { ready: Row[]; deferred: Row[] } {
  const columns = config.authUserColumns ?? [];
  if (columns.length === 0) return { ready: rows, deferred: [] };

  const ready: Row[] = [];
  const deferred: Row[] = [];
  for (const row of rows) {
    const missing = columns.some((column) => {
      const value = row[column];
      return typeof value === "string" && !authUserIds.has(value);
    });
    (missing ? deferred : ready).push(row);
  }
  return { ready, deferred };
}

async function upsertRows(
  target: SupabaseClient,
  config: TableConfig,
  rows: Row[],
  result: TableResult,
): Promise<void> {
  const onConflict = config.conflict.join(",");

  for (const batch of chunk(rows, UPSERT_CHUNK_SIZE)) {
    const { error } = await target
      .from(config.name)
      .upsert(batch, { onConflict });
    if (!error) {
      result.upserted += batch.length;
      continue;
    }

    // 청크 실패 시 행 단위로 재시도해 FK 보류와 실제 실패를 구분한다.
    for (const row of batch) {
      const { error: rowError } = await target
        .from(config.name)
        .upsert(row, { onConflict });
      if (!rowError) {
        result.upserted += 1;
      } else if (isForeignKeyViolation(rowError)) {
        result.deferredFk += 1;
      } else {
        result.failed += 1;
        pushError(result, rowKey(row, config), rowError.message);
      }
    }
  }
}

async function pruneTable(
  target: SupabaseClient,
  config: TableConfig,
  sourceRows: Row[],
  result: TableResult,
  execute: boolean,
): Promise<void> {
  // 원본 조회가 비어 있으면 사고(권한·네트워크) 가능성이 있으므로 prune하지 않는다.
  if (!config.prunable || config.conflict.length !== 1 || sourceRows.length === 0) {
    return;
  }

  const keyColumn = config.conflict[0];
  const sourceKeys = new Set(
    sourceRows.map((row) => String(row[keyColumn])),
  );
  const targetRows = await fetchAllRows(target, config);
  const extras = targetRows
    .map((row) => String(row[keyColumn]))
    .filter((key) => !sourceKeys.has(key));

  result.pruneCandidates = extras.length;
  if (!execute || extras.length === 0) return;

  for (const batch of chunk(extras, UPSERT_CHUNK_SIZE)) {
    const { error } = await target
      .from(config.name)
      .delete()
      .in(keyColumn, batch);
    if (error) {
      result.failed += batch.length;
      pushError(result, `prune:${batch[0]}…`, error.message);
      return;
    }
    result.pruned += batch.length;
  }
}

async function syncTable(
  source: SupabaseClient,
  target: SupabaseClient,
  config: TableConfig,
  authUserIds: Set<string>,
  sourceRef: string,
  targetRef: string,
  options: CliOptions,
): Promise<TableResult> {
  const result: TableResult = {
    table: config.name,
    status: options.execute ? "synced" : "planned",
    sourceRows: 0,
    upserted: 0,
    deferredNoUser: 0,
    deferredFk: 0,
    failed: 0,
    pruneCandidates: 0,
    pruned: 0,
    errors: [],
  };

  let sourceRows: Row[];
  try {
    sourceRows = await fetchAllRows(source, config);
  } catch (error) {
    result.status = "failed";
    pushError(
      result,
      config.name,
      error instanceof Error ? error.message : String(error),
    );
    return result;
  }

  result.sourceRows = sourceRows.length;
  const rewritten = sourceRows.map((row) =>
    rewriteStorageUrls(row, sourceRef, targetRef),
  );
  const { ready, deferred } = splitByAuthUsers(rewritten, config, authUserIds);
  result.deferredNoUser = deferred.length;

  if (options.execute) {
    await upsertRows(target, config, ready, result);
  } else {
    result.upserted = ready.length;
  }

  if (options.prune) {
    await pruneTable(target, config, sourceRows, result, options.execute);
  }

  if (result.failed > 0) result.status = "failed";
  return result;
}

function writeReport(report: SyncReport): void {
  report.finishedAt = new Date().toISOString();
  report.summary = report.tables.reduce(
    (summary, table) => ({
      sourceRows: summary.sourceRows + table.sourceRows,
      upserted: summary.upserted + table.upserted,
      deferredNoUser: summary.deferredNoUser + table.deferredNoUser,
      deferredFk: summary.deferredFk + table.deferredFk,
      failed: summary.failed + table.failed,
      pruned: summary.pruned + table.pruned,
    }),
    {
      sourceRows: 0,
      upserted: 0,
      deferredNoUser: 0,
      deferredFk: 0,
      failed: 0,
      pruned: 0,
    },
  );

  const outputPath = path.resolve(process.cwd(), report.options.reportPath);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(`보고서: ${outputPath}`);
}

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`환경 변수 ${name}이 필요합니다.`);
  return value;
}

async function run(): Promise<void> {
  loadLocalEnv();
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  const sourceUrl =
    process.env.SOURCE_SUPABASE_URL?.trim() || DEFAULT_SOURCE_URL;
  const sourceKey =
    process.env.SOURCE_SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    requireEnv("SOURCE_SUPABASE_PUBLISHABLE_KEY");
  const targetUrl = requireEnv("SUPABASE_URL");
  const targetKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const sourceProjectRef = getProjectRef(sourceUrl);
  const targetProjectRef = getProjectRef(targetUrl);

  if (sourceProjectRef === targetProjectRef) {
    throw new Error("원본과 대상 Supabase 프로젝트가 같습니다.");
  }
  if (targetProjectRef !== EXPECTED_TARGET_REF) {
    throw new Error(
      `대상 프로젝트가 ${EXPECTED_TARGET_REF}가 아닙니다 (${targetProjectRef}). 오작동 방지를 위해 중단합니다.`,
    );
  }

  const source = createClient(sourceUrl, sourceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const target = createClient(targetUrl, targetKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const tables = options.tables
    ? TABLES.filter((table) => options.tables!.includes(table.name))
    : TABLES;

  const report: SyncReport = {
    startedAt: new Date().toISOString(),
    mode: options.execute ? "execute" : "dry-run",
    sourceProjectRef,
    targetProjectRef,
    options: {
      execute: options.execute,
      prune: options.prune,
      tables: options.tables,
      reportPath: options.reportPath,
    },
    targetAuthUserCount: 0,
    tables: [],
  };

  try {
    console.log(
      `[${report.mode}] ${sourceProjectRef} -> ${targetProjectRef}, 테이블 ${tables.length}개`,
    );

    const needsAuthUsers = tables.some(
      (table) => (table.authUserColumns ?? []).length > 0,
    );
    const authUserIds = needsAuthUsers
      ? await listTargetAuthUserIds(target)
      : new Set<string>();
    report.targetAuthUserCount = authUserIds.size;
    if (needsAuthUsers) {
      console.log(`대상 auth 사용자 ${authUserIds.size}명 확인`);
    }

    for (const [index, config] of tables.entries()) {
      const result = await syncTable(
        source,
        target,
        config,
        authUserIds,
        sourceProjectRef,
        targetProjectRef,
        options,
      );
      report.tables.push(result);
      console.log(
        `[${index + 1}/${tables.length}] ${config.name}: 원본 ${result.sourceRows}건, ` +
          `${options.execute ? "반영" : "반영 예정"} ${result.upserted}건` +
          (result.deferredNoUser > 0
            ? `, 사용자 보류 ${result.deferredNoUser}건`
            : "") +
          (result.deferredFk > 0 ? `, FK 보류 ${result.deferredFk}건` : "") +
          (result.pruneCandidates > 0
            ? `, 정리 ${options.execute ? result.pruned : result.pruneCandidates}건`
            : "") +
          (result.failed > 0 ? `, 실패 ${result.failed}건` : ""),
      );
    }

    writeReport(report);
    const summary = report.summary!;
    console.log(
      `완료: 원본 ${summary.sourceRows}건, 반영 ${summary.upserted}건, ` +
        `사용자 보류 ${summary.deferredNoUser}건, FK 보류 ${summary.deferredFk}건, ` +
        `정리 ${summary.pruned}건, 실패 ${summary.failed}건`,
    );
    if (summary.failed > 0) {
      throw new Error(
        `${summary.failed}건 실패 — 보고서를 확인한 뒤 재실행하세요.`,
      );
    }
  } catch (error) {
    if (!report.finishedAt) writeReport(report);
    throw error;
  }
}

if (import.meta.main) {
  run().catch((error) => {
    console.error(
      `DB 동기화 실패: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exitCode = 1;
  });
}
