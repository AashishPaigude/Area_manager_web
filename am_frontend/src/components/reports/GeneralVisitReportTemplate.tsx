import React from "react";
import { CompanyHeaderLogo } from "./CompanyHeaderLogo";

interface GeneralVisitReportTemplateProps {
  report: {
    id?: string;
    formattedReportId?: string;
    clientName?: string;
    siteName?: string;
    visitDate?: string;
    createdOn?: string;
    officer?: string;
    startTime?: string;
    endTime?: string;
    personVisited?: string;
    reasonOfVisit?: string;
    remark?: string;
    photos?: string[];
  };
  hideTitle?: boolean;
  hideLogo?: boolean;
  hideHeader?: boolean;
}

export function GeneralVisitReportTemplate({ report, hideTitle = false, hideLogo = false, hideHeader = false }: GeneralVisitReportTemplateProps) {
  const clientName = report?.clientName || "N/A";
  const siteName = report?.siteName || "N/A";
  const visitDate = report?.visitDate || report?.createdOn || "N/A";
  const photosList = Array.isArray(report?.photos) ? report.photos : [];
  const photoCount = photosList.length;

  const formatDateToDMY = (dateStr: string) => {
    if (!dateStr || dateStr === "N/A") return "N/A";
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

  const formatTo12Hour = (time24?: string) => {
    if (!time24 || time24 === "N/A") return "N/A";
    try {
      const [hoursStr, minutesStr] = time24.split(":");
      const hours = parseInt(hoursStr, 10);
      const minutes = parseInt(minutesStr, 10);
      if (isNaN(hours) || isNaN(minutes)) return time24;
      const ampm = hours >= 12 ? "PM" : "AM";
      const hours12 = hours % 12 || 12;
      return `${hours12.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")} ${ampm}`;
    } catch (e) {
      return time24;
    }
  };

  const reportIdStr = report?.formattedReportId || `01-${clientName}-${siteName}-OGV-${formatDateToDMY(visitDate)}`;

  return (
    <div className="report-template-content bg-white text-slate-900 mb-6 p-2">
      {/* PDF Header matching General Visit Report layout */}
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
                  FIELD OFFICER GENERAL VISIT REPORT
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
            <span className="text-xs font-semibold text-slate-900 break-words">{siteName}</span>
          </div>
          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase">Visit Date</label>
            <span className="text-xs font-semibold text-slate-900">{formatDateToDMY(visitDate)}</span>
          </div>
          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase">Visit Type</label>
            <span className="text-xs font-semibold text-slate-900">General Visit</span>
          </div>

          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase">Officer Name</label>
            <span className="text-xs font-semibold text-slate-900 break-words">{report?.officer || "—"}</span>
          </div>
          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase">Check In Time</label>
            <span className="text-xs font-semibold text-slate-900">{formatTo12Hour(report?.startTime || "—")}</span>
          </div>
          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase">Check Out Time</label>
            <span className="text-xs font-semibold text-slate-900">{formatTo12Hour(report?.endTime || "—")}</span>
          </div>

          <div className="col-span-2 md:col-span-4">
            <label className="block text-[10px] font-bold text-slate-500 uppercase">Photo Evidence</label>
            <span className="text-xs font-semibold text-slate-900">{photoCount} {photoCount === 1 ? "Photo" : "Photos"}</span>
          </div>
        </div>
      </div>

      {/* Section 2: Visit Parameters */}
      <div className="mb-6 pdf-avoid-card">
        <div className="bg-[#1e3a8a] text-white text-[11px] font-extrabold uppercase tracking-wider px-4 py-2 rounded-t-lg border-l-4 border-indigo-400 pdf-section-title">
          Visit Parameters & Scope
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 p-4 border border-t-0 border-slate-200 bg-slate-50/70 rounded-b-lg">
          <div className="col-span-1">
            <label className="block text-[10px] font-bold text-slate-500 uppercase">Person Visited</label>
            <span className="text-xs font-semibold text-slate-900 break-words">{report?.personVisited || "N/A"}</span>
          </div>
          <div className="col-span-3">
            <label className="block text-[10px] font-bold text-slate-500 uppercase">Reason of Visit</label>
            <span className="text-xs font-medium text-slate-700 whitespace-pre-line break-words">
              {report?.reasonOfVisit || "Routine Inspection"}
            </span>
          </div>
        </div>
      </div>

      {/* Section 3: Notes & Remarks */}
      <div className="mb-6 pdf-avoid-card">
        <div className="bg-[#1e3a8a] text-white text-[11px] font-extrabold uppercase tracking-wider px-4 py-2 rounded-t-lg border-l-4 border-indigo-400 pdf-section-title">
          Remarks & Inspector Notes
        </div>
        <div className="border border-t-0 border-slate-200 rounded-b-lg p-4 bg-slate-50 text-xs text-slate-700 italic whitespace-pre-line shadow-sm break-words">
          {report?.remark || "No remarks recorded."}
        </div>
      </div>

      {/* Photo Evidence Gallery */}
      {photoCount > 0 && (
        <div className="mb-6 pdf-avoid-card">
          <div className="bg-[#1e3a8a] text-white text-[11px] font-extrabold uppercase tracking-wider px-4 py-2 rounded-t-lg border-l-4 border-indigo-400 pdf-section-title">
            Photo Evidence
          </div>
          <div className="border border-t-0 border-slate-200 rounded-b-lg p-4 bg-slate-50 shadow-sm">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {photosList.map((photo, pIdx) => (
                <div key={pIdx} className="aspect-square rounded-lg overflow-hidden border border-slate-300 bg-slate-100 flex items-center justify-center shadow-2xs">
                  <img src={photo} alt={`Evidence ${pIdx + 1}`} className="w-full h-full object-cover" />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
