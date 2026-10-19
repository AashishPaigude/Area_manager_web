import React, { useState, useEffect, useMemo } from 'react';
import {
  TrendingUp,
  Clock,
  Trophy,
  AlertTriangle,
  Target,
  MapPin,
  Users,
  ShieldCheck,
  Calendar as CalendarIcon,
  RefreshCw,
  Search,
  Download,
  Filter,
  CheckCircle2,
  XCircle,
  FileText,
  Sun,
  Moon,
  Compass,
  BarChart3,
  PieChart as PieIcon,
  Award,
  ArrowUpRight,
  ChevronRight,
  ChevronLeft,
  UserCheck,
  Timer,
  Zap,
  Activity,
  Briefcase,
  ArrowLeft,
  ExternalLink,
  Layers,
  Building2,
  SlidersHorizontal,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Sheet,
  SheetContent,
} from '@/components/ui/sheet';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import {
  analyticsService,
  AnalyticsSummaryResponse,
  OfficerAnalyticsDropdownItem,
} from '@/services/analyticsService';
import { getBranches, Branch } from '@/services/visitService';

const REPORT_COLORS = {
  day: '#10b981',      // Emerald
  night: '#6366f1',    // Indigo
  general: '#f59e0b',  // Amber
  session: '#0ea5e9',  // Sky Blue
};

/**
 * Modern Circular SVG Meter / Radial Gauge
 */
function CircularMeter({
  value,
  size = 32,
  strokeWidth = 3.5,
  color,
  trackColor = 'currentColor',
  showText = false,
}: {
  value: number;
  size?: number;
  strokeWidth?: number;
  color?: string;
  trackColor?: string;
  showText?: boolean;
}) {
  const clamped = Math.min(Math.max(value, 0), 100);
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (clamped / 100) * circumference;

  const autoColor =
    color ||
    (clamped >= 80 ? '#10b981' : clamped >= 40 ? '#f59e0b' : clamped > 0 ? '#38bdf8' : '#94a3b8');

  return (
    <div
      className="relative inline-flex items-center justify-center shrink-0"
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} className="transform -rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={trackColor}
          strokeWidth={strokeWidth}
          fill="transparent"
          className="text-muted/30 dark:text-muted/20"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={autoColor}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          fill="transparent"
          className="transition-all duration-700 ease-out"
        />
      </svg>
      {showText && (
        <span className="absolute text-[9px] font-extrabold font-mono text-foreground">
          {Math.round(clamped)}%
        </span>
      )}
    </div>
  );
}

/**
 * Format average dwell time into human-friendly string
 */
function formatDwellTime(mins: number | undefined | null): string {
  if (!mins || mins <= 0) return '45m avg';
  if (mins < 60) return `${Math.round(mins)}m avg`;
  if (mins < 1440) {
    const h = (mins / 60).toFixed(1);
    return `${h}h avg`;
  }
  return '2.5h avg';
}

/**
 * Clean format for date string e.g. "2026-08-27" -> "27 Aug 2026"
 */
function formatFriendlyDate(dateStr: string): string {
  if (!dateStr) return '—';
  try {
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      const d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
      return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    }
  } catch {
    // fallback
  }
  return dateStr;
}

