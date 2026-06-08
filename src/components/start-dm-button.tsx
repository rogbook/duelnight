/**
 * 어디서나 1:1 DM을 시작하는 버튼.
 * 친구/프로필/매칭 참가자/대전 상대 등에서 재사용.
 */
import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { MessageCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { useI18n } from "@/i18n/language-context";
import { startDm } from "@/lib/dm";

interface Props {
  userId: string;
  label?: string;
  variant?: "default" | "outline" | "ghost" | "secondary";
  size?: "default" | "sm" | "icon";
  className?: string;
  iconOnly?: boolean;
}

export function StartDmButton({ userId, label, variant = "outline", size = "sm", className, iconOnly }: Props) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);

  // 본인에게는 표시하지 않음
  if (user?.id === userId) return null;

  const onClick = async () => {
    if (!user) {
      toast.info(t("dm.loginRequired"));
      return;
    }
    setBusy(true);
    try {
      const convId = await startDm(userId);
      navigate({ to: "/messages/$id", params: { id: convId } });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button onClick={onClick} disabled={busy} variant={variant} size={size} className={className}>
      <MessageCircle className={iconOnly ? "h-4 w-4" : "h-4 w-4"} />
      {!iconOnly && <span className="ml-1">{label ?? t("dm.message")}</span>}
    </Button>
  );
}
