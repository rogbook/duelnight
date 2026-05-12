import type { LucideIcon } from "lucide-react";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
}

export function EmptyState({ icon: Icon, title, description }: EmptyStateProps) {
  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center rounded-lg border border-dashed border-border bg-muted/30 px-6 py-16 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-background text-muted-foreground shadow-sm">
        <Icon className="h-5 w-5" />
      </div>
      <h3 className="mt-4 text-base font-medium text-foreground">{title}</h3>
      {description && (
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">
          {description}
        </p>
      )}
      <p className="mt-4 text-xs text-muted-foreground">
        곧 제공될 예정입니다
      </p>
    </div>
  );
}
