import { createFileRoute, Link, useNavigate, notFound } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, ImageOff, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useIsAdmin } from "@/hooks/use-is-admin";
import { Button } from "@/components/ui/button";
import { EditCardDialog } from "@/components/cards/edit-card-dialog";
import { normalizeImageUrl } from "@/components/cards/card-uploader";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import type { Database } from "@/integrations/supabase/types";
import { useI18n } from "@/i18n/language-context";
import { colorLabel } from "@/lib/deck-colors";
import type { Game } from "@/lib/deck-colors";

type Card = Database["public"]["Tables"]["cards"]["Row"];
type Illustration = Database["public"]["Tables"]["card_illustrations"]["Row"];

const SITE = "https://duelnight.app";

export const Route = createFileRoute("/cards_/$code")({
  loader: async ({ params }) => {
    const { data, error } = await supabase
      .from("cards")
      .select("*")
      .eq("code", params.code)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw notFound();
    return { card: data as Card };
  },
  head: ({ loaderData }) => {
    const c = loaderData?.card;
    let locale = "ko";
    if (typeof window !== "undefined") {
      locale = localStorage.getItem("duelnight.i18n.locale") || "ko";
    }

    if (!c) {
      const titlesNotFound: Record<string, string> = {
        ko: "카드를 찾을 수 없음 — DuelNight",
        en: "Card Not Found — DuelNight",
        ja: "カードが見つかりません — DuelNight",
      };
      return { meta: [{ title: titlesNotFound[locale] || titlesNotFound.ko }] };
    }

    const typeLabels: Record<string, Record<string, string>> = {
      leader: { ko: "리더", en: "Leader", ja: "リーダー" },
      character: { ko: "캐릭터", en: "Character", ja: "キャラクター" },
      event: { ko: "이벤트", en: "Event", ja: "イベント" },
      stage: { ko: "스테이지", en: "Stage", ja: "ステージ" },
      don: { ko: "DON!!", en: "DON!!", ja: "DON!!" },
    };

    const typeLabel = typeLabels[c.type]?.[locale] || typeLabels[c.type]?.ko || c.type;
    const title = `${c.name} (${c.code}) — DuelNight`;
    const desc =
      (c.effect?.replace(/\s+/g, " ").slice(0, 150) ??
        `${typeLabel} · ${c.set_code}`) +
      ` · ${c.set_code}`;
    const url = `${SITE}/cards/${encodeURIComponent(c.code)}`;
    const ogImage = normalizeImageUrl(c.image_url) ?? undefined;
    return {
      meta: [
        { title },
        { name: "description", content: desc },
        { property: "og:title", content: title },
        { property: "og:description", content: desc },
        { property: "og:type", content: "article" },
        { property: "og:url", content: url },
        ...(ogImage
          ? [
              { property: "og:image", content: ogImage },
              { name: "twitter:image", content: ogImage },
              { name: "twitter:card", content: "summary_large_image" },
            ]
          : []),
        { name: "twitter:title", content: title },
        { name: "twitter:description", content: desc },
      ],
      links: [{ rel: "canonical", href: url }],
      scripts: [
        {
          type: "application/ld+json",
          children: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Product",
            name: c.name,
            sku: c.code,
            image: ogImage,
            description: c.effect ?? undefined,
            category: typeLabel,
            brand: { "@type": "Brand", name: "One Piece TCG" },
          }),
        },
      ],
    };
  },
  component: CardDetailPage,
  notFoundComponent: () => {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const { t } = useI18n();
    return (
      <div className="mx-auto max-w-3xl px-6 py-16 text-center">
        <h1 className="text-2xl font-semibold">{t("cards.cardNotFound")}</h1>
        <Link
          to="/cards"
          className="mt-4 inline-flex items-center gap-1 text-sm text-primary hover:underline"
        >
          <ArrowLeft className="h-4 w-4" /> {t("cards.backToDb")}
        </Link>
      </div>
    );
  },
});

