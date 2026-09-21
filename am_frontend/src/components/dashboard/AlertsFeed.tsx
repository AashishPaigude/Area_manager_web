import { useState, useEffect } from "react";
import { AlertTriangle, AlertCircle, Info, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import api from "../../services/api";

interface AlertItem {
  id: number;
  category: string;
  incident_type?: string;
  fact_found?: string;
  reported_at: string;
  site_id?: number | null;
  latitude?: number | null;
  longitude?: number | null;
  is_resolved: boolean;
  risk_category?: string;
}

const getAlertConfig = (category: string) => {
  if (category === "EMERGENCY_SOS") return { icon: AlertCircle, color: "text-status-critical bg-status-critical/10" };
  if (category === "Security") return { icon: AlertTriangle, color: "text-status-warning bg-status-warning/10" };
  return { icon: Info, color: "text-status-info bg-status-info/10" };
};

export function AlertsFeed({ onAlertSelect }: { onAlertSelect?: (alert: AlertItem) => void }) {
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    setAlerts([]);
  }, []);

  return (
    <Card className="border-border h-[500px] flex flex-col">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <AlertTriangle className="h-4 w-4 text-status-warning" />
          Live Activity Feed
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1 p-0 relative">
        {isLoading ? (
          <div className="absolute inset-0 flex items-center justify-center bg-background/50">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <ScrollArea className="h-[430px]">
            <div className="space-y-1 p-4 pt-0">
              {alerts.length === 0 ? (
                <p className="text-center text-sm text-muted-foreground pt-4">All clear. No active alerts.</p>
              ) : (
                alerts.map((alert) => {
                  const config = getAlertConfig(alert.category);
                  const Icon = config.icon;

                  const canLocate = typeof alert.latitude === "number" && typeof alert.longitude === "number";
                  const isSos = alert.category === "EMERGENCY_SOS";
                  const isSecurity = alert.category === "Security";

                  let cardStyles = "border-l-4 border-l-status-info bg-status-info/5 hover:bg-status-info/10 hover:border-r hover:border-y hover:border-border/40";
                  if (isSos) {
                    cardStyles = "border-l-4 border-l-status-critical bg-status-critical/5 hover:bg-status-critical/10 hover:border-r hover:border-y hover:border-border/40 shadow-[0_2px_12px_rgba(239,68,68,0.04)]";
                  } else if (isSecurity) {
                    cardStyles = "border-l-4 border-l-status-warning bg-status-warning/5 hover:bg-status-warning/10 hover:border-r hover:border-y hover:border-border/40";
                  }

                  return (
                    <div
                      key={alert.id}
                      className={`flex items-start gap-3 rounded-lg p-3.5 transition-all duration-200 border border-transparent ${cardStyles} ${canLocate ? "cursor-pointer" : "opacity-90"}`}
                      onClick={() => {
                        if (canLocate && onAlertSelect) {
                          onAlertSelect(alert);
                        }
                      }}
                      title={canLocate ? "Locate on map" : "Location not available"}
                    >
                      <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${config.color} mt-0.5`}>
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-sm leading-snug font-bold text-foreground flex items-center gap-1.5 flex-wrap">
                            {isSos ? "🚨 EMERGENCY SOS" : alert.category}
                            <Badge 
                              variant="outline" 
                              className={`text-[9px] py-0 px-1.5 h-4.5 font-bold uppercase rounded-md shadow-none select-none ${
                                isSos 
                                  ? "bg-red-500/10 text-red-600 border-red-500/30" 
                                  : "bg-amber-500/10 text-amber-600 border-amber-500/30"
                              }`}
                            >
                              Pending
                            </Badge>
                          </p>
                          <span className="text-[10px] text-muted-foreground/90 font-mono shrink-0 mt-0.5">
                            {(() => {
                              const d = new Date(alert.reported_at);
                              const pad = (n: number) => n.toString().padStart(2, "0");
                              let h = d.getHours();
                              const ampm = h >= 12 ? "PM" : "AM";
                              h = h % 12 || 12;
                              return `${pad(h)}:${pad(d.getMinutes())} ${ampm}`;
                            })()}
                          </span>
                        </div>
                        <div className="flex items-center gap-1 mt-1.5 font-semibold text-[10px]">
                          <span className="text-muted-foreground">Risk Level:</span>
                          <span className={`${
                            alert.risk_category?.toLowerCase() === "high" || alert.risk_category?.toLowerCase() === "critical"
                              ? "text-status-critical"
                              : alert.risk_category?.toLowerCase() === "medium"
                                ? "text-status-warning"
                                : "text-status-info"
                          }`}>
                            {alert.risk_category || "Not Specified"}
                          </span>
                        </div>

                        <div className="flex items-center gap-1.5 mt-2.5 text-[10px] text-muted-foreground font-semibold">
                          <span>{alert.site_id ? `Site ID: ${alert.site_id}` : 'Mobile Patrol'}</span>
                          {canLocate && (
                            <>
                              <span>·</span>
                              <span className="text-primary hover:underline flex items-center gap-0.5">
                                Click to locate
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}