import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { useI18n } from "@/i18n/language-context";

export const Route = createFileRoute("/reset-password")({
  head: () => {
    let locale = "ko";
    if (typeof window !== "undefined") {
      locale = localStorage.getItem("duelnight.i18n.locale") || "ko";
    }
    const titles: Record<string, string> = {
      ko: "비밀번호 재설정 — DuelNight",
      en: "Reset Password — DuelNight",
      ja: "パスワード再設定 — DuelNight",
    };
    return {
      meta: [{ title: titles[locale] || titles.ko }],
    };
  },
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const { t } = useI18n();
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");

  // Supabase parses recovery hash and emits PASSWORD_RECOVERY event.
  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") setReady(true);
    });
    // Also accept already-active session (e.g. user navigates here manually
    // after the recovery link).
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) {
      toast.error(t("auth.passwordMinLengthError"));
      return;
    }
    if (password !== confirm) {
      toast.error(t("auth.passwordMismatchError"));
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(t("auth.resetPasswordSuccess"));
    await supabase.auth.signOut();
    navigate({ to: "/login" });
  };

  return (
    <div className="mx-auto flex min-h-[80vh] max-w-sm flex-col justify-center px-6">
      <h1 className="text-2xl font-semibold tracking-tight">
        {t("auth.resetPasswordTitle")}
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {t("auth.resetPasswordDesc")}
      </p>

      {!ready ? (
        <div className="mt-6 rounded-md border border-dashed border-border bg-muted/30 p-4 text-xs text-muted-foreground">
          {t("auth.resetPasswordInvalidLink")}
        </div>
      ) : (
        <form onSubmit={submit} className="mt-6 flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="password">{t("auth.newPasswordInput")}</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="confirm">{t("auth.confirmNewPasswordInput")}</Label>
            <Input
              id="confirm"
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
              minLength={6}
            />
          </div>
          <Button type="submit" disabled={busy} className="mt-2">
            {busy ? t("auth.processing") : t("auth.resetPasswordBtn")}
          </Button>
        </form>
      )}
    </div>
  );
}
