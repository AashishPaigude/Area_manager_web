import React, { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Download, Loader2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GeneralVisitReportTemplate } from "@/components/reports/GeneralVisitReportTemplate";
import { DayVisitReportTemplate } from "@/components/reports/DayVisitReportTemplate";
import { NightVisitReportTemplate } from "@/components/reports/NightVisitReportTemplate";
import { CompanyHeaderLogo, resolveCompanyDetails } from "@/components/reports/CompanyHeaderLogo";
import { getCombinedReport, CombinedReportResponse } from "@/services/reportService";
// @ts-ignore
import html2pdf from "html2pdf.js";
import { toast } from "sonner";

export default function FieldOfficerCombinedReport() {
  const { officerId } = useParams();
  const navigate = useNavigate();
  const reportRef = useRef<HTMLDivElement>(null);

  const [isDownloading, setIsDownloading] = useState(false);
  const [report, setReport] = useState<CombinedReportResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const employeeOid = Number(officerId);

  useEffect(() => {
    if (!officerId || isNaN(employeeOid) || employeeOid <= 0) {
      setError("Invalid officer ID provided.");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    getCombinedReport(employeeOid)
      .then((data) => {
        setReport(data);
        setLoading(false);
      })
      .catch((err: any) => {
        console.error("Failed to load combined report:", err);
        setError(err.message || "Failed to load officer report.");
        setLoading(false);
      });
  }, [officerId, employeeOid]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] space-y-4">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
        <p className="text-sm font-medium text-slate-600">Loading Officer Combined Report...</p>
      </div>
    );
  }

  if (error || !report) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] space-y-4 max-w-lg mx-auto text-center px-4">
        <div className="h-12 w-12 rounded-full bg-red-100 text-red-600 flex items-center justify-center">
          <AlertTriangle className="h-6 w-6" />
        </div>
        <h3 className="text-lg font-bold text-slate-900">Failed to Load Report</h3>
        <p className="text-xs text-slate-600">{error || "No report data available for this officer."}</p>
        <Button onClick={() => navigate("/visits")} variant="outline" size="sm" className="mt-2">
          <ArrowLeft className="h-4 w-4 mr-2" /> Back to Reports Roster
        </Button>
      </div>
    );
  }

  // Real Data Mapping from CombinedReportResponse
  const companyDetails = resolveCompanyDetails(report?.officer || report);

  const officerInfo = {
    name: report.officer.officer || "Field Officer",
    empCode: report.officer.emp_code || `EMP${report.officer.employee_oid}`,
    branch: report.officer.branch || "N/A",
    area: report.officer.area || "N/A",
    shift: report.officer.shift || "Day / Night",
    reportDate: report.site_visits[0]?.visit_date || "Today",
    punchIn: report.officer.punch_in || "—",
    punchOut: report.officer.punch_out || "—",
    hoursWorked:
      report.officer.hours_worked !== null && report.officer.hours_worked !== undefined
        ? `${report.officer.hours_worked}`
        : "—",
  };

  const execSummary = {
    plannedVisits: report.summary.planned_visits,
    completedVisits: report.summary.completed_visits,
    missedVisits: report.summary.missed_visits,
    generalReports: report.summary.general_reports,
    dayReports: report.summary.day_reports,
    nightReports: report.summary.night_reports,
    totalSitesCovered: report.summary.total_sites_covered,
  };

  const siteSummary = report.site_visits.map((sv) => ({
    srNo: sv.serial_no,
    siteName: sv.site_name || `Site #${sv.site_id}`,
    visitType: sv.visit_type,
    checkIn: sv.check_in || "—",
    checkOut: sv.check_out || "—",
    status: sv.status || "Completed",
  }));

  const mappedGeneralReports = report.general_reports.map((g, idx) => {
    const indexStr = String(idx + 1).padStart(2, "0");
    const siteName = g.site_name || "Site";
    const clientName = g.client_name || "Client";
    return {
      siteIndex: indexStr,
      siteName: siteName,
      clientName: clientName,
      visitType: "GENERAL VISIT REPORT",
      type: "general",
      reportData: {
        ...g,
        id: g.id || `GV-${indexStr}`,
        formattedReportId: g.formatted_report_id || `${indexStr}-${clientName}-${siteName}-OGV`,
        clientName: clientName,
        siteName: siteName,
        visitDate: g.visit_date || officerInfo.reportDate,
        officer: g.officer || officerInfo.name,
        startTime: g.start_time || "—",
        endTime: g.end_time || "—",
        personVisited: (g as any).personVisited || g.person_visited || "N/A",
        reasonOfVisit: (g as any).reasonOfVisit || g.reason_of_visit || "General Inspection",
        remark: g.remark || "",
        photos: g.photos || [],
      },
    };
  });

  const mappedDayReports = report.day_reports.map((d, idx) => {
    const indexStr = String(mappedGeneralReports.length + idx + 1).padStart(2, "0");
    const siteName = d.site_name || d.unit || "Site";
    const clientName = d.client_name || "Client";

    let parsedSuggestions: any = d.suggestions;
    if (typeof d.suggestions === "string" && d.suggestions.trim().startsWith("{")) {
      try {
        parsedSuggestions = JSON.parse(d.suggestions);
      } catch (e) {
        // ignore
      }
    }

    return {
      siteIndex: indexStr,
      siteName: siteName,
      clientName: clientName,
      visitType: "DAY VISIT REPORT",
      type: "day",
      reportData: {
        ...d,
        id: d.id || `DV-${indexStr}`,
        formattedReportId: d.formatted_report_id || `${indexStr}-${clientName}-${siteName}-ODV`,
        clientName: clientName,
        unit: d.unit || siteName,
        siteName: siteName,
        shift: d.shift || "Day Shift",
        visitDate: d.visit_date || officerInfo.reportDate,
        officer: d.officer || officerInfo.name,
        startTime: d.start_time || "—",
        endTime: d.end_time || "—",
        gps: d.gps || "—",
        photos: d.photos || [],
        guards: d.guards || [],
        checklist: d.checklist || [],
        observations: d.observations,
        customerFeedback: typeof parsedSuggestions === "object" ? parsedSuggestions?.customerFeedback : undefined,
        suggestions: typeof parsedSuggestions === "object" ? parsedSuggestions?.overallSuggestions : typeof parsedSuggestions === "string" ? parsedSuggestions : undefined,
        lectureDetails: d.lecture_details,
        randomChecking: d.random_checking,
        overallRemarks: d.overall_remarks,
      },
    };
  });

  const mappedNightReports = report.night_reports.map((n, idx) => {
    const indexStr = String(mappedGeneralReports.length + mappedDayReports.length + idx + 1).padStart(2, "0");
    const siteName = n.site_name || n.unit || "Site";
    const clientName = n.client_name || "Client";
    return {
      siteIndex: indexStr,
      siteName: siteName,
      clientName: clientName,
      visitType: "NIGHT ROUND REPORT",
      type: "night",
      reportData: {
        ...n,
        id: n.id || `NV-${indexStr}`,
        formattedReportId: n.formatted_report_id || `${indexStr}-${clientName}-${siteName}-ONR`,
        clientName: clientName,
        unit: n.unit || siteName,
        siteName: siteName,
        shift: n.shift || "Night Shift",
        visitDate: n.visit_date || officerInfo.reportDate,
        officer: n.officer || officerInfo.name,
        startTime: n.start_time || "—",
        endTime: n.end_time || "—",
        gps: n.gps || "—",
        photos: n.photos || [],
        guards: n.guards || [],
        checklist: n.checklist || [],
        lectureDetails: n.lecture_details,
        randomChecking: n.random_checking,
        suggestions: n.suggestions,
        overallRemarks: n.overall_remarks,
      },
    };
  });

  const siteReportsData = [
    ...mappedGeneralReports,
    ...mappedDayReports,
    ...mappedNightReports,
  ];

  const handleDownloadPDF = async () => {
    if (isDownloading) return;
    const element = reportRef.current;
    if (!element) {
      toast.error("Report content not found.");
      return;
    }

    setIsDownloading(true);
    const toastId = toast.loading("Generating combined PDF report...");

    const originalBorder = element.style.border;
    const originalBoxShadow = element.style.boxShadow;

    try {
      element.style.border = "none";
      element.style.boxShadow = "none";

      if (document.fonts) {
        await document.fonts.ready;
      }

      const options = {
        margin: [8, 8, 8, 8],
        filename: `Consolidated_Report_${officerInfo.empCode}_14-07-26.pdf`,
        image: { type: "jpeg", quality: 0.98 },
        html2canvas: {
          scale: 2,
          useCORS: true,
          logging: false,
          letterRendering: true,
        },
        jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
        pagebreak: {
          mode: ["css", "legacy"],
          before: ".pdf-page-break",
          avoid: ["tr", "thead", ".pdf-avoid-card", ".pdf-avoid-break"],
        },
      };

      const pdfBlob = await html2pdf().set(options).from(element).outputPdf("blob");
      const pdfUrl = URL.createObjectURL(pdfBlob);

      window.open(pdfUrl, "_blank");

      const downloadLink = document.createElement("a");
      downloadLink.href = pdfUrl;
      downloadLink.download = `Consolidated_Report_${officerInfo.empCode}_14-07-26.pdf`;
      document.body.appendChild(downloadLink);
      downloadLink.click();
      document.body.removeChild(downloadLink);

      toast.success("Combined PDF generated & opened successfully!", { id: toastId });
    } catch (err) {
      console.error("PDF generation failed:", err);
      toast.error("Failed to generate PDF. Please try again.", { id: toastId });
    } finally {
      if (element) {
        element.style.border = originalBorder;
        element.style.boxShadow = originalBoxShadow;
      }
      setIsDownloading(false);
    }
  };

  return (
    <div className="space-y-3 max-w-5xl mx-auto pt-0 pb-16 print:p-0 print:m-0 print:max-w-full">
      <style
        dangerouslySetInnerHTML={{
          __html: `
        @media print {
          body, html {
            overflow: visible !important;
            height: auto !important;
            background: white !important;
          }
          .print\\:hidden {
            display: none !important;
          }
          .pdf-page-break {
            break-before: page !important;
            page-break-before: always !important;
          }
          .pdf-avoid-card {
            break-inside: avoid !important;
            page-break-inside: avoid !important;
          }
          tr {
            break-inside: avoid !important;
            page-break-inside: avoid !important;
          }
          thead {
            break-inside: avoid !important;
            page-break-inside: avoid !important;
            display: table-header-group;
          }
        }
        .pdf-page-break {
          break-before: page !important;
          page-break-before: always !important;
        }
        .pdf-avoid-card {
          break-inside: avoid !important;
          page-break-inside: avoid !important;
        }
        tr {
          break-inside: avoid !important;
          page-break-inside: avoid !important;
        }
        thead {
          break-inside: avoid !important;
          page-break-inside: avoid !important;
          display: table-header-group;
        }
        tbody, table {
          break-inside: auto !important;
        }
        .pdf-downloading .report-template-content {
          border: none !important;
          border-width: 0 !important;
          box-shadow: none !important;
          padding: 0 !important;
          border-radius: 0 !important;
          background: transparent !important;
        }
      `,
        }}
      />

      {/* Top Controls (Hidden on Print) */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 print:hidden">
        <Button
          onClick={() => navigate("/visits")}
          className="flex items-center gap-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full px-4 h-9 text-xs font-bold shadow-sm"
        >
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>

        <div className="flex gap-2">
          <Button
            onClick={handleDownloadPDF}
            disabled={isDownloading}
            className="bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-2 rounded-full px-5 h-9 text-xs font-semibold shadow-md"
          >
            {isDownloading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            Download PDF
          </Button>
        </div>
      </div>

      {/* Main Combined Report Container */}
      <div
        ref={reportRef}
        className={`bg-white text-slate-900 border border-slate-200 rounded-xl p-8 shadow-md print:shadow-none print:border-none print:p-0 ${isDownloading ? "pdf-downloading" : ""}`}
      >
        {/* Company Header */}
        <div className="border-b-2 border-[#1e3a8a] pb-4 mb-6 pdf-avoid-break break-inside-avoid">
          <CompanyHeaderLogo
            reportOrOfficer={report?.officer || report}
            imgClassName="h-11 w-auto object-contain max-w-[140px]"
            titleClassName="text-base font-black tracking-tight text-slate-900 leading-none"
          />
          <div className="flex justify-between items-end">
            <div className="flex flex-col">
              <h1 className="text-base font-black text-[#1e3a8a] leading-tight uppercase tracking-tight">
                FIELD OFFICER CONSOLIDATED VISIT REPORT
              </h1>
              <span className="text-[11px] font-bold text-slate-800 mt-1 uppercase font-mono">
                CONSOLIDATED ID : CR-2026-PUNE-{officerInfo.empCode}-140726
              </span>
            </div>
            <div className="text-right text-[11px] font-bold text-slate-800 leading-normal uppercase font-mono">
              REPORT DATE : {officerInfo.reportDate}
            </div>
          </div>
        </div>

        {/* Officer Information Summary */}
        <div className="mb-6 pdf-avoid-break break-inside-avoid">
          <div className="bg-[#1e3a8a] text-white text-[11px] font-extrabold uppercase tracking-wider px-4 py-2 rounded-t-lg border-l-4 border-indigo-400">
            Officer Profile & Shift Summary
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 p-4 border border-t-0 border-slate-200 bg-slate-50/70 rounded-b-lg text-xs">
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase">Officer Name</label>
              <span className="font-bold text-slate-900 text-sm">{officerInfo.name}</span>
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase">Employee ID</label>
              <span className="font-bold text-slate-900 font-mono">{officerInfo.empCode}</span>
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase">Branch</label>
              <span className="font-bold text-slate-900 font-mono">{officerInfo.branch || "N/A"}</span>
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase">Assigned Shift</label>
              <span className="font-semibold text-slate-800">{officerInfo.shift}</span>
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase">Punch In</label>
              <span className="font-bold text-emerald-600 font-mono">{officerInfo.punchIn}</span>
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase">Punch Out</label>
              <span className="font-bold text-rose-600 font-mono">{officerInfo.punchOut}</span>
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase">Hours Worked</label>
              <span className="font-bold text-blue-600 font-mono">
                {officerInfo.hoursWorked !== "—" && officerInfo.hoursWorked !== "" ? `${officerInfo.hoursWorked} hrs` : "—"}
              </span>
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase">Total Sites Covered</label>
              <span className="font-bold text-indigo-700">{execSummary.totalSitesCovered} Sites</span>
            </div>
          </div>
        </div>

        {/* Site Visit Summary Table */}
        <div className="mb-8 pdf-avoid-break break-inside-avoid">
          <div className="bg-[#1e3a8a] text-white text-[11px] font-extrabold uppercase tracking-wider px-4 py-2 rounded-t-lg border-l-4 border-indigo-400">
            Site Visit Summary Roster
          </div>
          <div className="overflow-x-auto border border-t-0 border-slate-200 rounded-b-lg">
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="bg-slate-200 border-b border-slate-300 text-slate-900 font-bold">
                  <th className="p-2.5 text-center w-14">Sr No</th>
                  <th className="p-2.5">Site Name</th>
                  <th className="p-2.5">Visit Type</th>
                  <th className="p-2.5 text-center w-24">Check In</th>
                  <th className="p-2.5 text-center w-24">Check Out</th>
                  <th className="p-2.5 text-center w-28">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {siteSummary.map((s) => (
                  <tr key={s.srNo} className="hover:bg-slate-50">
                    <td className="p-2.5 text-center font-semibold text-slate-600">{s.srNo}</td>
                    <td className="p-2.5 font-bold text-slate-900">{s.siteName}</td>
                    <td className="p-2.5 font-semibold text-slate-700">{s.visitType}</td>
                    <td className="p-2.5 text-center font-mono font-medium text-emerald-700">{s.checkIn}</td>
                    <td className="p-2.5 text-center font-mono font-medium text-slate-600">{s.checkOut}</td>
                    <td className="p-2.5 text-center">
                      <span
                        className={`font-bold ${s.status?.toLowerCase() === "completed" || s.status?.toLowerCase() === "ok" || s.status?.toLowerCase() === "yes"
                          ? "text-emerald-600"
                          : s.status?.toLowerCase() === "missed" || s.status?.toLowerCase() === "absent" || s.status?.toLowerCase() === "no"
                            ? "text-red-600"
                            : "text-slate-900"
                          }`}
                      >
                        {s.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Detailed Reports Section */}
        <div className="mt-8 space-y-12">
          {siteReportsData.map((item, index) => (
            <div key={item.siteIndex} className={index > 0 ? "pdf-page-break pt-6" : ""}>
              {/* Site Header Banner */}
              <div className="my-3 px-4 py-3 bg-slate-100/90 border-l-4 border-[#1e3a8a] rounded-r-lg text-left shadow-2xs pdf-avoid-card w-full space-y-2.5 leading-normal">
                {/* Row 1: Site Title & Visit Type */}
                <div className="flex justify-between items-center gap-3 border-b border-slate-200/80 pb-2 leading-normal">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <span className="text-xs font-black text-[#1e3a8a] tracking-wider uppercase shrink-0 leading-normal">
                      SITE {item.siteIndex < 10 ? `0${item.siteIndex}` : item.siteIndex}
                    </span>
                    <span className="text-slate-400 font-bold">•</span>
                    <span className="text-xs font-black text-slate-900 uppercase tracking-wide leading-normal">
                      {item.siteName}
                    </span>
                  </div>
                  <span className="text-xs font-extrabold text-slate-700 uppercase tracking-wider shrink-0 leading-normal">
                    {item.visitType}
                  </span>
                </div>

                {/* Row 2: Report ID & Date/Time */}
                <div className="flex justify-between items-center gap-4 text-[10px] font-mono text-slate-800 font-bold leading-normal">
                  <div className="min-w-0 flex-1 break-all">
                    <span className="text-slate-500 uppercase">REPORT ID :</span>{" "}
                    <span className="text-slate-900">
                      {item.reportData?.formattedReportId || `0${item.siteIndex}-${item.siteName}`}
                    </span>
                  </div>
                  <div className="shrink-0 text-right whitespace-nowrap">
                    <span className="text-slate-500 uppercase">DATE :</span>{" "}
                    <span className="text-slate-900">
                      {item.reportData?.visitDate || "14/07/26"} ({item.reportData?.startTime || "09:00"} - {item.reportData?.endTime || "09:40"})
                    </span>
                  </div>
                </div>
              </div>

              {/* Render Respective Report Template */}
              {item.type === "general" && (
                <GeneralVisitReportTemplate report={item.reportData} hideHeader={true} siteIndex={item.siteIndex} />
              )}
              {item.type === "day" && (
                <DayVisitReportTemplate report={item.reportData} hideHeader={true} siteIndex={item.siteIndex} />
              )}
              {item.type === "night" && (
                <NightVisitReportTemplate report={item.reportData} hideHeader={true} siteIndex={item.siteIndex} />
              )}
            </div>
          ))}
        </div>

        {/* Footer Meta */}
        <div className="pt-6 border-t border-slate-200 flex justify-between items-center text-[9px] text-slate-400 font-bold uppercase tracking-widest mt-8">
          <span>Consolidated Field Officer Operations Report • {companyDetails.companyName}</span>
        </div>
      </div>
    </div>
  );
}
