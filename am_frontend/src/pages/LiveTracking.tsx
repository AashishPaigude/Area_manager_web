import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  Wifi, WifiOff, Navigation, Clock, Signal,
  MapPin, Activity, Users, Search, RefreshCw, AlertTriangle,
  Battery, BatteryWarning, BatteryCharging, Zap
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from "@/components/ui/select";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { trackingService, LiveOfficerItem } from "@/services/trackingService";
import { getSites, SiteItem, getBranches, Branch } from "@/services/visitService";

const trackColors: Record<string, { dot: string; badge: string; ring: string }> = {
  online:  { dot: "#22c55e", badge: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400", ring: "ring-emerald-500/40" },
  delayed: { dot: "#f59e0b", badge: "bg-amber-500/15 text-amber-600 dark:text-amber-400",   ring: "ring-amber-500/40" },
  offline: { dot: "#f43f5e", badge: "bg-red-500/15 text-red-600 dark:text-red-400",         ring: "ring-red-500/40" },
};

const OFFICER_COLORS = [
  "#3B82F6", // Blue
  "#A855F7", // Purple
  "#F97316", // Orange
  "#14B8A6", // Teal
  "#EC4899", // Pink
  "#EAB308", // Yellow
  "#22C55E", // Green
  "#EF4444", // Red
];

const createLeafletIcon = (bodyColor: string, statusColor: string, isSelected: boolean = false) => {
  if (isSelected) {
    return L.divIcon({
      className: "bg-transparent",
      html: `
        <div style="position: relative; width: 38px; height: 46px; display: flex; align-items: center; justify-content: center;">
          <!-- Animated Radar Beacon Rings -->
          <div style="
            position: absolute;
            bottom: 2px;
            left: 50%;
            transform: translateX(-50%);
            width: 38px;
            height: 38px;
            border-radius: 50%;
            background: ${bodyColor};
            opacity: 0.45;
            animation: ping 1.2s cubic-bezier(0, 0, 0.2, 1) infinite;
          "></div>
          <div style="
            position: absolute;
            bottom: 6px;
            left: 50%;
            transform: translateX(-50%);
            width: 22px;
            height: 22px;
            border-radius: 50%;
            background: ${statusColor};
            opacity: 0.6;
          "></div>
          <!-- High-Contrast Vector Pin -->
          <svg width="32" height="40" viewBox="0 0 24 30" fill="none" xmlns="http://www.w3.org/2000/svg" style="filter: drop-shadow(0px 4px 8px rgba(0,0,0,0.55)); position: relative; z-index: 10;">
            <path d="M12 1.5C6.2 1.5 1.5 6.2 1.5 12C1.5 20.3 12 28.5 12 28.5C12 28.5 22.5 20.3 22.5 12C22.5 6.2 17.8 1.5 12 1.5Z" fill="${bodyColor}" stroke="white" stroke-width="2.2" stroke-linejoin="round"/>
            <circle cx="12" cy="12" r="4.8" fill="${statusColor}" stroke="white" stroke-width="1.2"/>
          </svg>
        </div>
      `,
      iconSize: [38, 46],
      iconAnchor: [19, 42],
      popupAnchor: [0, -38]
    });
  }

  return L.divIcon({
    className: "bg-transparent",
    html: `
      <svg width="28" height="35" viewBox="0 0 24 30" fill="none" xmlns="http://www.w3.org/2000/svg" style="filter: drop-shadow(0px 2px 4px rgba(0,0,0,0.35));">
        <path d="M12 1.5C6.2 1.5 1.5 6.2 1.5 12C1.5 20.3 12 28.5 12 28.5C12 28.5 22.5 20.3 22.5 12C22.5 6.2 17.8 1.5 12 1.5Z" fill="${bodyColor}" stroke="white" stroke-width="1.8" stroke-linejoin="round"/>
        <circle cx="12" cy="12" r="4.2" fill="${statusColor}" stroke="white" stroke-width="0.8"/>
      </svg>
    `,
    iconSize: [28, 35],
    iconAnchor: [14, 35],
    popupAnchor: [0, -32]
  });
};

function MapPanController({ center, panTrigger }: { center: [number, number] | null; panTrigger?: number }) {
  const map = useMap();
  useEffect(() => {
    if (
      map &&
      center &&
      Array.isArray(center) &&
      typeof center[0] === "number" &&
      typeof center[1] === "number" &&
      Number.isFinite(center[0]) &&
      Number.isFinite(center[1]) &&
      center[0] !== 0 &&
      center[1] !== 0
    ) {
      try {
        const latLng = L.latLng(center[0], center[1]);
        if (latLng) {
          const size = map.getSize();
          if (size && size.x > 0 && size.y > 0) {
            map.flyTo(latLng, 16, { animate: true, duration: 0.8 });
          } else {
            map.setView(latLng, 16);
          }
        }
      } catch (e) {
        try {
          map.setView([center[0], center[1]], 16);
        } catch (_) {}
      }
    }
  }, [center, panTrigger, map]);
  return null;
}

function formatWorkHoursDisplay(val?: string | null): string {
  if (!val) return "0h 0m";
  if (val.includes("h") || val.includes("m")) return val;
  if (val.includes(":")) {
    const parts = val.split(":");
    const h = parseInt(parts[0], 10) || 0;
    const m = parseInt(parts[1], 10) || 0;
    return `${h}h ${m}m`;
  }
  return val;
}

function BatteryBar({ level }: { level?: number | null }) {
  if (level === null || level === undefined) {
    return (
      <div className="flex items-center justify-between py-0.5">
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <Battery className="h-3.5 w-3.5 text-muted-foreground/70" />
          <span className="text-[11px] font-medium text-muted-foreground">Battery</span>
        </div>
        <span className="text-xs font-semibold text-muted-foreground">N/A</span>
      </div>
    );
  }

  const rounded = Math.round(level);
  const isHigh = rounded > 50;
  const isMid = rounded > 20 && rounded <= 50;

  const barColor = isHigh
    ? "bg-emerald-500"
    : isMid
    ? "bg-amber-500"
    : "bg-rose-500";

  const textColor = isHigh
    ? "text-emerald-600 dark:text-emerald-400"
    : isMid
    ? "text-amber-600 dark:text-amber-400"
    : "text-rose-600 dark:text-rose-400";

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Battery className={`h-3.5 w-3.5 ${textColor}`} />
          <span className="text-[11px] font-medium text-foreground">Battery</span>
        </div>
        <span className={`text-xs font-bold font-mono-data ${textColor}`}>{rounded}%</span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-muted/60 overflow-hidden">
        <div
          className={`h-full rounded-full ${barColor} transition-all duration-300`}
          style={{ width: `${Math.min(100, Math.max(0, rounded))}%` }}
        />
      </div>
    </div>
  );
}

