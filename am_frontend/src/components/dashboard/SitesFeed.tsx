import { useState, useEffect, useMemo } from "react";
import { Building2, MapPin, Search, Loader2, ShieldCheck } from "lucide-react";
import { CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import api from "../../services/api";

interface SiteItem {
  id: number;
  name: string;
  latitude: number;
  longitude: number;
  geofence_data?: [number, number][];
  client_name?: string;
  company_name?: string;
}

export function SitesFeed({ onSiteSelect }: { onSiteSelect?: (site: SiteItem) => void }) {
  const [companies, setCompanies] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  const fetchSites = async () => {
    try {
      const response = await api.get('/locations/companies');
      setCompanies(response.data || []);
    } catch (error) {
      console.error("Failed to fetch sites:", error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchSites();
  }, []);

  const allSites = useMemo(() => {
    return companies.flatMap((comp: any) =>
      (comp.sites || []).map((s: any) => ({
        ...s,
        company_name: comp.name
      }))
    ) as SiteItem[];
  }, [companies]);

  const filteredSites = useMemo(() => {
    if (!searchQuery.trim()) return allSites;
    const query = searchQuery.toLowerCase();
    return allSites.filter(site =>
      site.name.toLowerCase().includes(query) ||
      (site.client_name || "").toLowerCase().includes(query) ||
      (site.company_name || "").toLowerCase().includes(query)
    );
  }, [allSites, searchQuery]);

  return (
    <CardContent className="flex-1 p-0 flex flex-col overflow-hidden">
      <div className="p-4 pb-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search sites (e.g. Hinjewadi)..."
            className="pl-9 h-9"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      <div className="flex-1 relative">
        {isLoading ? (
          <div className="absolute inset-0 flex items-center justify-center bg-background/50">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <ScrollArea className="h-[378px]">
            <div className="space-y-1 p-4 pt-2">
              {filteredSites.length === 0 ? (
                <p className="text-center text-sm text-muted-foreground pt-4">No sites found.</p>
              ) : (
                filteredSites.map((site) => {
                  const hasGeofence = Array.isArray(site.geofence_data) && site.geofence_data.length > 0;

                  const cardStyles = hasGeofence
                    ? "border-l-4 border-l-status-active bg-status-active/5 hover:border-border/50 hover:bg-accent/10"
                    : "border-l-4 border-l-muted-foreground/30 bg-muted/5 hover:border-border/50 hover:bg-accent/10";

                  return (
                    <div
                      key={site.id}
                      className={`flex items-start gap-3 rounded-lg p-3.5 transition-all duration-200 border border-transparent cursor-pointer ${cardStyles}`}
                      onClick={() => onSiteSelect?.(site)}
                    >
                      <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg mt-0.5 ${hasGeofence ? "bg-status-active/10 text-status-active" : "bg-muted text-muted-foreground"}`}>
                        <Building2 className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between">
                          <p className="text-sm leading-snug font-semibold text-primary truncate">
                            {site.name}
                          </p>
                          {hasGeofence && (
                            <div className="flex items-center gap-1 text-[9px] text-status-active font-bold bg-status-active/10 border border-status-active/20 px-1.5 py-0.5 rounded shrink-0">
                              <ShieldCheck className="h-2.5 w-2.5" />
                              SECURE
                            </div>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5 truncate">
                          {site.client_name || "General Client"} · {site.company_name}
                        </p>
                        <div className="flex items-center gap-1.5 mt-1.5">
                          <MapPin className="h-3 w-3 text-muted-foreground" />
                          <span className="text-[10px] text-muted-foreground font-mono">
                            {site.latitude.toFixed(4)}, {site.longitude.toFixed(4)}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </ScrollArea>
        )}
      </div>
    </CardContent>
  );
}