function CardDetailPage() {
  const { t, language } = useI18n();
  const { card: loaderCard } = Route.useLoaderData();
  const [card, setCard] = useState<Card>(loaderCard);
  const [illusts, setIllusts] = useState<Illustration[]>([]);
  const [activeUrl, setActiveUrl] = useState<string | null>(normalizeImageUrl(loaderCard.image_url));
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const { isAdmin } = useIsAdmin();
  const navigate = useNavigate();

  const getCardTypeLabel = (type: string) => {
    if (type === "leader") return t("cards.typeLeader");
    if (type === "character") return t("cards.typeCharacter");
    if (type === "event") return t("cards.typeEvent");
    if (type === "stage") return t("cards.typeStage");
    if (type === "don") return t("cards.typeDon");
    return type;
  };

  const refetch = async () => {
    const { data } = await supabase.from("cards").select("*").eq("code", card.code).maybeSingle();
    if (data) {
      setCard(data as Card);
      setActiveUrl(normalizeImageUrl(data.image_url));
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      const { error } = await supabase.from("cards").delete().eq("code", card.code);
      if (error) throw error;
      toast.success(t("cards.deleteSuccess"));
      navigate({ to: "/cards" });
    } catch (err) {
      toast.error(t("cards.deleteFailed") + (err as Error).message);
      setDeleting(false);
      setConfirmDelete(false);
    }
  };

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data } = await supabase
        .from("card_illustrations")
        .select("*")
        .eq("card_code", card.code)
        .eq("status", "approved")
        .order("is_primary", { ascending: false })
        .order("created_at", { ascending: true });
      if (alive) setIllusts((data ?? []) as Illustration[]);
    })();
    return () => { alive = false; };
  }, [card.code]);

  const gallery: { url: string; label: string | null }[] = [];
  const mainUrl = normalizeImageUrl(card.image_url);
  if (mainUrl) gallery.push({ url: mainUrl, label: t("cards.primaryIllust") });
  for (const il of illusts) {
    const u = normalizeImageUrl(il.image_url);
    if (!u || gallery.some((x) => x.url === u)) continue;
    gallery.push({ url: u, label: il.variant_label || t("cards.altIllust") });
  }
  const displayUrl = activeUrl ?? mainUrl ?? null;

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-8">
      <div className="flex items-center justify-between gap-2">
        <Link
          to="/cards"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> {t("cards.title")}
        </Link>
        {isAdmin && (
          <div className="flex gap-1.5">
            <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
              <Pencil className="h-3.5 w-3.5 mr-1" />{t("common.edit")}
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="text-destructive hover:text-destructive"
              onClick={() => setConfirmDelete(true)}
            >
              <Trash2 className="h-3.5 w-3.5 mr-1" />{t("common.delete")}
            </Button>
          </div>
        )}
      </div>
      <div className="mt-4 grid gap-6 sm:grid-cols-[260px_1fr]">
        <div>
          <div className="aspect-[5/7] w-full overflow-hidden rounded-lg border border-border bg-muted">
            {displayUrl ? (
              <img
                src={displayUrl}
                alt={card.name}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full items-center justify-center text-muted-foreground">
                <ImageOff className="h-10 w-10" />
              </div>
            )}
          </div>
          {gallery.length > 1 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {gallery.map((g) => (
                <button
                  key={g.url}
                  type="button"
                  onClick={() => setActiveUrl(g.url)}
                  title={g.label ?? ""}
                  className={`relative h-16 w-12 overflow-hidden rounded border ${
                    displayUrl === g.url ? "border-primary ring-1 ring-primary" : "border-border"
                  }`}
                >
                  <img src={g.url} alt={g.label ?? ""} className="h-full w-full object-cover" />
                  {g.label && (
                    <span className="absolute inset-x-0 bottom-0 truncate bg-background/80 px-1 text-[9px] leading-3">
                      {g.label}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        <div>
          <div className="flex items-center gap-2">
            <p className="text-xs text-muted-foreground">{card.code}</p>
            {card.status === "pending" && (
              <span className="rounded-md bg-yellow-500/15 px-2 py-0.5 text-[10px] font-semibold text-yellow-600 dark:text-yellow-400">
                {t("cards.statusPending")}
              </span>
            )}
            {card.status === "rejected" && (
              <span className="rounded-md bg-destructive/15 px-2 py-0.5 text-[10px] font-semibold text-destructive">
                {t("cards.statusRejected")}
              </span>
            )}
          </div>
          <h1 className="mt-1 text-2xl font-semibold">{card.name}</h1>
          {card.status === "rejected" && card.review_note && (
            <p className="mt-2 rounded-md border border-destructive/30 bg-destructive/5 p-2 text-xs text-destructive">
              {t("cards.rejectReason").replace("{reason}", card.review_note)}
            </p>
          )}
          <div className="mt-3 flex flex-wrap gap-1.5">
            <Tag>{getCardTypeLabel(card.type)}</Tag>
            {card.colors.map((c: string) => (
              <Tag key={c}>{colorLabel(card.game as Game, c, language)}</Tag>
            ))}
            {card.rarity && <Tag>{card.rarity}</Tag>}
            <Tag>{card.set_code}</Tag>
          </div>
          <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <Stat label={card.type === "leader" ? t("cards.life") : t("cards.cost")} value={card.cost} />
            <Stat label={t("cards.power")} value={card.power?.toLocaleString()} />
            <Stat label={t("cards.counter")} value={card.counter?.toLocaleString()} />
            <Stat label={t("cards.attribute")} value={card.attribute} />
          </dl>
          {card.traits && card.traits.length > 0 && (
            <div className="mt-4">
              <p className="text-xs font-semibold text-muted-foreground">{t("cards.traits")}</p>
              <div className="mt-1 flex flex-wrap gap-1">
                {card.traits.map((t: string) => (
                  <Tag key={t}>{t}</Tag>
                ))}
              </div>
            </div>
          )}
          {card.effect && (
            <div className="mt-4">
              <p className="text-xs font-semibold text-muted-foreground">{t("cards.effect")}</p>
              <p className="mt-1 whitespace-pre-wrap rounded-md bg-muted/50 p-3 text-sm leading-relaxed">
                {card.effect}
              </p>
            </div>
          )}
        </div>
      </div>

      {editing && (
        <EditCardDialog
          card={card}
          onClose={() => setEditing(false)}
          onSaved={() => { setEditing(false); refetch(); }}
        />
      )}

      <AlertDialog open={confirmDelete} onOpenChange={(o) => { if (!o && !deleting) setConfirmDelete(false); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("cards.deleteConfirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("cards.deleteConfirmDesc")
                .replace("{code}", card.code)
                .replace("{name}", card.name)}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting ? t("cards.deleting") : t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground">
      {children}
    </span>
  );
}

function Stat({
  label,
  value,
}: {
  label: string;
  value?: string | number | null;
}) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <div className="flex gap-2">
      <dt className="w-14 shrink-0 text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm">{value}</dd>
    </div>
  );
}