export default function LiveTracking() {
  const [officers, setOfficers] = useState<LiveOfficerItem[]>([]);
  const [masterSites, setMasterSites] = useState<SiteItem[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedBranch, setSelectedBranch] = useState<string>("all");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [panTrigger, setPanTrigger] = useState<number>(0);
  const [filterStatus, setFilterStatus] = useState("all");
  const [siteFilter, setSiteFilter] = useState("all-sites");
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<"list" | "details">("list");
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [lastFetchTime, setLastFetchTime] = useState<string>("Just now");

  const markerRefs = React.useRef<Record<number, L.Marker | null>>({});

  // Fetch master sites and branches once on mount
  useEffect(() => {
    getSites()
      .then((sites) => setMasterSites(sites || []))
      .catch((err) => console.error("Failed to load master sites for LiveTracking:", err));

    getBranches()
      .then((bList) => setBranches(bList || []))
      .catch((err) => console.error("Failed to load branches for LiveTracking:", err));
  }, []);

  const fetchLiveTracking = useCallback(async (isInitial = false) => {
    try {
      if (isInitial) setLoading(true);
      setError(null);
      const bOid = selectedBranch !== "all" ? parseInt(selectedBranch) : undefined;
      const res = await trackingService.getLiveTracking(bOid);
      setOfficers(res.officers);
      setLastFetchTime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));

      if (res.officers.length > 0) {
        setSelectedId(prev => {
          if (prev && res.officers.some(o => o.id === prev)) {
            return prev;
          }
          // Do not select any officer by default; wait for user click
          return null;
        });
      }
    } catch (err: any) {
      console.error("Failed to fetch live tracking data:", err);
      setError(err?.response?.data?.message || err?.message || "Failed to load live tracking data from server.");
    } finally {
      if (isInitial) setLoading(false);
    }
  }, [selectedBranch]);

  // Fetch only on mount or when user clicks Refresh Data (no annoying auto-polling/jumping)
  useEffect(() => {
    fetchLiveTracking(true);
  }, [fetchLiveTracking]);

  const handleSelectOfficer = (o: LiveOfficerItem) => {
    setSelectedId(o.id);
    setPanTrigger(p => p + 1);
    setTimeout(() => {
      try {
        const m = markerRefs.current[o.id];
        if (m && typeof m.openPopup === "function") {
          m.openPopup();
        }
      } catch (e) {
        // Safe fallback
      }
    }, 100);
  };

  useEffect(() => {
    if (selectedId) {
      const timer = setTimeout(() => {
        try {
          const m = markerRefs.current[selectedId];
          if (m && typeof m.openPopup === "function") {
            m.openPopup();
          }
        } catch (e) {
          // Safe fallback
        }
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [selectedId]);

  const selected = selectedId ? (officers.find(o => o.id === selectedId) ?? null) : null;

  // Combine master sites from database and active officer sites
  const uniqueSites = useMemo(() => {
    const siteMap = new Map<string, { id: string; name: string }>();

    masterSites.forEach((s) => {
      if (s.name && s.name.trim()) {
        siteMap.set(String(s.oid), { id: String(s.oid), name: s.name.trim() });
      }
    });

    officers.forEach((o) => {
      if (o.site && o.site !== "—" && o.site.trim()) {
        const key = o.siteId ? String(o.siteId) : o.site.trim();
        if (!siteMap.has(key)) {
          siteMap.set(key, { id: key, name: o.site.trim() });
        }
      }
    });

    return Array.from(siteMap.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [masterSites, officers]);

  const filtered = officers.filter(o => {
    const matchStatus = filterStatus === "all" || o.trackStatus === filterStatus;
    
    let matchSite = siteFilter === "all-sites";
    if (!matchSite) {
      const selectedSiteObj = uniqueSites.find(s => s.id === siteFilter);
      const selectedSiteName = selectedSiteObj ? selectedSiteObj.name.toLowerCase().trim() : siteFilter.toLowerCase().trim();
      matchSite = String(o.siteId) === siteFilter ||
        (Boolean(o.site) && o.site.toLowerCase().trim() === selectedSiteName);
    }

    const matchSearch = o.name.toLowerCase().includes(search.toLowerCase()) ||
                        o.empCode.toLowerCase().includes(search.toLowerCase());
    return matchStatus && matchSite && matchSearch;
  });

  // Only officers who are currently on duty and have valid coordinates appear on the map
  const officersWithLocation = filtered.filter(
    o => o.trackStatus !== "offline" && o.status === "on_duty" && o.lat !== null && o.lng !== null && !isNaN(o.lat as number) && !isNaN(o.lng as number)
  );

  const counts = {
    online:  officers.filter(o => o.trackStatus === "online").length,
    delayed: officers.filter(o => o.trackStatus === "delayed").length,
    offline: officers.filter(o => o.trackStatus === "offline").length,
    onSite:  officers.filter(o => o.visitStatus === "Visiting").length,
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Live GPS Tracking</h1>
        <div className="mt-1.5 flex items-start gap-2 rounded-md border border-amber-200/70 bg-amber-50/70 p-2.5 text-xs text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-300">
          <span className="shrink-0 text-sm leading-none pt-0.5">📍</span>
          <div>
            <span className="font-semibold">Location Accuracy Notice: </span>
            <span className="text-amber-800 dark:text-amber-300/90 leading-relaxed">
              GPS data may be influenced by environmental factors (e.g., tall buildings, indoor locations, weather conditions, heavy tree cover, network coverage, etc.). As a result, the user’s location may not always be exact and can vary depending on these conditions.
            </span>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
        {[
          { label: "Online",  value: counts.online,  icon: Wifi,       color: "kpi-card-green", detail: "Active GPS signal" },
          { label: "Connectivity Issue", value: counts.delayed, icon: Clock,      color: "kpi-card-amber", detail: "Behind schedule" },
          { label: "Offline", value: counts.offline, icon: WifiOff,    color: "kpi-card-red",   detail: "Signal lost" },
          { 
            label: "On Site",  
            value: counts.onSite,  
            icon: MapPin,   
            color: "kpi-card-blue",  
            detail: "Officers currently on site" 
          },
        ].map(c => (
          <Card key={c.label} className={`kpi-card ${c.color} border-border`}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/80">{c.label}</p>
                  <p className="text-2xl font-extrabold font-mono-data mt-1">{loading ? "—" : c.value}</p>
                  <p className="text-[10px] text-muted-foreground/80 font-medium mt-1">{c.detail}</p>
                </div>
                <c.icon className="h-5 w-5 text-muted-foreground shrink-0 self-start mt-0.5" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/60" />
          <Input
            placeholder="Search officer..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-8 h-7 w-44 text-xs bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 shadow-sm"
          />
        </div>
        {branches.length > 1 && (
          <Select value={selectedBranch} onValueChange={setSelectedBranch}>
            <SelectTrigger className="h-7 w-36 text-xs border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
              <SelectValue placeholder="All Branches" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Branches</SelectItem>
              {branches.map(b => (
                <SelectItem key={b.oid} value={b.oid.toString()}>{b.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="h-7 w-28 text-xs border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="online">Online</SelectItem>
            <SelectItem value="delayed">Connectivity Issue</SelectItem>
            <SelectItem value="offline">Offline</SelectItem>
          </SelectContent>
        </Select>
        <Select value={siteFilter} onValueChange={setSiteFilter}>
          <SelectTrigger className="h-7 w-36 text-xs border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
            <SelectValue placeholder="Site" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all-sites">All Sites</SelectItem>
            {uniqueSites.map(s => (
              <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="ml-auto flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={fetchLiveTracking}
            disabled={loading}
            className="btn-white-fill h-7 px-3 text-xs gap-1.5 font-medium rounded-md shadow-xs"
            title={`Last updated at ${lastFetchTime}`}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            <span>Refresh</span>
          </Button>
        </div>
      </div>

      {/* Error state alert */}
      {error && (
        <Card className="border-red-500/30 bg-red-500/5 p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs text-red-600 dark:text-red-400 font-medium">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
            <Button size="sm" variant="outline" onClick={fetchLiveTracking} className="h-7 text-xs border-red-500/30">
              Retry
            </Button>
          </div>
        </Card>
      )}

      {/* Loading state skeleton fallback */}
      {loading && officers.length === 0 && !error && (
        <div className="p-12 text-center text-sm text-muted-foreground flex flex-col items-center justify-center gap-2 bg-card rounded-lg border">
          <RefreshCw className="h-6 w-6 animate-spin text-primary" />
          <span>Loading live GPS tracking roster from server...</span>
        </div>
      )}

      {/* Main Content Layout */}
      {!loading && officers.length === 0 && !error && (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          No active Field Officers found in the system.
        </Card>
      )}

      {officers.length > 0 && (
        <>
          {/* Desktop Layout: 3 Columns side-by-side (List, Map, Details) */}
          <div className="hidden lg:grid grid-cols-12 gap-5 h-[520px]">
            {/* Left: Officer Directory List (col-span-3) */}
            <Card className="col-span-3 border-border shadow-sm flex flex-col h-full overflow-hidden">
              <CardHeader className="pb-3 border-b py-3">
                <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
                  <Users className="h-3.5 w-3.5 text-primary" />
                  Active Officers ({filtered.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0 flex-1 overflow-y-auto min-h-0">
                <div className="divide-y divide-border">
                  {filtered.map((o, idx) => {
                    const tc = trackColors[o.trackStatus] || trackColors.offline;
                    const isSelected = o.id === selectedId;
                    const bc = OFFICER_COLORS[idx % OFFICER_COLORS.length];
                    const initials = o.name ? o.name.split(" ").map(n => n[0]).join("").slice(0, 2) : "OP";
                    return (
                      <button
                        key={o.id}
                        onClick={() => handleSelectOfficer(o)}
                        className={`flex items-center gap-2.5 w-full px-3 py-2.5 text-left transition-all hover:bg-muted/30 ${isSelected ? "bg-primary/10 border-l-4 border-l-primary font-medium" : ""}`}
                      >
                        <div
                          className="relative h-7.5 w-7.5 shrink-0 rounded-full flex items-center justify-center text-[10px] font-bold text-white shadow-inner"
                          style={{ backgroundColor: bc }}
                        >
                          {initials}
                          <span className="absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full border border-card" style={{ backgroundColor: tc.dot }} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-semibold text-foreground truncate">{o.name}</div>
                          <div className="text-[10px] text-muted-foreground mt-0.5 truncate">{o.empCode} · {o.designation}</div>
                        </div>
                        <div className="flex flex-col items-end gap-1 shrink-0">
                          <Badge className={`text-[8px] px-1 py-0 font-medium border-0 ${tc.badge}`}>
                            {o.trackStatus === "delayed" ? "Connectivity Issue" : o.trackStatus}
                          </Badge>
                          {o.trackStatus !== "offline" && (
                            o.visitStatus === "Visiting" ? (
                              <Badge className="text-[7.5px] px-1 py-0 font-bold border-0 bg-blue-500/10 text-blue-600 dark:text-blue-400 capitalize">
                                On Site
                              </Badge>
                            ) : (
                              <Badge className="text-[7.5px] px-1 py-0 font-bold border-0 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 capitalize">
                                On Road
                              </Badge>
                            )
                          )}
                        </div>
                      </button>
                    );
                  })}
                  {filtered.length === 0 && (
                    <div className="p-6 text-center text-xs text-muted-foreground">
                      No matching officers.
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Center: Live Map Card (col-span-6) */}
            <Card className="col-span-6 border-border shadow-sm flex flex-col h-full overflow-hidden">
              <CardHeader className="pb-2 border-b py-2 px-3.5 flex flex-row items-center justify-between gap-2">
                <CardTitle className="text-sm font-semibold flex items-center gap-1.5 shrink-0">
                  <MapPin className="h-3.5 w-3.5 text-primary" />
                  <span>Live Map</span>
                  <span className="text-xs font-normal text-muted-foreground">({officersWithLocation.length} active)</span>
                </CardTitle>
                <div className="flex items-center gap-2 text-[10px] text-muted-foreground select-none">
                  <div className="flex items-center gap-1 whitespace-nowrap">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 shrink-0" />
                    <span>Online</span>
                  </div>
                  <div className="flex items-center gap-1 whitespace-nowrap">
                    <span className="h-1.5 w-1.5 rounded-full bg-amber-500 shrink-0" />
                    <span>Connectivity Issue</span>
                  </div>
                  <div className="flex items-center gap-1 whitespace-nowrap">
                    <span className="h-1.5 w-1.5 rounded-full bg-rose-500 shrink-0" />
                    <span>Offline</span>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0 flex-1 relative min-h-0">
                {(() => {
                  const selectedOfficerObj = officers.find(o => o.id === selectedId);
                  let panCenter: [number, number] | null = null;
                  if (
                    selectedOfficerObj &&
                    selectedOfficerObj.trackStatus !== "offline" &&
                    selectedOfficerObj.status === "on_duty" &&
                    typeof selectedOfficerObj.lat === "number" &&
                    typeof selectedOfficerObj.lng === "number" &&
                    Number.isFinite(selectedOfficerObj.lat) &&
                    Number.isFinite(selectedOfficerObj.lng) &&
                    selectedOfficerObj.lat !== 0 &&
                    selectedOfficerObj.lng !== 0
                  ) {
                    panCenter = [selectedOfficerObj.lat, selectedOfficerObj.lng];
                  }

                  const defaultCenter: [number, number] = panCenter || (
                    officersWithLocation.length > 0 && officersWithLocation[0].lat && officersWithLocation[0].lng
                      ? [officersWithLocation[0].lat, officersWithLocation[0].lng]
                      : [18.5204, 73.8567]
                  );

                  return (
                    <MapContainer
                      center={defaultCenter}
                      zoom={13}
                      className="h-full w-full outline-none z-0"
                      zoomControl={true}
                      attributionControl={false}
                    >
                      <TileLayer
                        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                      />
                      <MapPanController center={panCenter} panTrigger={panTrigger} />

                      {/* Officer markers for officers with valid coordinates ONLY */}
                      {officersWithLocation.map((o, idx) => {
                        const bodyColor = OFFICER_COLORS[idx % OFFICER_COLORS.length];
                        const statusColor = trackColors[o.trackStatus]?.dot ?? "#94a3b8";
                        const isSelected = o.id === selectedId;
                        const markerIcon = createLeafletIcon(bodyColor, statusColor, isSelected);

                        return (
                          <Marker
                            key={o.id}
                            position={[o.lat!, o.lng!]}
                            icon={markerIcon}
                            zIndexOffset={isSelected ? 1000 : 100}
                            ref={(el) => {
                              if (el) {
                                markerRefs.current[o.id] = el;
                              }
                            }}
                            eventHandlers={{
                              click: () => {
                                handleSelectOfficer(o);
                              }
                            }}
                          >
                            <Popup>
                              <div className="text-xs p-1 min-w-[180px]">
                                <div className="font-bold text-foreground text-sm flex items-center justify-between">
                                  <span>{o.name}</span>
                                  <Badge className={`text-[8px] px-1 py-0 border-0 ${trackColors[o.trackStatus]?.badge ?? ""}`}>
                                    {o.trackStatus}
                                  </Badge>
                                </div>
                                <div className="text-muted-foreground text-[10px] mt-0.5">{o.empCode} · {o.designation}</div>
                                <div className="mt-1.5 pt-1.5 border-t space-y-1">
                                  <div className="text-xs font-semibold text-primary">
                                    📍 {o.trackStatus !== "offline" ? (o.site || "On Transit Road") : "Offline"}
                                  </div>
                                  <div className="text-[10px] text-muted-foreground flex justify-between">
                                    <span>Activity: <strong className="text-foreground">{o.visitStatus === "Visiting" ? "On Site" : "On Road"}</strong></span>
                                    <span>Speed: <strong className="text-foreground font-mono">{o.speed ?? 0} km/h</strong></span>
                                  </div>
                                  {o.battery != null && (
                                    <div className="text-[10px] text-muted-foreground flex justify-between">
                                      <span>Battery: <strong className="text-foreground font-mono">{Math.round(o.battery)}%</strong></span>
                                      <span>GPS Acc: <strong className="text-foreground font-mono">{o.gpsAccuracy ?? "N/A"}m</strong></span>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </Popup>
                          </Marker>
                        );
                      })}
                    </MapContainer>
                  );
                })()}
              </CardContent>
            </Card>

            {/* Right: Selected Officer Details Card (col-span-3) */}
            <Card className="col-span-3 border-border shadow-sm flex flex-col h-full overflow-hidden">
              {selected ? (
                <>
                  <CardHeader className="pb-3 border-b py-3 flex flex-row items-center justify-between">
                    <CardTitle className="text-sm font-semibold">Profile Details</CardTitle>
                    <Badge className={`text-[9px] font-bold border-0 ${trackColors[selected.trackStatus]?.badge ?? "bg-slate-100 text-slate-600"}`}>
                      {selected.trackStatus === "delayed" ? "Connectivity Issue" : selected.trackStatus}
                    </Badge>
                  </CardHeader>
                  <CardContent className="p-4 space-y-4 flex-1 overflow-y-auto min-h-0">
                    {/* Avatar & name */}
                    <div className="flex items-center gap-2.5">
                      <div 
                        className="relative h-10 w-10 rounded-xl flex items-center justify-center text-xs font-bold text-white shadow shrink-0"
                        style={{ backgroundColor: OFFICER_COLORS[officers.indexOf(selected) % OFFICER_COLORS.length] }}
                      >
                        {selected.name ? selected.name.split(" ").map(n => n[0]).join("").slice(0, 2) : "OP"}
                        <span
                          className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border border-card"
                          style={{ backgroundColor: trackColors[selected.trackStatus]?.dot ?? "#94a3b8" }}
                        />
                      </div>
                      <div className="min-w-0">
                        <div className="font-bold text-xs leading-tight text-foreground truncate">{selected.name}</div>
                        <div className="text-[10px] text-muted-foreground truncate">{selected.empCode} · {selected.designation}</div>
                        <div className="text-[10px] text-muted-foreground truncate">{selected.phone || "No phone registered"}</div>
                      </div>
                    </div>

                    {/* Status & Coordinates availability notice */}
                    {selected.trackStatus === "offline" ? (
                      <div className="rounded-md bg-slate-500/10 border border-slate-500/20 p-2.5 text-[11px] text-muted-foreground flex items-center gap-2">
                        <WifiOff className="h-4 w-4 shrink-0 text-red-500/80" />
                        <span className="font-medium text-foreground">Officer is currently Offline (Punched out / Off duty).</span>
                      </div>
                    ) : (selected.lat === null || selected.lng === null || isNaN(selected.lat) || isNaN(selected.lng)) ? (
                      <div className="rounded-md bg-amber-500/10 border border-amber-500/20 p-2 text-[10px] text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
                        <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-500" />
                        <span>No live GPS fix available for this officer</span>
                      </div>
                    ) : null}

                    {/* Metrics grid compact */}
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        { label: "Current Site",  value: selected.visitStatus === "Travelling" ? "—" : (selected.site || "—"), icon: MapPin, fullWidth: true },
                        { label: "Speed",         value: selected.speed !== null && selected.speed !== undefined ? `${selected.speed} km/h` : "0 km/h", icon: Navigation },
                        { label: "Hours Worked",  value: formatWorkHoursDisplay(selected.workHours), icon: Clock },
                        { label: "GPS Accuracy",  value: selected.gpsAccuracy !== null && selected.gpsAccuracy !== undefined ? `${selected.gpsAccuracy}m` : "N/A", icon: Signal },
                        { label: "Last Updated",  value: selected.lastUpdate || "Offline", icon: Wifi },
                      ].map(m => (
                        <div key={m.label} className={`rounded-lg border border-border/80 bg-muted/20 p-2 ${m.fullWidth ? "col-span-2" : ""}`}>
                          <span className="block text-[8px] font-extrabold uppercase text-muted-foreground/60 tracking-wide truncate">{m.label}</span>
                          <span className={`block text-[11px] font-bold text-foreground mt-0.5 ${m.fullWidth ? "" : "truncate"}`} title={m.value}>{m.value}</span>
                        </div>
                      ))}
                    </div>

                    {/* Battery */}
                    <div className="rounded-lg border border-border/80 bg-muted/20 p-2.5">
                      <BatteryBar level={selected.battery} />
                    </div>

                    {/* Visits */}
                    <div className="rounded-lg border border-border/80 bg-muted/20 p-2">
                      <span className="block text-[8px] font-extrabold uppercase text-muted-foreground/60 tracking-wide mb-1.5">Today's Visits</span>
                      <div className="grid grid-cols-3 gap-1 text-center">
                        <div>
                          <div className="text-xs font-bold text-emerald-600 dark:text-emerald-400">{selected.visits?.completed ?? 0}</div>
                          <div className="text-[8px] text-muted-foreground uppercase font-semibold">Done</div>
                        </div>
                        <div>
                          <div className="text-xs font-bold text-amber-600 dark:text-amber-400">{selected.visits?.pending ?? 0}</div>
                          <div className="text-[8px] text-muted-foreground uppercase font-semibold">Pending</div>
                        </div>
                        <div>
                          <div className="text-xs font-bold text-red-600 dark:text-red-400">{selected.visits?.missed ?? 0}</div>
                          <div className="text-[8px] text-muted-foreground uppercase font-semibold">Missed</div>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </>
              ) : (
                <div className="p-8 text-center text-xs text-muted-foreground flex flex-col items-center justify-center h-full gap-3">
                  <div className="h-10 w-10 rounded-full bg-muted/60 flex items-center justify-center">
                    <MapPin className="h-5 w-5 text-muted-foreground/50" />
                  </div>
                  <div>
                    <p className="font-semibold text-foreground text-sm">No Officer Selected</p>
                    <p className="text-[11px] text-muted-foreground mt-1">Select an officer from the left list to view profile and live tracking details.</p>
                  </div>
                </div>
              )}
            </Card>
          </div>

          {/* Mobile/Tablet Layout (collapsable stacked with Tabs) */}
          <div className="block lg:hidden space-y-4">
            {/* Map Card */}
            <Card className="border-border shadow-sm">
              <CardHeader className="pb-2 border-b py-2 flex flex-row items-center justify-between">
                <CardTitle className="text-xs font-semibold flex items-center gap-1">
                  <MapPin className="h-3.5 w-3.5 text-primary" />
                  Live Map ({officersWithLocation.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="p-2">
                {(() => {
                  const selectedOfficerObj = officers.find(o => o.id === selectedId);
                  let panCenter: [number, number] | null = null;
                  if (
                    selectedOfficerObj &&
                    selectedOfficerObj.trackStatus !== "offline" &&
                    selectedOfficerObj.status === "on_duty" &&
                    typeof selectedOfficerObj.lat === "number" &&
                    typeof selectedOfficerObj.lng === "number" &&
                    Number.isFinite(selectedOfficerObj.lat) &&
                    Number.isFinite(selectedOfficerObj.lng) &&
                    selectedOfficerObj.lat !== 0 &&
                    selectedOfficerObj.lng !== 0
                  ) {
                    panCenter = [selectedOfficerObj.lat, selectedOfficerObj.lng];
                  }

                  const defaultCenter: [number, number] = panCenter || (
                    officersWithLocation.length > 0 && officersWithLocation[0].lat && officersWithLocation[0].lng
                      ? [officersWithLocation[0].lat, officersWithLocation[0].lng]
                      : [18.5204, 73.8567]
                  );

                  return (
                    <div className="w-full rounded-lg overflow-hidden" style={{ height: 280 }}>
                      <MapContainer
                        center={defaultCenter}
                        zoom={13}
                        className="h-full w-full outline-none z-0"
                        zoomControl={true}
                        attributionControl={false}
                      >
                        <TileLayer
                          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                        />
                        <MapPanController center={panCenter} panTrigger={panTrigger} />

                        {/* Officer markers for officers with valid coordinates ONLY */}
                        {officersWithLocation.map((o, idx) => {
                          const bodyColor = OFFICER_COLORS[idx % OFFICER_COLORS.length];
                          const statusColor = trackColors[o.trackStatus]?.dot ?? "#94a3b8";
                          const isSelected = o.id === selectedId;
                          const markerIcon = createLeafletIcon(bodyColor, statusColor, isSelected);

                          return (
                            <Marker
                              key={o.id}
                              position={[o.lat!, o.lng!]}
                              icon={markerIcon}
                              zIndexOffset={isSelected ? 1000 : 100}
                              ref={(el) => {
                                if (el) {
                                  markerRefs.current[o.id] = el;
                                }
                              }}
                              eventHandlers={{
                                click: () => {
                                  handleSelectOfficer(o);
                                }
                              }}
                            >
                              <Popup>
                                <div className="text-xs p-1">
                                  <div className="font-bold text-foreground">{o.name}</div>
                                  <div className="mt-1 font-semibold text-primary">{o.site || "No active site"}</div>
                                </div>
                              </Popup>
                            </Marker>
                          );
                        })}
                      </MapContainer>
                    </div>
                  );
                })()}
              </CardContent>
            </Card>

            {/* Tab Selection */}
            <div className="flex gap-2 bg-muted p-1 rounded-lg">
              <button
                onClick={() => setActiveTab("list")}
                className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-all text-center
                  ${activeTab === "list" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"}`}
              >
                Officers List ({filtered.length})
              </button>
              <button
                onClick={() => setActiveTab("details")}
                className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-all text-center
                  ${activeTab === "details" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"}`}
              >
                Officer Profile Details
              </button>
            </div>

            {/* Tab Content */}
            {activeTab === "list" ? (
              <Card className="border-border shadow-sm">
                <CardContent className="p-0 max-h-[300px] overflow-y-auto">
                  <div className="divide-y divide-border">
                    {filtered.map((o, idx) => {
                      const tc = trackColors[o.trackStatus] || trackColors.offline;
                      const isSelected = o.id === selectedId;
                      const bc = OFFICER_COLORS[idx % OFFICER_COLORS.length];
                      const initials = o.name ? o.name.split(" ").map(n => n[0]).join("").slice(0, 2) : "OP";
                      return (
                        <button
                          key={o.id}
                          onClick={() => handleSelectOfficer(o)}
                          className={`flex items-center gap-3 w-full p-3.5 text-left transition-all ${isSelected ? "bg-primary/10 border-l-4 border-l-primary" : ""}`}
                        >
                          <div
                            className="relative h-8 w-8 shrink-0 rounded-full flex items-center justify-center text-xs font-bold text-white shadow-inner"
                            style={{ backgroundColor: bc }}
                          >
                            {initials}
                            <span className="absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full border border-card" style={{ backgroundColor: tc.dot }} />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="text-xs font-semibold text-foreground truncate">{o.name}</div>
                            <div className="text-[10px] text-muted-foreground truncate">{o.empCode}</div>
                          </div>
                          <div className="flex flex-col items-end gap-1 shrink-0">
                            <Badge className={`text-[8px] px-1 py-0 font-medium border-0 ${tc.badge}`}>
                              {o.trackStatus === "delayed" ? "Connectivity Issue" : o.trackStatus}
                            </Badge>
                            {o.trackStatus !== "offline" && (
                              o.visitStatus === "Visiting" ? (
                                <Badge className="text-[7.5px] px-1 py-0 font-bold border-0 bg-blue-500/10 text-blue-600 dark:text-blue-400 capitalize">
                                  On Site
                                </Badge>
                              ) : (
                                <Badge className="text-[7.5px] px-1 py-0 font-bold border-0 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 capitalize">
                                  On Road
                                </Badge>
                              )
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Card className="border-border shadow-sm">
                {selected ? (
                  <CardContent className="p-4 space-y-4">
                    <div className="flex items-center gap-3">
                      <div 
                        className="relative h-10 w-10 rounded-xl flex items-center justify-center text-xs font-bold text-white shadow shrink-0"
                        style={{ backgroundColor: OFFICER_COLORS[officers.indexOf(selected) % OFFICER_COLORS.length] }}
                      >
                        {selected.name ? selected.name.split(" ").map(n => n[0]).join("").slice(0, 2) : "OP"}
                        <span
                          className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border border-card"
                          style={{ backgroundColor: trackColors[selected.trackStatus]?.dot ?? "#94a3b8" }}
                        />
                      </div>
                      <div>
                        <div className="font-bold text-xs text-foreground leading-tight">{selected.name}</div>
                        <div className="text-[10px] text-muted-foreground mt-0.5">{selected.empCode} · {selected.designation}</div>
                      </div>
                    </div>

                    {/* Status & Coordinates availability notice */}
                    {selected.trackStatus === "offline" ? (
                      <div className="rounded-md bg-slate-500/10 border border-slate-500/20 p-2.5 text-[11px] text-muted-foreground flex items-center gap-2">
                        <WifiOff className="h-4 w-4 shrink-0 text-red-500/80" />
                        <span className="font-medium text-foreground">Officer is currently Offline (Punched out / Off duty).</span>
                      </div>
                    ) : (selected.lat === null || selected.lng === null || isNaN(selected.lat) || isNaN(selected.lng)) ? (
                      <div className="rounded-md bg-amber-500/10 border border-amber-500/20 p-2 text-[10px] text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
                        <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-500" />
                        <span>No live GPS fix available for this officer</span>
                      </div>
                    ) : null}

                    {/* Metrics grid */}
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        { label: "Current Site",  value: selected.visitStatus === "Travelling" ? "—" : (selected.site || "—"), icon: MapPin, fullWidth: true },
                        { label: "Speed",         value: selected.speed !== null && selected.speed !== undefined ? `${selected.speed} km/h` : "0 km/h", icon: Navigation },
                        { label: "Hours Worked",  value: formatWorkHoursDisplay(selected.workHours), icon: Clock },
                        { label: "GPS Accuracy",  value: selected.gpsAccuracy !== null && selected.gpsAccuracy !== undefined ? `${selected.gpsAccuracy}m` : "N/A", icon: Signal },
                        { label: "Last Updated",  value: selected.lastUpdate || "Offline", icon: Wifi },
                      ].map(m => (
                        <div key={m.label} className={`rounded-lg border border-border/80 bg-muted/20 p-2 ${m.fullWidth ? "col-span-2" : ""}`}>
                          <span className="block text-[8px] font-extrabold uppercase text-muted-foreground/60 tracking-wide truncate">{m.label}</span>
                          <span className={`block text-[11px] font-bold text-foreground mt-0.5 ${m.fullWidth ? "" : "truncate"}`}>{m.value}</span>
                        </div>
                      ))}
                    </div>

                    {/* Battery */}
                    <div className="rounded-lg border border-border/80 bg-muted/20 p-2.5">
                      <BatteryBar level={selected.battery} />
                    </div>
                  </CardContent>
                ) : (
                  <CardContent className="p-6 text-center text-xs text-muted-foreground">
                    Select an officer from the list to view profile details.
                  </CardContent>
                )}
              </Card>
            )}
          </div>
        </>
      )}
    </div>
  );
}
