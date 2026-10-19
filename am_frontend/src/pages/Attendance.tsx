import { useState, useEffect, useCallback, useMemo } from "react";
import { Users, AlertTriangle, CheckCircle2, Filter, Loader2, RefreshCw, AlertCircle, Calendar as CalendarIcon, Search } from "lucide-react";
import { format, parseISO, subDays, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from "date-fns";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from "@/components/ui/select";
import {
  getAttendance,
  AttendanceListData,
  AttendanceRecord,
} from "../services/attendanceService";
import { getBranches, Branch } from "@/services/visitService";

const statusStyle: Record<string, { badge: string; label: string }> = {
  present:      { badge: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20", label: "Present" },
  missed_punch: { badge: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/20", label: "Missed" },
  missed:       { badge: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/20", label: "Missed" },
  absent:       { badge: "bg-red-500/15 text-red-600 dark:text-red-400 border border-red-500/20",             label: "Absent" },
};

export default function Attendance() {
  const getTodayStr = () => format(new Date(), "yyyy-MM-dd");

  const [datePreset, setDatePreset] = useState<string>("TODAY");
  const [startDate, setStartDate] = useState<string>(getTodayStr());
  const [endDate, setEndDate] = useState<string>(getTodayStr());
  const [filterStatus, setFilterStatus] = useState<string>("ALL");
  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedBranch, setSelectedBranch] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [attendanceData, setAttendanceData] = useState<AttendanceListData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch branches on mount
  useEffect(() => {
    getBranches()
      .then((bList) => setBranches(bList || []))
      .catch((err) => console.error("Failed to load branches for Attendance:", err));
  }, []);

  const fetchAttendance = useCallback(async (sDate: string, eDate: string, statusVal: string, branchVal?: string) => {
    setLoading(true);
    setError(null);
    try {
      const activeBranch = branchVal !== undefined ? branchVal : selectedBranch;
      const branchOid = activeBranch !== "ALL" ? parseInt(activeBranch) : undefined;
      const res = await getAttendance(undefined, statusVal, sDate, eDate, branchOid);
      setAttendanceData(res.data);
    } catch (err: any) {
      console.error("Attendance fetch error:", err);
      setError(err.message || "Failed to load attendance records");
    } finally {
      setLoading(false);
    }
  }, [selectedBranch]);

  const handlePresetChange = (preset: string) => {
    setDatePreset(preset);
    const now = new Date();
    let s = startDate;
    let e = endDate;

    if (preset === "TODAY") {
      s = format(now, "yyyy-MM-dd");
      e = s;
    } else if (preset === "YESTERDAY") {
      s = format(subDays(now, 1), "yyyy-MM-dd");
      e = s;
    } else if (preset === "WEEKLY") {
      s = format(startOfWeek(now, { weekStartsOn: 1 }), "yyyy-MM-dd");
      e = format(endOfWeek(now, { weekStartsOn: 1 }), "yyyy-MM-dd");
    } else if (preset === "MONTHLY") {
      s = format(startOfMonth(now), "yyyy-MM-dd");
      e = format(endOfMonth(now), "yyyy-MM-dd");
    }

    setStartDate(s);
    setEndDate(e);
    fetchAttendance(s, e, filterStatus);
  };

  useEffect(() => {
    fetchAttendance(startDate, endDate, filterStatus);
  }, []);

  const handleRetry = () => {
    fetchAttendance(startDate, endDate, filterStatus);
  };

  const formatDisplayDate = (dateStr?: string) => {
    if (!dateStr) return "—";
    try {
      return format(parseISO(dateStr), "dd MMM yyyy");
    } catch {
      return dateStr;
    }
  };

  const formatDisplayTime = (timeStr?: string | null) => {
    if (!timeStr || timeStr === "None" || timeStr === "—") return null;
    if (/^\d{2}:\d{2}(:\d{2})?$/.test(timeStr)) {
      return timeStr.slice(0, 5);
    }
    try {
      if (timeStr.includes("T") || timeStr.includes(" ")) {
        const d = parseISO(timeStr.replace(" ", "T"));
        if (!isNaN(d.getTime())) return format(d, "HH:mm");
      }
    } catch {}
    return timeStr;
  };


  const summary = attendanceData?.summary || { present: 0, absent: 0, missed_punch: 0, total_officers: 0 };
  const records: AttendanceRecord[] = attendanceData?.records || [];

  const filteredRecords = useMemo(() => {
    if (!searchQuery.trim()) return records;
    const q = searchQuery.trim().toLowerCase();
    return records.filter(
      (r) =>
        r.employee_name.toLowerCase().includes(q) ||
        (r.emp_code && r.emp_code.toLowerCase().includes(q))
    );
  }, [records, searchQuery]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Field Officer Attendance</h1>
        <p className="text-sm text-muted-foreground">Daily attendance punch in/out records</p>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Present",       value: summary.present,                  color: "kpi-card-green", icon: CheckCircle2,  dot: "bg-status-active",   glow: "0 0 8px rgba(5,150,105,0.8)", iconClass: "kpi-icon-green" },
          { label: "Missed Punch",  value: summary.missed_punch || 0,        color: "kpi-card-amber", icon: AlertCircle,   dot: "bg-amber-500",       glow: "0 0 8px rgba(245,158,11,0.8)", iconClass: "kpi-icon-amber" },
          { label: "Absent",        value: summary.absent,                   color: "kpi-card-red",   icon: AlertTriangle, dot: "bg-status-critical", glow: "0 0 8px rgba(220,38,38,0.8)", iconClass: "kpi-icon-red" },
          { label: "Total Officers", value: summary.total_officers,          color: "kpi-card-blue",  icon: Users,         dot: "bg-status-info",     glow: "0 0 8px rgba(99,102,241,0.8)", iconClass: "kpi-icon-blue" },
        ].map((c) => (
          <Card key={c.label} className={`kpi-card ${c.color} border-border`}>
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <div className={`h-2 w-2 rounded-full animate-pulse ${c.dot}`} style={{ boxShadow: c.glow }} />
                    <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/80">{c.label}</p>
                  </div>
                  <p className="text-3xl font-extrabold font-mono-data tracking-tight">
                    {loading && !attendanceData ? (
                      <span className="text-muted-foreground/40 text-2xl">—</span>
                    ) : (
                      c.value
                    )}
                  </p>
                </div>
                <div className={`flex h-11 w-11 items-center justify-center rounded-xl ${c.iconClass}`}>
                  <c.icon className="h-5 w-5" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters & Refresh Bar (Just above Table) */}
      <div className="flex flex-wrap gap-2 items-center justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <Filter className="h-3.5 w-3.5 text-muted-foreground" />
          
          {/* Officer Search Box */}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/60" />
            <input
              type="text"
              placeholder="Search..."
              title="Search by officer name or code"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 pr-2 h-7 w-36 sm:w-44 text-xs rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          {/* Branch Dropdown */}
          {branches.length > 1 && (
            <Select 
              value={selectedBranch} 
              onValueChange={(val) => { 
                setSelectedBranch(val); 
                fetchAttendance(startDate, endDate, filterStatus, val); 
              }}
            >
              <SelectTrigger className="h-7 w-36 text-xs border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                <SelectValue placeholder="All Branches" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Branches</SelectItem>
                {branches.map(b => (
                  <SelectItem key={b.oid} value={String(b.oid)}>{b.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {/* Status Dropdown */}
          <Select 
            value={filterStatus} 
            onValueChange={(val) => { 
              setFilterStatus(val); 
              fetchAttendance(startDate, endDate, val); 
            }}
          >
            <SelectTrigger className="h-7 w-28 text-xs border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Status</SelectItem>
              <SelectItem value="PRESENT">Present</SelectItem>
              <SelectItem value="MISSED_PUNCH">Missed Punch</SelectItem>
              <SelectItem value="ABSENT">Absent</SelectItem>
            </SelectContent>
          </Select>

          {/* Date Range Preset Selector */}
          <Select value={datePreset} onValueChange={handlePresetChange}>
            <SelectTrigger className="h-7 w-36 text-xs border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
              <SelectValue placeholder="Period" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="TODAY">Today</SelectItem>
              <SelectItem value="YESTERDAY">Yesterday</SelectItem>
              <SelectItem value="WEEKLY">This Week</SelectItem>
              <SelectItem value="MONTHLY">This Month</SelectItem>
              <SelectItem value="CUSTOM">Custom Range</SelectItem>
            </SelectContent>
          </Select>

          {/* Date Inputs based on preset */}
          {datePreset === "CUSTOM" ? (
            <div className="flex flex-wrap items-center gap-1.5 bg-muted/40 p-1 rounded-md border border-slate-300 dark:border-slate-700">
              <CalendarIcon className="h-3.5 w-3.5 text-muted-foreground ml-1" />
              <span className="text-[10px] font-semibold text-muted-foreground">From:</span>
              <input
                type="date"
                value={startDate}
                onChange={(e) => {
                  const val = e.target.value;
                  setStartDate(val);
                  if (val && endDate) fetchAttendance(val, endDate, filterStatus);
                }}
                className="h-7 px-1.5 rounded border border-slate-300 dark:border-slate-700 text-xs text-foreground bg-white dark:bg-slate-900 focus:outline-none focus:ring-1 focus:ring-primary shadow-xs"
                title="Start Date"
              />
              <span className="text-[10px] font-semibold text-muted-foreground">To:</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => {
                  const val = e.target.value;
                  setEndDate(val);
                  if (startDate && val) fetchAttendance(startDate, val, filterStatus);
                }}
                className="h-7 px-1.5 rounded border border-slate-300 dark:border-slate-700 text-xs text-foreground bg-white dark:bg-slate-900 focus:outline-none focus:ring-1 focus:ring-primary shadow-xs"
                title="End Date"
              />
            </div>
          ) : (datePreset === "TODAY" || datePreset === "YESTERDAY") ? (
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-medium text-muted-foreground">Date:</span>
              <input
                type="date"
                value={startDate}
                onChange={(e) => {
                  const val = e.target.value;
                  setStartDate(val);
                  setEndDate(val);
                  fetchAttendance(val, val, filterStatus);
                }}
                className="h-7 px-2 rounded-md border border-slate-300 dark:border-slate-700 text-xs text-foreground bg-white dark:bg-slate-900 focus:outline-none focus:ring-1 focus:ring-primary shadow-sm"
                title="Select Date"
              />
            </div>
          ) : (
            <div className="flex items-center gap-1.5 text-xs font-mono-data text-muted-foreground bg-muted/40 px-2.5 py-1 rounded-md border border-border">
              <CalendarIcon className="h-3.5 w-3.5 text-muted-foreground" />
              <span>{formatDisplayDate(startDate)}</span>
              <span>–</span>
              <span>{formatDisplayDate(endDate)}</span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground">
            {loading ? "Loading..." : searchQuery.trim() ? `${filteredRecords.length} of ${records.length} records` : `${records.length} records`}
          </span>
          <button
            onClick={handleRetry}
            disabled={loading}
            className="btn-white-fill inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Error Alert */}
      {error && (
        <Card className="border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400 p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-medium">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
            <button
              onClick={handleRetry}
              className="text-xs font-bold underline hover:opacity-80"
            >
              Retry
            </button>
          </div>
        </Card>
      )}

      {/* Table Card */}
      <Card className="border-border shadow-sm">
        {/* Desktop Table View */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40">
                {["Officer", "Date", "Punch In", "Punch Out", "Attempts (16h)", "Working Hours", "Status"].map((h) => (
                  <th key={h} className="px-4 py-3 text-center text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading && records.length === 0 ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <tr key={i} className="border-b animate-pulse">
                    <td className="px-4 py-3 text-center"><div className="h-4 bg-muted rounded w-28 mx-auto" /></td>
                    <td className="px-4 py-3 text-center"><div className="h-4 bg-muted rounded w-20 mx-auto" /></td>
                    <td className="px-4 py-3 text-center"><div className="h-4 bg-muted rounded w-16 mx-auto" /></td>
                    <td className="px-4 py-3 text-center"><div className="h-4 bg-muted rounded w-16 mx-auto" /></td>
                    <td className="px-4 py-3 text-center"><div className="h-4 bg-muted rounded w-16 mx-auto" /></td>
                    <td className="px-4 py-3 text-center"><div className="h-4 bg-muted rounded w-16 mx-auto" /></td>
                    <td className="px-4 py-3 text-center"><div className="h-5 bg-muted rounded w-16 mx-auto" /></td>
                  </tr>
                ))
              ) : filteredRecords.length === 0 && !error ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-sm text-muted-foreground">
                    {searchQuery.trim() ? `No officers matching "${searchQuery}".` : "No attendance records found for the selected date."}
                  </td>
                </tr>
              ) : (
                filteredRecords.map((a) => {
                  const keyStatus = (a.status || "").toLowerCase();
                  const st = statusStyle[keyStatus] || {
                    badge: "bg-muted text-muted-foreground",
                    label: a.status,
                  };
                  const isMissed = a.is_missed_punch || keyStatus === "missed_punch";
                  const attempts = a.punch_in_attempts ?? 0;
                  const isExhausted = a.attempts_exhausted || attempts >= 2;

                  return (
                    <tr key={a.employee_oid} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-3 text-center">
                        <div className="text-center">
                          <div className="font-semibold leading-tight text-xs">{a.employee_name}</div>
                          <div className="text-[10px] text-muted-foreground mt-0.5">{a.emp_code || "—"}</div>
                          {a.in_buffer && (
                            <div className="mt-1">
                              <span className="inline-flex items-center gap-1 text-[9px] font-medium text-amber-600 dark:text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20">
                                ⏳ Cooldown ({Math.max(1, Math.ceil((a.buffer_remaining_seconds || 0) / 60))}m)
                              </span>
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center font-mono-data text-xs text-foreground">
                        {formatDisplayDate(a.attendance_date)}
                      </td>
                      <td className="px-4 py-3 text-center font-mono-data text-sm">
                        {formatDisplayTime(a.punch_in) ?? <span className="text-muted-foreground text-xs">—</span>}
                      </td>
                      <td className="px-4 py-3 text-center font-mono-data text-sm">
                        {isMissed ? (
                          <span className="text-amber-600 dark:text-amber-400 font-mono-data text-sm font-medium">
                            Missed
                          </span>
                        ) : (
                          formatDisplayTime(a.punch_out) ?? <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center font-mono-data text-sm">
                        <span className={isExhausted ? "text-red-600 dark:text-red-400 font-medium" : "text-foreground font-medium"}>
                          {attempts} / 2
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center font-mono-data font-semibold text-sm">
                        <div>{a.working_hours || "00:00"}</div>
                        {isMissed && (
                          <span className="text-[10px] block text-amber-600/80 dark:text-amber-400/80 font-normal">
                            (Capped 16h)
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <div className="flex items-center justify-center">
                          <Badge className={`text-[10px] font-semibold border-0 whitespace-nowrap capitalize ${st.badge}`}>
                            {st.label}
                          </Badge>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile Card List View */}
        <div className="block md:hidden divide-y divide-border">
          {loading && records.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground flex items-center justify-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading attendance records...
            </div>
          ) : filteredRecords.length === 0 && !error ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              {searchQuery.trim() ? `No officers matching "${searchQuery}".` : "No attendance records found for the selected date."}
            </div>
          ) : (
            filteredRecords.map((a) => {
              const keyStatus = (a.status || "").toLowerCase();
              const st = statusStyle[keyStatus] || {
                badge: "bg-muted text-muted-foreground",
                label: a.status,
              };
              const isMissed = a.is_missed_punch || keyStatus === "missed_punch";
              const attempts = a.punch_in_attempts ?? 0;

              return (
                <div key={a.employee_oid} className="p-4 space-y-3">
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="font-bold text-sm text-foreground">{a.employee_name}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">{a.emp_code || "—"}</div>
                      {a.in_buffer && (
                        <div className="mt-1">
                          <span className="inline-flex items-center gap-1 text-[10px] font-medium text-amber-600 dark:text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20">
                            ⏳ Cooldown ({Math.max(1, Math.ceil((a.buffer_remaining_seconds || 0) / 60))}m)
                          </span>
                        </div>
                      )}
                    </div>
                    <Badge className={`text-[10px] font-bold border px-1.5 py-0.5 capitalize ${st.badge}`}>
                      {st.label}
                    </Badge>
                  </div>

                  <div className="text-[10px] text-muted-foreground bg-muted/30 p-2.5 rounded-lg grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <div>
                      <span className="block text-[8px] uppercase font-bold text-muted-foreground/60">Date</span>
                      <span className="font-semibold text-foreground font-mono-data">
                        {formatDisplayDate(a.attendance_date)}
                      </span>
                    </div>
                    <div>
                      <span className="block text-[8px] uppercase font-bold text-muted-foreground/60">Punch In / Out</span>
                      <span className="font-semibold text-foreground font-mono-data">
                        {formatDisplayTime(a.punch_in) || "—"} / {isMissed ? "Missed" : (formatDisplayTime(a.punch_out) || "—")}
                      </span>
                    </div>
                    <div>
                      <span className="block text-[8px] uppercase font-bold text-muted-foreground/60">Attempts</span>
                      <span className={`font-mono-data font-medium ${a.attempts_exhausted || attempts >= 2 ? "text-red-600 dark:text-red-400" : "text-foreground"}`}>
                        {attempts} / 2
                      </span>
                    </div>
                    <div>
                      <span className="block text-[8px] uppercase font-bold text-muted-foreground/60">Work Hours</span>
                      <span className="font-semibold text-foreground font-mono-data">
                        {a.working_hours || "00:00"} {isMissed ? "(16h Cap)" : ""}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </Card>
    </div>
  );
}
