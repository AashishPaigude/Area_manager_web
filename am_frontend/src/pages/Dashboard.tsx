import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  Users, CheckCircle2, Search, UserCheck, UserX, Calendar, ChevronRight, ChevronDown, RefreshCw, AlertCircle, Loader2
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  getDashboardData,
  DashboardResponse,
  DashboardOfficer,
  DashboardVisit
} from "../services/dashboardService";

export default function Dashboard() {
  const [dashboardData, setDashboardData] = useState<DashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [selectedOfficer, setSelectedOfficer] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [siteFilter, setSiteFilter] = useState("all");
  const [kpiPeriod, setKpiPeriod] = useState<"weekly" | "monthly">("weekly");

  // Fetch dashboard data from backend API
  const loadData = useCallback(async (isInitial = false, forceRefresh = false) => {
    if (isInitial) {
      setLoading(true);
      setError(null);
    } else {
      setIsRefreshing(true);
    }

    try {
      const data = await getDashboardData(undefined, forceRefresh);
      setDashboardData(data);
      setError(null);
    } catch (err: any) {
      console.error("Dashboard fetch error:", err);
      if (isInitial) {
        setError(err.message || "Failed to load dashboard data");
      }
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  const handlePeriodChange = (newPeriod: "weekly" | "monthly") => {
    setKpiPeriod(newPeriod);
  };

  // Initial load + 30-minute automatic polling
  useEffect(() => {
    loadData(true, false);

    // 30 minutes polling interval (30 * 60 * 1000 ms = 1,800,000 ms)
    const POLLING_INTERVAL = 30 * 60 * 1000;
    const intervalId = setInterval(() => {
      loadData(false, false);
    }, POLLING_INTERVAL);

    return () => {
      clearInterval(intervalId);
    };
  }, [loadData]);

  const summary = dashboardData?.summary || {
    present: 0,
    absent: 0,
    plannedVisits: 0,
    completedVisitsToday: 0
  };

  const officers = dashboardData?.officers || [];

  // Dynamically extract unique site names from real officer visit data
  const availableSites = useMemo(() => {
    const siteNames = new Set<string>();
    officers.forEach((o) => {
      o.visits?.forEach((v) => {
        if (v.site_name && v.site_name.trim()) {
          siteNames.add(v.site_name.trim());
        }
      });
    });
    return Array.from(siteNames).sort();
  }, [officers]);

  const formatToDDMMYYYY = (val?: string | null) => {
    if (!val || val === "—") return "—";
    if (val.includes("/")) return val;
    if (val.includes("-")) {
      const parts = val.split("-");
      if (parts.length === 3 && parts[0].length === 4) {
        return `${parts[2]}/${parts[1]}/${parts[0]}`;
      }
    }
    return val;
  };


  const filteredOfficers = officers.filter((o) => {
    const matchesQuery = searchQuery === "" ||
      o.officer.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (o.emp_code && o.emp_code.toLowerCase().includes(searchQuery.toLowerCase()));
    
    const matchesSite = siteFilter === "all" ||
      o.visits.some(v => v.site_name === siteFilter);
      
    return matchesQuery && matchesSite;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">Real-time overview of field officer activity and visit progress</p>
      </div>

      {/* KPI Cards Section */}
      <div className="space-y-2.5">
        <div className="flex items-center justify-end gap-3 px-0.5">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">Visits Target:</span>
          <div className="inline-flex items-center rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 p-1 text-xs font-medium shadow-sm">
            <button
              onClick={() => handlePeriodChange("weekly")}
              className={`px-3 py-1 rounded-md transition-all ${
                kpiPeriod === "weekly"
                  ? "bg-blue-600 text-white font-bold shadow-sm"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800"
              }`}
            >
              Weekly
            </button>
            <button
              onClick={() => handlePeriodChange("monthly")}
              className={`px-3 py-1 rounded-md transition-all ${
                kpiPeriod === "monthly"
                  ? "bg-blue-600 text-white font-bold shadow-sm"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800"
              }`}
            >
              Monthly
            </button>
          </div>
        </div>

        {/* KPI Cards — Single line grid */}
        <div className="grid gap-3 grid-cols-2 xl:grid-cols-4">

        {/* Card 1: Present */}
        <Card className="kpi-card kpi-card-green border-border">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/80">Present</p>
                <p className="text-2xl font-extrabold font-mono-data mt-1 text-emerald-600 dark:text-emerald-400">
                  {loading ? "—" : summary.present}
                </p>
                <p className="text-[10px] text-muted-foreground/80 font-medium mt-1">On duty today</p>
              </div>
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-500 shrink-0 self-start mt-0.5">
                <UserCheck className="h-4.5 w-4.5" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Card 2: Absent */}
        <Card className="kpi-card kpi-card-red border-border">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/80">Absent</p>
                <p className="text-2xl font-extrabold font-mono-data mt-1 text-red-600 dark:text-red-400">
                  {loading ? "—" : summary.absent}
                </p>
                <p className="text-[10px] text-muted-foreground/80 font-medium mt-1">Not reported today</p>
              </div>
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-500/10 text-red-500 shrink-0 self-start mt-0.5">
                <UserX className="h-4.5 w-4.5" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Card 3: Planned Visits */}
        <Card className="kpi-card kpi-card-blue border-border">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/80">Planned Visits</p>
                <p className="text-2xl font-extrabold font-mono-data mt-1 text-blue-600 dark:text-blue-400">
                  {loading
                    ? "—"
                    : (kpiPeriod === "weekly"
                        ? (summary.plannedVisitsWeekly ?? summary.plannedVisits)
                        : (summary.plannedVisitsMonthly ?? summary.plannedVisits))}
                </p>
                <p className="text-[10px] text-muted-foreground/80 font-medium mt-1">
                  Scheduled for {kpiPeriod === "weekly" ? "present week" : "current month"}
                </p>
              </div>
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500/10 text-blue-500 shrink-0 self-start mt-0.5">
                <Calendar className="h-4.5 w-4.5" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Card 4: Completed Visits */}
        <Card className="kpi-card kpi-card-purple border-border">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/80">Completed Visits</p>
                <p className="text-2xl font-extrabold font-mono-data mt-1 text-purple-600 dark:text-purple-400">
                  {loading
                    ? "—"
                    : (kpiPeriod === "weekly"
                        ? (summary.completedVisitsWeekly ?? summary.completedVisitsToday)
                        : (summary.completedVisitsMonthly ?? summary.completedVisitsToday))}
                </p>
                <p className="text-[10px] text-muted-foreground/80 font-medium mt-1">
                  Completed {kpiPeriod === "weekly" ? "present week" : "current month"}
                </p>
              </div>
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-500/10 text-purple-500 shrink-0 self-start mt-0.5">
                <CheckCircle2 className="h-4.5 w-4.5" />
              </div>
            </div>
          </CardContent>
        </Card>

        </div>
      </div>


      {/* ── Officer Summary Table (full-width, vertical scroll) ── */}
      <Card className="border-border shadow-sm">
        <CardHeader className="pb-3 border-b flex flex-row items-center justify-between">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Users className="h-4 w-4 text-primary" />
            Today's Officer Summary
          </CardTitle>
          <div className="flex items-center gap-2">
            {isRefreshing && (
              <span className="flex items-center gap-1 text-xs text-muted-foreground animate-pulse">
                <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" /> Updating...
              </span>
            )}
            <button
              onClick={() => loadData(false, true)}
              disabled={loading || isRefreshing}
              className="btn-white-fill p-1.5 sm:px-2.5 sm:py-1 rounded-lg transition-colors flex items-center gap-1.5 text-xs font-medium"
              title="Refresh dashboard data (checks database immediately)"
            >
              <RefreshCw className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
              <span className="hidden sm:inline">Refresh</span>
            </button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {/* Filters Toolbar Row */}
          <div className="px-4 py-3 border-b border-border flex flex-wrap items-center gap-3 bg-muted/5">
            {/* Search Bar */}
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-muted-foreground/60" />
              <Input
                placeholder="Search by officer name or code..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 h-7 text-xs bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 shadow-sm"
              />
            </div>

            {/* Site Filter dropdown */}
            <select
              value={siteFilter}
              onChange={(e) => setSiteFilter(e.target.value)}
              className="bg-card border border-input text-foreground text-xs h-9 px-3 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary shadow-sm min-w-[180px] max-w-[240px]"
            >
              <option value="all">All Secure Sites</option>
              {availableSites.map((siteName) => (
                <option key={siteName} value={siteName}>
                  {siteName}
                </option>
              ))}
            </select>
          </div>

          {/* Loading State */}
          {loading && (
            <div className="p-12 text-center flex flex-col items-center justify-center text-muted-foreground space-y-3">
              <Loader2 className="h-7 w-7 animate-spin text-primary" />
              <p className="text-sm font-medium">Loading real-time officer data...</p>
            </div>
          )}

          {/* Error State */}
          {!loading && error && (
            <div className="p-8 text-center flex flex-col items-center justify-center space-y-3">
              <AlertCircle className="h-8 w-8 text-red-500" />
              <div className="text-sm font-semibold text-foreground">Failed to Load Dashboard Data</div>
              <div className="text-xs text-muted-foreground max-w-md">{error}</div>
              <button
                onClick={() => loadData(true)}
                className="mt-2 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-colors"
              >
                Retry Connection
              </button>
            </div>
          )}

          {/* Desktop Table View — hidden on mobile */}
          {!loading && !error && (
            <div className="hidden md:block overflow-y-auto" style={{ maxHeight: 420 }}>
              <table className="w-full text-sm table-fixed">
                <thead className="sticky top-0 z-10 bg-muted/90 backdrop-blur-sm">
                  <tr className="border-b text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                    <th className="px-4 py-3 text-left w-[30%]">Officer</th>
                    <th className="px-4 py-3 text-center w-[16%] whitespace-nowrap">Date</th>
                    <th className="px-4 py-3 text-center w-[14%] whitespace-nowrap">Visit Done</th>
                    <th className="px-4 py-3 text-center w-[16%] whitespace-nowrap">Hrs Worked</th>
                    <th className="px-4 py-3 text-center w-[18%] whitespace-nowrap">GPS Status</th>
                    <th className="px-4 py-3 text-center w-[6%]"></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredOfficers.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="p-12 text-center text-muted-foreground text-sm">
                        No field officers have submitted visit reports for today yet. Records will appear here automatically as visits are completed.
                      </td>
                    </tr>
                  ) : (
                    filteredOfficers.map((o) => {
                    const attDateRaw = o.visits.length > 0 && o.visits[0].visit_date ? o.visits[0].visit_date : (dashboardData?.target_date || "—");
                    const attDate = formatToDDMMYYYY(attDateRaw);
                    const gpsStatus = o.gps_status || "—";
                    const isSelected = selectedOfficer === o.employee_oid;

                    return (
                      <React.Fragment key={o.employee_oid}>
                        <tr
                          onClick={() => setSelectedOfficer(isSelected ? null : o.employee_oid)}
                          className={`border-b last:border-0 cursor-pointer transition-colors hover:bg-muted/30 ${isSelected ? "bg-primary/5 font-medium" : ""}`}
                        >
                          {/* Officer name + ID */}
                          <td className="px-4 py-3 text-left">
                            <div className="font-semibold text-sm text-foreground leading-tight truncate">{o.officer}</div>
                            <div className="text-[11px] text-muted-foreground mt-0.5">{o.emp_code || `EMP${o.employee_oid}`}</div>
                          </td>

                          {/* Date */}
                          <td className="px-4 py-3 text-center font-mono-data text-xs text-muted-foreground">
                            {attDate}
                          </td>

                          {/* Visit Done count */}
                          <td className="px-4 py-3 text-center">
                            <span className="text-xs font-mono-data font-semibold text-muted-foreground">
                              {o.visits_done}
                            </span>
                          </td>

                          {/* Hours */}
                          <td className="px-4 py-3 text-center font-mono-data text-xs font-medium">{o.hours_worked || "—"}</td>

                          {/* Tracking badge */}
                          <td className="px-4 py-3 text-center">
                            <Badge className={`text-[10px] font-semibold border-0 capitalize
                              ${gpsStatus === "online"  ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" :
                                gpsStatus === "delayed" ? "bg-amber-500/15 text-amber-600 dark:text-amber-400" :
                                gpsStatus === "offline" ? "bg-red-500/15 text-red-600 dark:text-red-400" :
                                                          "bg-slate-400/15 text-slate-500"}`}
                            >
                              {gpsStatus === "delayed" ? "Connectivity Issue" : gpsStatus}
                            </Badge>
                          </td>

                          {/* Collapsible Indicator Chevron */}
                          <td className="px-4 py-3 text-center">
                            {isSelected ? (
                              <ChevronDown className="h-4 w-4 text-muted-foreground inline" />
                            ) : (
                              <ChevronRight className="h-4 w-4 text-muted-foreground/60 inline" />
                            )}
                          </td>
                        </tr>

                        {/* Expandable Sub-Table for Submitted Visits */}
                        {isSelected && (
                          <tr className="bg-muted/10 border-b">
                            <td colSpan={6} className="px-4 py-3">
                              <div className="mx-1 border border-border/70 rounded-lg bg-card shadow-2xs overflow-hidden">
                                <table className="w-full text-xs text-left">
                                  <thead>
                                    <tr className="bg-muted/30 border-b text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                                      <th className="px-3 py-2 text-center w-[8%] whitespace-nowrap">Seq</th>
                                      <th className="px-4 py-2 text-left w-[32%] whitespace-nowrap">Site Visited</th>
                                      <th className="px-4 py-2 text-left w-[20%] whitespace-nowrap">Visit Type</th>
                                      <th className="px-4 py-2 text-center w-[13%] whitespace-nowrap">Check In</th>
                                      <th className="px-4 py-2 text-center w-[13%] whitespace-nowrap">Check Out</th>
                                      <th className="px-4 py-2 text-center w-[14%] whitespace-nowrap">Duration</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {o.visits.map((visit) => {
                                      return (
                                        <tr 
                                          key={visit.sequence} 
                                          className="border-b last:border-0 hover:bg-muted/10 transition-colors"
                                        >
                                          <td className="px-3 py-2 text-center font-bold text-muted-foreground">{visit.sequence}</td>
                                          <td className="px-4 py-2 font-semibold text-foreground truncate max-w-[240px]" title={visit.site_name}>{visit.site_name}</td>
                                          <td className="px-4 py-2 text-muted-foreground truncate max-w-[160px]">{visit.visit_type}</td>
                                          <td className="px-4 py-2 text-center font-mono-data">{visit.check_in || "—"}</td>
                                          <td className="px-4 py-2 text-center font-mono-data">{visit.check_out || "—"}</td>
                                          <td className="px-4 py-2 text-center font-mono-data font-medium">{visit.duration || "—"}</td>
                                        </tr>
                                      );
                                    })}
                                    {o.visits.length === 0 && (
                                      <tr>
                                        <td colSpan={6} className="px-4 py-5 text-center text-muted-foreground italic">
                                          No visits recorded for this officer.
                                        </td>
                                      </tr>
                                    )}
                                  </tbody>
                                </table>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  }))}
                </tbody>
              </table>
            </div>
          )}

          {/* Mobile Card List View — visible only on mobile/tablet */}
          {!loading && !error && (
            <div className="block md:hidden divide-y divide-border overflow-y-auto" style={{ maxHeight: 450 }}>
              {filteredOfficers.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground text-sm">
                  No field officers have submitted visit reports for today yet. Records will appear here automatically as visits are completed.
                </div>
              ) : (
                filteredOfficers.map((o) => {
                const isSelected = selectedOfficer === o.employee_oid;
                const gpsStatus = o.gps_status || "—";

                return (
                  <div key={o.employee_oid} className="flex flex-col">
                    {/* Card Row */}
                    <div
                      onClick={() => setSelectedOfficer(isSelected ? null : o.employee_oid)}
                      className={`p-4 space-y-3 cursor-pointer transition-colors hover:bg-muted/20 ${isSelected ? "bg-primary/5 font-medium" : ""}`}
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="font-semibold text-sm text-foreground">{o.officer}</div>
                          <div className="text-[10px] text-muted-foreground mt-0.5">{o.emp_code || `EMP${o.employee_oid}`}</div>
                        </div>
                        <div className="flex flex-col items-end gap-1.5 shrink-0">
                          <Badge className={`text-[9px] font-bold border-0 capitalize
                            ${gpsStatus === "online"  ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" :
                              gpsStatus === "delayed" ? "bg-amber-500/15 text-amber-600 dark:text-amber-400" :
                              gpsStatus === "offline" ? "bg-red-500/15 text-red-600 dark:text-red-400" :
                                                        "bg-slate-400/15 text-slate-500"}`}
                          >
                            GPS: {gpsStatus === "delayed" ? "Connectivity Issue" : gpsStatus}
                          </Badge>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2 pt-2 border-t text-[11px] text-muted-foreground">
                        <div>
                          <span className="block text-[8px] font-bold text-muted-foreground/60 uppercase tracking-wider">Visits</span>
                          <span className="font-semibold text-foreground">{o.visits_done} Done</span>
                        </div>
                        <div className="text-right">
                          <span className="block text-[8px] font-bold text-muted-foreground/60 uppercase tracking-wider">Hrs Worked</span>
                          <span className="font-mono-data font-semibold text-foreground">{o.hours_worked || "—"}</span>
                        </div>
                      </div>
                    </div>

                    {/* Expanded Sequence View for Mobile */}
                    {isSelected && (
                      <div className="bg-muted/15 px-3 py-3 border-t border-b border-border/50">
                        <div className="space-y-2">
                          <div className="flex justify-between items-center text-[10px] font-bold uppercase tracking-wider text-muted-foreground/80 mb-2 px-1">
                            <span>Visiting Sequence</span>
                            <span>{o.visits.length} Recorded</span>
                          </div>
                          <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                            {o.visits.map((visit) => {
                              return (
                                <div key={visit.sequence} className="bg-card border rounded-lg p-2.5 space-y-2 shadow-sm text-xs">
                                  <div className="flex justify-between items-start">
                                    <div className="flex items-start gap-1.5 min-w-0">
                                      <span className="text-[9px] font-extrabold w-4.5 h-4.5 rounded-full shrink-0 flex items-center justify-center bg-emerald-500/10 text-emerald-600">
                                        {visit.sequence}
                                      </span>
                                      <div className="min-w-0">
                                        <div className="font-bold text-foreground truncate">{visit.site_name}</div>
                                        <div className="text-[10px] text-muted-foreground truncate">{visit.visit_type}</div>
                                      </div>
                                    </div>
                                  </div>
                                  <div className="grid grid-cols-3 gap-1 pt-1.5 border-t text-[10px] text-muted-foreground">
                                    <div>
                                      <span className="block text-[8px] uppercase">In</span>
                                      <span className="font-mono-data font-semibold text-foreground">{visit.check_in || "—"}</span>
                                    </div>
                                    <div>
                                      <span className="block text-[8px] uppercase">Out</span>
                                      <span className="font-mono-data font-semibold text-foreground">{visit.check_out || "—"}</span>
                                    </div>
                                    <div className="text-right">
                                      <span className="block text-[8px] uppercase">Duration</span>
                                      <span className="font-mono-data font-semibold text-foreground">{visit.duration || "—"}</span>
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                            {o.visits.length === 0 && (
                              <div className="p-4 text-center text-xs text-muted-foreground italic">
                                No visits recorded for this officer.
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              }))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
