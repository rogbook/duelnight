import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { useI18n } from "@/i18n/language-context";

export const Route = createFileRoute("/login")({
  head: () => {
    let locale = "ko";
    if (typeof window !== "undefined") {
      locale = localStorage.getItem("duelnight.i18n.locale") || "ko";
    }
    const titles: Record<string, string> = {
      ko: "로그인 — DuelNight",
      en: "Log In — DuelNight",
      ja: "ログイン — DuelNight",
    };
    return {
      meta: [{ title: titles[locale] || titles.ko }],
    };
  },
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const { t } = useI18n();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const forgotPassword = async () => {
    const target = email.trim();
    if (!target) {
      toast.error(t("auth.passwordRequired"));
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.resetPasswordForEmail(target, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setBusy(true);
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(t("auth.passwordResetSuccess"));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${window.location.origin}/` },
        });
        if (error) throw error;
        toast.success(t("auth.signupSuccess"));
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
        navigate({ to: "/matches" });
      }
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const signInWithGoogle = async () => {
    setBusy(true);
    try {
      const result = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: `${window.location.origin}/matches`,
      });
      if (result.error) throw result.error;
      if (result.redirected) return;
      navigate({ to: "/matches" });
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const signInWithNaver = async () => {
    setBusy(true);
    try {
      toast.info(t("auth.naverPreparing"));
    } catch (err) {
      toast.error(`${t("auth.naverError")}: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const signInWithKakao = async () => {
    setBusy(true);
    try {
      toast.info(t("auth.kakaoPreparing"));
    } catch (err) {
      toast.error(`${t("auth.kakaoError")}: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto flex min-h-[80vh] max-w-sm flex-col justify-center px-6">
      <h1 className="text-2xl font-semibold tracking-tight">
        {mode === "signin" ? t("auth.loginTitle") : t("auth.signupTitle")}
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {t("auth.loginDesc")}
      </p>

      <div className="mt-6 flex flex-col gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={signInWithGoogle}
          disabled={busy}
          className="w-full"
        >
          <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
            <path
              fill="#EA4335"
              d="M12 10.2v3.9h5.5c-.24 1.4-1.7 4.1-5.5 4.1-3.3 0-6-2.7-6-6.1s2.7-6.1 6-6.1c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.8 3.5 14.6 2.5 12 2.5 6.8 2.5 2.5 6.8 2.5 12S6.8 21.5 12 21.5c6.9 0 9.5-4.8 9.5-7.3 0-.5-.05-.9-.1-1.3H12z"
            />
          </svg>
          {t("auth.googleLogin")}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={signInWithNaver}
          disabled={busy}
          className="w-full"
        >
          <span className="mr-2 inline-flex h-4 w-4 items-center justify-center rounded-sm bg-[#03C75A] text-[10px] font-bold text-white">
            N
          </span>
          {t("auth.naverLogin")}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={signInWithKakao}
          disabled={busy}
          className="w-full"
        >
          <span className="mr-2 inline-flex h-4 w-4 items-center justify-center rounded-sm bg-[#FEE500] text-[10px] font-bold text-[#3C1E1E]">
            K
          </span>
          {t("auth.kakaoLogin")}
        </Button>
      </div>

      <div className="my-5 flex items-center gap-2 text-[10px] text-muted-foreground">
        <span className="h-px flex-1 bg-border" />
        {t("common.or", "또는")} {t("auth.emailInput").toLowerCase()}
        <span className="h-px flex-1 bg-border" />
      </div>

      <form onSubmit={submit} className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="email">{t("auth.emailInput")}</Label>
          <Input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="password">{t("auth.passwordInput")}</Label>
          <Input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
          />
        </div>
        <Button type="submit" disabled={busy} className="mt-2">
          {busy ? t("auth.processing") : mode === "signin" ? t("auth.loginTitle") : t("auth.signupTitle")}
        </Button>
      </form>
      <div className="mt-4 flex items-center justify-between gap-2 text-xs">
        <button
          onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
          className="text-muted-foreground hover:text-foreground"
        >
          {mode === "signin"
            ? t("auth.toggleSignup")
            : t("auth.toggleSignin")}
        </button>
        {mode === "signin" && (
          <button
            type="button"
            onClick={forgotPassword}
            disabled={busy}
            className="text-muted-foreground hover:text-foreground disabled:opacity-50"
          >
            {t("auth.forgotPasswordBtn")}
          </button>
        )}
      </div>
      <Link to="/" className="mt-2 text-xs text-muted-foreground hover:text-foreground">
        {t("auth.backToDashboard")}
      </Link>
    </div>
  );
}
