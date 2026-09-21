import React from "react";
import { CompanyHeaderLogo } from "./CompanyHeaderLogo";

interface NightVisitReportTemplateProps {
  report: {
    id?: string;
    formattedReportId?: string;
    clientId?: string;
    clientName?: string;
    unit?: string;
    shift?: string;
    visitDate?: string;
    createdOn?: string;
    officer?: string;
    startTime?: string;
    endTime?: string;
    gps?: string;
    photos?: string[];
    guards?: Array<{ id: string | number; name: string; employeeId: string; present: boolean }>;
    checklist?: Array<{ id?: string; question: string; answer?: string; remarks?: string }>;
    lectureDetails?: string;
    randomChecking?: string;
    suggestions?: string;
  };
  hideTitle?: boolean;
  hideLogo?: boolean;
  hideHeader?: boolean;
}

export function NightVisitReportTemplate({ report, hideTitle = false, hideLogo = false, hideHeader = false }: NightVisitReportTemplateProps) {
  const clientName = report?.clientName || "N/A";
  const unit = report?.unit || "N/A";
  const visitDate = report?.visitDate || report?.createdOn || "14 Jul 2026";
  const photosList = Array.isArray(report?.photos) ? report.photos : [];
  const photoCount = photosList.length;

  const formatDateToDMY = (dateStr: string) => {
    if (!dateStr) return "14/07/26";
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr.replace(/-/g, "/");
      const day = d.getDate().toString().padStart(2, "0");
      const month = (d.getMonth() + 1).toString().padStart(2, "0");
      const year = d.getFullYear().toString().slice(-2);
      return `${day}/${month}/${year}`;
    } catch (e) {
      return dateStr;
    }
  };

  const reportIdStr = report?.formattedReportId || `03-${clientName}-${unit}-ONR-${formatDateToDMY(visitDate)}`;

  const parseArray = <T,>(data: any, fallback: T[]): T[] => {
    if (Array.isArray(data)) return data;
    if (typeof data === "string" && data.trim()) {
      try {
        const parsed = JSON.parse(data);
        if (Array.isArray(parsed)) return parsed;
      } catch (e) {
        // ignore
      }
    }
    return fallback;
  };

  const guardsList = parseArray(report?.guards, []);

  const rawChecklist = parseArray<any>(report?.checklist, []);
  const checklistItems = rawChecklist.filter((q: any) => {
    const ansStr = (q.answer || q.status || "").toString().trim();
    const remStr = (q.remarks || q.observation || "").toString().trim();
    return ansStr !== "" || remStr !== "";
  });

  const parseJsonField = (val?: string | null): { feedback?: string; suggestions?: string } => {
    if (!val) return {};
    const trimmed = val.trim();
    if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
      try {
        const obj = JSON.parse(trimmed);
        if (typeof obj === "object" && obj !== null) {
          return {
            feedback: obj.customerFeedback || obj.feedback || undefined,
            suggestions: obj.overallSuggestions || obj.suggestions || undefined,
          };
        }
      } catch {
        // ignore parse error
      }
    }
    return { suggestions: val };
  };

  const parsedFromSuggestions = parseJsonField(report?.suggestions);

  const lectureText = report?.lectureDetails || (report as any)?.lecture_details || "No short lecture details recorded.";
  const randomCheckText = report?.randomChecking || (report as any)?.random_checking || "No random checking recorded.";
  
  const rawSug = report?.suggestions;
  const suggestionsText =
    rawSug && !rawSug.trim().startsWith("{")
      ? rawSug
      : parsedFromSuggestions.suggestions || parsedFromSuggestions.feedback || "No officer suggestions recorded.";

  return (
    <div className="report-template-content bg-white text-slate-900 mb-6 p-2">
      {/* PDF Header */}
      {!hideHeader && (
        <div className="border-b-2 border-[#1e3a8a] pb-4 mb-4">
          {!hideLogo && (
            <CompanyHeaderLogo
              reportOrOfficer={report}
              className="flex items-center gap-3 mb-4"
              imgClassName="h-9 w-auto object-contain max-w-[120px]"
              titleClassName="text-sm font-black tracking-tight text-slate-900 leading-none"
            />
          )}
          <div className="flex justify-between items-end gap-4">
            <div className="flex flex-col min-w-0 shrink max-w-[65%]">
              {!hideTitle && (
                <h1 className="text-sm font-black text-[#1e3a8a] leading-tight uppercase tracking-tight w-fit">
                  FIELD OFFICER NIGHT VISIT REPORT
                </h1>
              )}
              <span className="text-[10px] font-bold text-slate-800 mt-1 uppercase font-mono break-all">
                REPORT ID : {reportIdStr}
              </span>
            </div>
            <div className="text-right text-[10px] font-bold text-slate-800 leading-normal uppercase font-mono shrink-0 whitespace-nowrap">
              DATE : {formatDateToDMY(visitDate)}
            </div>
          </div>
        </div>
      )}

      {/* General Information Block */}
      <div className="mb-6 pdf-avoid-card">
        <div className="bg-[#1e3a8a] text-white text-[11px] font-extrabold uppercase tracking-wider px-4 py-2 rounded-t-lg border-l-4 border-indigo-400 pdf-section-title">
          General Information
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-4 border border-t-0 border-slate-200 bg-slate-50/70 rounded-b-lg">
          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase">Client Name</label>
            <span className="text-xs font-semibold text-slate-900 break-words">{clientName}</span>
          </div>
          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase">Site Name</label>
            <span className="text-xs font-semibold text-slate-900 break-words">{unit}</span>
          </div>
          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase">Shift</label>
            <span className="text-xs font-semibold text-slate-900">{report?.shift || "Night Shift"}</span>
          </div>
          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase">Visit Type</label>
            <span className="text-xs font-semibold text-slate-900">Night Visit</span>
          </div>

          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase">Officer Name</label>
            <span className="text-xs font-semibold text-slate-900 break-words">{report?.officer || "—"}</span>
          </div>
          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase">Check In Time</label>
            <span className="text-xs font-semibold text-slate-900">{report?.startTime || "—"}</span>
          </div>
          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase">Check Out Time</label>
            <span className="text-xs font-semibold text-slate-900">{report?.endTime || "—"}</span>
          </div>
          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase">GPS Location</label>
            <span className="text-xs font-semibold text-slate-900 break-all">{report?.gps || "—"}</span>
          </div>

          <div className="col-span-2 md:col-span-4">
            <label className="block text-[10px] font-bold text-slate-500 uppercase">Photo Evidence</label>
            <span className="text-xs font-semibold text-slate-900">{photoCount} {photoCount === 1 ? "Photo" : "Photos"}</span>
          </div>
        </div>
      </div>

      {/* Guards Present Section */}
      <div className="mb-6">
        <div className="bg-[#1e3a8a] text-white text-[11px] font-extrabold uppercase tracking-wider px-4 py-2 rounded-t-lg border-l-4 border-indigo-400 pdf-section-title">
          Guards Present on Duty
        </div>
        <div className="overflow-x-auto border border-t-0 border-slate-200 rounded-b-lg">
          {guardsList.length > 0 ? (
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="bg-slate-200 border-b border-slate-300 text-slate-900 font-bold">
                  <th className="p-2 text-center w-12">Sr No</th>
                  <th className="p-2">Guard Name</th>
                  <th className="p-2">Employee ID</th>
                  <th className="p-2 text-center w-24">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {guardsList.map((g, idx) => (
                  <tr key={idx} className="pdf-avoid-card">
                    <td className="p-2 text-center font-medium text-slate-600">{idx + 1}</td>
                    <td className="p-2 font-semibold text-slate-900 break-words whitespace-normal">{g.name}</td>
                    <td className="p-2 text-slate-700 break-words whitespace-normal">{g.employeeId}</td>
                    <td className="p-2 text-center">
                      <span className={`font-bold ${g.present !== false ? "text-emerald-600" : "text-red-600"}`}>
                        {g.present !== false ? "Present" : "Absent"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="p-4 text-xs text-slate-500 italic">No guards listed for this visit.</div>
          )}
        </div>
      </div>

      {/* Inspection Checklist Table */}
      <div className="mb-6 pdf-avoid-card pdf-page-break pt-6">
        <div className="bg-[#1e3a8a] text-white text-[11px] font-extrabold uppercase tracking-wider px-4 py-2 rounded-t-lg border-l-4 border-indigo-400 pdf-section-title">
          2. Inspection Checklist
        </div>
        <div className="overflow-x-auto border border-t-0 border-slate-200 rounded-b-lg">
          {checklistItems.length > 0 ? (
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="bg-slate-200 border-b border-slate-300 text-slate-900 font-bold">
                  <th className="p-2 text-center w-12">SR. NO.</th>
                  <th className="p-2">Inspection Item</th>
                  <th className="p-2 w-28">Answer</th>
                  <th className="p-2">Remarks</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {checklistItems.map((q: any, idx: number) => {
                  const ans = (q.answer || q.status || "-").toString().trim();
                  const clean = ans.toUpperCase();
                  const isPositive = ["YES", "OK", "GOOD", "DONE", "PRESENT", "COMPLETED", "SERVICEABLE", "ADEQUATE", "SATISFACTORY"].includes(clean);
                  const isNegative = ["NO", "NOT OK", "BAD", "NOT DONE", "ABSENT", "MISSED", "UNSERVICEABLE", "INADEQUATE"].includes(clean);
                  const colorClass = isPositive ? "text-emerald-600" : isNegative ? "text-red-600" : "text-slate-900";
                  return (
                    <tr key={idx} className="pdf-avoid-card">
                      <td className="p-2 text-center font-medium text-slate-600">{idx + 1}</td>
                      <td className="p-2 font-semibold text-slate-900 break-words whitespace-normal">{q.question}</td>
                      <td className={`p-2 font-bold ${colorClass}`}>{ans}</td>
                      <td className="p-2 text-slate-700 break-words whitespace-normal">{q.remarks || q.observation || "-"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <div className="p-4 text-xs text-slate-500 italic">No checklist items were answered for this visit.</div>
          )}
        </div>
      </div>

      {/* 3. Photo Evidence Section */}
      {photoCount > 0 && (
        <div className="mb-6 pdf-avoid-card">
          <div className="bg-[#1e3a8a] text-white text-[11px] font-extrabold uppercase tracking-wider px-4 py-2 rounded-t-lg border-l-4 border-indigo-400 pdf-section-title">
            3. Photo Evidence
          </div>
          <div className="border border-t-0 border-slate-200 rounded-b-lg p-4 bg-slate-50 shadow-sm">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {photosList.map((photo, pIdx) => (
                <div
                  key={pIdx}
                  className="aspect-square rounded-lg overflow-hidden border border-slate-300 bg-slate-100 flex items-center justify-center shadow-2xs"
                >
                  <img
                    src={photo}
                    alt={`Evidence ${pIdx + 1}`}
                    className="w-full h-full object-cover"
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Short Lecture & Random Checking */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6 pdf-avoid-card">
        <div>
          <div className="bg-[#1e3a8a] text-white text-[11px] font-extrabold uppercase tracking-wider px-4 py-2 rounded-t-lg border-l-4 border-indigo-400 pdf-section-title">
            4. Short Lecture
          </div>
          <div className="border border-t-0 border-slate-200 rounded-b-lg p-3 bg-slate-50 text-xs text-slate-700 min-h-[80px] break-words whitespace-pre-wrap">
            {lectureText}
          </div>
        </div>
        <div>
          <div className="bg-[#1e3a8a] text-white text-[11px] font-extrabold uppercase tracking-wider px-4 py-2 rounded-t-lg border-l-4 border-indigo-400 pdf-section-title">
            5. Random Checking
          </div>
          <div className="border border-t-0 border-slate-200 rounded-b-lg p-3 bg-slate-50 text-xs text-slate-700 min-h-[80px] break-words whitespace-pre-wrap">
            {randomCheckText}
          </div>
        </div>
      </div>

      {/* Suggestions */}
      <div className="mb-6 pdf-avoid-card">
        <div className="bg-[#1e3a8a] text-white text-[11px] font-extrabold uppercase tracking-wider px-4 py-2 rounded-t-lg border-l-4 border-indigo-400 pdf-section-title">
          6. Officer Suggestions
        </div>
        <div className="border border-t-0 border-slate-200 rounded-b-lg p-3 bg-slate-50 text-xs text-slate-700 font-medium whitespace-pre-wrap shadow-sm break-words">
          {suggestionsText}
        </div>
      </div>

    </div>
  );
}
