import { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

interface StatCardProps {
  title: string;
  value: number;
  icon: LucideIcon;
  variant: "active" | "info" | "critical" | "warning";
  trend?: string;
}

const variantToKpi = {
  active: { card: "kpi-card-green", icon: "kpi-icon-green" },
  info: { card: "kpi-card-blue", icon: "kpi-icon-blue" },
  critical: { card: "kpi-card-red", icon: "kpi-icon-red" },
  warning: { card: "kpi-card-amber", icon: "kpi-icon-amber" },
};

const dotStyles = {
  active: "bg-status-active",
  info: "bg-status-info",
  critical: "bg-status-critical",
  warning: "bg-status-warning",
};

export function StatCard({ title, value, icon: Icon, variant, trend }: StatCardProps) {
  const kpi = variantToKpi[variant];
  return (
    <Card className={`kpi-card ${kpi.card} border-border backdrop-blur-sm`}>
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <div 
                className={`h-2 w-2 rounded-full animate-pulse ${dotStyles[variant]}`}
                style={{
                  boxShadow: variant === 'active' ? '0 0 8px rgba(34, 197, 94, 0.8)' :
                             variant === 'info' ? '0 0 8px rgba(59, 130, 246, 0.8)' :
                             variant === 'critical' ? '0 0 8px rgba(239, 68, 68, 0.8)' :
                             '0 0 8px rgba(245, 158, 11, 0.8)'
                }}
              />
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/80">{title}</p>
            </div>
            <p className="text-3xl font-extrabold font-mono-data tracking-tight text-foreground">{value}</p>
            {trend && <p className="text-xs text-muted-foreground">{trend}</p>}
          </div>
          <div className={`flex h-11 w-11 items-center justify-center rounded-xl transition-transform duration-300 ${kpi.icon}`}>
            <Icon className="h-5.5 w-5.5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
