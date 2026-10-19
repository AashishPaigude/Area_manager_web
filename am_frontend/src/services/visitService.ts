import api from './api';

export interface FieldOfficer {
  oid: number;
  name: string;
  emp_code?: string | null;
  branch_oid?: number | null;
}

export interface Branch {
  oid: number;
  name: string;
}

export interface Client {
  oid: number;
  name: string;
}

export interface SiteItem {
  oid: number;
  name: string;
  branch_oid?: number | null;
  client_oid?: number | null;
}

export interface CreatePlanRequestPayload {
  planning_type: 'WEEKLY' | 'MONTHLY' | 'SINGLE';
  week_start_date?: string | null;
  week_end_date?: string | null;
  planning_month?: number | null;
  planning_year?: number | null;
  visit_date?: string | null;
  employee_oid: number;
  planning_method?: 'MANUAL';
}

export interface UpdatePlanHeaderPayload {
  planning_type: 'WEEKLY' | 'MONTHLY' | 'SINGLE';
  week_start_date?: string | null;
  week_end_date?: string | null;
  planning_month?: number | null;
  planning_year?: number | null;
  visit_date?: string | null;
  employee_oid: number;
}

export interface AddSitePayload {
  site_oid: number;
  visit_frequency: number;
}

export interface UpdateSitePayload {
  visit_frequency: number;
}

export interface ConfiguredSiteItem {
  frequency_oid: number;
  site_oid: number;
  site_name: string;
  branch_oid?: number | null;
  branch_name?: string | null;
  client_oid?: number | null;
  client_name?: string | null;
  visit_frequency: number;
  visits_done: number;
}

export interface CustomVisitResponse {
  oid: number;
  plan_oid: number;
  branch_oid: number;
  branch_name?: string | null;
  client_name: string;
  site_name: string;
  address?: string | null;
  latitude?: number | string | null;
  longitude?: number | string | null;
  visit_frequency: number;
  created_by?: number | null;
  is_custom_location?: boolean;
}

export interface CreateCustomVisitPayload {
  branch_oid: number;
  client_name: string;
  site_name: string;
  address?: string | null;
  latitude?: number | string | null;
  longitude?: number | string | null;
  visit_frequency: number;
}

export interface PlanDetailData {
  oid: number;
  plan_code: string;
  planning_type: string;
  week_start_date?: string | null;
  week_end_date?: string | null;
  planning_month?: number | null;
  planning_year?: number | null;
  visit_date?: string | null;
  employee_oid: number;
  field_officer_name?: string | null;
  planning_method: string;
  status: string;
  total_sites: number;
  total_visits: number;
  visits_done: number;
  created_at?: string | null;
  updated_at?: string | null;
  created_by?: number | null;
  plan_creator_type?: "SELF" | "MANAGER";
  creator_name?: string | null;
  sites: ConfiguredSiteItem[];
  custom_visits?: CustomVisitResponse[];
}

export interface PlanSummary {
  oid: number;
  plan_code: string;
  planning_type: string;
  week_start_date?: string | null;
  week_end_date?: string | null;
  planning_month?: number | null;
  planning_year?: number | null;
  visit_date?: string | null;
  employee_oid: number;
  field_officer_name?: string | null;
  planning_method: string;
  status: string;
  total_sites: number;
  total_visits: number;
  visits_done: number;
  created_by?: number | null;
  plan_creator_type?: "SELF" | "MANAGER";
  creator_name?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  branch_oid?: number | null;
}

export interface PlanFiltersParams {
  planning_type?: string;
  employee_oid?: number;
  status?: string;
  search?: string;
  planning_month?: number;
  planning_year?: number;
  week_start_date?: string;
  week_end_date?: string;
  creator_type?: string;
  branch_oid?: number | null;
}

export interface GenericListResponse<T> {
  data: T[];
}

export interface SingleResponse<T> {
  data: T;
}

/**
 * Fetch active Field Officers (active = 1, DESIGNATION = 19).
 */
export const getFieldOfficers = async (branchOid?: number | null): Promise<FieldOfficer[]> => {
  const params: Record<string, any> = {};
  if (branchOid !== undefined && branchOid !== null) {
    params.branch_oid = branchOid;
  }
  const response = await api.get<GenericListResponse<FieldOfficer>>('/api/v1/visits/field-officers', { params });
  return response.data.data;
};

/**
 * Fetch all branches.
 */
export const getBranches = async (): Promise<Branch[]> => {
  const response = await api.get<GenericListResponse<Branch>>('/api/v1/visits/branches');
  return response.data.data;
};

/**
 * Fetch all clients.
 */
export const getClients = async (): Promise<Client[]> => {
  const response = await api.get<GenericListResponse<Client>>('/api/v1/visits/clients');
  return response.data.data;
};

/**
 * Fetch sites with optional branch_oid and client_oid dependency filters.
 */
export const getSites = async (branchOid?: number | null, clientOid?: number | null): Promise<SiteItem[]> => {
  const params: Record<string, number> = {};
  if (branchOid) params.branch_oid = branchOid;
  if (clientOid) params.client_oid = clientOid;
  const response = await api.get<GenericListResponse<SiteItem>>('/api/v1/visits/sites', { params });
  return response.data.data;
};

/**
 * Fetch visit plans with summary info and optional filters.
 */
