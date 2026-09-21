import api from './api';

export interface DashboardVisit {
  sequence: number;
  site_id?: number | null;
  site_name: string;
  visit_type: string;
  check_in?: string | null;
  check_out?: string | null;
  duration?: string | null;
  status: string;
  visit_date?: string | null;
  report_oid: number | string;
}

export interface DashboardOfficer {
  employee_oid: number;
  officer: string;
  emp_code?: string | null;
  punch_in?: string | null;
  punch_out?: string | null;
  attendance_status?: string | null;
  visits_done: number;
  hours_worked?: string | null;
  gps_status?: string | null;
  visits: DashboardVisit[];
}

export interface DashboardSummary {
  present: number;
  absent: number;
  plannedVisits: number;
  completedVisitsToday: number;
  plannedVisitsWeekly?: number;
  completedVisitsWeekly?: number;
  plannedVisitsMonthly?: number;
  completedVisitsMonthly?: number;
}

export interface DashboardResponse {
  summary: DashboardSummary;
  officers: DashboardOfficer[];
  target_date?: string | null;
}

/**
 * Fetch consolidated real-time Area Manager Dashboard data.
 * GET /api/v1/dashboard
 */
export const getDashboardData = async (
  targetDate?: string,
  forceRefresh?: boolean,
  period?: "weekly" | "monthly"
): Promise<DashboardResponse> => {
  try {
    const params: Record<string, any> = {};
    if (targetDate) {
      params.target_date = targetDate;
    }
    if (forceRefresh) {
      params.force_refresh = true;
    }
    if (period) {
      params.period = period;
    }
    const response = await api.get<DashboardResponse>('/api/v1/dashboard', { params });
    return response.data;
  } catch (error: any) {
    const message =
      error.response?.data?.message ||
      error.response?.data?.detail ||
      error.message ||
      'Failed to fetch dashboard data from server';
    throw new Error(message);
  }
};

