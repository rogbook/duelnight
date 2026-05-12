import type { Match } from "@/lib/match-stats";

const HEADERS = [
  "played_at",
  "game",
  "event",
  "my_deck",
  "opp_leader",
  "opp_deck",
  "went_first",
  "result",
  "notes",
] as const;

type Row = Pick<Match, (typeof HEADERS)[number]>;

const escape = (v: unknown): string => {
  const s = v == null ? "" : String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
};

export function matchesToCsv(rows: Match[]): string {
  const lines = [HEADERS.join(",")];
  for (const m of rows) {
    lines.push(HEADERS.map((h) => escape((m as Row)[h])).join(","));
  }
  return lines.join("\n");
}

export function matchesToJson(rows: Match[]): string {
  return JSON.stringify(
    rows.map((m) =>
      Object.fromEntries(HEADERS.map((h) => [h, (m as Row)[h]])),
    ),
    null,
    2,
  );
}

/** Minimal CSV parser supporting quoted fields with escaped quotes. */
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

export interface ImportRow {
  game: Match["game"];
  event: Match["event"];
  my_deck: string;
  opp_leader: string | null;
  opp_deck: string | null;
  went_first: boolean;
  result: Match["result"];
  notes: string | null;
  played_at?: string;
}

const VALID_GAME = new Set(["optcg", "ptcg", "dtcg"]);
const VALID_EVENT = new Set(["friendly", "shop", "official"]);
const VALID_RESULT = new Set(["win", "loss", "draw"]);

const truthy = (s: string) => /^(1|true|t|y|yes|선공|first)$/i.test(s.trim());

function normalizeRow(obj: Record<string, string>): ImportRow | null {
  const game = (obj.game || "").trim() as Match["game"];
  const event = (obj.event || "friendly").trim() as Match["event"];
  const result = (obj.result || "").trim() as Match["result"];
  if (!VALID_GAME.has(game)) return null;
  if (!VALID_EVENT.has(event)) return null;
  if (!VALID_RESULT.has(result)) return null;
  const my_deck = (obj.my_deck || "").trim();
  if (!my_deck) return null;
  return {
    game,
    event,
    my_deck,
    opp_leader: obj.opp_leader?.trim() || null,
    opp_deck: obj.opp_deck?.trim() || null,
    went_first: truthy(obj.went_first || "true"),
    result,
    notes: obj.notes?.trim() || null,
    played_at: obj.played_at?.trim() || undefined,
  };
}

export function parseImport(text: string): ImportRow[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  // JSON?
  if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed);
      const arr = Array.isArray(parsed) ? parsed : [parsed];
      return arr
        .map((o) =>
          normalizeRow(
            Object.fromEntries(
              Object.entries(o ?? {}).map(([k, v]) => [k, String(v ?? "")]),
            ),
          ),
        )
        .filter((x): x is ImportRow => !!x);
    } catch {
      return [];
    }
  }
  // CSV
  const rows = parseCsv(trimmed);
  if (rows.length < 2) return [];
  const head = rows[0].map((s) => s.trim());
  return rows
    .slice(1)
    .map((r) => {
      const obj: Record<string, string> = {};
      head.forEach((h, i) => {
        obj[h] = r[i] ?? "";
      });
      return normalizeRow(obj);
    })
    .filter((x): x is ImportRow => !!x);
}

export function downloadFile(name: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}