export const listPlans = async (filters?: PlanFiltersParams): Promise<PlanSummary[]> => {
  const params: Record<string, any> = {};
  if (filters) {
    if (filters.planning_type && filters.planning_type !== 'ALL') params.planning_type = filters.planning_type;
    if (filters.employee_oid) params.employee_oid = filters.employee_oid;
    if (filters.status && filters.status !== 'ALL') params.status = filters.status;
    if (filters.creator_type && filters.creator_type !== 'ALL') params.creator_type = filters.creator_type;
    if (filters.search) params.search = filters.search;
    if (filters.planning_month) params.planning_month = filters.planning_month;
    if (filters.planning_year) params.planning_year = filters.planning_year;
    if (filters.week_start_date) params.week_start_date = filters.week_start_date;
    if (filters.week_end_date) params.week_end_date = filters.week_end_date;
    if (filters.branch_oid !== undefined && filters.branch_oid !== null) params.branch_oid = filters.branch_oid;
  }
  const response = await api.get<GenericListResponse<PlanSummary>>('/api/v1/visits/plans', { params });
  return response.data.data;
};

/**
 * Create a new DRAFT visit plan.
 */
export const createPlan = async (payload: CreatePlanRequestPayload): Promise<PlanDetailData> => {
  const response = await api.post<SingleResponse<PlanDetailData>>('/api/v1/visits/plans', payload);
  return response.data.data;
};

/**
 * Fetch full details of a visit plan.
 */
export const getPlanDetails = async (planOid: number): Promise<PlanDetailData> => {
  const response = await api.get<SingleResponse<PlanDetailData>>(`/api/v1/visits/plans/${planOid}`);
  return response.data.data;
};

/**
 * Update header fields of a DRAFT visit plan.
 */
export const updatePlanHeader = async (planOid: number, payload: UpdatePlanHeaderPayload): Promise<PlanDetailData> => {
  const response = await api.put<SingleResponse<PlanDetailData>>(`/api/v1/visits/plans/${planOid}`, payload);
  return response.data.data;
};

/**
 * Duplicate an existing visit plan into a new independent DRAFT plan.
 */
export const duplicatePlan = async (planOid: number): Promise<PlanDetailData> => {
  const response = await api.post<SingleResponse<PlanDetailData>>(`/api/v1/visits/plans/${planOid}/duplicate`);
  return response.data.data;
};

/**
 * Delete a DRAFT visit plan.
 */
export const deletePlan = async (planOid: number): Promise<void> => {
  await api.delete(`/api/v1/visits/plans/${planOid}`);
};

/**
 * Add a site and its visit frequency to a DRAFT plan.
 */
export const addSiteToPlan = async (planOid: number, payload: AddSitePayload): Promise<ConfiguredSiteItem> => {
  const response = await api.post<SingleResponse<ConfiguredSiteItem>>(`/api/v1/visits/plans/${planOid}/sites`, payload);
  return response.data.data;
};

/**
 * Update visit frequency of a site in a DRAFT plan.
 */
export const updateSiteFrequency = async (
  planOid: number,
  frequencyOid: number,
  payload: UpdateSitePayload
): Promise<ConfiguredSiteItem> => {
  const response = await api.put<SingleResponse<ConfiguredSiteItem>>(`/api/v1/visits/plans/${planOid}/sites/${frequencyOid}`, payload);
  return response.data.data;
};

/**
 * Remove a site configuration from a DRAFT plan.
 */
export const removeSiteFromPlan = async (planOid: number, frequencyOid: number): Promise<void> => {
  await api.delete(`/api/v1/visits/plans/${planOid}/sites/${frequencyOid}`);
};

/**
 * Change plan status from DRAFT to PUBLISHED.
 */
export const publishPlan = async (planOid: number): Promise<PlanDetailData> => {
  const response = await api.put<SingleResponse<PlanDetailData>>(`/api/v1/visits/plans/${planOid}/publish`);
  return response.data.data;
};

/**
 * Revert plan status from PUBLISHED to DRAFT for editing.
 */
export const unpublishPlan = async (planOid: number): Promise<PlanDetailData> => {
  const response = await api.put<SingleResponse<PlanDetailData>>(`/api/v1/visits/plans/${planOid}/unpublish`);
  return response.data.data;
};

/**
 * Add a custom visit (new client/site) to a DRAFT plan.
 */
export const addCustomVisitToPlan = async (
  planOid: number,
  payload: CreateCustomVisitPayload
): Promise<CustomVisitResponse> => {
  const response = await api.post<SingleResponse<CustomVisitResponse>>(
    `/api/v1/visits/plans/${planOid}/new-client-visits`,
    payload
  );
  return response.data.data;
};

/**
 * Fetch all custom visit locations configured for a plan.
 */
export const getCustomVisitsForPlan = async (
  planOid: number
): Promise<{ data: CustomVisitResponse[]; total: number }> => {
  const response = await api.get<{ data: CustomVisitResponse[]; total: number }>(
    `/api/v1/visits/plans/${planOid}/new-client-visits`
  );
  return response.data;
};

/**
 * Remove a custom visit location from a DRAFT plan.
 */
export const removeCustomVisitFromPlan = async (
  planOid: number,
  recordOid: number
): Promise<{ status: string; message: string }> => {
  const response = await api.delete<{ status: string; message: string }>(
    `/api/v1/visits/plans/${planOid}/new-client-visits/${recordOid}`
  );
  return response.data;
};
