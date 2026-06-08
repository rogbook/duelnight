import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { UserPlus, Check, X, Trash2, Users, Star } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { StartDmButton } from "@/components/start-dm-button";
import { OpponentSearch, type FoundUser } from "@/components/opponent-search";
import { useIsOnline } from "@/hooks/use-online-presence";
import { toast } from "sonner";
import { useI18n } from "@/i18n/language-context";

type Row = {
  id: string;
  requester_id: string;
  addressee_id: string;
  status: "pending" | "accepted";
  created_at: string;
  other: { id: string; display_name: string | null; username: string | null; avatar_url: string | null } | null;
};

export const Route = createFileRoute("/friends")({
  head: () => {
    let locale = "ko";
    if (typeof window !== "undefined") {
      locale = localStorage.getItem("duelnight.i18n.locale") || "ko";
    }
    const titles: Record<string, string> = {
      ko: "친구 — DuelNight",
      en: "Friends — DuelNight",
      ja: "フレンド — DuelNight",
    };
    const descs: Record<string, string> = {
      ko: "친구 요청과 친구 목록을 관리하세요.",
      en: "Manage friend requests and your friends list.",
      ja: "フレンドリクエストとフレンドリストを管理しましょう。",
    };
    return {
      meta: [
        { title: titles[locale] || titles.ko },
        { name: "description", content: descs[locale] || descs.ko },
      ],
    };
  },
  component: FriendsPage,
});