export default function Analytics() {
  // Date & View Mode Selection
  const [dateMode, setDateMode] = useState<'single_day' | 'month' | 'custom' | 'all_time'>('single_day');
  
  // Single Day State (Defaults to Today)
  const todayStr = useMemo(() => new Date().toISOString().split('T')[0], []);
  const [targetDate, setTargetDate] = useState<string>(todayStr);

  // Month State (YYYY-MM)
  const currentMonthStr = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }, []);
  const [selectedMonth, setSelectedMonth] = useState<string>(currentMonthStr);

  // Custom Range State
  const [customFromDate, setCustomFromDate] = useState<string>('');
  const [customToDate, setCustomToDate] = useState<string>('');

  // Search Filter
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Right Drawer Officer Analysis State
  const [drawerOfficerOid, setDrawerOfficerOid] = useState<number | null>(null);
  const [drawerData, setDrawerData] = useState<AnalyticsSummaryResponse | null>(null);
  const [isDrawerLoading, setIsDrawerLoading] = useState<boolean>(false);
  const [drawerSearchQuery, setDrawerSearchQuery] = useState<string>('');
  const [drawerScopeAllTime, setDrawerScopeAllTime] = useState<boolean>(false);

  // Fleet / Global Data State
  const [officersList, setOfficersList] = useState<OfficerAnalyticsDropdownItem[]>([]);
  const [branchesList, setBranchesList] = useState<Branch[]>([]);
  const [selectedBranch, setSelectedBranch] = useState<string>("ALL");
  const [analyticsData, setAnalyticsData] = useState<AnalyticsSummaryResponse | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());

  // Load Branches on mount
  useEffect(() => {
    getBranches()
      .then((bList) => setBranchesList(bList || []))
      .catch((err) => console.error("Failed to load branches for analytics:", err));
  }, []);

  // Load Officers List for Dropdown filtered by branch if selected
  useEffect(() => {
    const fetchOfficers = async () => {
      try {
        const bOid = selectedBranch !== "ALL" ? parseInt(selectedBranch, 10) : undefined;
        const list = await analyticsService.getOfficers(bOid);
        setOfficersList(list);
      } catch (err) {
        console.error('Failed to load officers for analytics:', err);
      }
    };
    fetchOfficers();
  }, [selectedBranch]);

  // Compute from_date and to_date based on dateMode
  const dateParams = useMemo(() => {
    if (dateMode === 'single_day') {
      const d = targetDate || todayStr;
      return { from_date: d, to_date: d, period: 'today' };
    } else if (dateMode === 'month') {
      const [y, m] = (selectedMonth || currentMonthStr).split('-');
      const year = parseInt(y, 10);
      const month = parseInt(m, 10);
      const firstDay = `${year}-${String(month).padStart(2, '0')}-01`;
      const lastDayDate = new Date(year, month, 0);
      const lastDay = `${year}-${String(month).padStart(2, '0')}-${String(lastDayDate.getDate()).padStart(2, '0')}`;
      return { from_date: firstDay, to_date: lastDay, period: 'monthly' };
    } else if (dateMode === 'custom') {
      return {
        from_date: customFromDate || undefined,
        to_date: customToDate || undefined,
        period: 'custom',
      };
    }
    return { from_date: undefined, to_date: undefined, period: 'all_time' };
  }, [dateMode, targetDate, selectedMonth, customFromDate, customToDate, todayStr, currentMonthStr]);

  // Navigate to Prev / Next Day
  const handleShiftDay = (delta: number) => {
    const current = new Date(targetDate || todayStr);
    current.setDate(current.getDate() + delta);
    setTargetDate(current.toISOString().split('T')[0]);
  };

  // Fetch Global Fleet Analytics Summary
  const loadAnalytics = async (showRefreshIndicator = false) => {
    if (showRefreshIndicator) setIsRefreshing(true);
    else setIsLoading(true);

    try {
      const bOid = selectedBranch !== "ALL" ? parseInt(selectedBranch, 10) : undefined;
      const data = await analyticsService.getSummary({
        from_date: dateParams.from_date,
        to_date: dateParams.to_date,
        period: dateParams.period,
        branch_oid: bOid,
      });
      setAnalyticsData(data);
      setLastUpdated(new Date());
    } catch (err) {
      console.error('Failed to load analytics summary:', err);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    loadAnalytics();
  }, [dateParams, selectedBranch]);

  // Fetch Officer Specific Details when Drawer Opens
  const fetchDrawerData = async (officerOid: number, allTime = false) => {
    setDrawerOfficerOid(officerOid);
    setIsDrawerLoading(true);
    setDrawerSearchQuery('');
    try {
      const data = await analyticsService.getSummary({
        employee_oid: officerOid,
        from_date: allTime ? undefined : dateParams.from_date,
        to_date: allTime ? undefined : dateParams.to_date,
        period: allTime ? 'all_time' : dateParams.period,
      });
      setDrawerData(data);
    } catch (err) {
      console.error('Failed to load officer drawer data:', err);
    } finally {
      setIsDrawerLoading(false);
    }
  };

  const handleOpenDrawer = (officerOid: number) => {
    setDrawerScopeAllTime(false);
    fetchDrawerData(officerOid, false);
  };

  const handleToggleDrawerScope = () => {
    if (!drawerOfficerOid) return;
    const nextScope = !drawerScopeAllTime;
    setDrawerScopeAllTime(nextScope);
    fetchDrawerData(drawerOfficerOid, nextScope);
  };

  const handleCloseDrawer = () => {
    setDrawerOfficerOid(null);
    setDrawerData(null);
    setDrawerScopeAllTime(false);
  };

  const kpis = analyticsData?.kpis;
  const drawerOfficerProfile = drawerData?.selected_officer;
  const drawerKpis = drawerData?.kpis;

  // Filtered Fleet Leaderboard
  const filteredLeaderboard = useMemo(() => {
    if (!analyticsData?.officers_leaderboard) return [];
    if (!searchQuery.trim()) return analyticsData.officers_leaderboard;
    const q = searchQuery.toLowerCase();
    return analyticsData.officers_leaderboard.filter(
      (o) =>
        o.name.toLowerCase().includes(q) ||
        (o.emp_code && o.emp_code.toLowerCase().includes(q)) ||
        (o.branch && o.branch.toLowerCase().includes(q))
    );
  }, [analyticsData?.officers_leaderboard, searchQuery]);

  // Filtered Drawer Visits
  const drawerFilteredVisits = useMemo(() => {
    if (!drawerData?.recent_visits) return [];
    if (!drawerSearchQuery.trim()) return drawerData.recent_visits;
    const q = drawerSearchQuery.toLowerCase();
    return drawerData.recent_visits.filter(
      (v) =>
        v.site_name.toLowerCase().includes(q) ||
        v.visit_type.toLowerCase().includes(q) ||
        v.visit_date.includes(q) ||
        (v.report_id && v.report_id.toLowerCase().includes(q))
    );
  }, [drawerData?.recent_visits, drawerSearchQuery]);

  // Report Type Pie Data
  const reportTypePieData = useMemo(() => {
    if (!kpis) return [];
    const items = [
      { name: 'Day Visits', value: kpis.day_reports, color: REPORT_COLORS.day },
      { name: 'Night Visits', value: kpis.night_reports, color: REPORT_COLORS.night },
      { name: 'General Visits', value: kpis.general_reports, color: REPORT_COLORS.general },
    ].filter((item) => item.value > 0);

    if (items.length === 0 && kpis.total_completed_visits > 0) {
      items.push({
        name: 'Site Sessions',
        value: kpis.total_completed_visits,
        color: REPORT_COLORS.session,
      });
    }
    return items;
  }, [kpis]);

  // Export CSV
  const handleExportCSV = () => {
    if (!analyticsData) return;
    let csvContent = 'data:text/csv;charset=utf-8,';
    csvContent += `Field Officer Operations & Performance Report\n`;
    csvContent += `Period: ${dateParams.from_date || 'All Time'} to ${dateParams.to_date || 'All Time'}\n`;
    csvContent += `Generated At: ${new Date().toLocaleString()}\n\n`;
    csvContent += 'Rank,Officer Name,Emp Code,Branch,Duty Status,Punch In,Punch Out,Visits Done,Visits Planned,Completion %,Day Reports,Night Reports,Gen Reports,Sites Visited,Logged Hours,Efficiency Score,Performance Tier\n';
    analyticsData.officers_leaderboard.forEach((o, idx) => {
      csvContent += `${idx + 1},"${o.name}","${o.emp_code || '—'}","${o.branch || '—'}","${o.status}","${o.punch_in || '—'}","${o.punch_out || '—'}",${o.visits_completed},${o.visits_planned},${o.completion_rate}%,${o.day_reports},${o.night_reports},${o.general_reports},${o.sites_visited},"${o.total_hours}",${o.efficiency_score}%,"${o.performance_tier || 'Good'}"\n`;
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute(
      'download',
      `officer_performance_analytics_${dateParams.from_date || 'all'}_${new Date().toISOString().split('T')[0]}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6 pb-12">
      {/* DECLUTTERED & STREAMLINED TOP HEADER & FILTERS */}
      <div className="bg-card/70 backdrop-blur-sm p-4 sm:p-5 rounded-2xl border border-border/80 shadow-sm space-y-4">
        {/* Main Title & Action Buttons */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight text-foreground">
              Field Officer & Visit Analytics
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              {dateMode === 'single_day'
                ? `Operational review & visit completion for ${formatFriendlyDate(targetDate)}`
                : dateMode === 'month'
                ? `Monthly operational summary for ${selectedMonth}`
                : `Custom range analysis`}
            </p>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-center">
            <Button
              variant="outline"
              size="sm"
              onClick={() => loadAnalytics(true)}
              disabled={isLoading || isRefreshing}
              className="btn-white-fill h-8 px-3 gap-1.5 text-xs font-semibold rounded-md"
              title="Refresh Data"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? 'animate-spin text-primary' : ''}`} />
              <span>Refresh</span>
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={handleExportCSV}
              disabled={isLoading || !analyticsData}
              className="h-8 px-3 gap-1.5 text-xs font-semibold bg-primary/10 text-primary hover:bg-primary/20"
            >
              <Download className="h-3.5 w-3.5" />
              <span>Export CSV</span>
            </Button>
          </div>
        </div>

        {/* Clean, Inline Filter Toolbar */}
        <div className="pt-3 border-t border-border/50 grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-center">
          {/* Branch Selector (Only shown when user/manager handles multiple branches) */}
          {branchesList.length > 1 && (
            <div className="sm:col-span-3">
              <Select
                value={selectedBranch}
                onValueChange={(val) => {
                  setSelectedBranch(val);
                  setDrawerOfficerOid(null);
                }}
              >
                <SelectTrigger className="h-9 text-xs font-medium bg-background border-border shadow-xs">
                  <SelectValue placeholder="All Branches" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL" className="font-semibold text-xs">
                    All Branches
                  </SelectItem>
                  {branchesList.map((b) => (
                    <SelectItem key={b.oid} value={String(b.oid)} className="text-xs">
                      {b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Officer Selector */}
          <div className={branchesList.length > 1 ? "sm:col-span-3" : "sm:col-span-4"}>
            <Select
              value={drawerOfficerOid ? String(drawerOfficerOid) : 'all'}
              onValueChange={(val) => {
                if (val === 'all') handleCloseDrawer();
                else handleOpenDrawer(parseInt(val, 10));
              }}
            >
              <SelectTrigger className="h-9 text-xs font-medium bg-background border-border shadow-xs">
                <SelectValue placeholder="All Field Officers" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all" className="font-semibold text-xs">
                  <div className="flex items-center gap-2">
                    <Users className="h-3.5 w-3.5 text-primary" />
                    <span>All Field Officers (Fleet)</span>
                  </div>
                </SelectItem>
                {officersList.map((off) => (
                  <SelectItem key={off.employee_oid} value={String(off.employee_oid)} className="text-xs">
                    <div className="flex items-center justify-between w-full gap-2">
                      <div className="flex items-center gap-2 truncate">
                        <div
                          className={`h-2 w-2 rounded-full ${
                            off.status === 'on_duty' ? 'bg-emerald-500' : 'bg-slate-400'
                          }`}
                        />
                        <span className="font-medium truncate">{off.name}</span>
                        {off.emp_code && (
                          <span className="text-[10px] text-muted-foreground font-mono">
                            ({off.emp_code})
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] font-mono text-muted-foreground shrink-0 ml-1">
                        {off.total_visits} visits
                      </span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Time Scope Mode */}
          <div className={branchesList.length > 1 ? "sm:col-span-2" : "sm:col-span-3"}>
            <Select
              value={dateMode}
              onValueChange={(val: 'single_day' | 'month' | 'custom' | 'all_time') => setDateMode(val)}
            >
              <SelectTrigger className="h-9 text-xs font-medium bg-background border-border shadow-xs">
                <SelectValue placeholder="Select Scope" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="single_day" className="text-xs">📅 Single Day View</SelectItem>
                <SelectItem value="month" className="text-xs">🗓 Monthly Summary</SelectItem>
                <SelectItem value="custom" className="text-xs">📆 Custom Date Range</SelectItem>
                <SelectItem value="all_time" className="text-xs">🌐 All Historical Data</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Date Picker & Controls */}
          <div className={branchesList.length > 1 ? "sm:col-span-4" : "sm:col-span-5"}>
            {dateMode === 'single_day' && (
              <div className="flex items-center gap-1.5">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleShiftDay(-1)}
                  className="h-9 px-2 text-xs border-border shrink-0"
                  title="Previous Day"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Input
                  type="date"
                  value={targetDate}
                  onChange={(e) => setTargetDate(e.target.value)}
                  className="h-9 text-xs bg-background font-mono font-semibold"
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleShiftDay(1)}
                  className="h-9 px-2 text-xs border-border shrink-0"
                  title="Next Day"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
                <Button
                  variant={targetDate === todayStr ? 'secondary' : 'outline'}
                  size="sm"
                  onClick={() => setTargetDate(todayStr)}
                  className="h-9 px-2.5 text-xs font-bold shrink-0"
                >
                  Today
                </Button>
              </div>
            )}

            {dateMode === 'month' && (
              <div className="flex items-center gap-2">
                <Input
                  type="month"
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(e.target.value)}
                  className="h-9 text-xs bg-background font-mono font-semibold"
                />
                <Button
                  variant={selectedMonth === currentMonthStr ? 'secondary' : 'outline'}
                  size="sm"
                  onClick={() => setSelectedMonth(currentMonthStr)}
                  className="h-9 px-3 text-xs font-bold shrink-0"
                >
                  Current
                </Button>
              </div>
            )}

            {dateMode === 'custom' && (
              <div className="flex items-center gap-2">
                <Input
                  type="date"
                  value={customFromDate}
                  onChange={(e) => setCustomFromDate(e.target.value)}
                  className="h-9 text-xs bg-background"
                />
                <span className="text-xs text-muted-foreground">to</span>
                <Input
                  type="date"
                  value={customToDate}
                  onChange={(e) => setCustomToDate(e.target.value)}
                  className="h-9 text-xs bg-background"
                />
              </div>
            )}

            {dateMode === 'all_time' && (
              <div className="h-9 px-3 rounded-lg bg-muted/30 border border-border/50 flex items-center text-xs text-muted-foreground">
                <span>All recorded historical visits</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 4 CORE KPI CARDS: ORIGINAL CONTENT WITH SHADING PATTERN + LEFT ACCENT STRIPE */}
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        {/* Card 1: Completed Visits (Emerald Shading) */}
        <div className="relative overflow-hidden rounded-2xl p-5 border border-emerald-300/60 dark:border-emerald-700/40 bg-gradient-to-br from-emerald-50/90 via-emerald-50/40 to-transparent dark:from-emerald-950/25 dark:via-emerald-950/10 dark:to-transparent shadow-xs hover:shadow-md transition-all">
          <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-emerald-500 rounded-l-2xl" />
          <div className="flex items-start justify-between">
            <div className="min-w-0 pr-2">
              <span className="text-[11px] font-extrabold uppercase tracking-wider text-muted-foreground block">
                COMPLETED VISITS
              </span>
              <p className="text-3xl font-extrabold font-mono tracking-tight text-emerald-600 dark:text-emerald-400 mt-1">
                {kpis?.total_completed_visits || 0}
              </p>
              <p className="text-xs text-muted-foreground mt-1 font-medium truncate">
                Target: <strong className="text-foreground font-mono">{kpis?.total_planned_visits || 0}</strong> • {kpis?.completion_rate || 0}% compliance
              </p>
            </div>
            <div className="h-10 w-10 rounded-full bg-emerald-100/80 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
              <CheckCircle2 className="h-5 w-5" />
            </div>
          </div>
        </div>

        {/* Card 2: Sites Visited (Sky Blue Shading) */}
        <div className="relative overflow-hidden rounded-2xl p-5 border border-sky-300/60 dark:border-sky-700/40 bg-gradient-to-br from-sky-50/90 via-sky-50/40 to-transparent dark:from-sky-950/25 dark:via-sky-950/10 dark:to-transparent shadow-xs hover:shadow-md transition-all">
          <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-sky-500 rounded-l-2xl" />
          <div className="flex items-start justify-between">
            <div className="min-w-0 pr-2">
              <span className="text-[11px] font-extrabold uppercase tracking-wider text-muted-foreground block">
                SITES VISITED
              </span>
              <p className="text-3xl font-extrabold font-mono tracking-tight text-sky-600 dark:text-sky-400 mt-1">
                {kpis?.total_sites_covered || 0}
              </p>
              <p className="text-xs text-muted-foreground mt-1 font-medium truncate">
                Unique client locations covered
              </p>
            </div>
            <div className="h-10 w-10 rounded-full bg-sky-100/80 dark:bg-sky-900/40 text-sky-600 dark:text-sky-400 flex items-center justify-center shrink-0">
              <MapPin className="h-5 w-5" />
            </div>
          </div>
        </div>

        {/* Card 3: Inspection Reports (Indigo/Purple Shading) */}
        <div className="relative overflow-hidden rounded-2xl p-5 border border-indigo-300/60 dark:border-indigo-700/40 bg-gradient-to-br from-indigo-50/90 via-indigo-50/40 to-transparent dark:from-indigo-950/25 dark:via-indigo-950/10 dark:to-transparent shadow-xs hover:shadow-md transition-all">
          <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-indigo-500 rounded-l-2xl" />
          <div className="flex items-start justify-between">
            <div className="min-w-0 pr-2">
              <span className="text-[11px] font-extrabold uppercase tracking-wider text-muted-foreground block">
                INSPECTION REPORTS
              </span>
              <p className="text-3xl font-extrabold font-mono tracking-tight text-indigo-600 dark:text-indigo-400 mt-1">
                {kpis?.total_reports || 0}
              </p>
              <p className="text-xs text-muted-foreground mt-1 font-medium truncate">
                {kpis?.day_reports || 0} Day • {kpis?.night_reports || 0} Night • {kpis?.general_reports || 0} General
              </p>
            </div>
            <div className="h-10 w-10 rounded-full bg-indigo-100/80 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
              <FileText className="h-5 w-5" />
            </div>
          </div>
        </div>

        {/* Card 4: Logged Hours & Dwell Time (Amber Shading) */}
        <div className="relative overflow-hidden rounded-2xl p-5 border border-amber-300/60 dark:border-amber-700/40 bg-gradient-to-br from-amber-50/90 via-amber-50/40 to-transparent dark:from-amber-950/25 dark:via-amber-950/10 dark:to-transparent shadow-xs hover:shadow-md transition-all">
          <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-amber-500 rounded-l-2xl" />
          <div className="flex items-start justify-between">
            <div className="min-w-0 pr-2">
              <span className="text-[11px] font-extrabold uppercase tracking-wider text-muted-foreground block">
                LOGGED WORK HOURS
              </span>
              <p className="text-3xl font-extrabold font-mono tracking-tight text-amber-600 dark:text-amber-400 mt-1">
                {kpis?.total_work_hours || '00:00'}
              </p>
              <p className="text-xs text-muted-foreground mt-1 font-medium truncate">
                Avg Dwell: {formatDwellTime(kpis?.avg_visit_duration_mins)} / site
              </p>
            </div>
            <div className="h-10 w-10 rounded-full bg-amber-100/80 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
              <Clock className="h-5 w-5" />
            </div>
          </div>
        </div>
      </div>

      {/* Row 1: Charts (Visits Trend & Composition) */}
      <div className="grid gap-6 grid-cols-1 lg:grid-cols-12">
        {/* Activity Trend (8 cols) */}
        <Card className="lg:col-span-8 border-border/80 shadow-xs">
          <CardHeader className="pb-3 border-b border-border/60 flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-primary" />
                Fleet Visit Output & Inspection Trend
              </CardTitle>
              <CardDescription className="text-xs mt-0.5">
                Chronological completed inspections and report distribution
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-[10px] font-mono bg-muted/40">
                {analyticsData?.daily_trends.length || 0} Recorded Days
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="pt-5">
            {analyticsData?.daily_trends && analyticsData.daily_trends.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={analyticsData.daily_trends} barGap={4}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border/60" vertical={false} />
                  <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip
                    contentStyle={{
                      borderRadius: 12,
                      fontSize: 12,
                      backgroundColor: 'hsl(var(--card))',
                      borderColor: 'hsl(var(--border))',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
                  <Bar dataKey="day_reports" name="Day Visits" fill={REPORT_COLORS.day} radius={[4, 4, 0, 0]} stackId="a" />
                  <Bar dataKey="night_reports" name="Night Visits" fill={REPORT_COLORS.night} radius={[4, 4, 0, 0]} stackId="a" />
                  <Bar dataKey="general_reports" name="General Visits" fill={REPORT_COLORS.general} radius={[4, 4, 0, 0]} stackId="a" />
                  <Bar dataKey="completed" name="Completed Visits" fill="#0ea5e9" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-52 flex flex-col items-center justify-center text-muted-foreground gap-2">
                <BarChart3 className="h-10 w-10 text-muted-foreground/40" />
                <p className="text-sm font-medium">No visit records for the selected evaluation period.</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Visit Type Donut (4 cols) */}
        <Card className="lg:col-span-4 border-border/80 shadow-xs flex flex-col">
          <CardHeader className="pb-3 border-b border-border/60">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <PieIcon className="h-4 w-4 text-primary" />
              Visit Type Composition
            </CardTitle>
            <CardDescription className="text-xs mt-0.5">
              Breakdown of inspection types
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-4 flex-1 flex flex-col items-center justify-center">
            {reportTypePieData.length > 0 ? (
              <div className="w-full">
                <ResponsiveContainer width="100%" height={170}>
                  <PieChart>
                    <Pie
                      data={reportTypePieData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={48}
                      outerRadius={72}
                      paddingAngle={4}
                    >
                      {reportTypePieData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(v: number, name: string) => [`${v} visits`, name]}
                      contentStyle={{
                        borderRadius: 12,
                        fontSize: 12,
                        backgroundColor: 'hsl(var(--card))',
                        borderColor: 'hsl(var(--border))',
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="grid grid-cols-3 gap-2 mt-2 pt-2 border-t border-border/50 text-center">
                  {reportTypePieData.map((item) => (
                    <div key={item.name} className="space-y-0.5">
                      <div className="flex items-center justify-center gap-1">
                        <div className="h-2 w-2 rounded-full" style={{ backgroundColor: item.color }} />
                        <span className="text-[10px] font-medium text-muted-foreground truncate">{item.name}</span>
                      </div>
                      <p className="text-xs font-bold font-mono text-foreground">{item.value}</p>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="h-40 flex flex-col items-center justify-center text-muted-foreground gap-2">
                <PieIcon className="h-8 w-8 text-muted-foreground/40" />
                <p className="text-xs">No visit distribution data.</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Row 2: Top Visited Sites & Compliance */}
      <div className="grid gap-6 grid-cols-1 lg:grid-cols-12">
        {/* Top Sites (6 cols) */}
        <Card className="lg:col-span-6 border-border/80 shadow-xs">
          <CardHeader className="pb-3 border-b border-border/60">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <MapPin className="h-4 w-4 text-sky-500" />
              Top Visited Client Sites
            </CardTitle>
            <CardDescription className="text-xs mt-0.5">
              Client locations with visit volume and average dwell time
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-4">
            {analyticsData?.top_sites && analyticsData.top_sites.length > 0 ? (
              <div className="space-y-2.5">
                {analyticsData.top_sites.slice(0, 5).map((s, idx) => {
                  const maxVisits = Math.max(...analyticsData.top_sites.map((x) => x.visits_count), 1);
                  const volumePct = Math.round((s.visits_count / maxVisits) * 100);
                  return (
                    <div
                      key={idx}
                      className="p-3 rounded-xl bg-card border border-border/70 hover:border-primary/40 hover:shadow-xs transition-all flex items-center justify-between gap-3 group"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className={`h-7 w-7 rounded-lg flex items-center justify-center text-xs font-extrabold shrink-0 ${
                            idx === 0
                              ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30'
                              : idx === 1
                              ? 'bg-slate-300/30 text-slate-600 dark:text-slate-300 border border-slate-400/30'
                              : idx === 2
                              ? 'bg-orange-400/15 text-orange-600 dark:text-orange-400 border border-orange-500/30'
                              : 'bg-muted/60 text-muted-foreground'
                          }`}
                        >
                          #{idx + 1}
                        </div>
                        <div className="min-w-0">
                          <p className="font-bold text-xs text-foreground truncate group-hover:text-primary transition-colors">
                            {s.site_name}
                          </p>
                          <p className="text-[10px] text-muted-foreground flex items-center gap-1.5 mt-0.5">
                            <Clock className="h-3 w-3 text-muted-foreground/70" />
                            <span>{formatDwellTime(s.avg_duration_mins)}</span>
                            <span>•</span>
                            <span className="font-mono text-foreground/80">{volumePct}% volume</span>
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <Badge
                          variant="secondary"
                          className="font-mono text-xs px-2.5 py-1 font-bold bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/20"
                        >
                          {s.visits_count} {s.visits_count === 1 ? 'visit' : 'visits'}
                        </Badge>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="h-40 flex flex-col items-center justify-center text-muted-foreground gap-2">
                <MapPin className="h-8 w-8 text-muted-foreground/40" />
                <p className="text-xs">No site visits on this period.</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Target Compliance (6 cols) */}
        <Card className="lg:col-span-6 border-border/80 shadow-xs">
          <CardHeader className="pb-3 border-b border-border/60">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Target className="h-4 w-4 text-emerald-500" />
              Target Compliance — Planned vs Actual
            </CardTitle>
            <CardDescription className="text-xs mt-0.5">
              Assigned quotas vs completed visits
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-4">
            {analyticsData?.planned_vs_actual_sites && analyticsData.planned_vs_actual_sites.length > 0 ? (
              <div className="space-y-2.5">
                {analyticsData.planned_vs_actual_sites.slice(0, 5).map((p, idx) => {
                  const isDone = p.actual_visits >= p.planned_frequency && p.planned_frequency > 0;
                  const isStarted = p.actual_visits > 0;
                  const statusColor = isDone ? '#10b981' : isStarted ? '#f59e0b' : '#94a3b8';

                  return (
                    <div
                      key={idx}
                      className="p-3 rounded-xl bg-card border border-border/70 hover:border-border hover:shadow-xs transition-all flex items-center justify-between gap-3"
                    >
                      <div className="min-w-0 pr-2">
                        <p className="font-bold text-xs text-foreground truncate">{p.site_name}</p>
                        <div className="flex items-center gap-2 mt-0.5 text-[11px] text-muted-foreground">
                          <span>
                            Target: <strong className="text-foreground font-mono">{p.planned_frequency}</strong>
                          </span>
                          <span>|</span>
                          <span>
                            Completed: <strong className="text-foreground font-mono">{p.actual_visits}</strong>
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 shrink-0">
                        <CircularMeter
                          value={p.completion_rate}
                          size={34}
                          strokeWidth={3.5}
                          color={statusColor}
                          showText={false}
                        />
                        <div className="text-right min-w-[70px]">
                          <span className="font-mono font-extrabold text-xs text-foreground block">
                            {p.completion_rate}%
                          </span>
                          <span
                            className={`text-[9px] font-bold uppercase tracking-wider ${
                              isDone
                                ? 'text-emerald-600 dark:text-emerald-400'
                                : isStarted
                                ? 'text-amber-600 dark:text-amber-400'
                                : 'text-muted-foreground'
                            }`}
                          >
                            {p.status}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="h-40 flex flex-col items-center justify-center text-muted-foreground gap-2">
                <Target className="h-8 w-8 text-muted-foreground/40" />
                <p className="text-xs">No active plan frequencies for this evaluation.</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Row 3: FIELD OFFICER PERFORMANCE MATRIX TABLE */}
      <Card className="border-border/80 shadow-md overflow-hidden">
        <CardHeader className="p-4 sm:p-6 pb-4 border-b border-border/60 bg-muted/15 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Trophy className="h-5 w-5 text-amber-500" />
              <CardTitle className="text-lg font-bold text-foreground">
                Field Officer Performance & Operations Matrix
              </CardTitle>
            </div>
            <CardDescription className="text-xs mt-1">
              {dateMode === 'single_day'
                ? `Daily Attendance, punch timestamps, and visit completion for ${targetDate}`
                : `Monthly attendance days, total logged hours, and operational efficiency analysis`}
            </CardDescription>
          </div>

          {/* Search Bar */}
          <div className="w-full sm:w-72">
            <div className="relative">
              <Search className="h-3.5 w-3.5 absolute left-3 top-2.5 text-muted-foreground" />
              <Input
                placeholder="Search officer name, code, branch..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-9 pl-9 text-xs bg-background border-border"
              />
            </div>
          </div>
        </CardHeader>

        {/* Clean, Non-Boxy Spacious Table Design */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-border/80 bg-muted/40 text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground">
                <th className="py-3.5 px-4 w-12 text-center">Rank</th>
                <th className="py-3.5 px-4 min-w-[200px]">Field Officer</th>
                <th className="py-3.5 px-4 min-w-[160px]">
                  {dateMode === 'single_day' ? 'Attendance & Punches' : 'Duty Days & Status'}
                </th>
                <th className="py-3.5 px-4 text-center min-w-[130px]">Visits (Done / Target)</th>
                <th className="py-3.5 px-4 text-center min-w-[110px]">Compliance</th>
                <th className="py-3.5 px-4 text-center min-w-[140px]">Reports Submitted</th>
                <th className="py-3.5 px-4 text-center min-w-[110px]">Logged Hours</th>
                <th className="py-3.5 px-4 text-center min-w-[130px]">Performance Tier</th>
                <th className="py-3.5 px-4 text-right min-w-[110px]">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60 bg-card">
              {filteredLeaderboard.map((off, idx) => (
                <tr key={off.employee_oid} className="hover:bg-muted/20 transition-colors group">
                  {/* Rank */}
                  <td className="py-4 px-4 text-center">
                    <div
                      className={`h-7 w-7 rounded-full mx-auto flex items-center justify-center font-extrabold text-xs shadow-xs ${
                        idx === 0
                          ? 'bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/40'
                          : idx === 1
                          ? 'bg-slate-300/30 text-slate-700 dark:text-slate-300 border border-slate-400/40'
                          : idx === 2
                          ? 'bg-orange-400/20 text-orange-600 dark:text-orange-400 border border-orange-500/40'
                          : 'bg-muted/60 text-muted-foreground'
                      }`}
                    >
                      {idx + 1}
                    </div>
                  </td>

                  {/* Officer Details */}
                  <td className="py-4 px-4">
                    <div className="flex items-center gap-3">
                      <div className="h-9 w-9 rounded-xl bg-primary/10 text-primary font-extrabold flex items-center justify-center text-xs shrink-0 border border-primary/20">
                        {off.name
                          .split(' ')
                          .map((n) => n[0])
                          .join('')
                          .substring(0, 2)
                          .toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <span className="font-bold text-foreground text-xs block truncate group-hover:text-primary transition-colors">
                          {off.name}
                        </span>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          {off.emp_code && (
                            <span className="px-1.5 py-0.5 rounded bg-muted/60 text-[10px] font-mono text-muted-foreground font-semibold">
                              {off.emp_code}
                            </span>
                          )}
                          <span className="text-[10px] text-muted-foreground truncate">{off.branch || 'Main'}</span>
                        </div>
                      </div>
                    </div>
                  </td>

                  {/* Attendance & Punches */}
                  <td className="py-4 px-4">
                    {dateMode === 'single_day' ? (
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`h-2 w-2 rounded-full shrink-0 ${
                              off.status === 'on_duty'
                                ? 'bg-emerald-500 animate-pulse'
                                : off.status === 'off_duty'
                                ? 'bg-slate-400'
                                : 'bg-rose-500'
                            }`}
                          />
                          <span
                            className={`text-xs font-bold ${
                              off.status === 'on_duty'
                                ? 'text-emerald-600 dark:text-emerald-400'
                                : off.status === 'off_duty'
                                ? 'text-slate-600 dark:text-slate-400'
                                : 'text-rose-600 dark:text-rose-400'
                            }`}
                          >
                            {off.status === 'on_duty'
                              ? 'On Duty'
                              : off.status === 'off_duty'
                              ? 'Logged Out'
                              : 'Absent'}
                          </span>
                        </div>
                        <div className="text-[10px] font-mono text-muted-foreground pl-3.5">
                          In: <span className="font-semibold text-foreground">{off.punch_in || '—'}</span> | Out:{' '}
                          <span className="font-semibold text-foreground">{off.punch_out || '—'}</span>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`h-2 w-2 rounded-full shrink-0 ${
                              off.days_present > 0 ? 'bg-emerald-500' : 'bg-slate-400'
                            }`}
                          />
                          <span
                            className={`text-xs font-bold ${
                              off.days_present > 0
                                ? 'text-emerald-600 dark:text-emerald-400'
                                : 'text-slate-500'
                            }`}
                          >
                            {off.days_present} Days Present
                          </span>
                        </div>
                        <span className="block text-[10px] text-muted-foreground pl-3.5">
                          Active Duty Days
                        </span>
                      </div>
                    )}
                  </td>

                  {/* Visits Done / Planned */}
                  <td className="py-4 px-4 text-center">
                    <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-muted/20">
                      <span className="text-emerald-600 dark:text-emerald-400 font-extrabold text-sm font-mono">
                        {off.visits_completed}
                      </span>
                      <span className="text-muted-foreground text-xs font-mono font-medium">
                        / {off.visits_planned}
                      </span>
                    </div>
                  </td>

                  {/* Compliance Rate with Circular Meter */}
                  <td className="py-4 px-4 text-center">
                    <div className="flex items-center justify-center gap-2">
                      <CircularMeter
                        value={off.completion_rate}
                        size={28}
                        strokeWidth={3}
                        color={
                          off.completion_rate >= 80
                            ? '#10b981'
                            : off.completion_rate > 0
                            ? '#f59e0b'
                            : '#94a3b8'
                        }
                      />
                      <span className="font-mono font-extrabold text-xs text-foreground">
                        {off.completion_rate}%
                      </span>
                    </div>
                  </td>

                  {/* Reports Breakdown (D / N / G) */}
                  <td className="py-4 px-4 text-center">
                    <div className="flex items-center justify-center gap-1.5">
                      <span
                        className="font-mono text-xs font-bold text-emerald-600 dark:text-emerald-400"
                        title="Day Visit Reports"
                      >
                        {off.day_reports}D
                      </span>
                      <span className="text-muted-foreground/50">•</span>
                      <span
                        className="font-mono text-xs font-bold text-indigo-600 dark:text-indigo-400"
                        title="Night Visit Reports"
                      >
                        {off.night_reports}N
                      </span>
                      <span className="text-muted-foreground/50">•</span>
                      <span
                        className="font-mono text-xs font-bold text-amber-600 dark:text-amber-400"
                        title="General Visit Reports"
                      >
                        {off.general_reports}G
                      </span>
                    </div>
                  </td>

                  {/* Logged Work Hours */}
                  <td className="py-4 px-4 text-center">
                    <div className="font-mono font-bold text-xs text-foreground">
                      ⏱ {off.total_hours}
                    </div>
                  </td>

                  {/* Performance Tier */}
                  <td className="py-4 px-4 text-center">
                    <div className="flex flex-col items-center justify-center">
                      <span
                        className={`text-xs font-bold flex items-center gap-1 ${
                          off.completion_rate >= 85
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : off.completion_rate >= 50
                            ? 'text-amber-600 dark:text-amber-400'
                            : 'text-rose-600 dark:text-rose-400'
                        }`}
                      >
                        {off.performance_tier || 'Good Compliance'}
                      </span>
                      <span className="text-[10px] font-mono text-muted-foreground font-semibold">
                        {off.efficiency_score}% Score
                      </span>
                    </div>
                  </td>

                  {/* Action Button */}
                  <td className="py-4 px-4 text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleOpenDrawer(off.employee_oid)}
                      className="h-8 text-xs px-3 gap-1.5 text-primary hover:bg-primary/10 hover:text-primary transition-all font-semibold"
                    >
                      <span>Analyze</span>
                      <ChevronRight className="h-3.5 w-3.5" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* RIGHT SLIDE-OVER DRAWER (SHEET) FOR IN-DEPTH OFFICER ANALYSIS */}
      <Sheet open={drawerOfficerOid !== null} onOpenChange={(open) => !open && handleCloseDrawer()}>
        <SheetContent
          side="right"
          className="w-full sm:max-w-xl md:max-w-2xl lg:max-w-3xl p-0 gap-0 border-l border-border/80 shadow-2xl bg-card flex flex-col h-full overflow-hidden"
        >
          {isDrawerLoading ? (
            <div className="p-12 flex flex-col items-center justify-center gap-3 h-full">
              <RefreshCw className="h-8 w-8 text-primary animate-spin" />
              <p className="text-sm font-semibold text-muted-foreground">Loading Officer Analysis...</p>
            </div>
          ) : drawerOfficerProfile ? (
            <div className="flex flex-col h-full overflow-hidden">
              {/* Drawer Header with Back Button */}
              <div className="p-5 bg-gradient-to-r from-primary/10 via-card to-card border-b border-border/70 flex flex-col gap-3 shrink-0 pr-12">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleCloseDrawer}
                      className="h-8 px-2.5 gap-1.5 border-border hover:bg-primary/10 text-xs font-semibold"
                    >
                      <ArrowLeft className="h-3.5 w-3.5" />
                      <span>Back to Overview</span>
                    </Button>
                    <Badge variant="outline" className="text-[10px] font-mono bg-background/80">
                      ID: #{drawerOfficerProfile.employee_oid}
                    </Badge>
                  </div>

                  <span className="text-xs font-bold text-amber-600 dark:text-amber-400 flex items-center gap-1">
                    ⭐ Score: {drawerOfficerProfile.efficiency_score}% ({drawerOfficerProfile.performance_tier})
                  </span>
                </div>

                {/* Officer Bio Card */}
                <div className="flex items-center gap-3.5 pt-1">
                  <div className="h-12 w-12 rounded-2xl bg-primary/20 text-primary font-extrabold flex items-center justify-center text-base border border-primary/30 shrink-0 shadow-inner">
                    {drawerOfficerProfile.name
                      .split(' ')
                      .map((n) => n[0])
                      .join('')
                      .substring(0, 2)
                      .toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h2 className="text-base font-bold text-foreground truncate">
                        {drawerOfficerProfile.name}
                      </h2>
                      {drawerOfficerProfile.emp_code && (
                        <span className="px-1.5 py-0.5 rounded bg-muted/60 text-[10px] font-mono font-semibold text-muted-foreground">
                          {drawerOfficerProfile.emp_code}
                        </span>
                      )}
                      <div className="flex items-center gap-1 ml-1">
                        <span
                          className={`h-2 w-2 rounded-full shrink-0 ${
                            drawerOfficerProfile.duty_status === 'on_duty'
                              ? 'bg-emerald-500 animate-pulse'
                              : 'bg-slate-400'
                          }`}
                        />
                        <span
                          className={`text-[11px] font-bold ${
                            drawerOfficerProfile.duty_status === 'on_duty'
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : 'text-slate-500'
                          }`}
                        >
                          {drawerOfficerProfile.duty_status === 'on_duty' ? 'On Duty Active' : 'Logged Out'}
                        </span>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">
                      Branch: <strong className="text-foreground">{drawerOfficerProfile.branch || 'Main'}</strong> • In:{' '}
                      <strong className="font-mono text-foreground">{drawerOfficerProfile.punch_in || '—'}</strong> • Out:{' '}
                      <strong className="font-mono text-foreground">{drawerOfficerProfile.punch_out || '—'}</strong>
                    </p>
                  </div>
                </div>

                {/* Filter Scope Indicator & Switcher */}
                <div className="pt-2 border-t border-border/50 flex items-center justify-between text-[11px]">
                  <span className="text-muted-foreground">
                    Scope:{' '}
                    <strong className="text-foreground">
                      {drawerScopeAllTime
                        ? 'All Time Historical'
                        : dateMode === 'single_day'
                        ? `Day (${targetDate})`
                        : dateMode === 'month'
                        ? `Month (${selectedMonth})`
                        : 'Selected Filter'}
                    </strong>
                  </span>
                  <button
                    onClick={handleToggleDrawerScope}
                    className="text-primary hover:underline font-semibold flex items-center gap-1"
                  >
                    <SlidersHorizontal className="h-3 w-3" />
                    <span>{drawerScopeAllTime ? 'Switch to Selected Period' : 'View All-Time History'}</span>
                  </button>
                </div>
              </div>

              {/* Vertically Scrollable Drawer Content: Unified Single-View */}
              <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
                {/* 1. Summary Metric Snapshot (Shaded Cards) */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  <div className="relative overflow-hidden rounded-xl p-3 border border-emerald-300/60 dark:border-emerald-700/40 bg-gradient-to-br from-emerald-50/90 to-transparent dark:from-emerald-950/20">
                    <div className="absolute left-0 top-0 bottom-0 w-1 bg-emerald-500 rounded-l-xl" />
                    <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block mb-0.5">
                      Visits Done
                    </span>
                    <div className="flex items-baseline justify-between">
                      <span className="text-xl font-mono font-extrabold text-emerald-600 dark:text-emerald-400">
                        {drawerKpis?.total_completed_visits || 0}
                      </span>
                      <span className="font-mono text-xs font-bold text-emerald-600">
                        {drawerKpis?.completion_rate || 0}%
                      </span>
                    </div>
                  </div>

                  <div className="relative overflow-hidden rounded-xl p-3 border border-sky-300/60 dark:border-sky-700/40 bg-gradient-to-br from-sky-50/90 to-transparent dark:from-sky-950/20">
                    <div className="absolute left-0 top-0 bottom-0 w-1 bg-sky-500 rounded-l-xl" />
                    <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block mb-0.5">
                      Sites Visited
                    </span>
                    <div className="flex items-baseline justify-between">
                      <span className="text-xl font-mono font-extrabold text-sky-600 dark:text-sky-400">
                        {drawerKpis?.total_sites_covered || 0}
                      </span>
                      <MapPin className="h-3.5 w-3.5 text-sky-500" />
                    </div>
                  </div>

                  <div className="relative overflow-hidden rounded-xl p-3 border border-purple-300/60 dark:border-purple-700/40 bg-gradient-to-br from-purple-50/90 to-transparent dark:from-purple-950/20">
                    <div className="absolute left-0 top-0 bottom-0 w-1 bg-purple-500 rounded-l-xl" />
                    <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block mb-0.5">
                      Reports Filed
                    </span>
                    <div className="flex items-baseline justify-between">
                      <span className="text-xl font-mono font-extrabold text-purple-600 dark:text-purple-400">
                        {drawerKpis?.total_reports || 0}
                      </span>
                      <span className="text-[9px] font-mono text-muted-foreground font-semibold">
                        {drawerKpis?.day_reports || 0}D/{drawerKpis?.night_reports || 0}N/{drawerKpis?.general_reports || 0}G
                      </span>
                    </div>
                  </div>

                  <div className="relative overflow-hidden rounded-xl p-3 border border-amber-300/60 dark:border-amber-700/40 bg-gradient-to-br from-amber-50/90 to-transparent dark:from-amber-950/20">
                    <div className="absolute left-0 top-0 bottom-0 w-1 bg-amber-500 rounded-l-xl" />
                    <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block mb-0.5">
                      Logged Hours
                    </span>
                    <div className="flex items-baseline justify-between">
                      <span className="text-xl font-mono font-extrabold text-amber-600 dark:text-amber-400">
                        {drawerKpis?.total_work_hours || '00:00'}
                      </span>
                      <Clock className="h-3.5 w-3.5 text-amber-500" />
                    </div>
                  </div>
                </div>

                {/* 2. Target Quotas & Compliance Section */}
                {drawerData?.planned_vs_actual_sites && drawerData.planned_vs_actual_sites.length > 0 && (
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between">
                      <h3 className="text-xs font-bold uppercase tracking-wider text-foreground flex items-center gap-1.5">
                        <Target className="h-3.5 w-3.5 text-emerald-500" />
                        <span>Assigned Site Targets & Quotas</span>
                      </h3>
                      <span className="text-[10px] text-muted-foreground">
                        {drawerData.planned_vs_actual_sites.length} Active Targets
                      </span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      {drawerData.planned_vs_actual_sites.map((p, idx) => {
                        const isDone = p.actual_visits >= p.planned_frequency && p.planned_frequency > 0;
                        return (
                          <div key={idx} className="p-3 rounded-xl bg-card border border-border/70 flex items-center justify-between gap-3 shadow-xs">
                            <div className="min-w-0">
                              <p className="font-bold text-xs text-foreground truncate">{p.site_name}</p>
                              <p className="text-[11px] text-muted-foreground mt-0.5">
                                Target: <strong className="text-foreground font-mono">{p.planned_frequency}</strong> | Done: <strong className="text-foreground font-mono">{p.actual_visits}</strong>
                              </p>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <CircularMeter
                                value={p.completion_rate}
                                size={30}
                                strokeWidth={3}
                                color={isDone ? '#10b981' : p.actual_visits > 0 ? '#f59e0b' : '#94a3b8'}
                              />
                              <span className="font-mono font-bold text-xs">{p.completion_rate}%</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* 3. Top Locations Visited Section */}
                {drawerData?.top_sites && drawerData.top_sites.length > 0 && (
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between">
                      <h3 className="text-xs font-bold uppercase tracking-wider text-foreground flex items-center gap-1.5">
                        <MapPin className="h-3.5 w-3.5 text-sky-500" />
                        <span>Visited Locations & Dwell Time</span>
                      </h3>
                      <span className="text-[10px] text-muted-foreground">
                        {drawerData.top_sites.length} Locations
                      </span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      {drawerData.top_sites.map((s, idx) => (
                        <div key={idx} className="p-3 rounded-xl bg-card border border-border/70 flex items-center justify-between gap-3 shadow-xs">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <span className="h-6 w-6 rounded-md bg-primary/10 text-primary font-extrabold text-xs flex items-center justify-center shrink-0">
                              #{idx + 1}
                            </span>
                            <div className="min-w-0">
                              <p className="font-bold text-xs text-foreground truncate">{s.site_name}</p>
                              <p className="text-[10px] text-muted-foreground mt-0.5">{formatDwellTime(s.avg_duration_mins)}</p>
                            </div>
                          </div>
                          <span className="font-mono text-xs font-bold text-sky-600 dark:text-sky-400 shrink-0">
                            {s.visits_count} visits
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 4. Complete Visit History & Inspection Logs Section */}
                <div className="space-y-3 pt-2">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5 border-b border-border/60 pb-2">
                    <div className="flex items-center gap-2">
                      <Compass className="h-4 w-4 text-primary" />
                      <h3 className="text-xs font-bold uppercase tracking-wider text-foreground">
                        Inspection & Visit History Logs ({drawerFilteredVisits.length})
                      </h3>
                    </div>

                    <div className="w-full sm:w-56">
                      <div className="relative">
                        <Search className="h-3.5 w-3.5 absolute left-2.5 top-2 text-muted-foreground" />
                        <Input
                          placeholder="Filter visits..."
                          value={drawerSearchQuery}
                          onChange={(e) => setDrawerSearchQuery(e.target.value)}
                          className="h-8 pl-8 text-xs bg-background"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2.5">
                    {drawerFilteredVisits.length > 0 ? (
                      drawerFilteredVisits.map((v, idx) => (
                        <div
                          key={idx}
                          className="p-3 rounded-xl bg-card border border-border/70 hover:border-primary/40 hover:shadow-xs transition-all space-y-2"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="font-mono text-xs font-semibold text-foreground">
                                {formatFriendlyDate(v.visit_date)}
                              </span>
                              <span
                                className={`text-[11px] font-bold ${
                                  v.visit_type === 'Day Visit'
                                    ? 'text-emerald-600 dark:text-emerald-400'
                                    : v.visit_type === 'Night Visit'
                                    ? 'text-indigo-600 dark:text-indigo-400'
                                    : v.visit_type === 'General Visit'
                                    ? 'text-amber-600 dark:text-amber-400'
                                    : 'text-sky-600 dark:text-sky-400'
                                }`}
                              >
                                {v.visit_type === 'Day Visit'
                                  ? '☀️ Day'
                                  : v.visit_type === 'Night Visit'
                                  ? '🌙 Night'
                                  : v.visit_type === 'General Visit'
                                  ? '📋 General'
                                  : '📍 Session'}
                              </span>
                            </div>

                            <span className="text-emerald-600 dark:text-emerald-400 text-xs font-bold shrink-0">
                              ✓ {v.status}
                            </span>
                          </div>

                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <MapPin className="h-3.5 w-3.5 text-primary shrink-0" />
                              <span className="font-bold text-xs text-foreground truncate">{v.site_name}</span>
                            </div>

                            <div className="text-[11px] font-mono text-muted-foreground shrink-0">
                              ⏱ <strong className="text-foreground">{v.check_in || '—'}</strong> -{' '}
                              <strong className="text-foreground">{v.check_out || '—'}</strong>
                              {v.duration_minutes ? (
                                <span className="ml-1.5 text-foreground/80 font-bold">({Math.round(v.duration_minutes)}m)</span>
                              ) : null}
                            </div>
                          </div>

                          {v.report_id ? (
                            <div className="pt-1.5 border-t border-border/40 flex items-center justify-between text-[10px] font-mono text-muted-foreground">
                              <span>Report ID:</span>
                              <span className="font-semibold text-foreground">
                                {v.report_id}
                              </span>
                            </div>
                          ) : null}
                        </div>
                      ))
                    ) : (
                      <div className="p-8 text-center text-muted-foreground bg-muted/15 rounded-xl border border-dashed border-border/60">
                        <Compass className="h-8 w-8 mx-auto text-muted-foreground/40 mb-2" />
                        <p className="text-xs font-medium">No visit logs recorded for this time scope.</p>
                        {!drawerScopeAllTime && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={handleToggleDrawerScope}
                            className="mt-3 text-xs h-8 border-border"
                          >
                            View All-Time History Instead
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}
