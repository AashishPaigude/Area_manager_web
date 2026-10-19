import api from './api';

export interface OfficerListItem {
  employee_oid: number;
  officer: string;
  emp_code?: string | null;
  last_visit_date?: string | null;
  total_reports?: number;
  total_sites?: number;
  punch_in?: string | null;
  punch_out?: string | null;
  hours_worked?: string | null;
  gps_status?: string | null;
  sites?: string[];
}

export interface OfficerSummary {
  employee_oid: number;
  officer: string;
  emp_code?: string | null;
  branch?: string | null;
  area?: string | null;
  shift?: string | null;
  punch_in?: string | null;
  punch_out?: string | null;
  hours_worked?: number | null;
  company_id?: number | null;
  company_name?: string | null;
  company_short_name?: string | null;
  company_logo_filename?: string | null;
  company_logo_url?: string | null;
  is_eagle?: boolean;
}

export interface ReportExecutiveSummary {
  planned_visits: number;
  completed_visits: number;
  missed_visits: number;
  general_reports: number;
  day_reports: number;
  night_reports: number;
  total_sites_covered: number;
  planned_completed?: number;
  unplanned_completed?: number;
}

export interface SiteVisitSummary {
  serial_no: number;
  site_id?: number | null;
  site_name?: string | null;
  visit_type: string;
  check_in?: string | null;
  check_out?: string | null;
  status?: string | null;
  visit_date?: string | null;
  is_planned?: boolean;
  plan_code?: string | null;
}

export interface GeneralReportResponse {
  id?: string | null;
  formatted_report_id?: string | null;
  client_name?: string | null;
  site_name?: string | null;
  visit_date?: string | null;
  created_on?: string | null;
  officer?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  personVisited?: string | null;
  reasonOfVisit?: string | null;
  remark?: string | null;
  photos: string[];
  is_planned?: boolean;
  plan_code?: string | null;
}

export interface DayReportResponse {
  id?: string | null;
  formatted_report_id?: string | null;
  client_name?: string | null;
  unit?: string | null;
  site_name?: string | null;
  shift?: string | null;
  visit_date?: string | null;
  officer?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  gps?: string | null;
  photos: string[];
  guards: any[];
  checklist: any[];
  observations?: string | null;
  suggestions?: string | null;
  attachments: any[];
  status?: string | null;
  lecture_details?: any;
  random_checking?: any;
  overall_remarks?: string | null;
  is_planned?: boolean;
  plan_code?: string | null;
}

export interface NightReportResponse {
  id?: string | null;
  formatted_report_id?: string | null;
  client_name?: string | null;
  unit?: string | null;
  site_name?: string | null;
  shift?: string | null;
  visit_date?: string | null;
  officer?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  gps?: string | null;
  photos: string[];
  guards: any[];
  checklist: any[];
  lecture_details?: any;
  random_checking?: any;
  suggestions?: string | null;
  attachments: any[];
  status?: string | null;
  overall_remarks?: string | null;
  officer_signature?: string | null;
  is_planned?: boolean;
  plan_code?: string | null;
}

export interface PlanInfoSummary {
  plan_oid: number;
  plan_code: string;
  planning_type: string;
  week_start_date?: string | null;
  week_end_date?: string | null;
  planning_month?: number | null;
  planning_year?: number | null;
  status?: string | null;
  total_sites?: number;
  total_planned_visits?: number;
  visits_done?: number;
}

export interface CombinedReportResponse {
  officer: OfficerSummary;
  summary: ReportExecutiveSummary;
  site_visits: SiteVisitSummary[];
  general_reports: GeneralReportResponse[];
  day_reports: DayReportResponse[];
  night_reports: NightReportResponse[];
  company_id?: number | null;
  company_name?: string | null;
  company_short_name?: string | null;
  company_logo_url?: string | null;
  is_eagle?: boolean;
  plan_info?: PlanInfoSummary | null;
}

/**
 * Fetch available active officers list for the Reports page selector.
 * GET /api/v1/reports/officers
 */
export const getOfficers = async (branchOid?: number | null): Promise<OfficerListItem[]> => {
  try {
    const params: Record<string, any> = {};
    if (branchOid !== undefined && branchOid !== null) {
      params.branch_oid = branchOid;
    }
    const response = await api.get<OfficerListItem[]>('/api/v1/reports/officers', { params });
    return response.data;
  } catch (error: any) {
    const message =
      error.response?.data?.message ||
      error.response?.data?.detail ||
      error.message ||
      'Failed to fetch officers list from backend';
    throw new Error(message);
  }
};

/**
 * Fetch available officers with reports for the Reports page roster.
 * GET /api/v1/reports/officers-with-reports
 */
export const getOfficersWithReports = async (branchOid?: number | null): Promise<OfficerListItem[]> => {
  try {
    const params: Record<string, any> = {};
    if (branchOid !== undefined && branchOid !== null) {
      params.branch_oid = branchOid;
    }
    const response = await api.get<OfficerListItem[]>('/api/v1/reports/officers-with-reports', { params });
    return response.data;
  } catch (error: any) {
    const message =
      error.response?.data?.message ||
      error.response?.data?.detail ||
      error.message ||
      'Failed to fetch officers with reports list from backend';
    throw new Error(message);
  }
};

/**
 * Fetch consolidated Combined Officer Operations Report for a specific officer by employee_oid.
 * GET /api/v1/reports/combined/{employee_oid}
 */
export const getCombinedReport = async (
  employeeOid: number,
  fromDate?: string,
  toDate?: string,
  planOid?: number
): Promise<CombinedReportResponse> => {
  try {
    const params: Record<string, string> = {};
    if (fromDate) params.from_date = fromDate;
    if (toDate) params.to_date = toDate;
    if (planOid) params.plan_oid = String(planOid);

    const response = await api.get<CombinedReportResponse>(
      `/api/v1/reports/combined/${employeeOid}`,
      { params }
    );
    return response.data;
  } catch (error: any) {
    const message =
      error.response?.data?.message ||
      error.response?.data?.detail ||
      error.message ||
      `Failed to fetch combined report for officer OID ${employeeOid}`;
    throw new Error(message);
  }
};

