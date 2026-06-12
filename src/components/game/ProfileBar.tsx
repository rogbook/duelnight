import { useI18n } from "@/i18n/language-context";
import { getTier } from "@/lib/tier";
import { NotificationBell } from "@/components/notification-bell";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

interface ProfileBarProps {
  displayName: string;
  avatarUrl?: string | null;
  rating?: number | null;
  xpProgress?: number; // 0 ~ 100
  showNotification?: boolean;
  daysLeft?: number;
}

export function ProfileBar({
  displayName,
  avatarUrl,
  rating,
  xpProgress = 42,
  showNotification = true,
  daysLeft,
}: ProfileBarProps) {
  const { t } = useI18n();
  const tier = rating !== undefined && rating !== null ? getTier(rating) : null;

  return (
    <div className="flex items-center justify-between w-full bg-game-card border border-game-line rounded-2xl p-3 shadow-md">
      <div className="flex items-center gap-3 flex-1 min-w-0">
        {/* 아바타 (38px 원형, bg-game-blue-deep) */}
        <div className="relative flex-shrink-0">
          <Avatar className="h-[38px] w-[38px] border-2 border-game-blue-deep bg-game-blue-deep">
            {avatarUrl ? (
              <AvatarImage src={avatarUrl} alt={displayName} className="object-cover" />
            ) : null}
            <AvatarFallback className="text-white text-xs font-bold bg-game-blue-deep uppercase">
              {displayName.slice(0, 2)}
            </AvatarFallback>
          </Avatar>
        </div>

        {/* 닉네임 + ELO / 티어 배지 + XP 바 */}
        <div className="flex-1 min-w-0 flex flex-col gap-0.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-sm font-bold text-game-text truncate">{displayName}</span>
            {tier && rating !== null && rating !== undefined && (
              <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[9px] font-extrabold uppercase bg-game-gold/10 text-game-gold border border-game-gold/30">
                {t(tier.labelKey)} · {rating} RP
              </span>
            )}
          </div>
          {/* XP 진행바 (5px 두께, bg-game-blue) */}
          <div className="relative w-full max-w-[150px] h-[5px] bg-game-line rounded-full overflow-hidden mt-0.5">
            <div
              className="absolute left-0 top-0 h-full bg-game-blue transition-all duration-300 ease-out"
              style={{ width: `${xpProgress}%` }}
            />
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-shrink-0 pl-2">
        {/* 시즌 종료 D-day */}
        {daysLeft !== undefined && daysLeft !== null && (
          <span className="text-[10px] font-bold text-game-blue bg-game-blue/10 border border-game-blue/20 rounded-lg px-2 py-1">
            시즌 종료까지 {daysLeft}일
          </span>
        )}

        {/* 알림 벨 */}
        {showNotification && (
          <div className="flex items-center justify-center">
            <NotificationBell />
          </div>
        )}
      </div>
    </div>
  );
}