function FriendsPage() {
  const { user, loading } = useAuth();
  const qc = useQueryClient();
  const { t } = useI18n();
  const [picked, setPicked] = useState<FoundUser | null>(null);

  // 즐겨찾기(비공개). 테이블 미적용 시 빈 배열로 방어.
  const { data: favoriteIds = [], refetch: refetchFavorites } = useQuery({
    queryKey: ["friend-favorites", user?.id],
    enabled: !!user,
    queryFn: async () => {
      try {
        const { data, error } = await (supabase as any)
          .from("friend_favorites")
          .select("favorite_id");
        if (error) throw error;
        return ((data ?? []) as { favorite_id: string }[]).map((r) => r.favorite_id);
      } catch {
        return [] as string[];
      }
    },
  });
  const favoriteSet = new Set(favoriteIds);

  const toggleFavorite = async (favoriteId: string, makeFav: boolean) => {
    if (!user) return;
    try {
      if (makeFav) {
        const { error } = await (supabase as any)
          .from("friend_favorites")
          .insert({ user_id: user.id, favorite_id: favoriteId });
        if (error) throw error;
      } else {
        const { error } = await (supabase as any)
          .from("friend_favorites")
          .delete()
          .eq("user_id", user.id)
          .eq("favorite_id", favoriteId);
        if (error) throw error;
      }
      refetchFavorites();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  };

  const { data: rows = [], refetch } = useQuery({
    queryKey: ["friendships", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("friendships")
        .select("id,requester_id,addressee_id,status,created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      const otherIds = Array.from(
        new Set((data ?? []).map((r) => (r.requester_id === user!.id ? r.addressee_id : r.requester_id))),
      );
      let profiles: Record<string, { id: string; display_name: string | null; username: string | null; avatar_url: string | null }> = {};
      if (otherIds.length > 0) {
        const { data: ps } = await supabase
          .from("profiles")
          .select("id,display_name,username,avatar_url")
          .in("id", otherIds);
        for (const p of ps ?? []) profiles[p.id] = p;
      }
      return (data ?? []).map((r) => ({
        ...r,
        other: profiles[r.requester_id === user!.id ? r.addressee_id : r.requester_id] ?? null,
      })) as Row[];
    },
  });

  if (loading) return <div className="mx-auto max-w-4xl px-6 py-8 text-sm text-muted-foreground">{t("friends.loading")}</div>;
  if (!user) {
    return (
      <div className="mx-auto max-w-4xl px-6 py-8">
        <PageHeader title={t("friends.title")} description={t("friends.loginDesc")} />
        <Link to="/login" className="mt-4 inline-flex rounded-md bg-foreground px-4 py-2 text-sm text-background">{t("friends.goLogin")}</Link>
      </div>
    );
  }

  const friends = rows.filter((r) => r.status === "accepted");
  const incoming = rows.filter((r) => r.status === "pending" && r.addressee_id === user.id);
  const outgoing = rows.filter((r) => r.status === "pending" && r.requester_id === user.id);

  // 즐겨찾기 우선, 그다음 이름순
  const sortedFriends = [...friends].sort((a, b) => {
    const fa = a.other?.id && favoriteSet.has(a.other.id) ? 0 : 1;
    const fb = b.other?.id && favoriteSet.has(b.other.id) ? 0 : 1;
    if (fa !== fb) return fa - fb;
    const na = (a.other?.display_name ?? a.other?.username ?? "").toLowerCase();
    const nb = (b.other?.display_name ?? b.other?.username ?? "").toLowerCase();
    return na.localeCompare(nb);
  });

  const sendRequest = async () => {
    if (!picked) return;
    const { error } = await supabase.from("friendships").insert({
      requester_id: user.id,
      addressee_id: picked.id,
      status: "pending",
    });
    if (error) return toast.error(error.message);
    toast.success(t("friends.requestSent"));
    setPicked(null);
    qc.invalidateQueries({ queryKey: ["friendships"] });
    refetch();
  };

  const accept = async (id: string) => {
    const { error } = await supabase.from("friendships").update({ status: "accepted" }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success(t("friends.accepted"));
    refetch();
  };

  const remove = async (id: string) => {
    const { error } = await supabase.from("friendships").delete().eq("id", id);
    if (error) return toast.error(error.message);
    refetch();
  };

  return (
    <div className="mx-auto w-full max-w-4xl px-6 py-8">
      <PageHeader title={t("friends.title")} description={t("friends.desc")} />

      <section className="mt-6 rounded-lg border border-border bg-card p-4">
        <h2 className="text-sm font-medium">{t("friends.addFriend")}</h2>
        <div className="mt-3 flex flex-col gap-3 sm:flex-row">
          <div className="flex-1">
            <OpponentSearch selected={picked} onSelect={setPicked} onClear={() => setPicked(null)} />
          </div>
          <Button onClick={sendRequest} disabled={!picked || picked.friendship_status !== "none"}>
            <UserPlus className="mr-1 h-4 w-4" /> {t("friends.sendRequest")}
          </Button>
        </div>
        {picked && picked.friendship_status !== "none" && (
          <p className="mt-2 text-xs text-muted-foreground">{t("friends.alreadyFriend")}</p>
        )}
      </section>

      <Section title={t("friends.incomingSection", { count: incoming.length })}>
        {incoming.length === 0 ? (
          <Empty text={t("friends.noIncoming")} />
        ) : (
          incoming.map((r) => (
            <UserRow key={r.id} other={r.other} anonymous={t("friends.anonymous")}>
              <Button size="sm" onClick={() => accept(r.id)}><Check className="mr-1 h-3.5 w-3.5" />{t("friends.accept")}</Button>
              <Button size="sm" variant="ghost" onClick={() => remove(r.id)}><X className="h-3.5 w-3.5" /></Button>
            </UserRow>
          ))
        )}
      </Section>

      <Section title={t("friends.outgoingSection", { count: outgoing.length })}>
        {outgoing.length === 0 ? (
          <Empty text={t("friends.noOutgoing")} />
        ) : (
          outgoing.map((r) => (
            <UserRow key={r.id} other={r.other} anonymous={t("friends.anonymous")}>
              <span className="text-xs text-muted-foreground">{t("friends.pending")}</span>
              <Button size="sm" variant="ghost" onClick={() => remove(r.id)}>{t("friends.cancel")}</Button>
            </UserRow>
          ))
        )}
      </Section>

      <Section title={t("friends.friendsSection", { count: friends.length })}>
        {friends.length === 0 ? (
          <EmptyState icon={Users} title={t("friends.noFriendsTitle")} description={t("friends.noFriendsDesc")} />
        ) : (
          <>
            <p className="mb-2 text-[11px] text-muted-foreground">{t("friends.favoritesNote")}</p>
            {sortedFriends.map((r) => {
              const fid = r.other?.id;
              const fav = !!fid && favoriteSet.has(fid);
              return (
                <FriendRow
                  key={r.id}
                  other={r.other}
                  isFavorite={fav}
                  onToggleFavorite={() => fid && toggleFavorite(fid, !fav)}
                  onRemove={() => remove(r.id)}
                />
              );
            })}
          </>
        )}
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-6">
      <h2 className="mb-2 text-sm font-medium">{title}</h2>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="rounded-md border border-dashed border-border px-4 py-6 text-center text-xs text-muted-foreground">{text}</p>;
}

function FriendRow({
  other,
  isFavorite,
  onToggleFavorite,
  onRemove,
}: {
  other: Row["other"];
  isFavorite: boolean;
  onToggleFavorite: () => void;
  onRemove: () => void;
}) {
  const { t } = useI18n();
  const online = useIsOnline(other?.id);
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-card px-3 py-2">
      <div className="flex min-w-0 items-center gap-2">
        <div className="relative shrink-0">
          <Avatar className="h-9 w-9">
            <AvatarImage src={other?.avatar_url ?? undefined} />
            <AvatarFallback>{(other?.display_name ?? other?.username ?? "?").slice(0, 1)}</AvatarFallback>
          </Avatar>
          {online && (
            <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-card bg-green-500" />
          )}
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-1">
            {isFavorite && <Star className="h-3 w-3 shrink-0 fill-yellow-400 text-yellow-400" />}
            <p className="truncate text-sm font-medium">
              {other?.display_name ?? other?.username ?? t("friends.anonymous")}
            </p>
          </div>
          <p className="truncate text-[11px]">
            {online ? (
              <span className="font-medium text-green-500">● {t("friends.online")}</span>
            ) : (
              <span className="text-muted-foreground">{other?.username ? `@${other.username}` : ""}</span>
            )}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-1">
        <Button
          size="icon"
          variant="ghost"
          onClick={onToggleFavorite}
          title={t(isFavorite ? "friends.unfavorite" : "friends.favorite")}
        >
          <Star className={`h-4 w-4 ${isFavorite ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground"}`} />
        </Button>
        {other?.id && <StartDmButton userId={other.id} size="sm" variant="outline" />}
        <Button size="icon" variant="ghost" onClick={onRemove} className="text-destructive hover:text-destructive">
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

function UserRow({ other, children, anonymous }: { other: Row["other"]; children: React.ReactNode; anonymous: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-card px-3 py-2">
      <div className="flex items-center gap-2 min-w-0">
        <Avatar className="h-8 w-8">
          <AvatarImage src={other?.avatar_url ?? undefined} />
          <AvatarFallback>{(other?.display_name ?? other?.username ?? "?").slice(0, 1)}</AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{other?.display_name ?? other?.username ?? anonymous}</p>
          {other?.username && <p className="truncate text-[11px] text-muted-foreground">@{other.username}</p>}
        </div>
      </div>
      <div className="flex items-center gap-2">{children}</div>
    </div>
  );
}
