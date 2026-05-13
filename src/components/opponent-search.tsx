import { useEffect, useState } from "react";
import { Search, UserCheck, Clock, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

export type FoundUser = {
  id: string;
  display_name: string | null;
  username: string | null;
  avatar_url: string | null;
  primary_game: string | null;
  friendship_status: "friend" | "pending_in" | "pending_out" | "none";
};

export function OpponentSearch({
  selected,
  onSelect,
  onClear,
}: {
  selected: FoundUser | null;
  onSelect: (u: FoundUser) => void;
  onClear: () => void;
}) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<FoundUser[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (selected) return;
    if (q.trim().length < 1) {
      setResults([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const t = setTimeout(async () => {
      const { data, error } = await supabase.rpc("search_users", { q, lim: 12 });
      if (cancelled) return;
      setLoading(false);
      if (!error && data) setResults(data as FoundUser[]);
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [q, selected]);

  if (selected) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-md border border-border bg-muted/30 px-3 py-2">
        <div className="flex items-center gap-2 min-w-0">
          <Avatar className="h-7 w-7">
            <AvatarImage src={selected.avatar_url ?? undefined} />
            <AvatarFallback className="text-[10px]">
              {(selected.display_name ?? selected.username ?? "?").slice(0, 1)}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">
              {selected.display_name ?? selected.username ?? "익명"}
            </p>
            <p className="truncate text-[11px] text-muted-foreground">
              <FriendBadge s={selected.friendship_status} />
              {selected.username ? ` · @${selected.username}` : ""}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClear}
          className="text-muted-foreground hover:text-foreground"
          aria-label="해제"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="닉네임 또는 @username 검색"
        className="pl-9"
      />
      {open && (q.trim().length > 0 || loading) && (
        <div className="absolute z-50 mt-1 w-full overflow-hidden rounded-md border border-border bg-popover shadow-md">
          {loading && (
            <p className="px-3 py-2 text-xs text-muted-foreground">검색 중...</p>
          )}
          {!loading && results.length === 0 && (
            <p className="px-3 py-2 text-xs text-muted-foreground">결과 없음</p>
          )}
          <ul className="max-h-64 overflow-y-auto">
            {results.map((u) => (
              <li key={u.id}>
                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    onSelect(u);
                    setQ("");
                    setOpen(false);
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-accent"
                >
                  <Avatar className="h-6 w-6">
                    <AvatarImage src={u.avatar_url ?? undefined} />
                    <AvatarFallback className="text-[10px]">
                      {(u.display_name ?? u.username ?? "?").slice(0, 1)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">
                      {u.display_name ?? u.username ?? "익명"}
                    </p>
                    {u.username && (
                      <p className="truncate text-[10px] text-muted-foreground">
                        @{u.username}
                      </p>
                    )}
                  </div>
                  <FriendBadge s={u.friendship_status} />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function FriendBadge({ s }: { s: FoundUser["friendship_status"] }) {
  if (s === "friend")
    return (
      <span className="inline-flex items-center gap-0.5 rounded bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
        <UserCheck className="h-3 w-3" /> 친구
      </span>
    );
  if (s === "pending_in" || s === "pending_out")
    return (
      <span className="inline-flex items-center gap-0.5 rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-400">
        <Clock className="h-3 w-3" /> 대기중
      </span>
    );
  return (
    <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
      미친구
    </span>
  );
}
