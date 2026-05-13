import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Upload, FileText, Lock, Download, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { useIsAdmin } from "@/hooks/use-is-admin";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { downloadFile } from "@/lib/csv";
import type { Database } from "@/integrations/supabase/types";

type Game = Database["public"]["Enums"]["tcg_game"];
type CardType = Database["public"]["Enums"]["card_type"];

export const Route = createFileRoute("/admin/cards")({
  head: () => ({
    meta: [
      { title: "카드 DB 업로드 — 관리자 — TCG Hub" },
      { name: "description", content: "CSV/JSON으로 카드 데이터를 대량 등록합니다." },
    ],
  }),
  component: AdminCardsPage,
});

const REQUIRED = ["code", "set_code", "game", "name", "type"] as const;
const OPTIONAL = [
  "colors",
  "cost",
  "power",
  "counter",
  "attribute",
  "rarity",
  "effect",
  "image_url",
] as const;
const ALL_COLS = [...REQUIRED, ...OPTIONAL];

const SAMPLE_CSV = `code,set_code,game,name,type,colors,cost,power,counter,attribute,rarity,effect,image_url
OP01-001,OP01,optcg,몽키 D 루피,leader,"red",,5000,,타격,L,4코스트 효과...,/cards/OP01-001.png
OP01-002,OP01,optcg,로로노아 조로,character,"red|green",3,5000,1000,슬래시,SR,효과 텍스트,/cards/OP01-002.png`;

const VALID_GAMES: Game[] = ["optcg", "ptcg", "dtcg"];
const VALID_TYPES: CardType[] = [
  "leader",
  "character",
  "event",
  "stage",
  "don",
  "pokemon",
  "trainer",
  "energy",
  "digimon",
  "tamer",
  "option",
  "digi_egg",
];

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else inQ = false;
      } else cell += c;
    } else {
      if (c === '"') inQ = true;
      else if (c === ",") {
        row.push(cell);
        cell = "";
      } else if (c === "\n" || c === "\r") {
        if (cell !== "" || row.length) {
          row.push(cell);
          rows.push(row);
          row = [];
          cell = "";
        }
        if (c === "\r" && text[i + 1] === "\n") i++;
      } else cell += c;
    }
  }
  if (cell !== "" || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

type CardRow = {
  code: string;
  set_code: string;
  game: Game;
  name: string;
  type: CardType;
  colors: string[];
  cost: number | null;
  power: number | null;
  counter: number | null;
  attribute: string | null;
  rarity: string | null;
  effect: string | null;
  image_url: string | null;
};

type ParseResult = {
  rows: CardRow[];
  errors: { line: number; reason: string }[];
};

function normalizeRow(obj: Record<string, string>, lineNo: number): CardRow | { error: string } {
  for (const k of REQUIRED) {
    if (!obj[k]?.trim()) return { error: `필수 컬럼 누락: ${k}` };
  }
  const game = obj.game.trim() as Game;
  if (!VALID_GAMES.includes(game)) return { error: `잘못된 game: ${game}` };
  const type = obj.type.trim() as CardType;
  if (!VALID_TYPES.includes(type)) return { error: `잘못된 type: ${type}` };
  const colors = (obj.colors || "")
    .split(/[|,;]/)
    .map((s) => s.trim())
    .filter(Boolean);
  const num = (v: string | undefined): number | null => {
    if (v == null || v.trim() === "") return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  return {
    code: obj.code.trim(),
    set_code: obj.set_code.trim(),
    game,
    name: obj.name.trim(),
    type,
    colors,
    cost: num(obj.cost),
    power: num(obj.power),
    counter: num(obj.counter),
    attribute: obj.attribute?.trim() || null,
    rarity: obj.rarity?.trim() || null,
    effect: obj.effect?.trim() || null,
    image_url: obj.image_url?.trim() || null,
  };
}

function parseInput(text: string): ParseResult {
  const trimmed = text.trim();
  const errors: ParseResult["errors"] = [];
  if (!trimmed) return { rows: [], errors };
  // JSON
  if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed);
      const arr = Array.isArray(parsed) ? parsed : [parsed];
      const out: CardRow[] = [];
      arr.forEach((o: unknown, i: number) => {
        const obj = Object.fromEntries(
          Object.entries((o ?? {}) as Record<string, unknown>).map(([k, v]) => [
            k,
            v == null ? "" : Array.isArray(v) ? v.join("|") : String(v),
          ]),
        );
        const r = normalizeRow(obj, i + 1);
        if ("error" in r) errors.push({ line: i + 1, reason: r.error });
        else out.push(r);
      });
      return { rows: out, errors };
    } catch (e) {
      return { rows: [], errors: [{ line: 0, reason: `JSON 파싱 실패: ${(e as Error).message}` }] };
    }
  }
  // CSV
  const rows = parseCsv(trimmed);
  if (rows.length < 2) return { rows: [], errors: [{ line: 0, reason: "헤더와 1행 이상의 데이터가 필요합니다" }] };
  const head = rows[0].map((s) => s.trim());
  const out: CardRow[] = [];
  rows.slice(1).forEach((r, idx) => {
    const obj: Record<string, string> = {};
    head.forEach((h, i) => {
      obj[h] = r[i] ?? "";
    });
    const norm = normalizeRow(obj, idx + 2);
    if ("error" in norm) errors.push({ line: idx + 2, reason: norm.error });
    else out.push(norm);
  });
  return { rows: out, errors };
}

