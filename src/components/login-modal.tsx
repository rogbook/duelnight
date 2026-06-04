import { useState } from "react";
import { Check, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { useI18n } from "@/i18n/language-context";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

// 자주 노출되는 흔한 비밀번호 — Supabase 누출 비밀번호 보호와 별개로 클라이언트에서 선차단
const COMMON_PASSWORDS = new Set([
  "password",
  "password1",
  "12345678",
  "123456789",
  "1234567890",
  "qwerty123",
  "qwertyuiop",
  "11111111",
  "00000000",
  "abcdefgh",
  "iloveyou",
  "admin123",
  "letmein1",
]);

function checkPasswordRules(password: string) {
  const length = password.length >= 8;
  const letter = /[a-zA-Z]/.test(password);
  const number = /\d/.test(password);
  const notCommon =
    password.length > 0 && !COMMON_PASSWORDS.has(password.toLowerCase());
  return {
    length,
    letter,
    number,
    notCommon,
    valid: length && letter && number && notCommon,
  };
}

export function LoginModal({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
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
        // 이메일 인증이 비활성화된 경우 signUp 즉시 세션이 발급됨 → 자동 이동
        if (data.session) {
          onOpenChange(false);
        } else {
          // 세션이 없으면 password로 즉시 로그인 시도 (자동 로그인 보장)
          const { error: signInErr } = await supabase.auth.signInWithPassword({ email, password });
          if (!signInErr) onOpenChange(false);
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
        onOpenChange(false);
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
        redirect_uri: `${window.location.origin}/intro`,
      });
      if (result.error) throw result.error;
      if (result.redirected) return;
      onOpenChange(false);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm gap-0 overflow-hidden p-0">
        <DialogHeader className="px-6 pb-2 pt-6">
          <DialogTitle className="text-left text-xl">
            {mode === "signin" ? t("auth.loginTitle") : t("auth.signupTitle")}
          </DialogTitle>
          <p className="mt-1 text-left text-sm text-muted-foreground">
            {t("auth.loginDesc")}
          </p>
        </DialogHeader>

        <div className="px-6 pb-6">
          <div className="mt-4 flex flex-col gap-2">
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

          <div className="my-4 flex items-center gap-2 text-[10px] text-muted-foreground">
            <span className="h-px flex-1 bg-border" />
            {t("common.or", "또는")} {t("auth.emailInput").toLowerCase()}
            <span className="h-px flex-1 bg-border" />
          </div>

          <form onSubmit={submit} className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="modal-email">{t("auth.emailInput")}</Label>
              <Input
                id="modal-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="modal-password">{t("auth.passwordInput")}</Label>
              <Input
                id="modal-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={mode === "signup" ? 8 : 6}
                aria-describedby={mode === "signup" ? "pw-rules" : undefined}
              />
              {mode === "signup" && (
                <ul
                  id="pw-rules"
                  className="mt-1 flex flex-col gap-1 text-xs"
                  aria-label={t("auth.passwordHint")}
                >
                  <PwRule ok={pwRules.length}>{t("auth.pwRuleLength")}</PwRule>
                  <PwRule ok={pwRules.letter}>{t("auth.pwRuleLetter")}</PwRule>
                  <PwRule ok={pwRules.number}>{t("auth.pwRuleNumber")}</PwRule>
                  <PwRule ok={pwRules.notCommon}>{t("auth.pwRuleCommon")}</PwRule>
                </ul>
              )}
            </div>
            <Button
              type="submit"
              disabled={busy || signupBlocked}
              className="mt-1"
            >
              {busy
                ? t("auth.processing")
                : mode === "signin"
                  ? t("auth.loginTitle")
                  : t("auth.signupTitle")}
            </Button>
          </form>

          <div className="mt-3 flex items-center justify-between gap-2 text-xs">
            <button
              type="button"
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

          <div className="mt-3 flex justify-center">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              {t("common.cancel", "취소")}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function PwRule({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <li
      className={
        ok
          ? "flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400"
          : "flex items-center gap-1.5 text-muted-foreground"
      }
    >
      {ok ? (
        <Check className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      ) : (
        <X className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      )}
      <span>{children}</span>
    </li>
  );
}
