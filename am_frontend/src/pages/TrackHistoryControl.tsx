import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  Shield,
  ChevronRight,
  ChevronLeft,
  ChevronsLeft,
  ChevronsRight,
  Search,
  CheckCircle2,
  XCircle,
  Users,
  RefreshCw,
  Loader2,
  AlertCircle,
  Info,
  Building2,
  Calendar,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  trackHistoryControlService,
  OfficerTrackHistoryItem,
} from "@/services/trackHistoryControlService";

export default function TrackHistoryControl() {
  const [officers, setOfficers] = useState<OfficerTrackHistoryItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | number | null>(null);

  // Filter States
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [branchFilter, setBranchFilter] = useState<string>("ALL");

  // Pagination State
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(10);

  // Reset to first page when search or filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, statusFilter, branchFilter]);

  // Fetch officers from backend API
  const fetchOfficers = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await trackHistoryControlService.getOfficersTrackHistory();
      setOfficers(data || []);
    } catch (err: any) {
      console.error("Failed to load track history control list:", err);
      const msg = err.response?.data?.detail || err.message || "Failed to load Field Officers.";
      setError(typeof msg === "string" ? msg : JSON.stringify(msg));
      toast.error("Failed to load Field Officers Track History settings.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchOfficers();
  }, [fetchOfficers]);

  // Helper getters for normalized properties
  const getOfficerId = (o: OfficerTrackHistoryItem): string | number => {
    return o.employee_id ?? o.employee_oid ?? o.oid ?? o.id ?? "";
  };

  const getOfficerName = (o: OfficerTrackHistoryItem): string => {
    return o.employee_name ?? o.name ?? "Unknown Officer";
  };

  const getOfficerCode = (o: OfficerTrackHistoryItem): string => {
    return o.employee_code ?? o.emp_code ?? "—";
  };

  const getOfficerBranch = (o: OfficerTrackHistoryItem): string => {
    return o.branch_name ?? o.branch ?? "—";
  };

  const isOfficerEnabled = (o: OfficerTrackHistoryItem): boolean => {
    return Number(o.track_history_enabled) === 1 || o.track_history_enabled === true;
  };

  const getEffectiveSince = (o: OfficerTrackHistoryItem): string | null => {
    return o.effective_since ?? o.updated_at ?? o.last_updated ?? null;
  };

  // Derived unique branches for filtering
  const availableBranches = useMemo(() => {
    const set = new Set<string>();
    officers.forEach((o) => {
      const b = getOfficerBranch(o);
      if (b && b !== "—") set.add(b);
    });
    return Array.from(set).sort();
  }, [officers]);

  // Derived KPI metrics
  const enabledCount = useMemo(() => {
    return officers.filter(isOfficerEnabled).length;
  }, [officers]);

  const disabledCount = useMemo(() => {
    return officers.filter((o) => !isOfficerEnabled(o)).length;
  }, [officers]);

  const totalCount = officers.length;

  // Filtered officers list
  const filteredOfficers = useMemo(() => {
    return officers.filter((o) => {
      const name = getOfficerName(o).toLowerCase();
      const code = getOfficerCode(o).toLowerCase();
      const branch = getOfficerBranch(o).toLowerCase();
      const search = searchTerm.trim().toLowerCase();

      const matchesSearch = !search || name.includes(search) || code.includes(search) || branch.includes(search);

      const enabled = isOfficerEnabled(o);
      const matchesFilter =
        statusFilter === "ALL" ||
        (statusFilter === "ENABLED" && enabled) ||
        (statusFilter === "DISABLED" && !enabled);

      const matchesBranch =
        branchFilter === "ALL" || branch === branchFilter.toLowerCase();

      return matchesSearch && matchesFilter && matchesBranch;
    });
  }, [officers, searchTerm, statusFilter, branchFilter]);

  // Computed Pagination Values
  const totalItems = filteredOfficers.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const safeCurrentPage = Math.min(Math.max(1, currentPage), totalPages);

  const paginatedOfficers = useMemo(() => {
    const start = (safeCurrentPage - 1) * pageSize;
    return filteredOfficers.slice(start, start + pageSize);
  }, [filteredOfficers, safeCurrentPage, pageSize]);

  const getPaginationNumbers = (current: number, total: number): (number | string)[] => {
    if (total <= 7) {
      return Array.from({ length: total }, (_, i) => i + 1);
    }
    if (current <= 4) {
      return [1, 2, 3, 4, 5, "...", total];
    }
    if (current >= total - 3) {
      return [1, "...", total - 4, total - 3, total - 2, total - 1, total];
    }
    return [1, "...", current - 1, current, current + 1, "...", total];
  };

  // Handle Toggle Switch with optimistic revert and specific error handling
  const handleToggle = async (officer: OfficerTrackHistoryItem, nextChecked: boolean) => {
    const officerId = getOfficerId(officer);
    if (!officerId) {
      toast.error("Invalid officer identifier.");
      return;
    }

    const previousState = isOfficerEnabled(officer);
    if (previousState === nextChecked) return;

    const nextNumericValue: 0 | 1 = nextChecked ? 1 : 0;

    // Optimistically update UI
    setUpdatingId(officerId);
    setOfficers((prev) =>
      prev.map((item) =>
        getOfficerId(item) === officerId
          ? { ...item, track_history_enabled: nextNumericValue }
          : item
      )
    );

    try {
      await trackHistoryControlService.updateOfficerTrackHistory(
        officerId,
        nextNumericValue
      );

      // Success notification for immediate effect
      if (nextNumericValue === 1) {
        toast.success(
          "Track History enabled. New GPS points are now eligible for Track History."
        );
      } else {
        toast.success(
          "Track History disabled. New GPS points will no longer be included in Track History."
        );
      }
    } catch (err: any) {
      // Revert switch to previous state
      setOfficers((prev) =>
        prev.map((item) =>
          getOfficerId(item) === officerId
            ? { ...item, track_history_enabled: previousState ? 1 : 0 }
            : item
        )
      );

      // Handle specific error codes
      if (err.response?.status === 403) {
        toast.error("You are not authorized to modify this officer.");
      } else if (err.response?.status === 404) {
        toast.error("Field Officer not found.");
      } else {
        const msg =
          err.response?.data?.detail ||
          err.message ||
          "Failed to update Track History setting. Please try again.";
        toast.error(typeof msg === "string" ? msg : JSON.stringify(msg));
      }
    } finally {
      setUpdatingId(null);
    }
  };

  const formatTimestamp = (rawStr?: string | null) => {
    if (!rawStr) return "—";
    try {
      const date = new Date(rawStr);
      if (isNaN(date.getTime())) return rawStr;
      return date.toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      });
    } catch {
      return rawStr;
    }
  };

  return (
    <div className="space-y-6 max-w-[1400px] mx-auto pb-16">
      {/* Breadcrumb Navigation */}
      <nav className="flex items-center gap-1.5 text-xs text-muted-foreground font-semibold">
        <span className="flex items-center gap-1 text-muted-foreground/80">
          <Shield className="h-3.5 w-3.5" /> Field Officer Monitoring
        </span>
        <ChevronRight className="h-3 w-3" />
        <span className="text-foreground font-semibold">Track History Control</span>
      </nav>

      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          Track History Control
        </h1>

        {/* Immediate Effect Information Banner */}
        <div className="mt-2 flex items-start gap-3 p-3.5 rounded-xl border border-amber-200/70 bg-amber-50/70 text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-300 shadow-2xs">
          <Info className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <div className="text-xs leading-relaxed space-y-1">
            <p className="font-semibold text-amber-950 dark:text-amber-200">
              Track History control takes effect immediately.
            </p>
            <p className="text-amber-800/90 dark:text-amber-300/80">
              Disabling Track History stops new GPS points from being included in Track History. Live GPS tracking and GPS data collection continue normally.
            </p>
            <p className="text-amber-800/90 dark:text-amber-300/80">
              When enabled: New GPS points are eligible for Track History immediately.
            </p>
          </div>
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-3">
        {[
          {
            label: "Collection Active",
            subLabel: "ENABLED",
            value: enabledCount,
            color: "kpi-card-green",
            icon: CheckCircle2,
            dot: "bg-emerald-500",
            glow: "0 0 8px rgba(16, 185, 129, 0.8)",
            iconBg: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
          },
          {
            label: "Collection Suspended",
            subLabel: "DISABLED",
            value: disabledCount,
            color: "kpi-card-red",
            icon: XCircle,
            dot: "bg-rose-500",
            glow: "0 0 8px rgba(244, 63, 94, 0.8)",
            iconBg: "bg-rose-500/10 text-rose-600 dark:text-rose-400",
          },
          {
            label: "Total Field Officers",
            subLabel: "AUTHORIZED POOL",
            value: totalCount,
            color: "kpi-card-blue",
            icon: Users,
            dot: "bg-blue-500",
            glow: "0 0 8px rgba(59, 130, 246, 0.8)",
            iconBg: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
          },
        ].map((c) => (
          <Card key={c.label} className={`kpi-card ${c.color} border border-border/60 shadow-sm`}>
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <div className={`h-2 w-2 rounded-full ${c.dot}`} style={{ boxShadow: c.glow }} />
                    <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground leading-none">
                      {c.subLabel} — {c.label}
                    </p>
                  </div>
                  <p className="text-3xl font-extrabold font-mono-data tracking-tight pt-1">{c.value}</p>
                </div>
                <div className={`flex h-11 w-11 items-center justify-center rounded-xl shrink-0 ${c.iconBg}`}>
                  <c.icon className="h-5 w-5" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Main Console Card */}
      <Card className="border border-border/60 overflow-hidden shadow-sm">
        {/* Console Header */}
        <div className="px-4 py-3 bg-muted/40 border-b flex items-center justify-between text-xs font-semibold text-muted-foreground">
          <div className="flex items-center gap-2">
            <span>Field Officer Authorization Console</span>
            <span className="text-[11px] font-normal text-muted-foreground">({filteredOfficers.length} Officers Listed)</span>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={fetchOfficers}
            disabled={loading}
            className="btn-white-fill h-7 px-3 text-xs gap-1.5 font-medium rounded-md"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            <span>Refresh</span>
          </Button>
        </div>

        {/* Filter Bar */}
        <div className="px-4 py-3 border-b border-border/40 bg-card/60">
          <div className="flex flex-wrap items-center gap-3">
            {/* Search Box */}
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/60" />
              <Input
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search officer name, employee code..."
                className="pl-8 h-8 text-xs bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 shadow-sm min-w-[220px] max-w-[320px]"
              />
            </div>

            {/* Status Dropdown */}
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-foreground text-xs h-8 px-3 rounded-md focus:outline-none focus:ring-1 focus:ring-primary shadow-sm min-w-[150px]"
            >
              <option value="ALL">All States</option>
              <option value="ENABLED">ENABLED (Collection Active)</option>
              <option value="DISABLED">DISABLED (Collection Suspended)</option>
            </select>

            {/* Branch Dropdown */}
            {availableBranches.length > 1 && (
              <select
                value={branchFilter}
                onChange={(e) => setBranchFilter(e.target.value)}
                className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-foreground text-xs h-8 px-3 rounded-md focus:outline-none focus:ring-1 focus:ring-primary shadow-sm min-w-[140px]"
              >
                <option value="ALL">All Branches</option>
                {availableBranches.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
            )}

            {/* Reset Filter Button */}
            {(searchTerm || statusFilter !== "ALL" || (availableBranches.length > 1 && branchFilter !== "ALL")) && (
              <div className="flex items-center gap-3 text-xs ml-auto">
                <span className="text-muted-foreground">
                  Showing <span className="font-bold text-primary">{filteredOfficers.length}</span> of {officers.length}
                </span>
                <Button
                  variant="link"
                  className="h-auto p-0 text-accent font-bold hover:no-underline text-xs"
                  onClick={() => {
                    setSearchTerm("");
                    setStatusFilter("ALL");
                    setBranchFilter("ALL");
                  }}
                >
                  Reset
                </Button>
              </div>
            )}
          </div>
        </div>

        {/* Error State */}
        {error && (
          <div className="p-4 border-b border-rose-500/20 bg-rose-500/10 text-rose-600 dark:text-rose-400 text-xs flex items-center justify-between">
            <div className="flex items-center gap-2 font-medium">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
            <button onClick={fetchOfficers} className="font-bold underline hover:opacity-80">
              Retry
            </button>
          </div>
        )}

        {/* Content Body: Desktop Table */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/30">
                <th className="px-4 py-2 text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  Field Officer
                </th>
                <th className="px-4 py-2 text-center text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  Employee ID
                </th>
                <th className="px-4 py-2 text-center text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  Branch
                </th>
                <th className="px-4 py-2 text-center text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  Effective Since
                </th>
                <th className="px-4 py-2 text-center text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  Track History
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {loading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    <td className="px-4 py-2 text-left">
                      <div className="h-3.5 bg-muted rounded w-32 mb-1" />
                      <div className="h-2.5 bg-muted/60 rounded w-16" />
                    </td>
                    <td className="px-4 py-2 text-center"><div className="h-3.5 bg-muted rounded w-16 mx-auto" /></td>
                    <td className="px-4 py-2 text-center"><div className="h-3.5 bg-muted rounded w-20 mx-auto" /></td>
                    <td className="px-4 py-2 text-center"><div className="h-3.5 bg-muted rounded w-24 mx-auto" /></td>
                    <td className="px-4 py-2 text-center"><div className="h-7 bg-muted rounded-full w-28 mx-auto" /></td>
                  </tr>
                ))
              ) : officers.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-muted-foreground text-sm">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <Users className="h-7 w-7 text-muted-foreground/40" />
                      <span className="font-semibold text-foreground">No Field Officers Available</span>
                      <span className="text-xs text-muted-foreground">
                        No authorized field officers found under your management scope.
                      </span>
                    </div>
                  </td>
                </tr>
              ) : filteredOfficers.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-muted-foreground text-sm">
                    No Field Officers match the selected search & filter criteria.
                  </td>
                </tr>
              ) : (
                paginatedOfficers.map((officer) => {
                  const officerId = getOfficerId(officer);
                  const isEnabled = isOfficerEnabled(officer);
                  const isUpdating = updatingId === officerId;
                  const effectiveSince = getEffectiveSince(officer);

                  return (
                    <tr
                      key={String(officerId)}
                      className={`hover:bg-muted/20 transition-colors ${
                        isEnabled ? "bg-emerald-500/[0.015]" : ""
                      }`}
                    >
                      {/* Officer Name & OID */}
                      <td className="px-4 py-2 text-left">
                        <div className="font-semibold text-foreground text-xs leading-tight">
                          {getOfficerName(officer)}
                        </div>
                        <div className="text-[10px] text-muted-foreground font-mono-data leading-none mt-0.5">
                          OID: {officerId}
                        </div>
                      </td>

                      {/* Employee ID */}
                      <td className="px-4 py-2 text-center font-mono-data text-xs font-semibold text-foreground">
                        {getOfficerCode(officer)}
                      </td>

                      {/* Branch */}
                      <td className="px-4 py-2 text-center text-xs text-muted-foreground">
                        <div className="inline-flex items-center justify-center gap-1.5">
                          <Building2 className="h-3.5 w-3.5 text-muted-foreground/60" />
                          <span className="font-medium text-foreground">{getOfficerBranch(officer)}</span>
                        </div>
                      </td>

                      {/* Effective Since / Last Update */}
                      <td className="px-4 py-2 text-center text-xs text-muted-foreground">
                        <div className="inline-flex items-center justify-center gap-1.5 font-mono-data text-[11px]">
                          <Calendar className="h-3.5 w-3.5 text-muted-foreground/60" />
                          <span>{formatTimestamp(effectiveSince)}</span>
                        </div>
                      </td>

                      {/* Combined Segmented Enable / Disable Control */}
                      <td className="px-4 py-1.5 text-center">
                        <div className="flex flex-col items-center justify-center">
                          <div className="relative grid grid-cols-2 w-28 h-7 p-0.5 rounded-full border border-border bg-muted/60 overflow-hidden shrink-0">
                            {/* Sliding Background */}
                            <div
                              className={`absolute top-0.5 bottom-0.5 w-[calc(50%-2px)] rounded-full transition-all duration-300 ease-in-out ${
                                isEnabled
                                  ? "left-0.5 bg-emerald-500/15 border border-emerald-500/30"
                                  : "left-[calc(50%+1px)] bg-red-500/15 border border-red-500/30"
                              }`}
                            />

                            {/* Enable Button */}
                            <button
                              disabled={isUpdating}
                              onClick={() => handleToggle(officer, true)}
                              className={`relative z-10 flex items-center justify-center text-[11px] font-semibold transition-colors duration-300 ${
                                isEnabled
                                  ? "text-emerald-600 dark:text-emerald-400 font-bold"
                                  : "text-muted-foreground hover:text-foreground"
                              }`}
                            >
                              {isUpdating && isEnabled ? (
                                <Loader2 className="h-2.5 w-2.5 animate-spin text-emerald-600" />
                              ) : (
                                "Enable"
                              )}
                            </button>

                            {/* Disable Button */}
                            <button
                              disabled={isUpdating}
                              onClick={() => handleToggle(officer, false)}
                              className={`relative z-10 flex items-center justify-center text-[11px] font-semibold transition-colors duration-300 ${
                                !isEnabled
                                  ? "text-red-600 dark:text-red-400 font-bold"
                                  : "text-muted-foreground hover:text-foreground"
                              }`}
                            >
                              {isUpdating && !isEnabled ? (
                                <Loader2 className="h-2.5 w-2.5 animate-spin text-red-600" />
                              ) : (
                                "Disable"
                              )}
                            </button>
                          </div>

                          <span
                            className={`text-[8.5px] font-semibold tracking-wide mt-0.5 leading-none ${
                              isEnabled
                                ? "text-emerald-600/90 dark:text-emerald-400/90"
                                : "text-rose-600/90 dark:text-rose-400/90"
                            }`}
                          >
                            {isEnabled ? "Collection Active" : "Collection Suspended"}
                          </span>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile View: Cards List */}
        <div className="block md:hidden divide-y divide-border/40">
          {loading ? (
            <div className="p-8 text-center text-sm text-muted-foreground flex items-center justify-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
              <span>Loading Field Officers...</span>
            </div>
          ) : officers.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground text-sm">
              <span className="font-semibold text-foreground">No Field Officers Available</span>
            </div>
          ) : filteredOfficers.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground text-sm">
              No Field Officers match the selected filters.
            </div>
          ) : (
            paginatedOfficers.map((officer) => {
              const officerId = getOfficerId(officer);
              const isEnabled = isOfficerEnabled(officer);
              const isUpdating = updatingId === officerId;
              const effectiveSince = getEffectiveSince(officer);

              return (
                <div
                  key={String(officerId)}
                  className={`p-4 space-y-3 ${isEnabled ? "bg-emerald-500/[0.015]" : ""}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-semibold text-foreground text-sm">
                        {getOfficerName(officer)}
                      </div>
                      <div className="text-xs text-muted-foreground font-mono-data mt-0.5">
                        Emp ID: {getOfficerCode(officer)} • OID: {officerId}
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                        <Building2 className="h-3 w-3" />
                        <span>{getOfficerBranch(officer)}</span>
                      </div>
                    </div>

                    <div className="flex flex-col items-end gap-1.5">
                      <div className="relative grid grid-cols-2 w-28 h-7 p-0.5 rounded-full border border-border bg-muted/60 overflow-hidden shrink-0">
                        <div
                          className={`absolute top-0.5 bottom-0.5 w-[calc(50%-2px)] rounded-full transition-all duration-300 ease-in-out ${
                            isEnabled
                              ? "left-0.5 bg-emerald-500/10 border border-emerald-500/30"
                              : "left-[calc(50%+1px)] bg-red-500/10 border border-red-500/30"
                          }`}
                        />
                        <button
                          disabled={isUpdating}
                          onClick={() => handleToggle(officer, true)}
                          className={`relative z-10 flex items-center justify-center text-[11px] font-semibold transition-colors duration-300 ${
                            isEnabled
                              ? "text-emerald-600 dark:text-emerald-400 font-bold"
                              : "text-muted-foreground"
                          }`}
                        >
                          Enable
                        </button>
                        <button
                          disabled={isUpdating}
                          onClick={() => handleToggle(officer, false)}
                          className={`relative z-10 flex items-center justify-center text-[11px] font-semibold transition-colors duration-300 ${
                            !isEnabled
                              ? "text-red-600 dark:text-red-400 font-bold"
                              : "text-muted-foreground"
                          }`}
                        >
                          Disable
                        </button>
                      </div>
                      <span
                        className={`text-[9px] font-semibold ${
                          isEnabled
                            ? "text-emerald-600/90 dark:text-emerald-400/90"
                            : "text-rose-600/90 dark:text-rose-400/90"
                        }`}
                      >
                        {isEnabled ? "Collection Active" : "Collection Suspended"}
                      </span>
                    </div>
                  </div>

                  {effectiveSince && (
                    <div className="text-[10px] text-muted-foreground font-mono-data border-t border-border/30 pt-2 flex items-center gap-1">
                      <Calendar className="h-3 w-3 text-muted-foreground/60" />
                      <span>Effective Since: {formatTimestamp(effectiveSince)}</span>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Pagination Controls Footer */}
        {!loading && filteredOfficers.length > 0 && (
          <div className="border-t border-border/60 bg-card/60 px-4 py-3 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
            {/* Left: Summary info & Page size selector */}
            <div className="flex flex-wrap items-center gap-3 text-muted-foreground w-full sm:w-auto justify-between sm:justify-start">
              <span>
                Showing <span className="font-bold text-foreground font-mono-data">{(safeCurrentPage - 1) * pageSize + 1}</span> to{" "}
                <span className="font-bold text-foreground font-mono-data">{Math.min(safeCurrentPage * pageSize, totalItems)}</span> of{" "}
                <span className="font-bold text-primary font-mono-data">{totalItems}</span> officers
              </span>

              <div className="flex items-center gap-1.5 ml-0 sm:ml-2">
                <span className="text-[11px] text-muted-foreground">Per page:</span>
                <Select
                  value={String(pageSize)}
                  onValueChange={(val) => {
                    setPageSize(Number(val));
                    setCurrentPage(1);
                  }}
                >
                  <SelectTrigger className="h-7 w-[68px] text-xs bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 shadow-sm px-2">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="10">10</SelectItem>
                    <SelectItem value="20">20</SelectItem>
                    <SelectItem value="50">50</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Right: Page Indicator and Buttons */}
            <div className="flex items-center gap-1.5 w-full sm:w-auto justify-between sm:justify-end">
              {/* Current page indicator pill */}
              <span className="text-xs font-medium text-muted-foreground px-2.5 py-1 bg-muted/60 rounded-md border border-border/40 whitespace-nowrap">
                Page <strong className="text-primary font-mono-data">{safeCurrentPage}</strong> of{" "}
                <strong className="text-foreground font-mono-data">{totalPages}</strong>
              </span>

              {/* Navigation Buttons */}
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="icon"
                  className="h-7 w-7 text-xs border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-2xs hover:bg-slate-50 dark:hover:bg-slate-800"
                  disabled={safeCurrentPage === 1}
                  onClick={() => setCurrentPage(1)}
                  title="First Page"
                >
                  <ChevronsLeft className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-7 w-7 text-xs border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-2xs hover:bg-slate-50 dark:hover:bg-slate-800"
                  disabled={safeCurrentPage === 1}
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  title="Previous Page"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </Button>

                {/* Numbered Page Buttons for Quick Access */}
                <div className="hidden sm:flex items-center gap-1">
                  {getPaginationNumbers(safeCurrentPage, totalPages).map((pNum, idx) => {
                    if (pNum === "...") {
                      return (
                        <span key={`ellipsis-${idx}`} className="px-1 text-muted-foreground select-none">
                          …
                        </span>
                      );
                    }
                    const isCurrent = pNum === safeCurrentPage;
                    return (
                      <Button
                        key={`page-${pNum}`}
                        variant={isCurrent ? "default" : "outline"}
                        size="icon"
                        className={cn(
                          "h-7 w-7 text-xs font-mono-data font-semibold",
                          isCurrent
                            ? "bg-primary text-primary-foreground shadow-xs"
                            : "border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-2xs hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200"
                        )}
                        onClick={() => setCurrentPage(Number(pNum))}
                      >
                        {pNum}
                      </Button>
                    );
                  })}
                </div>

                <Button
                  variant="outline"
                  size="icon"
                  className="h-7 w-7 text-xs border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-2xs hover:bg-slate-50 dark:hover:bg-slate-800"
                  disabled={safeCurrentPage === totalPages}
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  title="Next Page"
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-7 w-7 text-xs border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-2xs hover:bg-slate-50 dark:hover:bg-slate-800"
                  disabled={safeCurrentPage === totalPages}
                  onClick={() => setCurrentPage(totalPages)}
                  title="Last Page"
                >
                  <ChevronsRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
