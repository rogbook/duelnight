import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Check, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { useI18n } from "@/i18n/language-context";

const COMMON_PASSWORDS = new Set([
  "password","password1","12345678","123456789","1234567890",
  "qwerty123","qwertyuiop","11111111","00000000","abcdefgh",
  "iloveyou","admin123","letmein1",
]);

function checkPasswordRules(password: string) {
  const length = password.length >= 8;
  const letter = /[a-zA-Z]/.test(password);
  const number = /\d/.test(password);
  const notCommon = password.length > 0 && !COMMON_PASSWORDS.has(password.toLowerCase());
  return { length, letter, number, notCommon, valid: length && letter && number && notCommon };
}

function PwRule({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <li className={ok ? "flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400" : "flex items-center gap-1.5 text-muted-foreground"}>
      {ok ? <Check className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /> : <X className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
      <span>{children}</span>
    </li>
  );
}


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

  const pwRules = checkPasswordRules(password);
  const signupBlocked = mode === "signup" && !pwRules.valid;


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
    if (mode === "signup" && !pwRules.valid) {
      toast.error(t("auth.passwordHint"));
      return;
    }
    setBusy(true);
    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({

          email,
          password,
          options: { emailRedirectTo: `${window.location.origin}/` },
        });
        if (error) throw error;
        toast.success(t("auth.signupSuccess"));
        if (data.session) {
          navigate({ to: "/matches" });
        } else {
          const { error: signInErr } = await supabase.auth.signInWithPassword({ email, password });
          if (!signInErr) navigate({ to: "/matches" });
        }
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
            minLength={mode === "signup" ? 8 : 6}
            aria-describedby={mode === "signup" ? "pw-rules" : undefined}
          />
          {mode === "signup" && (
            <ul id="pw-rules" className="mt-1 flex flex-col gap-1 text-xs" aria-label={t("auth.passwordHint")}>
              <PwRule ok={pwRules.length}>{t("auth.pwRuleLength")}</PwRule>
              <PwRule ok={pwRules.letter}>{t("auth.pwRuleLetter")}</PwRule>
              <PwRule ok={pwRules.number}>{t("auth.pwRuleNumber")}</PwRule>
              <PwRule ok={pwRules.notCommon}>{t("auth.pwRuleCommon")}</PwRule>
            </ul>
          )}
        </div>
        <Button type="submit" disabled={busy || signupBlocked} className="mt-2">
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
