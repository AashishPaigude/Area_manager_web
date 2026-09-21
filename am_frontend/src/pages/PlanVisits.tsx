import React, { useState, useEffect, useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { 
  ChevronRight, 
  Calendar, 
  Sparkles, 
  MapPin, 
  Plus, 
  Trash2, 
  Eye, 
  CheckCircle,
  Edit,
  Loader2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

import {
  FieldOfficer,
  Branch,
  Client,
  SiteItem,
  ConfiguredSiteItem,
  getFieldOfficers,
  getBranches,
  getClients,
  getSites,
  createPlan,
  updatePlanHeader,
  addSiteToPlan,
  updateSiteFrequency,
  removeSiteFromPlan,
  publishPlan,
  unpublishPlan,
  deletePlan,
} from "@/services/visitService";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

export default function PlanVisits() {
  const location = useLocation();
  const copiedPlan = location.state?.copiedPlan;

  // Master Data States
  const [officersList, setOfficersList] = useState<FieldOfficer[]>([]);
  const [branchesList, setBranchesList] = useState<Branch[]>([]);
  const [clientsList, setClientsList] = useState<Client[]>([]);
  const [sitesList, setSitesList] = useState<SiteItem[]>([]);

  const navigate = useNavigate();

  const [loadingOfficers, setLoadingOfficers] = useState(true);
  const [loadingBranches, setLoadingBranches] = useState(true);
  const [loadingClients, setLoadingClients] = useState(true);
  const [loadingSites, setLoadingSites] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Period scope selection ("weekly" | "monthly" | "single")
  const [planningPeriod, setPlanningPeriod] = useState<"weekly" | "monthly" | "single">(() => {
    if (copiedPlan) {
      const typeLower = (copiedPlan.planning_type || copiedPlan.planningType || "").toLowerCase();
      if (typeLower === "single") return "single";
      if (typeLower === "monthly") return "monthly";
      if (typeLower === "weekly") return "weekly";
    }
    return "weekly";
  });
  const [selectedMethod, setSelectedMethod] = useState<"manual" | "auto">("manual");

  // Period Details States
  // Weekly
  const [weekStartDate, setWeekStartDate] = useState<string>(() => copiedPlan?.week_start_date || "2026-08-17");
  const [weekEndDate, setWeekEndDate] = useState<string>(() => copiedPlan?.week_end_date || "2026-08-23");
  
  // Monthly
  const [month, setMonth] = useState<string>(() => {
    if (copiedPlan?.planning_month) {
      return MONTH_NAMES[copiedPlan.planning_month - 1] || "August";
    }
    return "August";
  });
  const [year, setYear] = useState<string>(() => (copiedPlan?.planning_year ? copiedPlan.planning_year.toString() : "2026"));

  // Single
  const [visitDate, setVisitDate] = useState<string>(() => copiedPlan?.visit_date || "2026-08-20");

  // Selected Officer OID & Plan state
  const [selectedOfficerOid, setSelectedOfficerOid] = useState<number | null>(() => copiedPlan?.employee_oid || null);
  const [currentPlanOid, setCurrentPlanOid] = useState<number | null>(() => copiedPlan?.oid || null);
  const [planCode, setPlanCode] = useState<string | null>(() => copiedPlan?.plan_code || null);
  const [planStatus, setPlanStatus] = useState<"DRAFT" | "PUBLISHED" | null>(() => (copiedPlan?.status as any) || null);

  // Configured Sites list state
  const [siteVisits, setSiteVisits] = useState<ConfiguredSiteItem[]>(() => copiedPlan?.sites || []);

  // Inline Site Add/Edit form state
  const [showAddCard, setShowAddCard] = useState(false);
  const [editingFrequencyOid, setEditingFrequencyOid] = useState<number | null>(null);
  
  // Form Card States (Dropdown selections)
  const [formBranchOid, setFormBranchOid] = useState<number | null>(null);
  const [formClientOid, setFormClientOid] = useState<number | null>(null);
  const [formSiteOid, setFormSiteOid] = useState<number | null>(null);
  const [formSiteFrequency, setFormSiteFrequency] = useState("3");

  // Preview Modal
  const [showPreviewModal, setShowPreviewModal] = useState(false);

  // Synchronize state if copiedPlan is passed via router location state
  useEffect(() => {
    if (copiedPlan) {
      const typeLower = (copiedPlan.planning_type || copiedPlan.planningType || "").toLowerCase();
      if (typeLower === "single") setPlanningPeriod("single");
      else if (typeLower === "monthly") setPlanningPeriod("monthly");
      else if (typeLower === "weekly") setPlanningPeriod("weekly");

      if (copiedPlan.week_start_date) setWeekStartDate(copiedPlan.week_start_date);
      if (copiedPlan.week_end_date) setWeekEndDate(copiedPlan.week_end_date);
      if (copiedPlan.planning_month) setMonth(MONTH_NAMES[copiedPlan.planning_month - 1] || "August");
      if (copiedPlan.planning_year) setYear(copiedPlan.planning_year.toString());
      if (copiedPlan.visit_date) setVisitDate(copiedPlan.visit_date);
      if (copiedPlan.employee_oid) setSelectedOfficerOid(copiedPlan.employee_oid);
      if (copiedPlan.oid) setCurrentPlanOid(copiedPlan.oid);
      if (copiedPlan.plan_code) setPlanCode(copiedPlan.plan_code);
      if (copiedPlan.status) setPlanStatus(copiedPlan.status as "DRAFT" | "PUBLISHED");
      if (copiedPlan.sites && Array.isArray(copiedPlan.sites)) setSiteVisits(copiedPlan.sites);
    }
  }, [copiedPlan]);

  // Load Field Officers, Branches, Clients on Mount
  useEffect(() => {
    const fetchMasterData = async () => {
      try {
        setLoadingOfficers(true);
        const officers = await getFieldOfficers();
        setOfficersList(officers);
        if (officers.length > 0 && !selectedOfficerOid) {
          setSelectedOfficerOid(officers[0].oid);
        }
      } catch (err: any) {
        toast.error(`Failed to load Field Officers: ${err.message}`);
      } finally {
        setLoadingOfficers(false);
      }

      try {
        setLoadingBranches(true);
        const branches = await getBranches();
        setBranchesList(branches);
      } catch (err: any) {
        toast.error(`Failed to load Branches: ${err.message}`);
      } finally {
        setLoadingBranches(false);
      }

      try {
        setLoadingClients(true);
        const clients = await getClients();
        setClientsList(clients);
      } catch (err: any) {
        toast.error(`Failed to load Clients: ${err.message}`);
      } finally {
        setLoadingClients(false);
      }
    };

    fetchMasterData();
  }, []);

  // Fetch Sites when Branch or Client changes
  useEffect(() => {
    if (!formBranchOid && !formClientOid) {
      setSitesList([]);
      return;
    }

    const fetchSitesData = async () => {
      try {
        setLoadingSites(true);
        const sites = await getSites(formBranchOid, formClientOid);
        setSitesList(sites);
      } catch (err: any) {
        toast.error(`Failed to load Sites: ${err.message}`);
      } finally {
        setLoadingSites(false);
      }
    };

    fetchSitesData();
  }, [formBranchOid, formClientOid]);

  // Handle Planning Period Switch (Reset inactive fields)
  const handlePeriodSwitch = (period: "weekly" | "monthly" | "single") => {
    setPlanningPeriod(period);

    if (period === "weekly") {
      setMonth("");
      setYear("");
      setVisitDate("");
      if (!weekStartDate) setWeekStartDate("2026-08-17");
      if (!weekEndDate) setWeekEndDate("2026-08-23");
    } else if (period === "monthly") {
      setWeekStartDate("");
      setWeekEndDate("");
      setVisitDate("");
      if (!month) setMonth("August");
      if (!year) setYear("2026");
    } else if (period === "single") {
      setWeekStartDate("");
      setWeekEndDate("");
      setMonth("");
      setYear("");
      if (!visitDate) setVisitDate("2026-08-20");
    }
  };

  // Helper to ensure a DRAFT plan is created or updated on backend
  const ensureDraftPlanCreated = async (): Promise<number> => {
    if (!selectedOfficerOid) {
      throw new Error("Please select a primary Field Officer");
    }

    if (planningPeriod === "weekly") {
      if (!weekStartDate || !weekEndDate) {
        throw new Error("Please select both Week Start Date and Week End Date");
      }
      if (weekStartDate > weekEndDate) {
        throw new Error("Week Start Date must be on or before Week End Date");
      }
    } else if (planningPeriod === "monthly") {
      if (!month || !year) {
        throw new Error("Please select both Month and Year");
      }
    } else if (planningPeriod === "single") {
      if (!visitDate) {
        throw new Error("Please select a Visit Date for Single Visit");
      }
    }

    const monthIndex = MONTH_NAMES.indexOf(month) + 1;
    const payload = {
      planning_type: (planningPeriod.toUpperCase()) as "WEEKLY" | "MONTHLY" | "SINGLE",
      week_start_date: planningPeriod === "weekly" ? weekStartDate : undefined,
      week_end_date: planningPeriod === "weekly" ? weekEndDate : undefined,
      planning_month: planningPeriod === "monthly" ? (monthIndex > 0 ? monthIndex : 8) : undefined,
      planning_year: planningPeriod === "monthly" ? parseInt(year) || 2026 : undefined,
      visit_date: planningPeriod === "single" ? visitDate : undefined,
      employee_oid: selectedOfficerOid,
      planning_method: "MANUAL" as const,
    };

    if (currentPlanOid) {
      const updatedPlan = await updatePlanHeader(currentPlanOid, payload);
      setPlanCode(updatedPlan.plan_code);
      setPlanStatus(updatedPlan.status as "DRAFT" | "PUBLISHED");
      return updatedPlan.oid;
    } else {
      const newPlan = await createPlan(payload);
      setCurrentPlanOid(newPlan.oid);
      setPlanCode(newPlan.plan_code);
      setPlanStatus(newPlan.status as "DRAFT" | "PUBLISHED");
      toast.info(`Draft plan ${newPlan.plan_code} initialized`);
      return newPlan.oid;
    }
  };

  // Save changes from Add/Edit Inline Form Card
  const handleSaveSiteCard = async () => {
    if (!formBranchOid) {
      toast.error("Please select a Branch");
      return;
    }
    if (!formClientOid) {
      toast.error("Please select a Client");
      return;
    }
    if (!formSiteOid) {
      toast.error("Please select a Site");
      return;
    }

    const freq = planningPeriod === "single" ? 1 : (parseInt(formSiteFrequency) || 1);
    if (freq <= 0) {
      toast.error("Visit frequency must be a positive number greater than 0");
      return;
    }

    try {
      setIsSubmitting(true);
      const planOid = await ensureDraftPlanCreated();

      if (editingFrequencyOid) {
        // Edit Mode
        const updated = await updateSiteFrequency(planOid, editingFrequencyOid, { visit_frequency: freq });
        setSiteVisits(prev => prev.map(item => item.frequency_oid === editingFrequencyOid ? updated : item));
        setEditingFrequencyOid(null);
        toast.success("Site visit frequency updated successfully");
      } else {
        // Add Mode
        const added = await addSiteToPlan(planOid, { site_oid: formSiteOid, visit_frequency: freq });
        setSiteVisits(prev => [...prev, added]);
        setShowAddCard(false);
        toast.success(`Site '${added.site_name}' added to plan`);
      }

      // Reset inputs
      setFormSiteOid(null);
      setFormSiteFrequency("3");
    } catch (err: any) {
      toast.error(err.message || "Failed to save site configuration");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Remove Site Card
  const handleRemoveSite = async (frequencyOid: number) => {
    if (!currentPlanOid) return;
    try {
      setIsSubmitting(true);
      await removeSiteFromPlan(currentPlanOid, frequencyOid);
      setSiteVisits(prev => prev.filter(item => item.frequency_oid !== frequencyOid));
      toast.success("Site configuration removed from plan");
    } catch (err: any) {
      toast.error(err.message || "Failed to remove site configuration");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Formatted date range for weekly period
  const formattedWeekRange = useMemo(() => {
    if (!weekStartDate || !weekEndDate) return "";
    try {
      const start = new Date(weekStartDate);
      const end = new Date(weekEndDate);
      const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      return `${start.getDate()} ${months[start.getMonth()]} – ${end.getDate()} ${months[end.getMonth()]}`;
    } catch {
      return `${weekStartDate} – ${weekEndDate}`;
    }
  }, [weekStartDate, weekEndDate]);

  // Formatted Single Visit Date
  const formattedSingleDate = useMemo(() => {
    if (!visitDate) return "";
    try {
      const d = new Date(visitDate);
      const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
    } catch {
      return visitDate;
    }
  }, [visitDate]);

  // Form Publish Validation & Action
  const handlePublishPlan = async () => {
    if (!selectedOfficerOid) {
      toast.error("Please assign a primary Field Officer");
      return;
    }
    if (siteVisits.length === 0) {
      toast.error("Please configure at least one planned site visit requirement");
      return;
    }

    try {
      setIsSubmitting(true);
      const planOid = await ensureDraftPlanCreated();
      const published = await publishPlan(planOid);
      setPlanStatus("PUBLISHED");
      setShowPreviewModal(false);
      toast.success(`Visit Plan ${published.plan_code} published and broadcasted to officer!`);
    } catch (err: any) {
      toast.error(err.message || "Failed to publish visit plan");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle plan deletion when in edit/draft phase
  const handleDeleteCurrentPlan = async () => {
    if (!currentPlanOid) return;
    if (confirm(`Are you sure you want to delete planned visit schedule ${planCode || ""}?`)) {
      try {
        setIsSubmitting(true);
        await deletePlan(currentPlanOid);
        toast.success(`Visit plan ${planCode || ""} deleted successfully`);
        navigate("/visit-planning/planned");
      } catch (err: any) {
        toast.error(err.message || "Failed to delete visit plan");
      } finally {
        setIsSubmitting(false);
      }
    }
  };

  const selectedOfficerName = useMemo(() => {
    const found = officersList.find(o => o.oid === selectedOfficerOid);
    return found ? found.name : "Unassigned";
  }, [officersList, selectedOfficerOid]);

  return (
    <div className="space-y-6 max-w-[1400px] mx-auto pb-16">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-xs text-muted-foreground font-semibold">
        <span className="flex items-center gap-1 text-muted-foreground/80">
          <Calendar className="h-3.5 w-3.5" /> Visit Planning
        </span>
        <ChevronRight className="h-3 w-3" />
        <span className="text-foreground font-semibold">Plan Visits</span>
      </nav>

      {/* Header */}
      <div className="flex flex-col gap-1 border-b border-border/60 pb-5">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold tracking-tight">Plan Visits</h1>
          {planCode && (
            <Badge variant="outline" className="text-xs font-bold px-3 py-1 bg-primary/5 text-primary border-primary/20">
              {planCode} ({planStatus})
            </Badge>
          )}
        </div>
        <p className="text-sm text-muted-foreground">Create weekly, monthly, and single visit schedules for your assigned field officers.</p>
      </div>

      {/* 1. Plan Configurations */}
      <Card className="border border-border/80 bg-white dark:bg-card shadow-sm">
        <CardHeader className="pb-3 border-b border-border/40">
          <CardTitle className="text-base font-semibold text-primary">1. Plan Configurations</CardTitle>
          <CardDescription className="text-xs">Define plan metadata, scheduling scope, and assign officer responsibilities.</CardDescription>
        </CardHeader>
        <CardContent className="pt-4 space-y-4">
          {/* Row 1: Planning Period Selection & Details (Grid) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-foreground/85">Planning Period *</Label>
              <div className="inline-flex p-1 bg-muted/60 dark:bg-muted/30 rounded-xl border border-border/60 w-full">
                <button 
                  type="button"
                  disabled={planStatus === "PUBLISHED"}
                  onClick={() => handlePeriodSwitch("weekly")}
                  className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                    planningPeriod === "weekly" 
                      ? "bg-[#3B82F6]/10 text-[#3B82F6] shadow-sm font-extrabold" 
                      : "text-muted-foreground hover:text-foreground font-semibold"
                  }`}
                >
                  Weekly Plan
                </button>
                <button 
                  type="button"
                  disabled={planStatus === "PUBLISHED"}
                  onClick={() => handlePeriodSwitch("monthly")}
                  className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                    planningPeriod === "monthly" 
                      ? "bg-[#3B82F6]/10 text-[#3B82F6] shadow-sm font-extrabold" 
                      : "text-muted-foreground hover:text-foreground font-semibold"
                  }`}
                >
                  Monthly Plan
                </button>
                <button 
                  type="button"
                  disabled={planStatus === "PUBLISHED"}
                  onClick={() => handlePeriodSwitch("single")}
                  className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                    planningPeriod === "single" 
                      ? "bg-[#3B82F6]/10 text-[#3B82F6] shadow-sm font-extrabold" 
                      : "text-muted-foreground hover:text-foreground font-semibold"
                  }`}
                >
                  Single Visit
                </button>
              </div>
            </div>

            {/* Dynamic Period details */}
            <div className="space-y-1.5">
              {planningPeriod === "weekly" ? (
                <div className="grid grid-cols-2 gap-3 animate-in fade-in duration-100">
                  <div className="space-y-1.5">
                    <Label className="text-[10px] font-bold text-muted-foreground uppercase">Week Start Date *</Label>
                    <Input 
                      type="date" 
                      value={weekStartDate} 
                      disabled={planStatus === "PUBLISHED"}
                      onChange={(e) => setWeekStartDate(e.target.value)} 
                      className="h-9 text-xs bg-white dark:bg-muted/40 border-input shadow-xs font-medium" 
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[10px] font-bold text-muted-foreground uppercase">Week End Date *</Label>
                    <Input 
                      type="date" 
                      value={weekEndDate} 
                      disabled={planStatus === "PUBLISHED"}
                      onChange={(e) => setWeekEndDate(e.target.value)} 
                      className="h-9 text-xs bg-white dark:bg-muted/40 border-input shadow-xs font-medium" 
                    />
                  </div>
                </div>
              ) : planningPeriod === "monthly" ? (
                <div className="grid grid-cols-2 gap-3 animate-in fade-in duration-100">
                  <div className="space-y-1.5">
                    <Label className="text-[10px] font-bold text-muted-foreground uppercase">Month *</Label>
                    <Select value={month} onValueChange={setMonth} disabled={planStatus === "PUBLISHED"}>
                      <SelectTrigger className="h-9 text-xs bg-white dark:bg-muted/40 border-input shadow-xs font-medium">
                        <SelectValue placeholder="Select Month" />
                      </SelectTrigger>
                      <SelectContent className="bg-white dark:bg-popover">
                        {MONTH_NAMES.map(m => (
                          <SelectItem key={m} value={m}>{m}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[10px] font-bold text-muted-foreground uppercase">Year *</Label>
                    <Select value={year} onValueChange={setYear} disabled={planStatus === "PUBLISHED"}>
                      <SelectTrigger className="h-9 text-xs bg-white dark:bg-muted/40 border-input shadow-xs font-medium">
                        <SelectValue placeholder="Select Year" />
                      </SelectTrigger>
                      <SelectContent className="bg-white dark:bg-popover">
                        {["2026", "2027", "2028"].map(y => (
                          <SelectItem key={y} value={y}>{y}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-3 animate-in fade-in duration-100">
                  <div className="space-y-1.5">
                    <Label className="text-[10px] font-bold text-muted-foreground uppercase">Visit Date *</Label>
                    <Input 
                      type="date" 
                      value={visitDate} 
                      disabled={planStatus === "PUBLISHED"}
                      onChange={(e) => setVisitDate(e.target.value)} 
                      className="h-9 text-xs bg-white dark:bg-muted/40 border-input shadow-xs font-medium" 
                    />
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Row 3: Staff Assignment & Method selector */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-t border-border/20 pt-4">
            <div className="space-y-1.5">
              <Label htmlFor="officer" className="text-xs font-bold text-foreground/85">Primary Field Officer *</Label>
              <Select 
                value={selectedOfficerOid ? selectedOfficerOid.toString() : ""} 
                onValueChange={(val) => setSelectedOfficerOid(parseInt(val))}
                disabled={loadingOfficers || planStatus === "PUBLISHED"}
              >
                <SelectTrigger id="officer" className="h-9 text-sm bg-white dark:bg-muted/40 border-input shadow-xs font-medium">
                  <SelectValue placeholder={loadingOfficers ? "Loading Field Officers..." : "Select Field Officer"} />
                </SelectTrigger>
                <SelectContent className="bg-white dark:bg-popover">
                  {officersList.map(o => (
                    <SelectItem key={o.oid} value={o.oid.toString()}>
                      {o.name} {o.emp_code ? `(${o.emp_code})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-foreground/85">Planning Method *</Label>
              <div className="inline-flex p-1 bg-muted/60 dark:bg-muted/30 rounded-xl border border-border/60 w-full">
                <button 
                  type="button"
                  onClick={() => setSelectedMethod("manual")} 
                  className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                    selectedMethod === "manual" 
                      ? "bg-[#3B82F6]/10 text-[#3B82F6] shadow-sm font-extrabold" 
                      : "text-muted-foreground hover:text-foreground font-semibold"
                  }`}
                >
                  Manual Planning
                </button>
                <button 
                  type="button"
                  onClick={() => setSelectedMethod("auto")} 
                  className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                    selectedMethod === "auto" 
                      ? "bg-[#3B82F6]/10 text-[#3B82F6] shadow-sm font-extrabold" 
                      : "text-muted-foreground hover:text-foreground font-semibold"
                  }`}
                >
                  Auto Generate
                </button>
              </div>
            </div>
          </div>

        </CardContent>
      </Card>

      {/* Conditionally Display Panel based on selection */}
      {selectedMethod === "auto" ? (
        <Card className="border border-border/80 bg-white dark:bg-card shadow-sm p-6 overflow-hidden relative animate-in fade-in">
          <div className="absolute right-0 top-0 translate-x-1/4 -translate-y-1/4 opacity-10 pointer-events-none">
            <Sparkles className="h-64 w-64 text-accent" />
          </div>
          <div className="flex gap-4 items-start">
            <div className="p-3 bg-accent/10 rounded-xl">
              <Sparkles className="h-6 w-6 text-accent" />
            </div>
            <div className="space-y-3 flex-1">
              <div className="space-y-1">
                <h3 className="text-lg font-bold tracking-tight text-primary">AI Visit Planner</h3>
                <p className="text-sm text-muted-foreground">
                  Automatic schedule generation will be available in a future update.
                </p>
              </div>
              <div className="pt-3 border-t border-border/50">
                <p className="text-xs font-semibold text-foreground/80 uppercase tracking-wider mb-2">
                  Future capabilities:
                </p>
                <ul className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2">
                  <li className="text-sm text-muted-foreground flex items-center gap-2">
                    <span className="text-accent">•</span> Intelligent officer allocation
                  </li>
                  <li className="text-sm text-muted-foreground flex items-center gap-2">
                    <span className="text-accent">•</span> Route optimization
                  </li>
                  <li className="text-sm text-muted-foreground flex items-center gap-2">
                    <span className="text-accent">•</span> Workload balancing
                  </li>
                  <li className="text-sm text-muted-foreground flex items-center gap-2">
                    <span className="text-accent">•</span> Conflict detection
                  </li>
                  <li className="text-sm text-muted-foreground flex items-center gap-2">
                    <span className="text-accent">•</span> Smart scheduling
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </Card>
      ) : (
        <div className="space-y-6 transition-all duration-300">

          {/* Section 2: Planned Site Visits */}
          <Card className="border border-border/80 bg-white dark:bg-card shadow-sm">
            <CardHeader className="pb-3 border-b border-border/40">
              <CardTitle className="text-base font-semibold text-primary">2. Planned Site Visits</CardTitle>
              <CardDescription className="text-xs">Configure branch, client, site, and visit frequency details.</CardDescription>
            </CardHeader>
            <CardContent className="pt-4 space-y-4 px-6 pb-6">
              
              {/* Add Site Button */}
              {planStatus !== "PUBLISHED" && (
                <Button 
                  variant="outline" 
                  size="sm"
                  disabled={isSubmitting}
                  className="h-9 text-xs border-[#3B82F6]/30 text-[#3B82F6] hover:bg-[#3B82F6]/5 font-semibold"
                  onClick={() => {
                    setEditingFrequencyOid(null);
                    setFormSiteOid(null);
                    setFormSiteFrequency(planningPeriod === "single" ? "1" : "3");
                    setShowAddCard(!showAddCard);
                  }}
                >
                  <Plus className="mr-1.5 h-3.5 w-3.5" /> Configure New Site
                </Button>
              )}

              {/* Inline Add Site Form Card */}
              {showAddCard && planStatus !== "PUBLISHED" && (
                <Card className="border border-border/80 bg-white dark:bg-card p-5 rounded-xl space-y-4 shadow-md animate-in slide-in-from-top-2 duration-200">
                  <div className="flex items-center justify-between border-b pb-2">
                    <h4 className="text-xs font-bold text-primary uppercase flex items-center gap-1.5">
                      <span>✨</span> Configure Site Frequency
                    </h4>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="space-y-1.5">
                      <Label className="text-[10px] font-bold text-muted-foreground uppercase">Branch *</Label>
                      <Select 
                        value={formBranchOid ? formBranchOid.toString() : ""} 
                        onValueChange={(val) => {
                          setFormBranchOid(parseInt(val));
                          setFormSiteOid(null);
                        }}
                        disabled={loadingBranches}
                      >
                        <SelectTrigger className="h-9 text-xs bg-white dark:bg-muted/40 border-input shadow-xs font-medium">
                          <SelectValue placeholder={loadingBranches ? "Loading..." : "Select Branch"} />
                        </SelectTrigger>
                        <SelectContent className="bg-white dark:bg-popover">
                          {branchesList.map(b => (
                            <SelectItem key={b.oid} value={b.oid.toString()}>{b.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-[10px] font-bold text-muted-foreground uppercase">Client *</Label>
                      <Select 
                        value={formClientOid ? formClientOid.toString() : ""} 
                        onValueChange={(val) => {
                          setFormClientOid(parseInt(val));
                          setFormSiteOid(null);
                        }}
                        disabled={loadingClients}
                      >
                        <SelectTrigger className="h-9 text-xs bg-white dark:bg-muted/40 border-input shadow-xs font-medium">
                          <SelectValue placeholder={loadingClients ? "Loading..." : "Select Client"} />
                        </SelectTrigger>
                        <SelectContent className="bg-white dark:bg-popover">
                          {clientsList.map(c => (
                            <SelectItem key={c.oid} value={c.oid.toString()}>{c.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-[10px] font-bold text-muted-foreground uppercase">Site *</Label>
                      <Select 
                        value={formSiteOid ? formSiteOid.toString() : ""} 
                        onValueChange={(val) => setFormSiteOid(parseInt(val))}
                        disabled={loadingSites || sitesList.length === 0}
                      >
                        <SelectTrigger className="h-9 text-xs bg-white dark:bg-muted/40 border-input shadow-xs font-medium">
                          <SelectValue placeholder={
                            loadingSites 
                              ? "Loading Sites..." 
                              : (!formBranchOid || !formClientOid)
                              ? "Select Branch & Client"
                              : sitesList.length === 0
                              ? "No Sites Found"
                              : "Select Site"
                          } />
                        </SelectTrigger>
                        <SelectContent className="bg-white dark:bg-popover">
                          {sitesList.map(s => (
                            <SelectItem key={s.oid} value={s.oid.toString()}>{s.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-[10px] font-bold text-muted-foreground uppercase">Visit Frequency</Label>
                      {planningPeriod === "single" ? (
                        <Input 
                          value="1 Visit" 
                          disabled 
                          className="h-9 text-xs bg-muted/40 font-bold text-primary"
                        />
                      ) : (
                        <Input 
                          type="number" 
                          min="1" 
                          value={formSiteFrequency} 
                          onChange={(e) => setFormSiteFrequency(e.target.value)} 
                          className="h-9 text-xs bg-white dark:bg-muted/40 border-input shadow-xs font-semibold text-foreground"
                        />
                      )}
                    </div>
                  </div>
                  <div className="flex justify-end gap-2 pt-2">
                    <Button 
                      variant="outline" 
                      size="sm" 
                      disabled={isSubmitting}
                      onClick={() => setShowAddCard(false)}
                    >
                      Cancel
                    </Button>
                    <Button 
                      size="sm" 
                      disabled={isSubmitting}
                      onClick={handleSaveSiteCard}
                      className="bg-[#3B82F6] hover:bg-[#2563EB] text-white"
                    >
                      {isSubmitting ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null} Add to List
                    </Button>
                  </div>
                </Card>
              )}

              {/* List of Configured Site Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pt-2">
                {siteVisits.length === 0 ? (
                  <div className="col-span-full text-center text-muted-foreground py-8 text-sm border border-dashed rounded-xl bg-muted/10">
                    No planned visits configured. Click "Configure New Site" to define requirements.
                  </div>
                ) : (
                  siteVisits.map((item) => {
                    const isEditing = editingFrequencyOid === item.frequency_oid;
                    
                    return isEditing ? (
                      /* Inline Edit Form Card replacing the site card */
                      <Card key={item.frequency_oid} className="border border-border/80 bg-white dark:bg-card p-4 rounded-xl space-y-4 col-span-1 shadow-md animate-in fade-in duration-200">
                        <div className="flex items-center justify-between border-b pb-1.5">
                          <h4 className="text-xs font-bold text-primary uppercase flex items-center gap-1.5">
                            <span>✏</span> Edit Site Frequency
                          </h4>
                        </div>
                        <div className="space-y-3">
                          <div className="space-y-1">
                            <Label className="text-[9px] font-bold text-muted-foreground uppercase">Site Name</Label>
                            <Input value={item.site_name} disabled className="h-8 text-xs bg-muted/30 font-medium" />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-[9px] font-bold text-muted-foreground uppercase">Visit Frequency *</Label>
                            {planningPeriod === "single" ? (
                              <Input value="1 Visit" disabled className="h-8 text-xs bg-muted/40 font-bold text-primary" />
                            ) : (
                              <Input 
                                type="number" 
                                min="1" 
                                value={formSiteFrequency} 
                                onChange={(e) => setFormSiteFrequency(e.target.value)} 
                                className="h-8 text-xs bg-white dark:bg-muted/40 border-input shadow-xs font-semibold text-foreground"
                              />
                            )}
                          </div>
                        </div>
                        <div className="flex justify-end gap-1.5 pt-1">
                          <Button 
                            variant="outline" 
                            size="sm" 
                            disabled={isSubmitting}
                            className="h-7 text-xs px-2.5"
                            onClick={() => setEditingFrequencyOid(null)}
                          >
                            Cancel
                          </Button>
                          <Button 
                            size="sm" 
                            disabled={isSubmitting}
                            className="h-7 text-xs px-2.5 bg-[#3B82F6] hover:bg-[#2563EB] text-white"
                            onClick={handleSaveSiteCard}
                          >
                            {isSubmitting ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null} Save
                          </Button>
                        </div>
                      </Card>
                    ) : (
                      /* Standard Site Card */
                      <Card key={item.frequency_oid} className="border border-border/80 bg-white dark:bg-card p-4 rounded-xl flex flex-col justify-between shadow-xs hover:shadow-md transition-shadow relative col-span-1">
                        <div className="space-y-2">
                          <div className="flex items-start justify-between gap-2">
                            <span className="font-bold text-sm text-primary flex items-center gap-1.5 leading-tight">
                              <MapPin className="h-4 w-4 text-accent/80 shrink-0" />
                              {item.site_name}
                            </span>
                          </div>

                          <div className="text-[11px] text-muted-foreground space-y-0.5 pl-5">
                            <div className="truncate">Client: <span className="font-medium text-foreground/80">{item.client_name || "N/A"}</span></div>
                            <div className="truncate">Branch: <span className="font-medium text-foreground/80">{item.branch_name || "N/A"}</span></div>
                          </div>
                          
                          <div className="flex items-center gap-1.5 mt-2 pl-5">
                            <Badge variant="outline" className="bg-[#3B82F6]/5 border-[#3B82F6]/20 text-[#3B82F6] font-bold text-[10px] px-2 py-0.5">
                              {item.visit_frequency} Visit{item.visit_frequency !== 1 ? "s" : ""}
                            </Badge>
                            <span className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">
                              {planningPeriod === "weekly" ? "Per Week" : planningPeriod === "monthly" ? "Per Month" : "Single Visit"}
                            </span>
                          </div>

                          {planStatus !== "PUBLISHED" && (
                            <div className="pt-2 border-t border-border/30 flex items-center justify-end text-xs text-muted-foreground mt-3">
                              {/* Actions */}
                              <div className="flex items-center gap-1">
                                {planningPeriod !== "single" && (
                                  <Button 
                                    variant="ghost" 
                                    size="icon" 
                                    disabled={isSubmitting}
                                    className="h-7 w-7 text-muted-foreground hover:text-primary hover:bg-muted"
                                    onClick={() => {
                                      setEditingFrequencyOid(item.frequency_oid);
                                      setFormBranchOid(item.branch_oid || null);
                                      setFormClientOid(item.client_oid || null);
                                      setFormSiteOid(item.site_oid);
                                      setFormSiteFrequency(item.visit_frequency.toString());
                                      setShowAddCard(false);
                                    }}
                                    title="Edit Frequency"
                                  >
                                    <Edit className="h-3.5 w-3.5" />
                                  </Button>
                                )}
                                <Button 
                                  variant="ghost" 
                                  size="icon" 
                                  disabled={isSubmitting}
                                  className="h-7 w-7 text-destructive hover:bg-destructive/10"
                                  onClick={() => handleRemoveSite(item.frequency_oid)}
                                  title="Delete"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            </div>
                          )}
                        </div>
                      </Card>
                    );
                  })
                )}
              </div>
            </CardContent>
          </Card>

          {/* Action Controls Footer */}
          <div className="border-t border-border/60 pt-6 flex items-center justify-between gap-3">
            <div>
              {/* Delete Option — ONLY available in Edit / Draft phase */}
              {currentPlanOid && planStatus !== "PUBLISHED" && (
                <Button 
                  variant="destructive" 
                  disabled={isSubmitting}
                  className="h-9 text-xs font-semibold rounded-full px-4"
                  onClick={handleDeleteCurrentPlan}
                >
                  <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Delete Plan
                </Button>
              )}

              {/* Edit Plan Option — available when plan is in Published view mode */}
              {currentPlanOid && planStatus === "PUBLISHED" && (
                <Button 
                  variant="outline" 
                  disabled={isSubmitting}
                  className="h-9 text-xs font-semibold rounded-full px-4 border-blue-500/30 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/30"
                  onClick={async () => {
                    try {
                      setIsSubmitting(true);
                      await unpublishPlan(currentPlanOid);
                      setPlanStatus("DRAFT");
                      toast.info("Plan switched to editing phase");
                    } catch (err: any) {
                      toast.error(err.message || "Failed to switch plan to edit phase");
                    } finally {
                      setIsSubmitting(false);
                    }
                  }}
                >
                  <Edit className="mr-1.5 h-3.5 w-3.5" /> Edit Plan
                </Button>
              )}
            </div>

            <div className="flex items-center gap-3">
              <Button 
                variant="outline" 
                disabled={isSubmitting || planStatus === "PUBLISHED"}
                className="h-9 text-xs font-semibold rounded-full px-4"
                onClick={async () => {
                  try {
                    setIsSubmitting(true);
                    const planOid = await ensureDraftPlanCreated();
                    toast.success(`Draft plan VP-${planOid} saved successfully!`);
                  } catch (err: any) {
                    toast.error(err.message || "Failed to save draft plan");
                  } finally {
                    setIsSubmitting(false);
                  }
                }}
              >
                {isSubmitting ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null} Save Draft
              </Button>
              <Button 
                variant="secondary" 
                disabled={siteVisits.length === 0}
                className="h-9 text-xs font-semibold rounded-full px-4 border border-border/50 hover:bg-muted/40"
                onClick={() => setShowPreviewModal(true)}
              >
                <Eye className="mr-1.5 h-3.5 w-3.5" /> Preview Plan
              </Button>
              <Button 
                disabled={isSubmitting || planStatus === "PUBLISHED" || siteVisits.length === 0}
                className="h-9 text-xs font-semibold rounded-full px-4 bg-[#3B82F6] hover:bg-[#2563EB] text-white shadow-glow-secondary"
                onClick={handlePublishPlan}
              >
                {isSubmitting ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null} {planStatus === "PUBLISHED" ? "Plan Published" : "Publish Plan"}
              </Button>
            </div>
          </div>

        </div>
      )}

      {/* Plan Preview Modal */}
      <Dialog open={showPreviewModal} onOpenChange={setShowPreviewModal}>
        <DialogContent className="max-w-[750px] max-h-[85vh] overflow-y-auto custom-scrollbar">
          <DialogHeader className="border-b pb-3">
            <DialogTitle className="text-lg font-bold text-primary flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-green-500" /> Plan Preview {planCode ? `(${planCode})` : ""}
            </DialogTitle>
            <DialogDescription className="text-xs">
              Verify your configurations before publishing the visit plan.
            </DialogDescription>
          </DialogHeader>
          
          <div className="py-4 space-y-5">
            {/* Header info */}
            <div className="grid grid-cols-2 gap-4 bg-muted/20 p-4 rounded-xl border">
              <div>
                <span className="text-[10px] font-bold text-muted-foreground uppercase">Planning Scope</span>
                <p className="text-sm font-semibold text-primary">
                  {planningPeriod === "weekly" 
                    ? `Weekly: (${formattedWeekRange})` 
                    : planningPeriod === "monthly"
                    ? `Monthly: ${month} ${year}`
                    : `Single Visit: ${formattedSingleDate}`}
                </p>
              </div>
              <div>
                <span className="text-[10px] font-bold text-muted-foreground uppercase">Assigned Staff</span>
                <p className="text-sm font-semibold text-primary">
                  {selectedOfficerName}
                </p>
              </div>
            </div>

            {/* Planned sites */}
            <div className="space-y-2">
              <span className="text-[10px] font-bold text-muted-foreground uppercase block">Planned Visits ({siteVisits.length})</span>
              <div className="border rounded-xl overflow-hidden">
                <Table>
                  <TableHeader className="bg-muted/40">
                    <TableRow>
                      <TableHead className="text-xs font-bold">Site Location</TableHead>
                      <TableHead className="text-xs font-bold text-center">Visit Frequency</TableHead>
                      <TableHead className="text-xs font-bold">Planning Period</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {siteVisits.map((item) => (
                      <TableRow key={item.frequency_oid}>
                        <TableCell className="text-xs">
                          <div className="flex flex-col gap-0.5">
                            <span className="font-bold text-primary flex items-center gap-1">
                              <MapPin className="h-3.5 w-3.5 text-accent/80" /> {item.site_name}
                            </span>
                            <span className="text-[10px] text-muted-foreground pl-4.5">
                              {item.client_name || "N/A"} — {item.branch_name || "N/A"}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-xs font-bold text-center text-foreground/80">
                          {item.visit_frequency} Visit{item.visit_frequency !== 1 ? "s" : ""}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground font-medium">
                          {planningPeriod === "weekly" ? "Per Week" : planningPeriod === "monthly" ? "Per Month" : "Single Visit"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>

          </div>

          <DialogFooter className="border-t pt-3">
            <Button variant="outline" size="sm" onClick={() => setShowPreviewModal(false)}>Close Preview</Button>
            {planStatus !== "PUBLISHED" && (
              <Button 
                size="sm" 
                disabled={isSubmitting}
                className="bg-[#3B82F6] hover:bg-[#2563EB] text-white shadow-glow-secondary font-semibold"
                onClick={handlePublishPlan}
              >
                {isSubmitting ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null} Publish Directly
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
