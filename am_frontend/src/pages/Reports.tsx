import React, { useState, useEffect, useMemo } from "react";
import {
  CalendarDays, MapPin, Clock, CheckCircle2, AlertTriangle,
  Activity, Filter, X, Building2, Navigation, FileText, Search, Users, ChevronRight, Loader2, Download
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle
} from "@/components/ui/dialog";
import { useNavigate } from "react-router-dom";
import { DayVisitReportTemplate } from "@/components/reports/DayVisitReportTemplate";
import { NightVisitReportTemplate } from "@/components/reports/NightVisitReportTemplate";
import { GeneralVisitReportTemplate } from "@/components/reports/GeneralVisitReportTemplate";
// @ts-ignore
import html2pdf from "html2pdf.js";
import { toast } from "sonner";
import {
  getOfficersWithReports,
  getCombinedReport,
  OfficerListItem,
  CombinedReportResponse,
  SiteVisitSummary,
} from "@/services/reportService";
import { getDashboardData, DashboardResponse } from "@/services/dashboardService";
import { getSites, SiteItem } from "@/services/visitService";

const statusStyle: Record<string, { badge: string; dot: string }> = {
  completed: { badge: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400", dot: "bg-emerald-500" },
  active: { badge: "bg-blue-500/15 text-blue-600 dark:text-blue-400", dot: "bg-blue-500" },
  pending: { badge: "bg-amber-500/15 text-amber-600 dark:text-amber-400", dot: "bg-amber-500" },
  missed: { badge: "bg-red-500/15 text-red-600 dark:text-red-400", dot: "bg-red-500" },
};

export interface Visit {
  id: number | string;
  officerId: number;
  officer: string;
  empCode: string;
  site: string;
  checkIn: string | null;
  checkOut: string | null;
  duration: string;
  distance: number;
  status: string;
  purpose: string;
}

export function VisitDetailModal({
  visit,
  siteVisits = [],
  open,
  onClose,
}: {
  visit: Visit | null;
  siteVisits?: SiteVisitSummary[];
  open: boolean;
  onClose: () => void;
}) {
  const [activeVisit, setActiveVisit] = useState<Visit | null>(null);

  useEffect(() => {
    if (visit) {
      setActiveVisit(visit);
    }
  }, [visit]);

  if (!visit || !activeVisit) return null;

  const st = statusStyle[activeVisit.status.toLowerCase()] || statusStyle.pending;

  const routeSequence = siteVisits.length > 0
    ? siteVisits
    : [
        {
          serial_no: 1,
          site_name: activeVisit.site,
          check_in: activeVisit.checkIn,
          status: activeVisit.status,
        },
      ];

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-3xl p-4 gap-3">
        <DialogHeader className="space-y-1">
          <DialogTitle className="flex items-center gap-1.5 text-sm font-bold">
            <FileText className="h-4 w-4 text-primary" />
            Visit Details
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 mt-0.5">
          {/* Horizontal Visit Route Sequence */}
          <div className="rounded-xl border border-border bg-muted/10 p-2.5 space-y-1.5">
            <div className="font-semibold text-[11px] flex items-center gap-1.5 text-foreground">
              <Navigation className="h-3 w-3 text-primary" />
              Officer's Route Sequence (Click any site to view details)
            </div>
            <div className="relative flex items-center justify-between w-full mt-1 gap-2 overflow-x-auto py-2.5 px-1">
              <div className="absolute top-6 left-2 right-2 h-0.5 bg-border/60 z-0" />

              {routeSequence.map((sv, index) => {
                const sName = sv.site_name || `Site #${sv.site_id || index + 1}`;
                const isCurrent = sName === activeVisit.site;
                const isCompleted = (sv.status || "").toLowerCase() === "completed";
                const isActive = (sv.status || "").toLowerCase() === "active";
                const isMissed = (sv.status || "").toLowerCase() === "missed";

                return (
                  <div
                    key={sv.serial_no || index}
                    className="relative z-10 flex flex-col items-center min-w-[85px] text-center shrink-0 cursor-pointer hover:scale-102 transition-all"
                  >
                    <div
                      className={`h-7 w-7 rounded-full border-2 bg-card flex items-center justify-center font-bold text-[10px] shadow-sm transition-all
                        ${isCurrent ? "ring-2 ring-primary ring-offset-2 scale-110 font-extrabold" : ""}
                        ${
                          isCompleted
                            ? "border-emerald-500 text-emerald-600 bg-emerald-500/5"
                            : isActive
                            ? "border-blue-500 text-blue-600 bg-blue-500/5 animate-pulse"
                            : isMissed
                            ? "border-red-500 text-red-600 bg-red-500/5"
                            : "border-muted text-muted-foreground"
                        }`}
                    >
                      {index + 1}
                    </div>
                    <span
                      className={`text-[9px] mt-1 font-bold truncate max-w-[82px] ${
                        isCurrent ? "text-primary" : "text-muted-foreground"
                      }`}
                      title={sName}
                    >
                      {sName.split(" ")[0]}
                    </span>
                    <span className="text-[8px] text-muted-foreground/60 font-mono-data">
                      {sv.check_in || "Pending"}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Bottom details structured as 2 horizontal columns on desktop */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {/* Left Column: Officer and Performance Metrics */}
            <div className="space-y-3">
              <div className="flex items-center justify-between p-2.5 rounded-xl bg-muted/40 border border-border">
                <div>
                  <div className="font-bold text-xs text-foreground leading-none">{activeVisit.officer}</div>
                  <div className="text-[10px] text-muted-foreground mt-1 leading-none">{activeVisit.empCode} · Field Officer</div>
                </div>
                <Badge className={`text-[9px] font-bold border-0 px-2 py-0.5 capitalize ${st.badge}`}>{activeVisit.status}</Badge>
              </div>

              <div className="grid grid-cols-3 gap-2.5">
                {[
                  { icon: Clock, label: "Arrival Time", value: activeVisit.checkIn ?? "Not arrived" },
                  { icon: Clock, label: "Departure Time", value: activeVisit.checkOut ?? "—" },
                  { icon: Activity, label: "Duration", value: activeVisit.duration },
                ].map((m) => (
                  <div key={m.label} className="rounded-xl border border-border bg-muted/30 p-2.5">
                    <div className="flex items-center gap-1 mb-0.5">
                      <m.icon className="h-3 w-3 text-muted-foreground" />
                      <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">{m.label}</span>
                    </div>
                    <div className="text-xs font-semibold font-mono-data text-foreground">{m.value}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Right Column: Site Info & Checklist */}
            <div className="space-y-3">
              <div className="rounded-xl border border-border p-2.5 space-y-1.5">
                <div className="font-semibold text-[11px] flex items-center gap-1.5 text-foreground border-b pb-1">
                  <Building2 className="h-3 w-3 text-primary" />
                  Site Information
                </div>
                <div className="grid grid-cols-2 gap-y-1 text-[10px] leading-tight">
                  <div className="text-muted-foreground font-medium">Site Name</div>
                  <div className="font-semibold text-foreground">{visit.site}</div>
                  <div className="text-muted-foreground font-medium">Visit Purpose</div>
                  <div className="font-semibold text-foreground">{visit.purpose}</div>
                </div>
              </div>

              <div className="rounded-xl border border-border p-2.5 space-y-1.5">
                <div className="font-semibold text-[11px] text-foreground border-b pb-1">Checklist Summary</div>
                {activeVisit.status.toLowerCase() === "completed" ? (
                  <div className="space-y-1.5">
                    <div className="grid grid-cols-2 gap-1.5">
                      {["Security perimeter checked", "CCTV cameras verified", "Guard roster reviewed", "Incident log signed"].map((item) => (
                        <div key={item} className="flex items-center gap-1 text-[9px] text-foreground">
                          <CheckCircle2 className="h-2.5 w-2.5 text-emerald-500 shrink-0" />
                          <span className="truncate">{item}</span>
                        </div>
                      ))}
                    </div>
                    <div className="mt-1.5 pt-1.5 border-t text-[9px] text-muted-foreground leading-normal">
                      <span className="font-bold text-foreground block mb-0.5">Remarks:</span>
                      All security parameters found satisfactory. Guard deployment adequate.
                    </div>
                  </div>
                ) : (
                  <p className="text-[10px] text-muted-foreground">
                    {activeVisit.status.toLowerCase() === "pending"
                      ? "Visit not started yet."
                      : activeVisit.status.toLowerCase() === "active"
                      ? "Checklist in progress."
                      : "Visit was missed — checklist not completed."}
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function SingleSiteReportView({
  siteVisit,
  activeReport,
  onBack,
}: {
  siteVisit: Visit;
  activeReport: CombinedReportResponse | null;
  onBack: () => void;
}) {
  const reportRef = React.useRef<HTMLDivElement>(null);
  const [isDownloading, setIsDownloading] = useState(false);

  const rep = useMemo(() => {
    if (!activeReport) return null;
    const siteNameLower = (siteVisit.site || "").toLowerCase().trim();
    const purposeLower = (siteVisit.purpose || "").toLowerCase().trim();

    if (purposeLower.includes("night")) {
      const found =
        activeReport.night_reports.find(
          (n) => (n.site_name || n.unit || "").toLowerCase().trim() === siteNameLower
        ) || activeReport.night_reports[0];

      if (found) {
        return {
          type: "night",
          data: {
            ...found,
            id: found.id || `NV-${siteVisit.id}`,
            formattedReportId:
              found.formatted_report_id ||
              `0${siteVisit.id}-${found.client_name || "Client"}-${found.unit || siteVisit.site}-ONR`,
            clientName: found.client_name || "Client",
            unit: found.unit || found.site_name || siteVisit.site,
            shift: found.shift || "Night Shift",
            visitDate: found.visit_date || "14/07/26",
            officer: found.officer || activeReport.officer.officer,
            startTime: found.start_time || siteVisit.checkIn || "—",
            endTime: found.end_time || siteVisit.checkOut || "—",
            gps: found.gps || "—",
            photos: found.photos || [],
            guards: found.guards || [],
            checklist: found.checklist || [],
            lectureDetails: found.lecture_details,
            randomChecking: found.random_checking,
            suggestions: found.suggestions,
          },
        };
      }
    }

    if (purposeLower.includes("day")) {
      const found =
        activeReport.day_reports.find(
          (d) => (d.site_name || d.unit || "").toLowerCase().trim() === siteNameLower
        ) || activeReport.day_reports[0];

      if (found) {
        return {
          type: "day",
          data: {
            ...found,
            id: found.id || `DV-${siteVisit.id}`,
            formattedReportId:
              found.formatted_report_id ||
              `0${siteVisit.id}-${found.client_name || "Client"}-${found.unit || siteVisit.site}-ODV`,
            clientName: found.client_name || "Client",
            unit: found.unit || found.site_name || siteVisit.site,
            shift: found.shift || "Day Shift",
            visitDate: found.visit_date || "14/07/26",
            officer: found.officer || activeReport.officer.officer,
            startTime: found.start_time || siteVisit.checkIn || "—",
            endTime: found.end_time || siteVisit.checkOut || "—",
            gps: found.gps || "—",
            photos: found.photos || [],
            guards: found.guards || [],
            checklist: found.checklist || [],
            suggestions: found.suggestions,
            customerFeedback: found.overall_remarks || found.remarks,
          },
        };
      }
    }

    // General Report
    const foundGen =
      activeReport.general_reports.find(
        (g) => (g.site_name || "").toLowerCase().trim() === siteNameLower
      ) || activeReport.general_reports[0];

    if (foundGen) {
      return {
        type: "general",
        data: {
          ...foundGen,
          id: foundGen.id || `GV-${siteVisit.id}`,
          formattedReportId:
            foundGen.formatted_report_id ||
            `0${siteVisit.id}-${foundGen.client_name || "Client"}-${foundGen.site_name || siteVisit.site}-OGV`,
          clientName: foundGen.client_name || "Client",
          siteName: foundGen.site_name || siteVisit.site,
          visitDate: foundGen.visit_date || "14/07/26",
          officer: foundGen.officer || activeReport.officer.officer,
          startTime: foundGen.start_time || siteVisit.checkIn || "—",
          endTime: foundGen.end_time || siteVisit.checkOut || "—",
          personVisited: foundGen.personVisited || "N/A",
          reasonOfVisit: foundGen.reasonOfVisit || "Routine Inspection",
          remark: foundGen.remark || "No remarks recorded.",
          photos: foundGen.photos || [],
        },
      };
    }

    return null;
  }, [siteVisit, activeReport]);

  const handleDownloadPDF = async () => {
    if (isDownloading || !reportRef.current) return;
    setIsDownloading(true);
    const toastId = toast.loading("Generating PDF for site report...");

    try {
      const options = {
        margin: [12, 10, 14, 10],
        filename: `Report_${siteVisit.site.replace(/ /g, "_")}_${siteVisit.checkIn || "Visit"}.pdf`,
        image: { type: "jpeg", quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, logging: false },
        jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
        pagebreak: {
          mode: ["css", "legacy"],
          before: ".pdf-page-break",
          avoid: ["tr", "thead", ".pdf-avoid-card", ".pdf-section-title"],
        },
      };

      await html2pdf().set(options).from(reportRef.current).save();
      toast.success("PDF report downloaded successfully!", { id: toastId });
    } catch (err) {
      console.error("Single PDF export error:", err);
      toast.error("Failed to generate PDF.", { id: toastId });
    } finally {
      setIsDownloading(false);
    }
  };

  if (!rep) {
    return (
      <div className="p-8 text-center bg-card border rounded-xl space-y-4">
        <p className="text-xs text-muted-foreground">No detailed report data found for this site visit.</p>
        <Button variant="outline" size="sm" onClick={onBack}>← Back to Site Schedule</Button>
      </div>
    );
  }

  return (
    <div className="space-y-3 max-w-4xl mx-auto pt-0 animate-in fade-in duration-200">
      {/* Top Action Bar */}
      <div className="flex items-center justify-between gap-4 pb-2 border-b border-slate-200 dark:border-slate-700">
        <Button
          size="sm"
          className="h-9 gap-1.5 text-xs font-bold bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full px-4 shadow-sm"
          onClick={onBack}
        >
          ← Back
        </Button>
        <Button
          size="sm"
          className="bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-2 rounded-full px-5 h-9 text-xs font-semibold shadow-md"
          onClick={handleDownloadPDF}
          disabled={isDownloading}
        >
          {isDownloading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Download className="h-4 w-4" />
          )}
          {isDownloading ? "Generating PDF..." : "Download PDF"}
        </Button>
      </div>

      {/* Standalone Report Container with Logo & Header */}
      <div
        ref={reportRef}
        className="bg-white text-slate-900 border border-slate-200 rounded-xl p-8 shadow-md"
      >
        {rep.type === "night" && <NightVisitReportTemplate report={rep.data} hideHeader={false} />}
        {rep.type === "day" && <DayVisitReportTemplate report={rep.data} hideHeader={false} />}
        {rep.type === "general" && <GeneralVisitReportTemplate report={rep.data} hideHeader={false} />}
      </div>
    </div>
  );
}

export default function Reports() {
  const navigate = useNavigate();

  // State for real backend officers
  const [officers, setOfficers] = useState<OfficerListItem[]>([]);
  const [loadingOfficers, setLoadingOfficers] = useState(true);
  const [officersError, setOfficersError] = useState<string | null>(null);

  // State for Dashboard KPI data & Authorized Sites
  const [authorizedSites, setAuthorizedSites] = useState<SiteItem[]>([]);
  const [dashboardData, setDashboardData] = useState<DashboardResponse | null>(null);
  const [kpiPeriod, setKpiPeriod] = useState<"weekly" | "monthly">("weekly");
  const [filterOfficer, setFilterOfficer] = useState<string>("all"); // 'all' or employee_oid string
  const [filterSite, setFilterSite] = useState<string>("all");
  const [filterDateType, setFilterDateType] = useState<string>("all");
  const [customFrom, setCustomFrom] = useState<string>("");
  const [customTo, setCustomTo] = useState<string>("");

  // State for selected officer combined report
  const [activeReport, setActiveReport] = useState<CombinedReportResponse | null>(null);
  const [loadingReport, setLoadingReport] = useState<boolean>(false);
  const [reportError, setReportError] = useState<string | null>(null);

  // Roster Stage state
  const [expandedOfficerId, setExpandedOfficerId] = useState<number | null>(null);
  const [expandedDate, setExpandedDate] = useState<string | null>(null);
  const [expandedSiteId, setExpandedSiteId] = useState<number | string | null>(null);
  const [selectedSiteVisit, setSelectedSiteVisit] = useState<Visit | null>(null);
  const [selected, setSelected] = useState<Visit | null>(null);
  const [selectedReport, setSelectedReport] = useState<any | null>(null);

  const getReportForSiteVisit = (sv: Visit) => {
    if (!activeReport) return null;

    const siteNameLower = (sv.site || "").toLowerCase().trim();
    const purposeLower = (sv.purpose || "").toLowerCase().trim();

    if (purposeLower.includes("night")) {
      const found =
        activeReport.night_reports.find(
          (n) =>
            (n.site_name || n.unit || "").toLowerCase().trim() === siteNameLower
        ) || activeReport.night_reports[0];

      if (found) {
        return {
          type: "night",
          data: {
            ...found,
            id: found.id || `NV-${sv.id}`,
            formattedReportId:
              found.formatted_report_id ||
              `0${sv.id}-${found.client_name || "Client"}-${found.unit || sv.site}-ONR`,
            clientName: found.client_name || "Client",
            unit: found.unit || found.site_name || sv.site,
            shift: found.shift || "Night Shift",
            visitDate: found.visit_date || "14/07/26",
            officer: found.officer || activeReport.officer.officer,
            startTime: found.start_time || sv.checkIn || "—",
            endTime: found.end_time || sv.checkOut || "—",
            gps: found.gps || "—",
            photos: found.photos || [],
            guards: found.guards || [],
            checklist: found.checklist || [],
            lectureDetails: found.lecture_details,
            randomChecking: found.random_checking,
            suggestions: found.suggestions,
          },
        };
      }
    }

    if (purposeLower.includes("day")) {
      const found =
        activeReport.day_reports.find(
          (d) =>
            (d.site_name || d.unit || "").toLowerCase().trim() === siteNameLower
        ) || activeReport.day_reports[0];

      if (found) {
        return {
          type: "day",
          data: {
            ...found,
            id: found.id || `DV-${sv.id}`,
            formattedReportId:
              found.formatted_report_id ||
              `0${sv.id}-${found.client_name || "Client"}-${found.unit || sv.site}-ODV`,
            clientName: found.client_name || "Client",
            unit: found.unit || found.site_name || sv.site,
            shift: found.shift || "Day Shift",
            visitDate: found.visit_date || "14/07/26",
            officer: found.officer || activeReport.officer.officer,
            startTime: found.start_time || sv.checkIn || "—",
            endTime: found.end_time || sv.checkOut || "—",
            gps: found.gps || "—",
            photos: found.photos || [],
            guards: found.guards || [],
            checklist: found.checklist || [],
            suggestions: found.suggestions,
            customerFeedback: found.overall_remarks || found.remarks,
          },
        };
      }
    }

    // General Report
    const foundGen =
      activeReport.general_reports.find(
        (g) =>
          (g.site_name || "").toLowerCase().trim() === siteNameLower
      ) || activeReport.general_reports[0];

    if (foundGen) {
      return {
        type: "general",
        data: {
          ...foundGen,
          id: foundGen.id || `GV-${sv.id}`,
          formattedReportId:
            foundGen.formatted_report_id ||
            `0${sv.id}-${foundGen.client_name || "Client"}-${foundGen.site_name || sv.site}-OGV`,
          clientName: foundGen.client_name || "Client",
          siteName: foundGen.site_name || sv.site,
          visitDate: foundGen.visit_date || "14/07/26",
          officer: foundGen.officer || activeReport.officer.officer,
          startTime: foundGen.start_time || sv.checkIn || "—",
          endTime: foundGen.end_time || sv.checkOut || "—",
          personVisited: foundGen.personVisited || "N/A",
          reasonOfVisit: foundGen.reasonOfVisit || "Routine Inspection",
          remark: foundGen.remark || "No remarks recorded.",
          photos: foundGen.photos || [],
        },
      };
    }

    return null;
  };

  // 1. Fetch all officers, dashboard data, and role-authorized sites on mount
  useEffect(() => {
    setLoadingOfficers(true);
    setOfficersError(null);

    getOfficersWithReports()
      .then((data) => {
        setOfficers(data);
        setLoadingOfficers(false);
      })
      .catch((err: any) => {
        console.error("Failed to load officers with reports list:", err);
        setOfficersError(err.message || "Failed to load officers list.");
        setLoadingOfficers(false);
      });

    getDashboardData()
      .then((data) => setDashboardData(data))
      .catch((err) => console.error("Failed to load dashboard metrics for Reports page:", err));

    getSites()
      .then((sites) => setAuthorizedSites(sites))
      .catch((err) => console.error("Failed to load authorized sites for Reports page:", err));
  }, []);

  // 2. Fetch active report whenever filterOfficer or expandedOfficerId/expandedDate changes
  const targetEmployeeOid = useMemo(() => {
    if (expandedOfficerId) return expandedOfficerId;
    if (filterOfficer !== "all") return Number(filterOfficer);
    return null;
  }, [expandedOfficerId, filterOfficer]);

  const targetDate = useMemo(() => {
    if (expandedDate) return expandedDate;
    return undefined;
  }, [expandedDate]);

  useEffect(() => {
    if (!targetEmployeeOid || isNaN(targetEmployeeOid) || targetEmployeeOid <= 0) {
      setActiveReport(null);
      return;
    }

    setLoadingReport(true);
    setReportError(null);

    let fromDate: string | undefined = targetDate;
    let toDate: string | undefined = targetDate;

    if (!targetDate && filterDateType === "custom") {
      fromDate = customFrom || undefined;
      toDate = customTo || undefined;
    }

    getCombinedReport(targetEmployeeOid, fromDate, toDate)
      .then((data) => {
        setActiveReport(data);
        setLoadingReport(false);
      })
      .catch((err: any) => {
        console.error(`Failed to load report for officer ${targetEmployeeOid}:`, err);
        setReportError(err.message || "Failed to load report.");
        setLoadingReport(false);
      });
  }, [targetEmployeeOid, targetDate, filterDateType, customFrom, customTo]);

  // Unique officers list for dropdown filter and summary count
  const uniqueOfficers = useMemo(() => {
    const map = new Map<number, OfficerListItem>();
    officers.forEach((o) => {
      if (!map.has(o.employee_oid)) {
        map.set(o.employee_oid, o);
      }
    });
    return Array.from(map.values());
  }, [officers]);

  // Derived Summary Counts supporting Weekly/Monthly toggle & Site filter
  const summaryMetrics = useMemo(() => {
    const summary = dashboardData?.summary;

    let planned = kpiPeriod === "weekly"
      ? (summary?.plannedVisitsWeekly ?? summary?.plannedVisits ?? activeReport?.summary.planned_visits ?? 0)
      : (summary?.plannedVisitsMonthly ?? summary?.plannedVisits ?? activeReport?.summary.planned_visits ?? 0);

    let completed = kpiPeriod === "weekly"
      ? (summary?.completedVisitsWeekly ?? summary?.completedVisitsToday ?? activeReport?.summary.completed_visits ?? 0)
      : (summary?.completedVisitsMonthly ?? summary?.completedVisitsToday ?? activeReport?.summary.completed_visits ?? 0);

    // Calculate sites covered count
    let sitesCovered = activeReport?.summary.total_sites_covered ?? 0;
    if (!activeReport && dashboardData) {
      const coveredSet = new Set<string>();
      dashboardData.officers.forEach((o) => {
        o.visits.forEach((v) => {
          if ((v.status || "").toLowerCase() === "completed" && v.site_name) {
            coveredSet.add(v.site_name);
          }
        });
      });
      sitesCovered = coveredSet.size;
    }

    // Dynamic adjustment when filterSite is active
    if (filterSite !== "all") {
      if (activeReport) {
        const hasSiteVisit = activeReport.site_visits.some(
          (sv) => (sv.site_name || "").toLowerCase().trim() === filterSite.toLowerCase().trim()
        );
        sitesCovered = hasSiteVisit ? 1 : 0;
      } else if (dashboardData) {
        const hasCompletedSite = dashboardData.officers.some((o) =>
          o.visits.some(
            (v) => (v.site_name || "").toLowerCase().trim() === filterSite.toLowerCase().trim() && (v.status || "").toLowerCase() === "completed"
          )
        );
        sitesCovered = hasCompletedSite ? 1 : 0;
      }
    }

    return {
      plannedVisits: planned,
      completedVisits: completed,
      totalSitesCovered: sitesCovered,
      fieldOfficersCount: uniqueOfficers.length,
    };
  }, [kpiPeriod, dashboardData, activeReport, filterSite, uniqueOfficers]);

  // Available unique sites across authorized sites, all officers & active reports
  const uniqueSites = useMemo(() => {
    const sitesSet = new Set<string>();
    authorizedSites.forEach((s) => {
      if (s.name) sitesSet.add(s.name);
    });
    officers.forEach((o) => {
      o.sites?.forEach((sName) => {
        if (sName) sitesSet.add(sName);
      });
    });
    if (dashboardData) {
      dashboardData.officers.forEach((o) => {
        o.visits.forEach((v) => {
          if (v.site_name) sitesSet.add(v.site_name);
        });
      });
    }
    if (activeReport) {
      activeReport.site_visits.forEach((sv) => {
        if (sv.site_name) sitesSet.add(sv.site_name);
      });
    }
    return Array.from(sitesSet).sort();
  }, [authorizedSites, officers, dashboardData, activeReport]);

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

  const isDateInRange = (dateStr?: string | null) => {
    if (!dateStr || dateStr === "—") return filterDateType === "all";
    if (filterDateType === "all") return true;

    let d: Date | null = null;
    if (dateStr.includes("-")) {
      const parts = dateStr.split("-");
      if (parts.length === 3) {
        if (parts[0].length === 4) {
          d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
        } else if (parts[2].length === 4) {
          d = new Date(Number(parts[2]), Number(parts[1]) - 1, Number(parts[0]));
        }
      }
    } else if (dateStr.includes("/")) {
      const parts = dateStr.split("/");
      if (parts.length === 3) {
        if (parts[2].length === 4) {
          d = new Date(Number(parts[2]), Number(parts[1]) - 1, Number(parts[0]));
        } else if (parts[0].length === 4) {
          d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
        }
      }
    }

    if (!d || isNaN(d.getTime())) return true;

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    if (filterDateType === "today") {
      return d.getTime() === today.getTime();
    }

    if (filterDateType === "yesterday") {
      const yest = new Date(today);
      yest.setDate(yest.getDate() - 1);
      return d.getTime() === yest.getTime();
    }

    if (filterDateType === "weekly") {
      const weekAgo = new Date(today);
      weekAgo.setDate(weekAgo.getDate() - 7);
      return d.getTime() >= weekAgo.getTime() && d.getTime() <= today.getTime() + 86400000;
    }

    if (filterDateType === "custom") {
      if (customFrom) {
        const fromD = new Date(customFrom);
        if (d < fromD) return false;
      }
      if (customTo) {
        const toD = new Date(customTo);
        toD.setHours(23, 59, 59, 999);
        if (d > toD) return false;
      }
      return true;
    }

    return true;
  };

  // Filtered Roster Items
  const rosterItems = useMemo(() => {
    if (officers.length === 0) return [];

    let filtered = officers;

    // 1. Officer Filter
    if (filterOfficer !== "all") {
      filtered = filtered.filter((o) => String(o.employee_oid) === filterOfficer);
    }

    // 2. Date Filter
    filtered = filtered.filter((o) => {
      const isSelected = activeReport?.officer.employee_oid === o.employee_oid;
      const reportDate = isSelected && activeReport?.site_visits[0]?.visit_date
        ? activeReport.site_visits[0].visit_date
        : o.last_visit_date;
      return isDateInRange(reportDate);
    });

    // 3. Site Filter (role-authorized site scope)
    if (filterSite !== "all") {
      filtered = filtered.filter((o) => {
        const officerSites = o.sites || [];
        if (officerSites.length > 0) {
          return officerSites.some(
            (sName) => sName.toLowerCase().trim() === filterSite.toLowerCase().trim()
          );
        }
        const isSelected = activeReport?.officer.employee_oid === o.employee_oid;
        if (isSelected && activeReport) {
          return activeReport.site_visits.some(
            (sv) => (sv.site_name || "").toLowerCase().trim() === filterSite.toLowerCase().trim()
          );
        }
        return false;
      });
    }

    // 4. Sort newest-first (latest report on top)
    filtered.sort((a, b) => {
      const dateA = a.last_visit_date ? new Date(a.last_visit_date).getTime() : 0;
      const dateB = b.last_visit_date ? new Date(b.last_visit_date).getTime() : 0;
      return dateB - dateA;
    });

    return filtered.map((o) => {
      const isSelected = activeReport?.officer.employee_oid === o.employee_oid;
      const summary = isSelected ? activeReport.summary : null;
      const visits = isSelected ? activeReport.site_visits : [];

      const done = summary ? summary.completed_visits : (o.visits_done ?? o.total_reports ?? 0);
      const punchIn = isSelected ? activeReport?.officer.punch_in || o.punch_in || "—" : o.punch_in || "—";
      const punchOut = isSelected ? activeReport?.officer.punch_out || o.punch_out || "—" : o.punch_out || "—";
      const hours = isSelected && activeReport?.officer.hours_worked ? `${activeReport.officer.hours_worked} hrs` : (o.hours_worked || "—");
      const gpsStatus = o.gps_status || "—";

      const rawDate = isSelected && activeReport?.site_visits[0]?.visit_date
        ? activeReport.site_visits[0].visit_date
        : o.last_visit_date;

      const formattedDate = formatToDDMMYYYY(rawDate);

      return {
        key: `${o.employee_oid}_${o.last_visit_date}`,
        employee_oid: o.employee_oid,
        officer: o.officer,
        empCode: o.emp_code || `EMP${o.employee_oid}`,
        punchIn,
        punchOut,
        sitesCount: `${o.total_sites || o.visits?.length || 0} Sites`,
        done,
        hours,
        gpsStatus,
        rawDate: o.last_visit_date,
        date: formattedDate,
        visits: o.visits || [],
      };
    });
  }, [officers, filterOfficer, filterSite, filterDateType, customFrom, customTo, activeReport]);

  // Filtered Site Visits list for Stage 2
  const activeVisitsList = useMemo(() => {
    if (!activeReport) return [];
    return activeReport.site_visits.map((sv) => ({
      id: sv.serial_no,
      officerId: activeReport.officer.employee_oid,
      officer: activeReport.officer.officer,
      empCode: activeReport.officer.emp_code || `EMP${activeReport.officer.employee_oid}`,
      site: sv.site_name || `Site #${sv.site_id}`,
      checkIn: sv.check_in || "—",
      checkOut: sv.check_out || "—",
      duration: "00:40",
      distance: 2.5,
      status: (sv.status || "Completed").toLowerCase(),
      purpose: `${sv.visit_type} Inspection`,
    }));
  }, [activeReport]);

  if (selectedSiteVisit) {
    return (
      <SingleSiteReportView
        siteVisit={selectedSiteVisit}
        activeReport={activeReport}
        onBack={() => setSelectedSiteVisit(null)}
      />
    );
  }

  if (selectedReport) {
    return (
      <OfficerReportView
        report={selectedReport}
        onBack={() => setSelectedReport(null)}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Reports</h1>
        <p className="text-sm text-muted-foreground">All scheduled site visits and consolidated officer reports</p>
      </div>

      {/* Summary KPI Cards Section with Weekly/Monthly Toggle */}
      <div className="space-y-2.5">
        <div className="flex items-center justify-start gap-3 px-0.5">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">Visits Target:</span>
          <div className="inline-flex items-center rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 p-1 text-xs font-medium shadow-sm">
            <button
              onClick={() => setKpiPeriod("weekly")}
              className={`px-3 py-1 rounded-md transition-all ${
                kpiPeriod === "weekly"
                  ? "bg-blue-600 text-white font-bold shadow-sm"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800"
              }`}
            >
              Weekly
            </button>
            <button
              onClick={() => setKpiPeriod("monthly")}
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

        {/* Summary cards grid */}
        <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
          {[
            {
              label: "Planned Visits",
              value: loadingReport ? "..." : summaryMetrics.plannedVisits,
              color: "kpi-card-blue",
              icon: CalendarDays,
              detail: `Scheduled for ${kpiPeriod === "weekly" ? "present week" : "current month"}`,
              iconColor: "text-blue-500",
              iconBg: "bg-blue-500/10",
            },
            {
              label: "Completed Visits",
              value: loadingReport ? "..." : summaryMetrics.completedVisits,
              color: "kpi-card-green",
              icon: CheckCircle2,
              detail: `Completed ${kpiPeriod === "weekly" ? "present week" : "current month"}`,
              iconColor: "text-emerald-500",
              iconBg: "bg-emerald-500/10",
            },
            {
              label: "Sites Covered",
              value: loadingReport ? "..." : summaryMetrics.totalSitesCovered,
              color: "kpi-card-purple",
              icon: Building2,
              detail: filterSite !== "all" ? `Filtered for ${filterSite}` : `Sites covered ${kpiPeriod === "weekly" ? "present week" : "current month"}`,
              iconColor: "text-purple-500",
              iconBg: "bg-purple-500/10",
            },
            {
              label: "Field Officers Count",
              value: loadingOfficers ? "..." : summaryMetrics.fieldOfficersCount,
              color: "kpi-card-amber",
              icon: Users,
              detail: "Active officers roster",
              iconColor: "text-amber-500",
              iconBg: "bg-amber-500/10",
            },
          ].map((c) => {
            const Icon = c.icon;
            return (
              <Card key={c.label} className={`kpi-card ${c.color} border-border`}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/80">{c.label}</p>
                      <p className="text-2xl font-extrabold font-mono-data mt-1">{c.value}</p>
                      <p className="text-[10px] text-muted-foreground/80 font-medium mt-1">{c.detail}</p>
                    </div>
                    <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${c.iconBg} ${c.iconColor} shrink-0 self-start mt-0.5`}>
                      <Icon className="h-4.5 w-4.5" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <Filter className="h-3.5 w-3.5 text-muted-foreground" />
        <Select value={filterOfficer} onValueChange={setFilterOfficer}>
          <SelectTrigger className="h-7 w-44 text-xs border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
            <SelectValue placeholder="Officer" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Officers</SelectItem>
            {uniqueOfficers.map((o) => (
              <SelectItem key={o.employee_oid} value={String(o.employee_oid)}>
                {o.officer} ({o.emp_code || `EMP${o.employee_oid}`})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filterSite} onValueChange={setFilterSite}>
          <SelectTrigger className="h-7 w-40 text-xs border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
            <SelectValue placeholder="Site" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Sites</SelectItem>
            {uniqueSites.map((s) => (
              <SelectItem key={s} value={s}>{s}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filterDateType} onValueChange={setFilterDateType}>
          <SelectTrigger className="h-7 w-32 text-xs border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
            <SelectValue placeholder="Date" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Dates</SelectItem>
            <SelectItem value="today">Today</SelectItem>
            <SelectItem value="yesterday">Yesterday</SelectItem>
            <SelectItem value="weekly">Weekly</SelectItem>
            <SelectItem value="custom">Custom Range</SelectItem>
          </SelectContent>
        </Select>

        {filterDateType === "custom" && (
          <div className="flex items-center gap-1.5 animate-in fade-in zoom-in duration-200">
            <input
              type="date"
              value={customFrom}
              onChange={(e) => setCustomFrom(e.target.value)}
              className="h-7 px-2 rounded-md border border-slate-300 dark:border-slate-700 text-xs text-foreground bg-white dark:bg-slate-900 focus:outline-none focus:ring-1 focus:ring-primary shadow-sm"
              title="From Date"
            />
            <span className="text-xs text-muted-foreground">to</span>
            <input
              type="date"
              value={customTo}
              onChange={(e) => setCustomTo(e.target.value)}
              className="h-7 px-2 rounded-md border border-slate-300 dark:border-slate-700 text-xs text-foreground bg-white dark:bg-slate-900 focus:outline-none focus:ring-1 focus:ring-primary shadow-sm"
              title="To Date"
            />
          </div>
        )}

        {(filterOfficer !== "all" || filterSite !== "all" || filterDateType !== "today" || customFrom !== "" || customTo !== "") && (
          <Button
            variant="ghost"
            size="sm"
            className="h-9 gap-1.5 text-xs"
            onClick={() => {
              setFilterOfficer("all");
              setFilterSite("all");
              setFilterDateType("today");
              setCustomFrom("");
              setCustomTo("");
            }}
          >
            <X className="h-3 w-3" /> Clear
          </Button>
        )}
        <span className="ml-auto text-xs text-muted-foreground">
          {rosterItems.length} of {uniqueOfficers.length} officers
        </span>
      </div>

      {/* 3-Stage Patrolling Log View Switcher */}
      <div className="w-full mt-2">
        {/* Loading / Error Banner */}
        {loadingOfficers && (
          <div className="flex items-center justify-center p-8 bg-card border rounded-xl space-x-3">
            <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
            <span className="text-xs text-muted-foreground">Loading officers from backend...</span>
          </div>
        )}

        {officersError && (
          <div className="flex items-center justify-center p-6 bg-red-50 border border-red-200 rounded-xl space-x-2 text-red-600 text-xs font-semibold">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>{officersError}</span>
          </div>
        )}

        {/* Stage 1: Field Officers Daily Patrol Roster Table */}
        {!loadingOfficers && !expandedOfficerId && (
          <div className="rounded-xl border border-border bg-card overflow-hidden shadow-sm animate-in fade-in duration-200">
            <div className="overflow-x-auto">
              <table className="w-full text-sm table-fixed">
                <thead className="bg-muted/15 border-b border-border/80">
                  <tr className="border-b text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                    <th className="px-4 py-3.5 text-left w-[26%]">Officer</th>
                    <th className="px-2 py-3.5 text-center w-[15%] whitespace-nowrap">Date</th>
                    <th className="px-2 py-3.5 text-center w-[13%] whitespace-nowrap">Visit Done</th>
                    <th className="px-2 py-3.5 text-center w-[15%] whitespace-nowrap">Hrs Worked</th>
                    <th className="px-2 py-3.5 text-center w-[13%] whitespace-nowrap">GPS Status</th>
                    <th className="px-2 py-3.5 text-center w-[18%] whitespace-nowrap">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {rosterItems.map((r) => {
                    const gpsStatus = r.gpsStatus || "—";
                    return (
                      <tr key={r.key} className="border-b last:border-0 hover:bg-muted/10 transition-colors">
                        {/* Officer name */}
                        <td className="px-4 py-3.5 text-left">
                          <div className="font-semibold text-sm text-foreground leading-tight truncate">{r.officer}</div>
                          <div className="text-[11px] text-muted-foreground mt-0.5 font-mono">{r.empCode}</div>
                        </td>

                        {/* Date */}
                        <td className="px-2 py-3.5 text-center font-mono-data text-xs text-muted-foreground whitespace-nowrap">
                          {r.date}
                        </td>

                        {/* Visit Done count */}
                        <td className="px-2 py-3.5 text-center">
                          <span className="text-xs font-mono-data font-semibold text-muted-foreground">
                            {r.done}
                          </span>
                        </td>

                        {/* Hours */}
                        <td className="px-2 py-3.5 text-center font-mono-data text-xs font-medium whitespace-nowrap">{r.hours}</td>

                        {/* Tracking badge */}
                        <td className="px-2 py-3.5 text-center">
                          <Badge className={`text-[10px] font-semibold border-0 capitalize
                            ${gpsStatus === "online"  ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" :
                              gpsStatus === "delayed" ? "bg-amber-500/15 text-amber-600 dark:text-amber-400" :
                              gpsStatus === "offline" ? "bg-red-500/15 text-red-600 dark:text-red-400" :
                                                        "bg-slate-400/15 text-slate-500"}`}
                          >
                            {gpsStatus === "delayed" ? "Connectivity Issue" : gpsStatus}
                          </Badge>
                        </td>

                        {/* Action buttons */}
                        <td className="px-2 py-3.5 text-center">
                          <div className="flex flex-col items-center justify-center gap-1.5">
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 text-[10px] font-bold w-24"
                              onClick={(e) => {
                                e.stopPropagation();
                                setExpandedOfficerId(r.employee_oid);
                                setExpandedDate(r.rawDate || null);
                                setSelected(null);
                              }}
                            >
                              View Sites
                            </Button>
                            <Button
                              size="sm"
                              className="h-7 text-[10px] font-bold w-24 bg-blue-600 hover:bg-blue-700 text-white"
                              onClick={(e) => {
                                e.stopPropagation();
                                navigate(`/reports/combined/${r.employee_oid}?from_date=${r.rawDate}&to_date=${r.rawDate}`);
                              }}
                            >
                              Generate Report
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {rosterItems.length === 0 && (
                    <tr>
                      <td colSpan={6} className="text-center py-8 text-muted-foreground text-xs bg-muted/5">
                        No active officers found matching filters.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Stage 2: Selected Officer's Assigned Site Schedule */}
        {expandedOfficerId && !selected && (() => {
          const officerObj = officers.find((o) => o.employee_oid === expandedOfficerId);
          if (!officerObj) return null;

          return (
            <div className="space-y-4 animate-in fade-in duration-200">
              {/* Back navigation header */}
              <div className="flex items-center justify-between pb-2 border-b">
                <Button
                  size="sm"
                  className="h-8 gap-1.5 text-xs font-bold bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 shadow-sm"
                  onClick={() => {
                    setExpandedOfficerId(null);
                    setExpandedDate(null);
                  }}
                >
                  ← Back
                </Button>
                <div className="text-xs font-medium text-muted-foreground">
                  Officer: <span className="font-extrabold text-foreground">{officerObj.officer}</span> ({officerObj.emp_code || `EMP${officerObj.employee_oid}`})
                </div>
              </div>

              {loadingReport && (
                <div className="flex items-center justify-center p-8 bg-card border rounded-xl space-x-3">
                  <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
                  <span className="text-xs text-muted-foreground">Loading site visits...</span>
                </div>
              )}

              {!loadingReport && activeVisitsList.length === 0 && (
                <div className="p-8 text-center bg-card border rounded-xl text-xs text-muted-foreground">
                  No site visits found for this officer.
                </div>
              )}

              {/* Timeline slots */}
              {!loadingReport && activeVisitsList.length > 0 && (
                <div className="rounded-xl border border-border bg-card overflow-hidden shadow-sm divide-y">
                  {activeVisitsList.map((v) => {
                    return (
                      <div
                        key={v.id}
                        onClick={() => setSelectedSiteVisit(v)}
                        className="p-4 flex flex-wrap justify-between items-center gap-3 cursor-pointer transition-all hover:bg-muted/15"
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 text-[10px]">
                            <span className="font-mono-data font-bold text-muted-foreground">{v.checkIn || "Scheduled"}</span>
                            <span className="h-1.5 w-1.5 rounded-full bg-border" />
                            <span className="font-medium text-muted-foreground uppercase tracking-wider">{v.purpose}</span>
                          </div>
                          <div className="font-extrabold text-sm text-foreground">{v.site}</div>
                          <div className="text-[11px] text-muted-foreground mt-0.5">
                            Duration: <span className="font-mono-data font-semibold text-foreground">{v.duration}</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-3 ml-auto">
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-[10px] font-bold gap-1 bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-800 hover:bg-blue-100"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedSiteVisit(v);
                            }}
                          >
                            View Report <ChevronRight className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })()}

        {/* Stage 3: Detailed Visit Inspection Modal */}
        <VisitDetailModal
          visit={selected}
          siteVisits={activeReport?.site_visits}
          open={!!selected}
          onClose={() => setSelected(null)}
        />
      </div>
    </div>
  );
}
