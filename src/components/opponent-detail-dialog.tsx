import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { fmtPctVal } from "@/lib/match-stats";
import { useGames } from "@/hooks/use-games";
import { StartDmButton } from "@/components/start-dm-button";

type Game = string;

export function OpponentDetailDialog({
  open,
  onOpenChange,
  opponent,
  game,
  myMatches,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  opponent: { name: string; userId?: string | null } | null;
  game: Game | "all";
  myMatches: Array<{
    id: string;
    played_at: string;
    game: Game;
    my_deck: string;
    opp_leader: string | null;
    opp_deck: string | null;
    result: "win" | "loss" | "draw";
    went_first: boolean;
    points_delta: number | null;
    opponent_user_id: string | null;
  }>;
}) {
  const { labelOf } = useGames();
  // Profile if userId provided
  const { data: profile } = useQuery({
    queryKey: ["opp-profile", opponent?.userId],
    enabled: !!opponent?.userId,
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id,display_name,username,avatar_url,primary_game,bio")
        .eq("id", opponent!.userId!)
        .maybeSingle();
      return data;
    },
  });

  const { data: ratings = [] } = useQuery({
    queryKey: ["opp-rating", opponent?.userId],
    enabled: !!opponent?.userId,
    queryFn: async () => {
      const { data } = await supabase
        .from("user_ratings")
        .select("game,rating,matches_count")
        .eq("user_id", opponent!.userId!);
      return data ?? [];
    },
  });

  const { data: decks = [] } = useQuery({
    queryKey: ["opp-decks", opponent?.userId],
    enabled: !!opponent?.userId,
    queryFn: async () => {
      const { data } = await supabase
        .from("decks")
        .select("id,name,leader,game,colors,is_public")
        .eq("user_id", opponent!.userId!)
        .eq("is_public", true)
        .order("updated_at", { ascending: false });
      return data ?? [];
    },
  });

  const recent = (myMatches ?? [])
    .slice()
    .sort((a, b) => +new Date(b.played_at) - +new Date(a.played_at))
    .slice(0, 12);
  const wins = recent.filter((m) => m.result === "win").length;
  const losses = recent.filter((m) => m.result === "loss").length;
  const decided = wins + losses;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        {opponent && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-3">
                {profile ? (
                  <>
                    <Avatar className="h-10 w-10">
                      <AvatarImage src={profile.avatar_url ?? undefined} />
                      <AvatarFallback>
                        {(profile.display_name ?? profile.username ?? "?").slice(0, 1)}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <p>{profile.display_name ?? profile.username ?? opponent.name}</p>
                      {profile.username && (
                        <p className="text-xs font-normal text-muted-foreground">
                          @{profile.username}
                        </p>
                      )}
                    </div>
                  </>
                ) : (
                  <span>{opponent.name}</span>
                )}
              </DialogTitle>
            </DialogHeader>

            {opponent.userId && (
              <div>
                <StartDmButton userId={opponent.userId} variant="outline" size="sm" />
              </div>
            )}

            {profile?.bio && (
              <p className="text-sm text-muted-foreground">{profile.bio}</p>
            )}

            {ratings.length > 0 && (
              <section>
                <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  랭킹 점수
                </h3>
                <ul className="grid grid-cols-3 gap-2">
                  {ratings.map((r) => (
                    <li
                      key={r.game}
                      className="rounded-md border border-border bg-card p-2 text-center"
                    >
                      <p className="text-[10px] text-muted-foreground">
                        {labelOf(r.game)}
                      </p>
                      <p className="text-lg font-semibold tabular-nums">{r.rating}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {r.matches_count}판
                      </p>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {decks.length > 0 && (
              <section>
                <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  공개 덱 ({decks.length})
                </h3>
                <ul className="space-y-1.5">
                  {decks.slice(0, 8).map((d) => (
                    <li
                      key={d.id}
                      className="flex items-center justify-between rounded-md border border-border bg-card px-3 py-2 text-sm"
                    >
                      <span className="truncate">
                        {d.name}
                        {d.leader && (
                          <span className="ml-1.5 text-xs text-muted-foreground">
                            · {d.leader}
                          </span>
                        )}
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        {labelOf(d.game)}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <section>
              <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                최근 매칭 ({recent.length})
                {decided > 0 && (
                  <span className="ml-2 normal-case text-foreground">
                    승률 {fmtPctVal(wins / decided)} ({wins}-{losses})
                  </span>
                )}
              </h3>
              {recent.length === 0 ? (
                <p className="text-sm text-muted-foreground">기록 없음</p>
              ) : (
                <ul className="divide-y divide-border rounded-md border border-border bg-card">
                  {recent.map((m) => (
                    <li key={m.id} className="flex items-center justify-between px-3 py-2 text-xs">
                      <div className="min-w-0 flex-1">
                        <p className="truncate">
                          <span className="font-medium">{m.my_deck}</span>
                          <span className="mx-1 text-muted-foreground">vs</span>
                          {m.opp_leader || m.opp_deck || opponent.name}
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                          {new Date(m.played_at).toLocaleDateString("ko-KR")} ·{" "}
                          {m.went_first ? "선공" : "후공"} · {labelOf(m.game)}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <ResultPill r={m.result} />
                        {m.points_delta != null && (
                          <span
                            className={
                              "tabular-nums text-[11px] font-medium " +
                              (m.points_delta > 0
                                ? "text-emerald-600"
                                : m.points_delta < 0
                                  ? "text-rose-600"
                                  : "text-muted-foreground")
                            }
                          >
                            {m.points_delta > 0 ? "+" : ""}
                            {m.points_delta}
                          </span>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ResultPill({ r }: { r: "win" | "loss" | "draw" }) {
  const map = {
    win: "bg-emerald-500/10 text-emerald-600",
    loss: "bg-rose-500/10 text-rose-600",
    draw: "bg-muted text-muted-foreground",
  } as const;
  const label = { win: "승", loss: "패", draw: "무" }[r];
  return <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${map[r]}`}>{label}</span>;
}
