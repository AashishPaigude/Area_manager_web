import api from './api';

export interface AnalyticsKPIs {
  total_planned_visits: number;
  total_completed_visits: number;
  total_missed_visits: number;
  total_pending_visits: number;
  completion_rate: number;
  total_reports: number;
  day_reports: number;
  night_reports: number;
  general_reports: number;
  total_sites_covered: number;
  total_work_hours: string;
  avg_visit_duration_mins: number;
  active_officers_count: number;
  on_duty_officers_count: number;
  days_in_period?: number;
}

export interface DailyTrendItem {
  date: string;
  day: string;
  completed: number;
  planned: number;
  missed: number;
  day_reports: number;
  night_reports: number;
  general_reports: number;
  completion_rate: number;
}

export interface SiteAnalyticsItem {
  site_id?: number | null;
  site_name: string;
  visits_count: number;
  total_duration_mins: number;
  avg_duration_mins: number;
  day_count: number;
  night_count: number;
  general_count: number;
}

export interface OfficerPerformanceItem {
  employee_oid: number;
  name: string;
  emp_code?: string | null;
  branch?: string | null;
  visits_completed: number;
  visits_planned: number;
  completion_rate: number;
  day_reports: number;
  night_reports: number;
  general_reports: number;
  total_reports: number;
  sites_visited: number;
  total_hours: string;
  avg_duration_mins: number;
  punch_in?: string | null;
  punch_out?: string | null;
  days_present: number;
  status: 'on_duty' | 'off_duty' | 'present' | 'absent' | string;
  efficiency_score: number;
  salary_grade?: string;
  payroll_status?: string;
}

export interface OfficerVisitSessionItem {
  session_id: number;
  site_id?: number | null;
  site_name: string;
  visit_type: string;
  check_in?: string | null;
  check_out?: string | null;
  duration_minutes?: number | null;
  status: string;
  visit_date: string;
  report_id?: string | null;
}

export interface PlannedVsActualSiteAnalytics {
  site_oid: number;
  site_name: string;
  planned_frequency: number;
  actual_visits: number;
  completion_rate: number;
  status: 'COMPLETED' | 'IN_PROGRESS' | 'PENDING' | string;
}

export interface OfficerProfileSummary {
  employee_oid: number;
  name: string;
  emp_code?: string | null;
  branch?: string | null;
  shift?: string | null;
  punch_in?: string | null;
  punch_out?: string | null;
  work_hours?: string | null;
  days_present?: number;
  duty_status: string;
  efficiency_score: number;
  performance_tier: string;
  salary_grade?: string;
  payroll_status?: string;
}

export interface AnalyticsSummaryResponse {
  mode: 'fleet' | 'officer';
  period: string;
  from_date?: string | null;
  to_date?: string | null;
  selected_officer?: OfficerProfileSummary | null;
  kpis: AnalyticsKPIs;
  daily_trends: DailyTrendItem[];
  top_sites: SiteAnalyticsItem[];
  officers_leaderboard: OfficerPerformanceItem[];
  planned_vs_actual_sites: PlannedVsActualSiteAnalytics[];
  recent_visits: OfficerVisitSessionItem[];
}

export interface OfficerAnalyticsDropdownItem {
  employee_oid: number;
  name: string;
  emp_code?: string | null;
  branch?: string | null;
  total_visits: number;
  completion_rate: number;
  status: string;
}

export const analyticsService = {
  getOfficers: async (): Promise<OfficerAnalyticsDropdownItem[]> => {
    try {
      const response = await api.get<OfficerAnalyticsDropdownItem[]>('/api/v1/analytics/officers');
      return response.data;
    } catch (error: any) {
      console.warn('Analytics officers API error:', error);
      return [];
    }
  },

  getSummary: async (params: {
    employee_oid?: number | null;
    from_date?: string | null;
    to_date?: string | null;
    period?: string;
  }): Promise<AnalyticsSummaryResponse> => {
    const queryParams: Record<string, any> = {};
    if (params.employee_oid !== undefined && params.employee_oid !== null) {
      queryParams.employee_oid = params.employee_oid;
    }
    if (params.from_date) queryParams.from_date = params.from_date;
    if (params.to_date) queryParams.to_date = params.to_date;
    if (params.period) queryParams.period = params.period;

    const response = await api.get<AnalyticsSummaryResponse>('/api/v1/analytics/summary', {
      params: queryParams,
    });
    return response.data;
  },
};
