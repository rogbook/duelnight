import { describe, expect, test } from "bun:test";
import {
  getProjectRef,
  normalizeStoragePath,
  parseArgs,
  parseStorageObjectPath,
} from "./migrate-images";

describe("getProjectRef", () => {
  test("Supabase 프로젝트 ref를 추출한다", () => {
    expect(
      getProjectRef("https://nrtdhkjeziknmafauypv.supabase.co"),
    ).toBe("nrtdhkjeziknmafauypv");
  });

  test("Supabase가 아닌 URL은 거부한다", () => {
    expect(() => getProjectRef("https://example.com")).toThrow(
      "Supabase URL 형식",
    );
  });
});

describe("normalizeStoragePath", () => {
  test("정상적인 중첩 경로를 유지한다", () => {
    expect(normalizeStoragePath("BTK-01/card%2001.webp")).toBe(
      "BTK-01/card 01.webp",
    );
  });

  test("상위 경로 이동을 거부한다", () => {
    expect(() => normalizeStoragePath("user/%2E%2E/admin/card.webp")).toThrow(
      "안전하지 않은",
    );
  });

  test("백슬래시 경로도 정규화한다", () => {
    expect(normalizeStoragePath("set\\card.webp")).toBe("set/card.webp");
  });
});

describe("parseStorageObjectPath", () => {
  const sourceRef = "tgybttphkmesgfbtgftt";

  test("원본 프로젝트의 public URL만 파싱한다", () => {
    expect(
      parseStorageObjectPath(
        `https://${sourceRef}.supabase.co/storage/v1/object/public/card-images/BTK-01/card.webp`,
        sourceRef,
      ),
    ).toBe("BTK-01/card.webp");
  });

  test("다른 프로젝트 URL은 무시한다", () => {
    expect(
      parseStorageObjectPath(
        "https://nrtdhkjeziknmafauypv.supabase.co/storage/v1/object/public/card-images/card.webp",
        sourceRef,
      ),
    ).toBeNull();
  });

  test("다른 버킷 URL은 무시한다", () => {
    expect(
      parseStorageObjectPath(
        `https://${sourceRef}.supabase.co/storage/v1/object/public/avatars/card.webp`,
        sourceRef,
      ),
    ).toBeNull();
  });
});

describe("parseArgs", () => {
  test("기본값은 dry-run이다", () => {
    const options = parseArgs([]);
    expect(options.execute).toBeFalse();
    expect(options.concurrency).toBe(4);
    expect(options.limit).toBeNull();
  });

  test("실행 옵션을 파싱한다", () => {
    const options = parseArgs([
      "--execute",
      "--verify-existing",
      "--skip-db-update",
      "--concurrency",
      "2",
      "--limit",
      "10",
      "--report",
      "backups/report.json",
    ]);
    expect(options).toMatchObject({
      execute: true,
      verifyExisting: true,
      skipDatabaseUpdate: true,
      concurrency: 2,
      limit: 10,
      reportPath: "backups/report.json",
    });
  });

  test("알 수 없는 옵션을 거부한다", () => {
    expect(() => parseArgs(["--force"])).toThrow("알 수 없는 옵션");
  });
});
