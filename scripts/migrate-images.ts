import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const BUCKET = "card-images";
const DEFAULT_SOURCE_URL = "https://tgybttphkmesgfbtgftt.supabase.co";
const EXPECTED_TARGET_REF = "nrtdhkjeziknmafauypv";
const DEFAULT_CONCURRENCY = 4;
const DEFAULT_MAX_BYTES = 20 * 1024 * 1024;
const PAGE_SIZE = 1_000;
const DB_PAGE_SIZE = 1_000;
const ALLOWED_IMAGE_TYPES = new Set([
  "image/avif",
  "image/gif",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

type JsonObject = Record<string, unknown>;

type ListedObject = {
  id: string | null;
  name: string;
  metadata: JsonObject | null;
};

type StorageObject = {
  path: string;
  size: number | null;
  contentType: string | null;
};

type ImageRow = {
  id: string;
  image_url: string;
  label: string;
  table: "cards" | "card_illustrations";
};

type CopyStatus =
  | "copied"
  | "overwritten"
  | "planned-copy"
  | "planned-overwrite"
  | "skipped-same-size"
  | "verified-existing"
  | "failed";

type CopyResult = {
  path: string;
  status: CopyStatus;
  bytes: number | null;
  sourceSha256?: string;
  targetSha256?: string;
  error?: string;
};

type DatabaseUpdateResult = {
  table: ImageRow["table"];
  id: string;
  label: string;
  status: "updated" | "skipped" | "failed";
  error?: string;
};

type CliOptions = {
  execute: boolean;
  verifyExisting: boolean;
  skipDatabaseUpdate: boolean;
  concurrency: number;
  maxBytes: number;
  limit: number | null;
  reportPath: string;
  help: boolean;
};

type MigrationReport = {
  startedAt: string;
  finishedAt?: string;
  mode: "dry-run" | "execute";
  sourceProjectRef: string;
  targetProjectRef: string;
  bucket: string;
  options: Omit<CliOptions, "help">;
  sourceObjectCount: number;
  targetObjectCount: number;
  copyResults: CopyResult[];
  databaseUpdates: DatabaseUpdateResult[];
  summary?: {
    copied: number;
    overwritten: number;
    planned: number;
    skipped: number;
    verified: number;
    failed: number;
    databaseUpdated: number;
    databaseFailed: number;
  };
};

export function loadLocalEnv(): void {
  for (const file of [".env.local", ".dev.vars"]) {
    const fullPath = path.resolve(process.cwd(), file);
    if (!fs.existsSync(fullPath)) continue;

    for (const line of fs.readFileSync(fullPath, "utf8").split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;

      const separator = trimmed.indexOf("=");
      if (separator <= 0) continue;

      const key = trimmed.slice(0, separator).trim();
      let value = trimmed.slice(separator + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }

      if (process.env[key] === undefined) process.env[key] = value;
    }
  }
}

export function getProjectRef(url: string): string {
  const parsed = new URL(url);
  const match = parsed.hostname.match(/^([a-z0-9-]+)\.supabase\.co$/i);
  if (!match) throw new Error(`Supabase URL 형식이 아닙니다: ${parsed.origin}`);
  return match[1];
}

export function normalizeStoragePath(value: string): string {
  let decoded: string;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    throw new Error("URL 인코딩이 올바르지 않습니다.");
  }

  const normalized = decoded.replaceAll("\\", "/").replace(/^\/+/, "");
  const segments = normalized.split("/");
  if (
    !normalized ||
    normalized.includes("\0") ||
    segments.some((segment) => !segment || segment === "." || segment === "..")
  ) {
    throw new Error("안전하지 않은 Storage 경로입니다.");
  }
  return segments.join("/");
}

export function parseStorageObjectPath(
  imageUrl: string,
  sourceProjectRef: string,
  bucket = BUCKET,
): string | null {
  let parsed: URL;
  try {
    parsed = new URL(imageUrl);
  } catch {
    return null;
  }

  if (parsed.hostname !== `${sourceProjectRef}.supabase.co`) return null;

  const prefixes = [
    `/storage/v1/object/public/${bucket}/`,
    `/storage/v1/object/sign/${bucket}/`,
    `/storage/v1/object/authenticated/${bucket}/`,
  ];
  const prefix = prefixes.find((candidate) => parsed.pathname.startsWith(candidate));
  if (!prefix) return null;

  try {
    return normalizeStoragePath(parsed.pathname.slice(prefix.length));
  } catch {
    return null;
  }
}

function parsePositiveInteger(value: string, option: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${option} 값은 1 이상의 정수여야 합니다.`);
  }
  return parsed;
}

export function parseArgs(args: string[]): CliOptions {
  const timestamp = new Date().toISOString().replaceAll(/[:.]/g, "-");
  const options: CliOptions = {
    execute: false,
    verifyExisting: false,
    skipDatabaseUpdate: false,
    concurrency: DEFAULT_CONCURRENCY,
    maxBytes: DEFAULT_MAX_BYTES,
    limit: null,
    reportPath: path.join("backups", "image-migration", `report-${timestamp}.json`),
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
      case "--verify-existing":
        options.verifyExisting = true;
        break;
      case "--skip-db-update":
        options.skipDatabaseUpdate = true;
        break;
      case "--concurrency":
        options.concurrency = parsePositiveInteger(next(), argument);
        break;
      case "--max-bytes":
        options.maxBytes = parsePositiveInteger(next(), argument);
        break;
      case "--limit":
        options.limit = parsePositiveInteger(next(), argument);
        break;
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

export function isAlreadyExistsError(error: {
  message?: string;
  statusCode?: string | number;
}): boolean {
  return (
    String(error.statusCode ?? "") === "409" ||
    error.message?.toLowerCase().includes("already exists") === true
  );
}

function printHelp(): void {
  console.log(`
DuelNight card-images 증분 이관

사용법:
  bun run migrate-images [옵션]

기본 동작은 쓰기 없는 dry-run입니다.

옵션:
  --execute             대상 Storage 복사와 DB URL 갱신 실행
  --verify-existing     크기가 같은 기존 파일도 SHA-256으로 검증
  --skip-db-update      Storage만 복사하고 DB URL은 변경하지 않음
  --concurrency <n>     동시 처리 수 (기본 ${DEFAULT_CONCURRENCY})
  --max-bytes <n>       허용할 파일 최대 바이트 (기본 ${DEFAULT_MAX_BYTES})
  --limit <n>           앞에서부터 n개 객체만 처리
  --report <path>       JSON 보고서 경로
  --help                도움말

필수 환경 변수:
  SOURCE_SUPABASE_PUBLISHABLE_KEY
  SUPABASE_URL
  SUPABASE_SERVICE_ROLE_KEY

선택 환경 변수:
  SOURCE_SUPABASE_URL   기본 ${DEFAULT_SOURCE_URL}
`);
}

function metadataString(metadata: JsonObject | null, ...keys: string[]): string | null {
  for (const key of keys) {
    const value = metadata?.[key];
    if (typeof value === "string" && value) return value;
  }
  return null;
}

function metadataSize(metadata: JsonObject | null): number | null {
  const value = metadata?.size;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function isFolder(item: ListedObject): boolean {
  return item.id === null && item.metadata === null;
}

async function listFolder(client: SupabaseClient, folder: string): Promise<ListedObject[]> {
  const results: ListedObject[] = [];

  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await client.storage.from(BUCKET).list(folder, {
      limit: PAGE_SIZE,
      offset,
      sortBy: { column: "name", order: "asc" },
    });
    if (error) {
      throw new Error(`Storage 목록 조회 실패 (${folder || "/"}): ${error.message}`);
    }

    const page = (data ?? []) as ListedObject[];
    results.push(...page);
    if (page.length < PAGE_SIZE) break;
  }

  return results;
}

async function listObjectsRecursive(client: SupabaseClient, folder = ""): Promise<StorageObject[]> {
  const objects: StorageObject[] = [];
  const entries = await listFolder(client, folder);

  for (const entry of entries) {
    const objectPath = normalizeStoragePath(folder ? `${folder}/${entry.name}` : entry.name);
    if (isFolder(entry)) {
      objects.push(...(await listObjectsRecursive(client, objectPath)));
      continue;
    }

    objects.push({
      path: objectPath,
      size: metadataSize(entry.metadata),
      contentType: metadataString(entry.metadata, "mimetype", "contentType", "content-type"),
    });
  }

  return objects;
}

function sha256(buffer: ArrayBuffer): string {
  return createHash("sha256").update(Buffer.from(buffer)).digest("hex");
}

function normalizeContentType(value: string | null): string | null {
  if (!value) return null;
  return value.split(";", 1)[0].trim().toLowerCase() || null;
}

function assertValidImage(
  objectPath: string,
  contentType: string | null,
  byteLength: number,
  maxBytes: number,
): string {
  const normalizedType = normalizeContentType(contentType);
  if (!normalizedType || !ALLOWED_IMAGE_TYPES.has(normalizedType)) {
    throw new Error(`${objectPath}: 허용되지 않은 MIME type (${contentType ?? "없음"})`);
  }
  if (byteLength <= 0 || byteLength > maxBytes) {
    throw new Error(`${objectPath}: 파일 크기 ${byteLength} bytes가 허용 범위를 벗어났습니다.`);
  }
  return normalizedType;
}

async function downloadObject(
  client: SupabaseClient,
  object: StorageObject,
  maxBytes: number,
): Promise<{ buffer: ArrayBuffer; contentType: string; hash: string }> {
  const { data, error } = await client.storage.from(BUCKET).download(object.path);
  if (error || !data) {
    throw new Error(`다운로드 실패: ${error?.message ?? "응답 데이터 없음"}`);
  }

  const buffer = await data.arrayBuffer();
  const contentType = assertValidImage(
    object.path,
    data.type || object.contentType,
    buffer.byteLength,
    maxBytes,
  );
  return { buffer, contentType, hash: sha256(buffer) };
}

async function verifyTargetObject(
  target: SupabaseClient,
  object: StorageObject,
  sourceHash: string,
  maxBytes: number,
): Promise<string> {
  const downloaded = await downloadObject(target, object, maxBytes);
  if (downloaded.hash !== sourceHash) {
    throw new Error(`SHA-256 불일치 (source=${sourceHash}, target=${downloaded.hash})`);
  }
  return downloaded.hash;
}

async function mapConcurrent<T, R>(
  values: T[],
  concurrency: number,
  worker: (value: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(values.length);
  let cursor = 0;

  async function runWorker(): Promise<void> {
    while (cursor < values.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(values[index], index);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, runWorker));
  return results;
}

async function processObject(
  source: SupabaseClient,
  target: SupabaseClient,
  sourceObject: StorageObject,
  targetObject: StorageObject | undefined,
  options: CliOptions,
): Promise<CopyResult> {
  const sameSize =
    targetObject !== undefined &&
    sourceObject.size !== null &&
    targetObject.size !== null &&
    sourceObject.size === targetObject.size;
  const shouldVerifyExisting = options.verifyExisting || options.execute;

  try {
    if (!options.execute && !shouldVerifyExisting) {
      return {
        path: sourceObject.path,
        status: sameSize
          ? "skipped-same-size"
          : targetObject
            ? "planned-overwrite"
            : "planned-copy",
        bytes: sourceObject.size,
      };
    }

    if (sameSize && !shouldVerifyExisting) {
      return {
        path: sourceObject.path,
        status: "skipped-same-size",
        bytes: sourceObject.size,
      };
    }

    const downloaded = await downloadObject(source, sourceObject, options.maxBytes);

    if (sameSize && shouldVerifyExisting && targetObject) {
      const targetHash = await verifyTargetObject(
        target,
        targetObject,
        downloaded.hash,
        options.maxBytes,
      );
      return {
        path: sourceObject.path,
        status: "verified-existing",
        bytes: downloaded.buffer.byteLength,
        sourceSha256: downloaded.hash,
        targetSha256: targetHash,
      };
    }

    if (!options.execute) {
      return {
        path: sourceObject.path,
        status: targetObject ? "planned-overwrite" : "planned-copy",
        bytes: downloaded.buffer.byteLength,
        sourceSha256: downloaded.hash,
      };
    }

    const { error } = await target.storage
      .from(BUCKET)
      .upload(sourceObject.path, Buffer.from(downloaded.buffer), {
        contentType: downloaded.contentType,
        upsert: targetObject !== undefined,
      });
    if (error) {
      if (isAlreadyExistsError(error)) {
        const targetHash = await verifyTargetObject(
          target,
          { ...sourceObject, size: downloaded.buffer.byteLength },
          downloaded.hash,
          options.maxBytes,
        );
        return {
          path: sourceObject.path,
          status: "verified-existing",
          bytes: downloaded.buffer.byteLength,
          sourceSha256: downloaded.hash,
          targetSha256: targetHash,
        };
      }
      throw new Error(`업로드 실패: ${error.message}`);
    }

    const targetHash = await verifyTargetObject(
      target,
      { ...sourceObject, size: downloaded.buffer.byteLength },
      downloaded.hash,
      options.maxBytes,
    );

    return {
      path: sourceObject.path,
      status: targetObject ? "overwritten" : "copied",
      bytes: downloaded.buffer.byteLength,
      sourceSha256: downloaded.hash,
      targetSha256: targetHash,
    };
  } catch (error) {
    return {
      path: sourceObject.path,
      status: "failed",
      bytes: sourceObject.size,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function fetchImageRows(target: SupabaseClient): Promise<ImageRow[]> {
  const rows: ImageRow[] = [];

  for (const table of ["cards", "card_illustrations"] as const) {
    for (let from = 0; ; from += DB_PAGE_SIZE) {
      const select = table === "cards" ? "id, code, image_url" : "id, card_code, image_url";
      const { data, error } = await target
        .from(table)
        .select(select)
        .not("image_url", "is", null)
        .range(from, from + DB_PAGE_SIZE - 1);
      if (error) throw new Error(`${table} 조회 실패: ${error.message}`);

      const page = (data ?? []) as unknown as Array<Record<string, string | null>>;
      for (const row of page) {
        if (!row.image_url || !row.id) continue;
        rows.push({
          id: row.id,
          image_url: row.image_url,
          label: table === "cards" ? (row.code ?? row.id) : (row.card_code ?? row.id),
          table,
        });
      }
      if (page.length < DB_PAGE_SIZE) break;
    }
  }

  return rows;
}

async function updateDatabaseUrls(
  target: SupabaseClient,
  sourceProjectRef: string,
  verifiedPaths: Set<string>,
): Promise<DatabaseUpdateResult[]> {
  const rows = await fetchImageRows(target);
  const results: DatabaseUpdateResult[] = [];

  for (const row of rows) {
    const objectPath = parseStorageObjectPath(row.image_url, sourceProjectRef);
    if (!objectPath || !verifiedPaths.has(objectPath)) {
      results.push({
        table: row.table,
        id: row.id,
        label: row.label,
        status: "skipped",
      });
      continue;
    }

    const { data: publicUrl } = target.storage.from(BUCKET).getPublicUrl(objectPath);
    const { data, error } = await target
      .from(row.table)
      .update({ image_url: publicUrl.publicUrl })
      .eq("id", row.id)
      .eq("image_url", row.image_url)
      .select("id");

    if (error) {
      results.push({
        table: row.table,
        id: row.id,
        label: row.label,
        status: "failed",
        error: error.message,
      });
    } else if ((data ?? []).length === 1) {
      results.push({
        table: row.table,
        id: row.id,
        label: row.label,
        status: "updated",
      });
    } else {
      results.push({
        table: row.table,
        id: row.id,
        label: row.label,
        status: "failed",
        error: "동시 변경으로 인해 image_url 조건이 일치하지 않았습니다.",
      });
    }
  }

  return results;
}

function reportSummary(report: MigrationReport): NonNullable<MigrationReport["summary"]> {
  return {
    copied: report.copyResults.filter((item) => item.status === "copied").length,
    overwritten: report.copyResults.filter((item) => item.status === "overwritten").length,
    planned: report.copyResults.filter((item) => item.status.startsWith("planned-")).length,
    skipped: report.copyResults.filter((item) => item.status === "skipped-same-size").length,
    verified: report.copyResults.filter((item) => item.status === "verified-existing").length,
    failed: report.copyResults.filter((item) => item.status === "failed").length,
    databaseUpdated: report.databaseUpdates.filter((item) => item.status === "updated").length,
    databaseFailed: report.databaseUpdates.filter((item) => item.status === "failed").length,
  };
}

function writeReport(report: MigrationReport): void {
  report.finishedAt = new Date().toISOString();
  report.summary = reportSummary(report);
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

async function assertTargetBucketExists(target: SupabaseClient): Promise<void> {
  const { data, error } = await target.storage.getBucket(BUCKET);
  if (error || !data) {
    throw new Error(
      `대상 ${BUCKET} 버킷을 확인할 수 없습니다. 버킷/RLS 변경은 Claude 작업으로 먼저 준비해야 합니다: ${error?.message ?? "없음"}`,
    );
  }
  if (!data.public) {
    throw new Error(
      `대상 ${BUCKET} 버킷이 public이 아닙니다. 공개 URL 재작성 전에 Claude 검토가 필요합니다.`,
    );
  }
}

async function run(): Promise<void> {
  loadLocalEnv();
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  const sourceUrl = process.env.SOURCE_SUPABASE_URL?.trim() || DEFAULT_SOURCE_URL;
  const sourceKey = requireEnv("SOURCE_SUPABASE_PUBLISHABLE_KEY");
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

  const report: MigrationReport = {
    startedAt: new Date().toISOString(),
    mode: options.execute ? "execute" : "dry-run",
    sourceProjectRef,
    targetProjectRef,
    bucket: BUCKET,
    options: {
      execute: options.execute,
      verifyExisting: options.verifyExisting,
      skipDatabaseUpdate: options.skipDatabaseUpdate,
      concurrency: options.concurrency,
      maxBytes: options.maxBytes,
      limit: options.limit,
      reportPath: options.reportPath,
    },
    sourceObjectCount: 0,
    targetObjectCount: 0,
    copyResults: [],
    databaseUpdates: [],
  };

  try {
    console.log(`[${report.mode}] ${sourceProjectRef}/${BUCKET} -> ${targetProjectRef}/${BUCKET}`);
    await assertTargetBucketExists(target);

    console.log("원본 Storage 목록을 재귀 조회합니다...");
    const allSourceObjects = await listObjectsRecursive(source);
    const sourceObjects =
      options.limit === null ? allSourceObjects : allSourceObjects.slice(0, options.limit);
    console.log("대상 Storage 목록을 재귀 조회합니다...");
    const targetObjects = await listObjectsRecursive(target);
    const targetMap = new Map(targetObjects.map((object) => [object.path, object]));

    report.sourceObjectCount = allSourceObjects.length;
    report.targetObjectCount = targetObjects.length;
    console.log(
      `원본 ${allSourceObjects.length}개, 대상 ${targetObjects.length}개, 이번 처리 ${sourceObjects.length}개`,
    );

    report.copyResults = await mapConcurrent(
      sourceObjects,
      options.concurrency,
      async (object, index) => {
        const result = await processObject(
          source,
          target,
          object,
          targetMap.get(object.path),
          options,
        );
        console.log(`[${index + 1}/${sourceObjects.length}] ${result.status}: ${result.path}`);
        return result;
      },
    );

    const copyFailures = report.copyResults.filter((result) => result.status === "failed");
    if (copyFailures.length > 0) {
      throw new Error(`${copyFailures.length}개 파일 처리 실패. DB URL은 변경하지 않았습니다.`);
    }

    if (options.execute && !options.skipDatabaseUpdate) {
      const verifiedPaths = new Set(
        report.copyResults
          .filter((result) => result.status !== "failed")
          .map((result) => result.path),
      );
      console.log("대상 DB의 이전 프로젝트 image_url을 재작성합니다...");
      report.databaseUpdates = await updateDatabaseUrls(target, sourceProjectRef, verifiedPaths);
      const databaseFailures = report.databaseUpdates.filter(
        (result) => result.status === "failed",
      );
      if (databaseFailures.length > 0) {
        throw new Error(
          `${databaseFailures.length}개 DB URL 갱신 실패. 보고서를 확인한 뒤 재실행하세요.`,
        );
      }
    }

    writeReport(report);
    const summary = report.summary!;
    console.log(
      `완료: copied=${summary.copied}, overwritten=${summary.overwritten}, planned=${summary.planned}, skipped=${summary.skipped}, verified=${summary.verified}, dbUpdated=${summary.databaseUpdated}`,
    );
  } catch (error) {
    writeReport(report);
    throw error;
  }
}

if (import.meta.main) {
  run().catch((error) => {
    console.error(`이미지 이관 실패: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
