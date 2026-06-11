import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import {
  UserPlus,
  UserMinus,
  Crown,
  Lock,
  LogIn,
  Infinity as InfinityIcon,
  Trash2,
} from "lucide-react";
import { z } from "zod";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useAuth } from "@/hooks/use-auth";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  anyAdminExists,
  checkIsAdmin,
  claimFirstAdmin,
  grantAdmin,
  grantAiUnlimited,
  listAdmins,
  listAiUnlimited,
  revokeAdmin,
  revokeAiUnlimited,
} from "@/lib/admin.functions";

const emailSchema = z.string().trim().email({ message: "올바른 이메일 형식이 아닙니다" }).max(255);

export const Route = createFileRoute("/admin/")({
  head: () => ({
    meta: [
      { title: "관리자 — DuelNight" },
      { name: "description", content: "관리자 권한 부여 및 관리." },
    ],
  }),
  component: AdminPage,
});

function AdminPage() {
  const { user, loading } = useAuth();
  const qc = useQueryClient();

  const fnAnyAdmin = useServerFn(anyAdminExists);
  const fnIsAdmin = useServerFn(checkIsAdmin);
  const fnClaim = useServerFn(claimFirstAdmin);
  const fnGrant = useServerFn(grantAdmin);
  const fnRevoke = useServerFn(revokeAdmin);
  const fnList = useServerFn(listAdmins);
  const fnGrantUnlimited = useServerFn(grantAiUnlimited);
  const fnRevokeUnlimited = useServerFn(revokeAiUnlimited);
  const fnListUnlimited = useServerFn(listAiUnlimited);

  const { data: anyAdmin, isLoading: l1 } = useQuery({
    queryKey: ["any-admin"],
    queryFn: () => fnAnyAdmin().then((r) => r.exists),
  });

  const { data: amAdmin, isLoading: l2 } = useQuery({
    queryKey: ["am-admin", user?.id],
    enabled: !!user,
    queryFn: () => fnIsAdmin().then((r) => r.isAdmin),
  });

  const { data: admins = [], refetch: refetchAdmins } = useQuery({
    queryKey: ["admins-list"],
    enabled: !!amAdmin,
    queryFn: () => fnList().then((r) => r.admins),
  });

  const { data: unlimitedUsers = [], refetch: refetchUnlimited } = useQuery({
    queryKey: ["ai-unlimited-list"],
    enabled: !!amAdmin,
    queryFn: () => fnListUnlimited().then((r) => r.users),
  });

  const [grantEmail, setGrantEmail] = useState("");
  const [revokeEmail, setRevokeEmail] = useState("");
  const [unlimitedEmail, setUnlimitedEmail] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["any-admin"] });
    qc.invalidateQueries({ queryKey: ["am-admin"] });
    qc.invalidateQueries({ queryKey: ["is-admin"] });
    refetchAdmins();
  };

  const grantUnlimited = async () => {
    const parsed = emailSchema.safeParse(unlimitedEmail);
    if (!parsed.success) return toast.error(parsed.error.issues[0].message);
    setBusy(true);
    try {
      await fnGrantUnlimited({ data: { email: parsed.data } });
      toast.success(`${parsed.data} 에게 AI 무제한을 부여했어요`);
      setUnlimitedEmail("");
      refetchUnlimited();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const revokeUnlimited = async (email: string) => {
    if (!confirm(`${email} 의 AI 무제한을 해제할까요?`)) return;
    setBusy(true);
    try {
      await fnRevokeUnlimited({ data: { email } });
      toast.success("AI 무제한을 해제했어요");
      refetchUnlimited();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const claim = async () => {
    setBusy(true);
    try {
      await fnClaim();
      toast.success("첫 관리자로 등록됐어요");
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const grant = async () => {
    const parsed = emailSchema.safeParse(grantEmail);
    if (!parsed.success) return toast.error(parsed.error.issues[0].message);
    setBusy(true);
    try {
      await fnGrant({ data: { email: parsed.data } });
      toast.success(`${parsed.data} 에게 관리자 권한을 부여했어요`);
      setGrantEmail("");
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const revoke = async () => {
    const parsed = emailSchema.safeParse(revokeEmail);
    if (!parsed.success) return toast.error(parsed.error.issues[0].message);
    if (!confirm(`${parsed.data} 의 관리자 권한을 해제할까요?`)) return;
    setBusy(true);
    try {
      await fnRevoke({ data: { email: parsed.data } });
      toast.success("관리자 권한을 해제했어요");
      setRevokeEmail("");
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  // ---- Guard screens ----
  if (loading) {
    return <GuardLayout>불러오는 중…</GuardLayout>;
  }

  if (!user) {
    return (
      <GuardLayout>
        <GuardCard
          icon={LogIn}
          title="로그인이 필요합니다"
          description="관리자 콘솔은 로그인한 사용자만 접근할 수 있어요. 로그인 후 다시 시도해 주세요."
          action={
            <Button asChild>
              <Link to="/login">로그인하러 가기</Link>
            </Button>
          }
        />
      </GuardLayout>
    );
  }

  if (l1 || l2) {
    return <GuardLayout>권한을 확인하는 중…</GuardLayout>;
  }

  // 비관리자 + 이미 다른 관리자가 존재 → 안내 화면
  if (!amAdmin && anyAdmin) {
    return (
      <GuardLayout>
        <GuardCard
          icon={Lock}
          title="관리자 전용 페이지입니다"
          description="이 페이지는 관리자 권한이 있는 계정만 사용할 수 있어요. 권한이 필요하면 기존 관리자에게 본인의 가입 이메일을 전달해 부여를 요청하세요."
          action={
            <div className="flex gap-2">
              <Button variant="outline" asChild>
                <Link to="/">대시보드로</Link>
              </Button>
              <Button asChild>
                <Link to="/profile">내 프로필 보기</Link>
              </Button>
            </div>
          }
        />
      </GuardLayout>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-8">
      <PageHeader title="관리자 콘솔" description="관리자 권한 부여·해제 및 목록 관리" />

      {!anyAdmin && (
        <section className="mt-6 rounded-lg border-2 border-primary/40 bg-primary/5 p-4">
          <div className="flex items-start gap-3">
            <Crown className="mt-0.5 h-5 w-5 text-primary" />
            <div className="flex-1">
              <h2 className="text-sm font-semibold">첫 관리자 등록</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                아직 관리자가 없어요. 지금 로그인된 본인 계정을 첫 관리자로 등록할 수 있습니다.
              </p>
              <Button onClick={claim} disabled={busy} className="mt-3">
                <Crown className="mr-1 h-4 w-4" />내 계정을 첫 관리자로 등록
              </Button>
            </div>
          </div>
        </section>
      )}

      {amAdmin && (
        <>
          <section className="mt-6 rounded-lg border border-border bg-card p-4">
            <h2 className="text-sm font-semibold">관리자 권한 부여</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              해당 이메일로 가입된 사용자에게 admin 역할을 추가합니다. (서버에서 권한 재검증)
            </p>
            <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto]">
              <div className="space-y-1">
                <Label htmlFor="grant-email" className="sr-only">
                  이메일
                </Label>
                <Input
                  id="grant-email"
                  type="email"
                  value={grantEmail}
                  onChange={(e) => setGrantEmail(e.target.value)}
                  placeholder="user@example.com"
                  maxLength={255}
                />
              </div>
              <Button onClick={grant} disabled={busy} className="gap-1">
                <UserPlus className="h-4 w-4" /> 부여
              </Button>
            </div>
          </section>

          <section className="mt-4 rounded-lg border border-border bg-card p-4">
            <h2 className="text-sm font-semibold">관리자 권한 해제</h2>
            <p className="mt-1 text-xs text-muted-foreground">본인 계정은 해제할 수 없습니다.</p>
            <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto]">
              <Input
                type="email"
                value={revokeEmail}
                onChange={(e) => setRevokeEmail(e.target.value)}
                placeholder="user@example.com"
                maxLength={255}
              />
              <Button onClick={revoke} disabled={busy} variant="outline" className="gap-1">
                <UserMinus className="h-4 w-4" /> 해제
              </Button>
            </div>
          </section>

          <section className="mt-6">
            <h2 className="text-sm font-semibold">현재 관리자 ({admins.length})</h2>
            {admins.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">관리자가 없습니다.</p>
            ) : (
              <ul className="mt-3 divide-y divide-border rounded-lg border border-border bg-card">
                {admins.map((a) => (
                  <li
                    key={a.user_id}
                    className="flex items-center justify-between gap-3 px-4 py-3 text-sm"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium">{a.display_name ?? a.email}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {a.email} · {new Date(a.granted_at).toLocaleDateString()}
                      </p>
                    </div>
                    {a.user_id === user.id && (
                      <span className="rounded bg-primary/15 px-2 py-0.5 text-[10px] font-semibold text-primary">
                        나
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* ── AI 무제한 사용자 ── */}
          <section className="mt-8 rounded-lg border border-border bg-card p-4">
            <h2 className="flex items-center gap-1.5 text-sm font-semibold">
              <InfinityIcon className="h-4 w-4 text-primary" /> AI 무제한 사용자
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              지정한 사용자는 요금제·크레딧 없이 AI 기능(카드 OCR·코치)을 무제한으로 씁니다.
              관리자는 별도 지정 없이 항상 무제한입니다.
            </p>
            <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto]">
              <Input
                type="email"
                value={unlimitedEmail}
                onChange={(e) => setUnlimitedEmail(e.target.value)}
                placeholder="user@example.com"
                maxLength={255}
              />
              <Button onClick={grantUnlimited} disabled={busy} className="gap-1">
                <UserPlus className="h-4 w-4" /> 무제한 부여
              </Button>
            </div>

            <h3 className="mt-5 text-xs font-semibold text-muted-foreground">
              지정된 사용자 ({unlimitedUsers.length})
            </h3>
            {unlimitedUsers.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">지정된 사용자가 없습니다.</p>
            ) : (
              <ul className="mt-2 divide-y divide-border rounded-lg border border-border">
                {unlimitedUsers.map((u) => (
                  <li
                    key={u.user_id}
                    className="flex items-center justify-between gap-3 px-4 py-3 text-sm"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium">{u.display_name ?? u.email}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {u.email} · {new Date(u.granted_at).toLocaleDateString()}
                      </p>
                    </div>
                    <Button
                      onClick={() => revokeUnlimited(u.email)}
                      disabled={busy}
                      variant="ghost"
                      size="sm"
                      className="gap-1 text-destructive hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" /> 해제
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function GuardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-8">
      <PageHeader title="관리자 콘솔" description="관리자 권한 부여·해제 및 목록 관리" />
      <div className="mt-6">{children}</div>
    </div>
  );
}

function GuardCard({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border-2 border-dashed border-border bg-card px-6 py-12 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
        <Icon className="h-6 w-6 text-muted-foreground" />
      </div>
      <h2 className="text-base font-semibold">{title}</h2>
      <p className="max-w-md text-sm text-muted-foreground">{description}</p>
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
