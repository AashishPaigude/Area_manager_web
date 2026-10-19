import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { 
  Eye, Edit, Trash2, Calendar as CalendarIcon, MapPin, ChevronRight, ChevronLeft,
  ChevronsLeft, ChevronsRight, Copy, Loader2, RefreshCw, AlertTriangle, CheckCircle2,
  Clock, BarChart3, Building2, Filter, Briefcase, User, Layers
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import type { DateRange } from "react-day-picker";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import {
  FieldOfficer, Branch, PlanSummary, PlanDetailData, getFieldOfficers, getBranches, listPlans,
  getPlanDetails, duplicatePlan, deletePlan, unpublishPlan,
} from "@/services/visitService";
import { trackingService, PlannedVsActualResponse } from "@/services/trackingService";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

export default function PlannedVisits() {
  const navigate = useNavigate();

  // Tab State
  const [activeTab, setActiveTab] = useState<string>("schedules");

  // Data States for Plan Schedules
  const [plans, setPlans] = useState<PlanSummary[]>([]);
  const [officersList, setOfficersList] = useState<FieldOfficer[]>([]);
  const [branchesList, setBranchesList] = useState<Branch[]>([]);
  
  const [loadingPlans, setLoadingPlans] = useState(true);
  const [loadingOfficers, setLoadingOfficers] = useState(true);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [isActionLoading, setIsActionLoading] = useState(false);

  // Filters State for Schedules Tab
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [officerFilter, setOfficerFilter] = useState("ALL");
  const [branchFilter, setBranchFilter] = useState("ALL");
  const [planningTypeFilter, setPlanningTypeFilter] = useState("ALL");
  const [creatorFilter, setCreatorFilter] = useState("ALL");
  const [creatorCounts, setCreatorCounts] = useState<{ all: number; manager: number; self: number }>({ all: 0, manager: 0, self: 0 });

  // Pagination State for Schedules Tab
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(10);

  // Automatically return to first page whenever any filter criteria change
  useEffect(() => {
    setCurrentPage(1);
  }, [planningTypeFilter, statusFilter, officerFilter, branchFilter, creatorFilter, dateRange]);

  // Details Modal State
  const [selectedPlanDetails, setSelectedPlanDetails] = useState<PlanDetailData | null>(null);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);

  // Planned vs Actual Analytics State
  const [pvaOfficerOid, setPvaOfficerOid] = useState<number | null>(null);
  const [pvaPeriod, setPvaPeriod] = useState<string>("weekly");
  const [pvaDate, setPvaDate] = useState<string>(() => new Date().toISOString().split("T")[0]);
  const [pvaData, setPvaData] = useState<PlannedVsActualResponse | null>(null);
  const [loadingPva, setLoadingPva] = useState<boolean>(false);
  const [pvaError, setPvaError] = useState<string | null>(null);

  // Load Field Officers and Branches for dropdowns
  useEffect(() => {
    const fetchMasterData = async () => {
      try {
        setLoadingOfficers(true);
        const [officers, branches] = await Promise.all([
          getFieldOfficers(),
          getBranches().catch(() => [] as Branch[]),
        ]);
        setOfficersList(officers);
        setBranchesList(branches);
        if (officers.length > 0) {
          setPvaOfficerOid(officers[0].oid);
        }
      } catch (err: any) {
        toast.error(`Failed to load master data: ${err.message}`);
      } finally {
        setLoadingOfficers(false);
      }
    };
    fetchMasterData();
  }, []);

  // Fetch Visit Plans matching active filters
  const fetchPlans = useCallback(async () => {
    try {
      setLoadingPlans(true);

      const filtersPayload: Record<string, any> = {};
      if (planningTypeFilter !== "ALL") {
        filtersPayload.planning_type = planningTypeFilter.toUpperCase();
      }
      if (statusFilter !== "ALL") {
        filtersPayload.status = statusFilter.toUpperCase();
      }
      if (officerFilter !== "ALL") {
        filtersPayload.employee_oid = parseInt(officerFilter);
      }
      if (branchFilter !== "ALL") {
        filtersPayload.branch_oid = parseInt(branchFilter);
      }
      if (creatorFilter !== "ALL") {
        filtersPayload.creator_type = creatorFilter;
      }
      if (dateRange?.from) {
        filtersPayload.week_start_date = format(dateRange.from, "yyyy-MM-dd");
      }
      if (dateRange?.to) {
        filtersPayload.week_end_date = format(dateRange.to, "yyyy-MM-dd");
      }

      const data = await listPlans(filtersPayload);
      setPlans(data);

      // Maintain split counts for quick switcher tabs
      if (creatorFilter === "ALL") {
        setCreatorCounts({
          all: data.length,
          manager: data.filter(p => p.plan_creator_type === "MANAGER").length,
          self: data.filter(p => p.plan_creator_type === "SELF").length,
        });
      }
    } catch (err: any) {
      toast.error(`Failed to load visit plans: ${err.message}`);
    } finally {
      setLoadingPlans(false);
    }
  }, [planningTypeFilter, statusFilter, officerFilter, branchFilter, creatorFilter, dateRange]);

  useEffect(() => {
    fetchPlans();
  }, [fetchPlans]);

  // Fetch Planned vs Actual Analytics Data
  const fetchPlannedVsActual = useCallback(async () => {
    if (!pvaOfficerOid) return;
    try {
      setLoadingPva(true);
      setPvaError(null);
      const res = await trackingService.getPlannedVsActual(pvaOfficerOid, pvaDate, pvaPeriod);
      setPvaData(res);
    } catch (err: any) {
      console.error("Failed to fetch planned vs actual visits:", err);
      setPvaError(err?.response?.data?.message || err?.message || "Failed to load planned vs actual data.");
      setPvaData(null);
    } finally {
      setLoadingPva(false);
    }
  }, [pvaOfficerOid, pvaDate, pvaPeriod]);

  useEffect(() => {
    if (activeTab === "analytics") {
      fetchPlannedVsActual();
    }
  }, [activeTab, fetchPlannedVsActual]);

  // Formatted date range label for button trigger
  const getDateRangeLabel = () => {
    if (!dateRange?.from) return "Select Date Range";
    if (!dateRange.to) return `${format(dateRange.from, "dd MMM yyyy")} – ...`;
    return `${format(dateRange.from, "dd MMM yyyy")} – ${format(dateRange.to, "dd MMM yyyy")}`;
  };

  // Helper to safely parse date string to local Date object without UTC day-shift
  const parseDateSafely = (dateStr: string): Date => {
    if (!dateStr) return new Date();
    const parts = dateStr.split("T")[0].split("-");
    if (parts.length === 3) {
      const y = parseInt(parts[0], 10);
      const m = parseInt(parts[1], 10) - 1;
      const d = parseInt(parts[2], 10);
      return new Date(y, m, d);
    }
    return new Date(dateStr);
  };

  // Helper to format Planning Period for display
  const formatPeriodDisplay = (plan: PlanSummary | PlanDetailData) => {
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    if (plan.planning_type === "WEEKLY") {
      if (plan.week_start_date && plan.week_end_date) {
        try {
          const s = parseDateSafely(plan.week_start_date);
          const e = parseDateSafely(plan.week_end_date);
          if (s.getFullYear() === e.getFullYear()) {
            return `${s.getDate()} ${months[s.getMonth()]} – ${e.getDate()} ${months[e.getMonth()]} ${s.getFullYear()}`;
          }
          return `${s.getDate()} ${months[s.getMonth()]} ${s.getFullYear()} – ${e.getDate()} ${months[e.getMonth()]} ${e.getFullYear()}`;
        } catch {
          return `${plan.week_start_date} – ${plan.week_end_date}`;
        }
      }
      return "Weekly Plan";
    } else if (plan.planning_type === "MONTHLY") {
      if (plan.planning_month && plan.planning_year) {
        const mName = MONTH_NAMES[plan.planning_month - 1] || `Month ${plan.planning_month}`;
        return `${mName} ${plan.planning_year}`;
      }
      return "Monthly Plan";
    } else if (plan.planning_type === "SINGLE") {
      if (plan.visit_date) {
        try {
          const d = parseDateSafely(plan.visit_date);
          return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
        } catch {
          return plan.visit_date;
        }
      }
      return "Single Visit";
    }
    return "Visit Plan";
  };

  // Computed Pagination Values
  const totalItems = plans.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const safeCurrentPage = Math.min(Math.max(1, currentPage), totalPages);

  const paginatedPlans = useMemo(() => {
    const start = (safeCurrentPage - 1) * pageSize;
    return plans.slice(start, start + pageSize);
  }, [plans, safeCurrentPage, pageSize]);

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

  // View details
  const handleOpenDetails = async (plan: PlanSummary) => {
    try {
      setLoadingDetails(true);
      setIsDetailsOpen(true);
      const details = await getPlanDetails(plan.oid);
      setSelectedPlanDetails(details);
    } catch (err: any) {
      toast.error(`Failed to load plan details: ${err.message}`);
      setIsDetailsOpen(false);
    } finally {
      setLoadingDetails(false);
    }
  };

  // Delete plan
  const handleDeletePlan = async (plan: PlanSummary) => {
    if (plan.status === "PUBLISHED") {
      toast.error("Cannot delete a PUBLISHED plan. Only DRAFT plans can be deleted.");
      return;
    }

    if (confirm(`Are you sure you want to delete planned visit schedule ${plan.plan_code}?`)) {
      try {
        setIsActionLoading(true);
        await deletePlan(plan.oid);
        toast.success(`Visit plan ${plan.plan_code} deleted successfully`);
        if (selectedPlanDetails?.oid === plan.oid) {
          setIsDetailsOpen(false);
        }
        await fetchPlans();
      } catch (err: any) {
        toast.error(err.message || "Failed to delete visit plan");
      } finally {
        setIsActionLoading(false);
      }
    }
  };

  // Duplicate plan
  const handleDuplicatePlan = async (plan: PlanSummary) => {
    try {
      setIsActionLoading(true);
      const duplicated = await duplicatePlan(plan.oid);
      toast.success(`Plan "${formatPeriodDisplay(plan)}" duplicated as DRAFT plan ${duplicated.plan_code}`);
      await fetchPlans();
    } catch (err: any) {
      toast.error(err.message || "Failed to duplicate visit plan");
    } finally {
      setIsActionLoading(false);
    }
  };

  // Edit plan
  const handleEditPlan = async (plan: PlanSummary | PlanDetailData) => {
    try {
      setIsActionLoading(true);
      let details: PlanDetailData;
      if (plan.status === "PUBLISHED") {
        details = await unpublishPlan(plan.oid);
        toast.info(`Plan ${plan.plan_code} switched to edit phase (Draft)`);
      } else {
        details = await getPlanDetails(plan.oid);
      }
      navigate("/visit-planning/plan", { state: { copiedPlan: details } });
    } catch (err: any) {
      toast.error(`Failed to load plan for editing: ${err.message}`);
    } finally {
      setIsActionLoading(false);
    }
  };

  return (
    <div className="space-y-4 max-w-[1400px] mx-auto pb-16">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-xs text-muted-foreground font-semibold">
        <span className="flex items-center gap-1 text-muted-foreground/80">
          <CalendarIcon className="h-3.5 w-3.5" /> Visit Planning
        </span>
        <ChevronRight className="h-3 w-3" />
        <span className="text-foreground font-semibold">Planned vs Actual Visits</span>
      </nav>

      {/* Header */}
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight">Planned vs Actual Visits</h1>
        <p className="text-sm text-muted-foreground">View visit schedules, site-level visit completion targets, and actual site visit session analytics.</p>
      </div>

      {/* Navigation Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full space-y-4">
        <TabsList className="h-auto inline-flex items-center rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-200/80 dark:bg-slate-900 p-1 text-xs font-semibold shadow-inner gap-1.5">
          <TabsTrigger
            value="schedules"
            className="rounded-lg text-xs font-semibold px-3.5 py-1.5 transition-all data-[state=active]:bg-blue-600 data-[state=active]:text-white data-[state=active]:font-bold data-[state=active]:shadow-sm data-[state=inactive]:bg-white dark:data-[state=inactive]:bg-slate-800 data-[state=inactive]:text-slate-700 dark:data-[state=inactive]:text-slate-200 data-[state=inactive]:shadow-xs data-[state=inactive]:border data-[state=inactive]:border-slate-300/80 dark:data-[state=inactive]:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700"
          >
            Visit Schedules Listing
          </TabsTrigger>
          <TabsTrigger
            value="analytics"
            className="rounded-lg text-xs font-semibold px-3.5 py-1.5 transition-all flex items-center gap-1.5 data-[state=active]:bg-blue-600 data-[state=active]:text-white data-[state=active]:font-bold data-[state=active]:shadow-sm data-[state=inactive]:bg-white dark:data-[state=inactive]:bg-slate-800 data-[state=inactive]:text-slate-700 dark:data-[state=inactive]:text-slate-200 data-[state=inactive]:shadow-xs data-[state=inactive]:border data-[state=inactive]:border-slate-300/80 dark:data-[state=inactive]:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700"
          >
            <BarChart3 className="h-3.5 w-3.5" /> Planned vs Actual Analytics
          </TabsTrigger>
        </TabsList>

        {/* TAB 1: VISIT SCHEDULES LISTING */}
        <TabsContent value="schedules" className="space-y-4">
          {/* Filters Toolbar */}
          <Card className="border border-border/50 bg-card/40 p-4 shadow-sm">
            <div className={`grid grid-cols-1 sm:grid-cols-2 ${branchesList.length > 1 ? "lg:grid-cols-5" : "lg:grid-cols-4"} gap-3 items-end`}>
              {/* Date Range */}
              <div className="space-y-1 text-left w-full">
                <Label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block h-4">
                  Date Range
                </Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "h-8 w-full justify-start text-left text-xs font-normal border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors px-3 rounded-md",
                        !dateRange?.from && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-3.5 w-3.5 text-muted-foreground/70 flex-shrink-0" />
                      <span className="truncate">{getDateRangeLabel()}</span>
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl rounded-2xl" align="start">
                    <div className="pb-2 mb-2 border-b border-border/40 flex items-center justify-between px-1">
                      <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
                        <CalendarIcon className="h-3.5 w-3.5 text-primary" /> Select Visit Date Range
                      </span>
                      {dateRange?.from && (
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="h-6 px-2 text-[11px] text-muted-foreground hover:text-foreground"
                          onClick={() => setDateRange(undefined)}
                        >
                          Clear
                        </Button>
                      )}
                    </div>
                    <Calendar
                      initialFocus
                      mode="range"
                      defaultMonth={dateRange?.from || new Date()}
                      selected={dateRange}
                      onSelect={setDateRange}
                      numberOfMonths={2}
                    />
                  </PopoverContent>
                </Popover>
              </div>

              {/* Branch */}
              {branchesList.length > 1 && (
                <div className="space-y-1 text-left w-full">
                  <Label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block h-4">Branch</Label>
                  <Select value={branchFilter} onValueChange={setBranchFilter}>
                    <SelectTrigger className="h-8 text-xs border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors px-3 rounded-md">
                      <SelectValue placeholder="Select Branch" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">All Branches</SelectItem>
                      {branchesList.map(b => (
                        <SelectItem key={b.oid} value={b.oid.toString()}>{b.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Status */}
              <div className="space-y-1 text-left w-full">
                <Label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block h-4">Status</Label>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="h-8 text-xs border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors px-3 rounded-md">
                    <SelectValue placeholder="Select Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">All Status</SelectItem>
                    <SelectItem value="Draft">Draft</SelectItem>
                    <SelectItem value="Published">Published</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Officer */}
              <div className="space-y-1 text-left w-full">
                <Label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block h-4">Officer</Label>
                <Select value={officerFilter} onValueChange={setOfficerFilter} disabled={loadingOfficers}>
                  <SelectTrigger className="h-8 text-xs border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors px-3 rounded-md">
                    <SelectValue placeholder={loadingOfficers ? "Loading Officers..." : "Select Officer"} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">All Officers</SelectItem>
                    {officersList.map(o => (
                      <SelectItem key={o.oid} value={o.oid.toString()}>{o.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Planning Type */}
              <div className="space-y-1 text-left w-full">
                <Label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block h-4">Planning Type</Label>
                <Select value={planningTypeFilter} onValueChange={setPlanningTypeFilter}>
                  <SelectTrigger className="h-8 text-xs border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors px-3 rounded-md">
                    <SelectValue placeholder="Select Type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">All Types</SelectItem>
                    <SelectItem value="Weekly">Weekly</SelectItem>
                    <SelectItem value="Monthly">Monthly</SelectItem>
                    <SelectItem value="Single">Single</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Clear Filters Indicator */}
            {(dateRange?.from || statusFilter !== "ALL" || officerFilter !== "ALL" || (branchesList.length > 1 && branchFilter !== "ALL") || planningTypeFilter !== "ALL" || creatorFilter !== "ALL") && (
              <div className="mt-3 pt-3 border-t border-border/40 flex items-center justify-between text-xs">
                <span className="text-muted-foreground">
                  Showing <span className="font-bold text-primary">{plans.length}</span> visit schedules
                </span>
                <Button
                  variant="link"
                  className="h-auto p-0 text-accent font-bold hover:no-underline text-xs"
                  onClick={() => {
                    setDateRange(undefined);
                    setStatusFilter("ALL");
                    setOfficerFilter("ALL");
                    setBranchFilter("ALL");
                    setPlanningTypeFilter("ALL");
                    setCreatorFilter("ALL");
                  }}
                >
                  Reset Filters
                </Button>
              </div>
            )}
          </Card>

          {/* Quick Segmented Switcher for Plan Origin (Option A) */}
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="inline-flex items-center gap-1.5 p-1 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-200/80 dark:bg-slate-900 shadow-inner">
              <Button
                variant="ghost"
                size="sm"
                className={cn(
                  "h-7 px-3 text-xs rounded-lg transition-all gap-1.5 font-semibold",
                  creatorFilter === "ALL"
                    ? "bg-blue-600 text-white shadow-sm font-bold border border-blue-600 hover:bg-blue-600 hover:text-white"
                    : "bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 shadow-xs border border-slate-300/80 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700"
                )}
                onClick={() => setCreatorFilter("ALL")}
              >
                <Layers className="h-3.5 w-3.5" />
                <span>All Plans</span>
                <span className={cn(
                  "ml-1 text-[10px] px-1.5 py-0.5 rounded-full font-mono font-bold",
                  creatorFilter === "ALL" 
                    ? "bg-white/25 text-white" 
                    : "bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-600"
                )}>
                  {creatorCounts.all}
                </span>
              </Button>

              <Button
                variant="ghost"
                size="sm"
                className={cn(
                  "h-7 px-3 text-xs rounded-lg transition-all gap-1.5 font-semibold",
                  creatorFilter === "MANAGER"
                    ? "bg-indigo-600 text-white shadow-sm font-bold border border-indigo-600 hover:bg-indigo-600 hover:text-white"
                    : "bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 shadow-xs border border-slate-300/80 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700"
                )}
                onClick={() => setCreatorFilter("MANAGER")}
              >
                <Briefcase className="h-3.5 w-3.5" />
                <span>Planned by Manager</span>
                <span className={cn(
                  "ml-1 text-[10px] px-1.5 py-0.5 rounded-full font-mono font-bold",
                  creatorFilter === "MANAGER" 
                    ? "bg-white/25 text-white" 
                    : "bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-600"
                )}>
                  {creatorCounts.manager}
                </span>
              </Button>

              <Button
                variant="ghost"
                size="sm"
                className={cn(
                  "h-7 px-3 text-xs rounded-lg transition-all gap-1.5 font-semibold",
                  creatorFilter === "SELF"
                    ? "bg-amber-600 text-white shadow-sm font-bold border border-amber-600 hover:bg-amber-600 hover:text-white"
                    : "bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 shadow-xs border border-slate-300/80 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700"
                )}
                onClick={() => setCreatorFilter("SELF")}
              >
                <User className="h-3.5 w-3.5" />
                <span>Self Planned</span>
                <span className={cn(
                  "ml-1 text-[10px] px-1.5 py-0.5 rounded-full font-mono font-bold",
                  creatorFilter === "SELF" 
                    ? "bg-white/25 text-white" 
                    : "bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-600"
                )}>
                  {creatorCounts.self}
                </span>
              </Button>
            </div>

            <span className="text-xs text-muted-foreground font-medium">
              Total <span className="font-bold text-foreground">{plans.length}</span> schedules listed
            </span>
          </div>

          {/* Plan Listing Table */}
          <Card className="border border-border/60 overflow-hidden shadow-sm">
            <div className="w-full overflow-x-hidden">
              <Table className="w-full">
                <TableHeader className="bg-muted/40">
                  <TableRow>
                    <TableHead className="text-xs font-bold text-left px-3 py-2.5 w-[150px] whitespace-nowrap">Planning Period</TableHead>
                    <TableHead className="text-xs font-bold text-center px-2 py-2.5 w-[85px] whitespace-nowrap">Planning Type</TableHead>
                    <TableHead className="text-xs font-bold text-center px-2.5 py-2.5 whitespace-nowrap">Assigned Officer</TableHead>
                    <TableHead className="text-xs font-bold text-center px-2 py-2.5 w-[75px] whitespace-nowrap">Total Visits</TableHead>
                    <TableHead className="text-xs font-bold text-center px-2 py-2.5 w-[75px] whitespace-nowrap">Visits Done</TableHead>
                    <TableHead className="text-xs font-bold text-center px-2 py-2.5 w-[85px] whitespace-nowrap">Status</TableHead>
                    <TableHead className="text-xs font-bold text-center px-1.5 py-2.5 w-[95px] whitespace-nowrap">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loadingPlans ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-10 text-sm text-muted-foreground">
                        <div className="flex items-center justify-center gap-2">
                          <Loader2 className="h-4 w-4 animate-spin text-primary" /> Loading planned visits...
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : plans.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-muted-foreground py-10 text-sm">
                        No schedules found matching current filter configuration.
                      </TableCell>
                    </TableRow>
                  ) : (
                    paginatedPlans.map((plan) => (
                      <TableRow key={plan.oid} className="hover:bg-muted/10 transition-colors">
                        {/* Planning Period & ID - Clean, Compact & Non-wrapping */}
                        <TableCell className="font-semibold text-left px-3 py-2 whitespace-nowrap w-[150px]">
                          <div className="flex flex-col items-start justify-center gap-0.5">
                            <div className="flex items-center gap-1.5 text-xs font-bold text-foreground tracking-tight whitespace-nowrap">
                              <CalendarIcon className="h-3 w-3 text-primary/70 shrink-0" />
                              <span>{formatPeriodDisplay(plan)}</span>
                            </div>
                            <span className="text-[10px] text-muted-foreground font-mono font-semibold tracking-wider bg-muted/60 border border-border/40 px-1.5 py-0.5 rounded uppercase">
                              {plan.plan_code}
                            </span>
                          </div>
                        </TableCell>

                        {/* Planning Type */}
                        <TableCell className="text-xs font-medium text-center px-2 py-2 text-foreground/80 whitespace-nowrap w-[85px]">
                          {plan.planning_type === "WEEKLY" ? "Weekly" : plan.planning_type === "MONTHLY" ? "Monthly" : "Single"}
                        </TableCell>

                        {/* Officer & Plan Origin */}
                        <TableCell className="text-xs font-medium text-center px-2.5 py-2 text-foreground/80 whitespace-nowrap">
                          <div className="flex flex-col items-center justify-center gap-1">
                            <span className="font-semibold text-foreground text-xs">{plan.field_officer_name || "Unassigned"}</span>
                            {plan.plan_creator_type === "MANAGER" ? (
                              <span 
                                className="text-[10px] font-semibold text-indigo-600 dark:text-indigo-400 tracking-tight cursor-default"
                                title={plan.creator_name ? `Created by ${plan.creator_name}` : "Planned by Manager"}
                              >
                                Manager Planned
                              </span>
                            ) : (
                              <span 
                                className="text-[10px] font-semibold text-amber-600 dark:text-amber-500 tracking-tight cursor-default"
                                title="Self-planned by Field Officer directly"
                              >
                                Self Planned
                              </span>
                            )}
                          </div>
                        </TableCell>

                        {/* Total Visits (Assigned Target) */}
                        <TableCell className="text-xs font-bold text-center px-2 py-2 whitespace-nowrap w-[75px]">
                          <span className="bg-primary/5 px-2 py-0.5 rounded-md border text-primary text-xs inline-block">
                            {plan.total_visits}
                          </span>
                        </TableCell>

                        {/* Visits Done (Actual Completed) */}
                        <TableCell className="text-xs font-bold text-center px-2 py-2 whitespace-nowrap w-[75px]">
                          <span className="bg-emerald-500/10 dark:bg-emerald-500/20 px-2 py-0.5 rounded-md border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs inline-block">
                            {plan.visits_done}
                          </span>
                        </TableCell>

                        {/* Status badge */}
                        <TableCell className="text-center px-2 py-2 whitespace-nowrap w-[85px]">
                          <Badge 
                            variant="outline" 
                            className={
                              plan.status === "PUBLISHED"
                                ? "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20 font-bold text-[10px] px-2 py-0.5"
                                : "bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20 font-bold text-[10px] px-2 py-0.5"
                            }
                          >
                            {plan.status === "PUBLISHED" ? "Published" : "Draft"}
                          </Badge>
                        </TableCell>

                        {/* Action buttons - Compact with minimal gap */}
                        <TableCell className="text-center px-1.5 py-2 whitespace-nowrap w-[95px]">
                          <div className="flex items-center justify-center gap-0.5">
                            {/* View details */}
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              disabled={isActionLoading}
                              className="h-7 w-7 p-0 hover:bg-muted/60"
                              onClick={() => handleOpenDetails(plan)}
                              title="View Details"
                            >
                              <Eye className="h-3.5 w-3.5 text-muted-foreground hover:text-primary" />
                            </Button>

                            {/* Edit Plan */}
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              disabled={isActionLoading}
                              className="h-7 w-7 p-0 hover:bg-muted/60"
                              onClick={() => handleEditPlan(plan)}
                              title="Edit Plan"
                            >
                              <Edit className="h-3.5 w-3.5 text-muted-foreground hover:text-primary" />
                            </Button>

                            {/* Duplicate */}
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              disabled={isActionLoading}
                              className="h-7 w-7 p-0 hover:bg-muted/60"
                              onClick={() => handleDuplicatePlan(plan)}
                              title="Duplicate Plan"
                            >
                              <Copy className="h-3.5 w-3.5 text-muted-foreground hover:text-primary" />
                            </Button>

                            {/* Delete (DRAFT only) */}
                            {plan.status === "DRAFT" && (
                              <Button 
                                variant="ghost" 
                                size="icon" 
                                disabled={isActionLoading}
                                className="h-7 w-7 p-0 text-destructive hover:bg-destructive/10"
                                onClick={() => handleDeletePlan(plan)}
                                title="Delete Plan"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>

            {/* Pagination Controls Footer */}
            {!loadingPlans && plans.length > 0 && (
              <div className="border-t border-border/60 bg-card/60 px-4 py-3 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
                {/* Left: Summary info & Page size selector */}
                <div className="flex flex-wrap items-center gap-3 text-muted-foreground w-full sm:w-auto justify-between sm:justify-start">
                  <span>
                    Showing <span className="font-bold text-foreground font-mono-data">{(safeCurrentPage - 1) * pageSize + 1}</span> to{" "}
                    <span className="font-bold text-foreground font-mono-data">{Math.min(safeCurrentPage * pageSize, totalItems)}</span> of{" "}
                    <span className="font-bold text-primary font-mono-data">{totalItems}</span> visits
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

                    {/* Page Numbers */}
                    <div className="hidden md:flex items-center gap-1">
                      {getPaginationNumbers(safeCurrentPage, totalPages).map((pNum, idx) => {
                        if (pNum === "...") {
                          return (
                            <span key={`ellipsis-${idx}`} className="px-1 text-muted-foreground text-xs">
                              ...
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
                              "h-7 w-7 text-xs font-mono-data",
                              isCurrent
                                ? "bg-primary text-primary-foreground font-bold shadow-sm"
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
        </TabsContent>

        {/* TAB 2: PLANNED VS ACTUAL ANALYTICS */}
        <TabsContent value="analytics" className="space-y-4">
          {/* Controls bar */}
          <Card className="border border-border/50 bg-card/40 p-4 shadow-sm">
            <div className="flex flex-wrap gap-3 items-end">
              {/* Field Officer */}
              <div className="space-y-1 text-left w-48">
                <Label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block h-4">Field Officer</Label>
                <Select
                  value={pvaOfficerOid ? String(pvaOfficerOid) : ""}
                  onValueChange={v => setPvaOfficerOid(Number(v))}
                  disabled={loadingOfficers}
                >
                  <SelectTrigger className="h-8 text-xs border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm">
                    <SelectValue placeholder="Select Officer" />
                  </SelectTrigger>
                  <SelectContent>
                    {officersList.map(o => (
                      <SelectItem key={o.oid} value={String(o.oid)}>
                        {o.name} ({o.emp_code || `EMP${o.oid}`})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Planning Period */}
              <div className="space-y-1 text-left w-36">
                <Label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block h-4">Planning Period</Label>
                <Select value={pvaPeriod} onValueChange={setPvaPeriod}>
                  <SelectTrigger className="h-8 text-xs border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm">
                    <SelectValue placeholder="Period" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="weekly">Weekly</SelectItem>
                    <SelectItem value="monthly">Monthly</SelectItem>
                    <SelectItem value="single">Single Day</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Reference Date */}
              <div className="space-y-1 text-left w-36">
                <Label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block h-4">Reference Date</Label>
                <Input
                  type="date"
                  value={pvaDate}
                  onChange={e => setPvaDate(e.target.value)}
                  className="h-8 text-xs border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm"
                />
              </div>

              {/* Refresh Button */}
              <Button
                variant="outline"
                size="sm"
                onClick={fetchPlannedVsActual}
                disabled={loadingPva || !pvaOfficerOid}
                className="btn-white-fill h-8 gap-1.5 text-xs rounded-md"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${loadingPva ? "animate-spin" : ""}`} />
                Reload Analytics
              </Button>
            </div>
          </Card>

          {/* Error Alert */}
          {pvaError && (
            <Card className="border-red-500/30 bg-red-500/5 p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs text-red-600 dark:text-red-400 font-medium">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  <span>{pvaError}</span>
                </div>
                <Button size="sm" variant="outline" onClick={fetchPlannedVsActual} className="h-7 text-xs border-red-500/30">
                  Retry
                </Button>
              </div>
            </Card>
          )}

          {/* Main Analytics Content */}
          {loadingPva ? (
            <Card className="p-12 text-center text-sm text-muted-foreground flex flex-col items-center justify-center gap-2">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
              <span>Fetching planned vs actual visit metrics from server...</span>
            </Card>
          ) : pvaData ? (
            <>
              {/* Summary KPI Strip */}
              {(() => {
                const planned = pvaData.total_planned;
                const actual = pvaData.total_actual;
                const completed = Math.min(actual, planned);
                const remaining = Math.max(0, planned - actual);
                const rate = planned > 0 ? Math.round((completed / planned) * 100) : 0;

                return (
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                    {[
                      { label: "Total Planned", value: planned, icon: CalendarIcon, color: "text-blue-600 dark:text-blue-400" },
                      { label: "Actual Visits", value: actual, icon: Eye, color: "text-violet-600 dark:text-violet-400" },
                      { label: "Completed Visits", value: completed, icon: CheckCircle2, color: "text-emerald-600 dark:text-emerald-400" },
                      { label: "Remaining Visits", value: remaining, icon: Clock, color: "text-amber-600 dark:text-amber-400" },
                      { label: "Completion Rate", value: `${rate}%`, icon: BarChart3, color: "text-sky-600 dark:text-sky-400" },
                    ].map(m => (
                      <Card key={m.label} className="border-border shadow-sm">
                        <CardContent className="p-3 flex items-center gap-3">
                          <div className={`h-8 w-8 rounded-lg bg-muted flex items-center justify-center shrink-0 ${m.color}`}>
                            <m.icon className="h-4 w-4" />
                          </div>
                          <div>
                            <div className="text-[9px] font-bold text-muted-foreground tracking-wider leading-tight">{m.label}</div>
                            <div className="text-lg font-extrabold font-mono-data">{m.value}</div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                );
              })()}

              {/* Site-Level Comparison Table */}
              <Card className="border border-border/60 overflow-hidden shadow-sm">
                <CardContent className="p-0">
                  <Table>
                    <TableHeader className="bg-muted/40">
                      <TableRow>
                        <TableHead className="text-xs font-bold text-left px-4 py-3">Site Location</TableHead>
                        <TableHead className="text-xs font-bold text-center px-4 py-3">Planned Target</TableHead>
                        <TableHead className="text-xs font-bold text-center px-4 py-3">Actual Sessions</TableHead>
                        <TableHead className="text-xs font-bold text-center px-4 py-3">Completed</TableHead>
                        <TableHead className="text-xs font-bold text-center px-4 py-3">Remaining</TableHead>
                        <TableHead className="text-xs font-bold text-left px-4 py-3 w-48">Progress</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pvaData.sites.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={6} className="text-center text-xs text-muted-foreground py-10">
                            No planned site visits found for officer in this {pvaPeriod} period.
                          </TableCell>
                        </TableRow>
                      ) : (
                        pvaData.sites.map(s => {
                          const rate = s.planned > 0 ? Math.min(100, Math.round((s.completed / s.planned) * 100)) : 0;
                          return (
                            <TableRow key={s.site_oid} className="hover:bg-muted/10 transition-colors">
                              <TableCell className="text-xs font-semibold px-4 py-3">
                                <div className="flex items-center gap-1.5 text-primary">
                                  <Building2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                                  <span>{s.site_name}</span>
                                </div>
                              </TableCell>
                              <TableCell className="text-xs font-bold text-center px-4 py-3">
                                <span className="bg-primary/5 px-2.5 py-1 rounded-lg border text-primary inline-block">
                                  {s.planned}
                                </span>
                              </TableCell>
                              <TableCell className="text-xs font-bold text-center px-4 py-3 text-violet-600 dark:text-violet-400">
                                {s.actual}
                              </TableCell>
                              <TableCell className="text-xs font-bold text-center px-4 py-3 text-emerald-600 dark:text-emerald-400">
                                {s.completed}
                              </TableCell>
                              <TableCell className="text-xs font-bold text-center px-4 py-3 text-amber-600 dark:text-amber-400">
                                {s.remaining}
                              </TableCell>
                              <TableCell className="px-4 py-3">
                                <div className="space-y-1">
                                  <div className="flex items-center justify-between text-[10px] font-bold">
                                    <span className="text-muted-foreground">Completion</span>
                                    <span className="font-mono-data">{rate}%</span>
                                  </div>
                                  <Progress value={rate} className="h-1.5" />
                                </div>
                              </TableCell>
                            </TableRow>
                          );
                        })
                      )}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </>
          ) : (
            <Card className="p-8 text-center text-xs text-muted-foreground">
              Select a Field Officer to view planned vs actual analytics.
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {/* Centered Details Modal Card */}
      <Dialog open={isDetailsOpen} onOpenChange={setIsDetailsOpen}>
        <DialogContent className="max-w-[750px] max-h-[85vh] overflow-y-auto custom-scrollbar">
          {loadingDetails ? (
            <div className="py-12 text-center text-sm text-muted-foreground flex items-center justify-center gap-2">
              <Loader2 className="h-5 w-5 animate-spin text-primary" /> Fetching plan details...
            </div>
          ) : selectedPlanDetails ? (
            <div className="space-y-5">
              {/* Header */}
              <DialogHeader className="border-b pb-3">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-muted-foreground font-mono-data tracking-wider uppercase">
                    Plan Code: {selectedPlanDetails.plan_code}
                  </span>
                  <Badge 
                    variant="outline" 
                    className={
                      selectedPlanDetails.status === "PUBLISHED"
                        ? "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20 font-bold text-[11px]"
                        : "bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20 font-bold text-[11px]"
                    }
                  >
                    {selectedPlanDetails.status}
                  </Badge>
                </div>
                <DialogTitle className="text-lg font-bold text-primary mt-2 flex items-center gap-2">
                  <CalendarIcon className="h-4 w-4 text-primary/70 shrink-0" />
                  <span>{formatPeriodDisplay(selectedPlanDetails)}</span>
                </DialogTitle>
                <DialogDescription className="text-xs">
                  Verify planned site route, visit frequencies, and execution progress for this schedule period.
                </DialogDescription>
              </DialogHeader>

              {/* Basic Details */}
              <div className="space-y-2">
                <span className="text-[10px] font-bold text-muted-foreground uppercase block">Basic Details</span>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3 bg-muted/10 p-3.5 rounded-xl border text-xs">
                  <div>
                    <span className="text-[10px] font-bold text-muted-foreground block uppercase">Planning Type</span>
                    <span className="font-semibold text-primary">
                      {selectedPlanDetails.planning_type === "WEEKLY" ? "Weekly" : selectedPlanDetails.planning_type === "MONTHLY" ? "Monthly" : "Single"}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-muted-foreground block uppercase">Assigned Officer</span>
                    <span className="font-semibold text-primary">{selectedPlanDetails.field_officer_name || "Unassigned"}</span>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-muted-foreground block uppercase">Planned By</span>
                    {selectedPlanDetails.plan_creator_type === "MANAGER" ? (
                      <span className="font-semibold text-indigo-600 dark:text-indigo-400">
                        {selectedPlanDetails.creator_name || "Manager Planned"}
                      </span>
                    ) : (
                      <span className="font-semibold text-amber-600 dark:text-amber-500">
                        Self Planned
                      </span>
                    )}
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-muted-foreground block uppercase">Total Sites</span>
                    <span className="font-semibold text-primary">{selectedPlanDetails.total_sites} {selectedPlanDetails.total_sites === 1 ? "Site" : "Sites"}</span>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-muted-foreground block uppercase">Total Planned Visits</span>
                    <span className="font-semibold text-primary">{selectedPlanDetails.total_visits} {selectedPlanDetails.total_visits === 1 ? "Visit" : "Visits"}</span>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-muted-foreground block uppercase">Visits Done</span>
                    <span className="font-semibold text-emerald-600 dark:text-emerald-400">{selectedPlanDetails.visits_done} {selectedPlanDetails.visits_done === 1 ? "Visit" : "Visits"}</span>
                  </div>
                </div>
              </div>

              {/* Planned Sites Route */}
              <div className="space-y-2">
                <span className="text-[10px] font-bold text-muted-foreground uppercase block">
                  Planned Sites Route ({selectedPlanDetails.sites.length + (selectedPlanDetails.custom_visits?.length || 0)})
                </span>
                <div className="border rounded-xl overflow-hidden">
                  <Table>
                    <TableHeader className="bg-muted/40">
                      <TableRow>
                        <TableHead className="text-xs font-bold">Site Location</TableHead>
                        <TableHead className="text-xs font-bold text-center">Visit Frequency</TableHead>
                        <TableHead className="text-xs font-bold text-center">Visits Done</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {selectedPlanDetails.sites.length === 0 && (!selectedPlanDetails.custom_visits || selectedPlanDetails.custom_visits.length === 0) ? (
                        <TableRow>
                          <TableCell colSpan={3} className="text-center text-xs text-muted-foreground py-6">
                            No site configurations added to this plan yet.
                          </TableCell>
                        </TableRow>
                      ) : (
                        <>
                          {selectedPlanDetails.sites.map((site) => (
                            <TableRow key={`reg-${site.frequency_oid}`}>
                              <TableCell className="text-xs">
                                <div className="flex flex-col gap-0.5">
                                  <span className="font-bold text-primary flex items-center gap-1">
                                    <MapPin className="h-3.5 w-3.5 text-accent/80" /> {site.site_name}
                                  </span>
                                  <span className="text-[10px] text-muted-foreground pl-4.5">
                                    {site.client_name || "N/A"} — {site.branch_name || "N/A"}
                                  </span>
                                </div>
                              </TableCell>
                              <TableCell className="text-xs font-bold text-center text-foreground/80">
                                {site.visit_frequency} {selectedPlanDetails.planning_type === "WEEKLY" ? "per Week" : selectedPlanDetails.planning_type === "MONTHLY" ? "per Month" : "Visit"}
                              </TableCell>
                              <TableCell className="text-xs font-bold text-center text-emerald-600 dark:text-emerald-400">
                                {site.visits_done} Visit{site.visits_done !== 1 ? "s" : ""}
                              </TableCell>
                            </TableRow>
                          ))}
                          {selectedPlanDetails.custom_visits?.map((cv) => (
                            <TableRow key={`custom-${cv.oid}`}>
                              <TableCell className="text-xs">
                                <div className="flex flex-col gap-0.5">
                                  <span className="font-bold text-primary flex items-center gap-1">
                                    <MapPin className="h-3.5 w-3.5 text-emerald-600" /> {cv.site_name}
                                    <Badge variant="outline" className="text-[9px] bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-800 ml-1 py-0 px-1.5 font-bold">
                                      New Client Visit
                                    </Badge>
                                  </span>
                                  <span className="text-[10px] text-muted-foreground pl-4.5">
                                    {cv.client_name} {cv.branch_name ? `— ${cv.branch_name}` : ""}
                                    {cv.address ? ` • ${cv.address}` : ""}
                                    {cv.latitude !== null && cv.latitude !== undefined && cv.longitude !== null && cv.longitude !== undefined ? ` • GPS: ${cv.latitude}, ${cv.longitude}` : ""}
                                  </span>
                                </div>
                              </TableCell>
                              <TableCell className="text-xs font-bold text-center text-foreground/80">
                                {cv.visit_frequency} {selectedPlanDetails.planning_type === "WEEKLY" ? "per Week" : selectedPlanDetails.planning_type === "MONTHLY" ? "per Month" : "Visit"}
                              </TableCell>
                              <TableCell className="text-xs font-bold text-center text-muted-foreground">
                                —
                              </TableCell>
                            </TableRow>
                          ))}
                        </>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </div>

              {/* Footer */}
              <DialogFooter className="border-t pt-3">
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => setIsDetailsOpen(false)}
                >
                  Close
                </Button>
                <Button 
                  size="sm" 
                  className="bg-[#3B82F6] hover:bg-[#2563EB] text-white font-semibold flex items-center gap-1.5"
                  onClick={() => {
                    setIsDetailsOpen(false);
                    handleEditPlan(selectedPlanDetails);
                  }}
                >
                  <Edit className="h-3.5 w-3.5" /> Edit Plan
                </Button>
              </DialogFooter>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
