import { describe, expect, test } from "bun:test";
import {
  TABLES,
  chunk,
  isForeignKeyViolation,
  parseArgs,
  rewriteStorageUrls,
  splitByAuthUsers,
} from "./sync-from-lovable";

const SOURCE_REF = "tgybttphkmesgfbtgftt";
const TARGET_REF = "nrtdhkjeziknmafauypv";
const sourceUrl = (p: string) =>
  `https://${SOURCE_REF}.supabase.co/storage/v1/${p}`;
const targetUrl = (p: string) =>
  `https://${TARGET_REF}.supabase.co/storage/v1/${p}`;

describe("rewriteStorageUrls", () => {
  test("원본 프로젝트 Storage URL을 대상 URL로 치환한다", () => {
    expect(
      rewriteStorageUrls(
        sourceUrl("object/public/card-images/OP12/card.webp"),
        SOURCE_REF,
        TARGET_REF,
      ),
    ).toBe(targetUrl("object/public/card-images/OP12/card.webp"));
  });

  test("다른 프로젝트 URL과 일반 문자열은 건드리지 않는다", () => {
    const other = `https://example.supabase.co/storage/v1/object/x.webp`;
    expect(rewriteStorageUrls(other, SOURCE_REF, TARGET_REF)).toBe(other);
    expect(rewriteStorageUrls("OP12-001", SOURCE_REF, TARGET_REF)).toBe(
      "OP12-001",
    );
  });

  test("중첩 객체·배열(JSONB) 내부의 URL도 치환한다", () => {
    const row = {
      id: "abc",
      cost: 3,
      ok: true,
      none: null,
      extra: {
        gallery: [sourceUrl("object/public/card-images/a.webp"), "plain"],
      },
    };
    const rewritten = rewriteStorageUrls(row, SOURCE_REF, TARGET_REF);
    expect(rewritten.extra.gallery[0]).toBe(
      targetUrl("object/public/card-images/a.webp"),
    );
    expect(rewritten.extra.gallery[1]).toBe("plain");
    expect(rewritten.cost).toBe(3);
    expect(rewritten.none).toBeNull();
  });

  test("한 문자열 안의 여러 URL을 모두 치환한다", () => {
    const text = `${sourceUrl("object/public/a.webp")} 그리고 ${sourceUrl("object/public/b.webp")}`;
    const rewritten = rewriteStorageUrls(text, SOURCE_REF, TARGET_REF);
    expect(rewritten).not.toInclude(SOURCE_REF);
    expect(rewritten.match(new RegExp(TARGET_REF, "g"))).toHaveLength(2);
  });
});

describe("splitByAuthUsers", () => {
  const config = {
    name: "decks",
    conflict: ["id"],
    authUserColumns: ["user_id"],
  };

  test("대상에 없는 사용자의 행을 보류로 분리한다", () => {
    const rows = [
      { id: "1", user_id: "known" },
      { id: "2", user_id: "unknown" },
    ];
    const { ready, deferred } = splitByAuthUsers(
      rows,
      config,
      new Set(["known"]),
    );
    expect(ready.map((row) => row.id)).toEqual(["1"]);
    expect(deferred.map((row) => row.id)).toEqual(["2"]);
  });

  test("auth 컬럼이 null이면 보류하지 않는다", () => {
    const { ready, deferred } = splitByAuthUsers(
      [{ id: "1", user_id: null }],
      config,
      new Set(),
    );
    expect(ready).toHaveLength(1);
    expect(deferred).toHaveLength(0);
  });

  test("auth 컬럼이 없는 테이블은 전부 통과한다", () => {
    const { ready, deferred } = splitByAuthUsers(
      [{ id: "1", user_id: "anyone" }],
      { name: "matches", conflict: ["id"] },
      new Set(),
    );
    expect(ready).toHaveLength(1);
    expect(deferred).toHaveLength(0);
  });
});

describe("parseArgs", () => {
  test("기본값은 dry-run·전체 테이블이다", () => {
    const options = parseArgs([]);
    expect(options.execute).toBeFalse();
    expect(options.prune).toBeFalse();
    expect(options.tables).toBeNull();
    expect(options.reportPath).toInclude("db-sync");
  });

  test("--tables는 알려진 테이블만 허용한다", () => {
    expect(parseArgs(["--tables", "cards,games"]).tables).toEqual([
      "cards",
      "games",
    ]);
    expect(() => parseArgs(["--tables", "cards,nope"])).toThrow(
      "알 수 없는 테이블",
    );
  });

  test("알 수 없는 옵션은 거부한다", () => {
    expect(() => parseArgs(["--nope"])).toThrow("알 수 없는 옵션");
  });
});

describe("chunk", () => {
  test("배열을 지정 크기로 나눈다", () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunk([], 10)).toEqual([]);
  });

  test("0 이하 크기는 거부한다", () => {
    expect(() => chunk([1], 0)).toThrow("1 이상");
  });
});

describe("isForeignKeyViolation", () => {
  test("Postgres FK 위반 코드(23503)만 참이다", () => {
    expect(isForeignKeyViolation({ code: "23503" })).toBeTrue();
    expect(isForeignKeyViolation({ code: "23505" })).toBeFalse();
    expect(isForeignKeyViolation({ code: null })).toBeFalse();
  });
});

describe("TABLES 구성", () => {
  test("테이블 이름이 중복되지 않는다", () => {
    const names = TABLES.map((table) => table.name);
    expect(new Set(names).size).toBe(names.length);
  });

  test("모든 테이블에 conflict 키가 있다", () => {
    for (const table of TABLES) {
      expect(table.conflict.length).toBeGreaterThan(0);
    }
  });

  test("prune 대상은 단일 conflict 키만 갖는다 (delete .in 제약)", () => {
    for (const table of TABLES.filter((entry) => entry.prunable)) {
      expect(table.conflict).toHaveLength(1);
    }
  });

  test("시크릿·만료성 테이블은 동기화 대상이 아니다", () => {
    const names = new Set(TABLES.map((table) => table.name));
    expect(names.has("oauth_states")).toBeFalse();
    expect(names.has("user_drive_tokens")).toBeFalse();
  });
});