function AdminCardsPage() {
  const { user, loading } = useAuth();
  const { isAdmin, isLoading } = useIsAdmin();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ inserted: number; updated?: number } | null>(null);

  const parsed = useMemo(() => parseInput(text), [text]);

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 5 * 1024 * 1024) {
      toast.error("5MB 이하 파일만 업로드 가능합니다");
      return;
    }
    const t = await f.text();
    setText(t);
  };

  const upload = async () => {
    if (parsed.rows.length === 0) {
      toast.error("등록할 유효한 행이 없습니다");
      return;
    }
    setBusy(true);
    setResult(null);
    try {
      // Chunk inserts to avoid request size limits
      const CHUNK = 200;
      let inserted = 0;
      for (let i = 0; i < parsed.rows.length; i += CHUNK) {
        const slice = parsed.rows.slice(i, i + CHUNK);
        const { error } = await supabase.from("cards").upsert(slice, { onConflict: "code" });
        if (error) throw error;
        inserted += slice.length;
      }
      setResult({ inserted });
      toast.success(`${inserted}장 등록/업데이트 완료`);
    } catch (e) {
      toast.error((e as Error).message ?? "업로드 실패");
    } finally {
      setBusy(false);
    }
  };

  if (loading || isLoading) {
    return (
      <div className="mx-auto w-full max-w-4xl px-6 py-8">
        <PageHeader title="카드 DB 업로드" description="권한 확인 중…" />
      </div>
    );
  }
  if (!user || !isAdmin) {
    return (
      <div className="mx-auto w-full max-w-4xl px-6 py-8">
        <PageHeader title="카드 DB 업로드" description="관리자 전용" />
        <Card className="mt-6">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Lock className="h-5 w-5 text-muted-foreground" />
              <CardTitle>접근 권한이 없습니다</CardTitle>
            </div>
            <CardDescription>관리자만 사용할 수 있어요.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline">
              <Link to="/cards">카드 DB 둘러보기</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-4xl px-6 py-8">
      <PageHeader
        title="카드 DB 업로드"
        description="CSV 또는 JSON으로 카드 데이터를 대량 등록·갱신합니다 (code 기준 upsert)"
      />

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-base">컬럼 안내</CardTitle>
          <CardDescription>
            필수: <code>{REQUIRED.join(", ")}</code> · 선택: <code>{OPTIONAL.join(", ")}</code>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            • <code>game</code>: <code>optcg | ptcg | dtcg</code>
          </p>
          <p>
            • <code>type</code>: <code>{VALID_TYPES.join(" | ")}</code>
          </p>
          <p>
            • <code>colors</code>는 <code>|</code>, <code>,</code>, <code>;</code> 중 하나로 구분 (예: <code>red|green</code>)
          </p>
          <p>• 동일 <code>code</code>가 이미 있으면 업데이트됩니다.</p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => downloadFile("cards-sample.csv", SAMPLE_CSV, "text/csv")}
          >
            <Download className="mr-1 h-4 w-4" /> 샘플 CSV 다운로드
          </Button>
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle className="text-base">파일 또는 본문 입력</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="file">CSV/JSON 파일 (최대 5MB)</Label>
            <Input id="file" type="file" accept=".csv,.json,text/csv,application/json" onChange={onFile} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="text">또는 직접 붙여넣기</Label>
            <Textarea
              id="text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={10}
              placeholder={SAMPLE_CSV}
              className="font-mono text-xs"
            />
          </div>
          <div className="flex items-center justify-between">
            <div className="text-sm">
              <span className="font-medium text-emerald-600">{parsed.rows.length}</span>건 유효
              {parsed.errors.length > 0 && (
                <>
                  {" · "}
                  <span className="font-medium text-destructive">{parsed.errors.length}</span>건 오류
                </>
              )}
            </div>
            <div className="flex gap-2">
              {text && (
                <Button variant="ghost" size="sm" onClick={() => setText("")}>
                  <Trash2 className="mr-1 h-4 w-4" /> 비우기
                </Button>
              )}
              <Button onClick={upload} disabled={busy || parsed.rows.length === 0}>
                <Upload className="mr-1 h-4 w-4" />
                {busy ? "업로드 중…" : `${parsed.rows.length}건 업로드`}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {parsed.errors.length > 0 && (
        <Card className="mt-4 border-destructive/40">
          <CardHeader>
            <CardTitle className="text-sm text-destructive">파싱 오류 ({parsed.errors.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="max-h-60 overflow-y-auto space-y-1 text-xs">
              {parsed.errors.slice(0, 100).map((e, i) => (
                <li key={i} className="text-muted-foreground">
                  · {e.line ? `${e.line}행: ` : ""}
                  {e.reason}
                </li>
              ))}
              {parsed.errors.length > 100 && (
                <li className="text-muted-foreground">... 외 {parsed.errors.length - 100}건</li>
              )}
            </ul>
          </CardContent>
        </Card>
      )}

      {parsed.rows.length > 0 && (
        <Card className="mt-4">
          <CardHeader>
            <CardTitle className="text-sm">미리보기 (상위 10건)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border text-left">
                    {ALL_COLS.map((c) => (
                      <th key={c} className="px-2 py-1 font-medium text-muted-foreground">
                        {c}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {parsed.rows.slice(0, 10).map((r, i) => (
                    <tr key={i} className="border-b border-border/50">
                      {ALL_COLS.map((c) => (
                        <td key={c} className="px-2 py-1">
                          {Array.isArray((r as Record<string, unknown>)[c])
                            ? ((r as Record<string, unknown>)[c] as string[]).join("|")
                            : String((r as Record<string, unknown>)[c] ?? "")}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {result && (
        <Card className="mt-4 border-emerald-500/40 bg-emerald-500/5">
          <CardContent className="py-4 text-sm">
            <FileText className="mr-2 inline h-4 w-4 text-emerald-600" />
            완료: {result.inserted}건 처리됨
          </CardContent>
        </Card>
      )}
    </div>
  );
}
