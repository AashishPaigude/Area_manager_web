import api from './api';

export interface LiveOfficerVisitsCount {
  completed: number;
  pending: number;
  missed: number;
}

export interface LiveOfficerItem {
  id: number;
  name: string;
  empCode: string;
  designation: string;
  phone?: string | null;
  site: string;
  siteId?: number | null;
  lat?: number | null;
  lng?: number | null;
  status: 'on_duty' | 'off_duty' | string;
  trackStatus: 'online' | 'delayed' | 'offline' | string;
  battery?: number | null;
  gpsAccuracy?: number | null;
  speed?: number | null;
  distToday: number;
  workHours: string;
  lastUpdate?: string | null;
  visitStatus: 'Visiting' | 'Travelling' | 'Idle' | 'Absent' | string;
  visits: LiveOfficerVisitsCount;
}

export interface LiveTrackingResponse {
  officers: LiveOfficerItem[];
}

export interface AttendanceInfo {
  punch_in: string | null;
  punch_out: string | null;
  punch_in_lat?: number | null;
  punch_in_lng?: number | null;
  punch_out_lat?: number | null;
  punch_out_lng?: number | null;
  work_hours: string;
  status: string;
}

export interface TrackHistorySummary {
  total_waypoints: number;
  total_distance_km: number;
  planned_visits: number;
  actual_visits: number;
  completed_visits: number;
  pending_visits: number;
}

export interface WaypointItem {
  time: string;
  lat: number;
  lng: number;
  speed?: number | null;
  accuracy?: number | null;
  battery?: number | null;
  is_mock: boolean;
  is_on_site?: boolean;
  site_id?: number | null;
  site_name?: string | null;
  session_id?: number | null;
  transit_seq_num?: number | null;
  premises_seq_num?: number | null;
  display_label?: string | null;
  hide_marker_pin?: boolean;
  segment_id?: number | null;
}

export interface SiteVisitItem {
  session_id: number;
  site_id?: number | null;
  site_name?: string | null;
  gate_name?: string | null;
  gate_lat?: number | null;
  gate_lng?: number | null;
  radius?: number | null;
  check_in?: string | null;
  check_out?: string | null;
  entry_lat?: number | null;
  entry_lng?: number | null;
  exit_lat?: number | null;
  exit_lng?: number | null;
  duration_minutes?: number | null;
  status: string;
  raw_points_count: number;
  distance_from_gate_m?: number | null;
}

export interface PunchSessionItem {
  session_id: number;
  trip_number: number;
  in_time: string;
  out_time?: string | null;
  duration_str?: string | null;
  is_active: boolean;
  total_waypoints: number;
  total_distance_km: number;
  total_site_visits: number;
}

export interface TrackHistoryResponse {
  employee_oid: number;
  date: string;
  attendance: AttendanceInfo;
  total_punch_trips: number;
  selected_trip_number?: number | null;
  punch_sessions: PunchSessionItem[];
  summary: TrackHistorySummary;
  waypoints: WaypointItem[];
  site_visits: SiteVisitItem[];
  is_track_history_enabled?: boolean;
}


export interface PlannedVsActualSiteItem {
  site_oid: number;
  site_name: string;
  planned: number;
  actual: number;
  completed: number;
  remaining: number;
}

export interface PlannedVsActualResponse {
  employee_oid: number;
  period: string;
  total_planned: number;
  total_actual: number;
  sites: PlannedVsActualSiteItem[];
}

export const trackingService = {
  getLiveTracking: async (branchOid?: number, search?: string): Promise<LiveTrackingResponse> => {
    const params: Record<string, any> = {};
    if (branchOid !== undefined) params.branch_oid = branchOid;
    if (search) params.search = search;

    const response = await api.get<LiveTrackingResponse>('/api/v1/tracking/live', { params });
    return response.data;
  },

  getTrackHistory: async (employeeOid: number, dateStr: string, tripNumber?: number): Promise<TrackHistoryResponse> => {
    const params: Record<string, any> = {
      employee_oid: employeeOid,
      date: dateStr,
    };
    if (tripNumber !== undefined && tripNumber !== null) {
      params.trip_number = tripNumber;
    }
    const response = await api.get<TrackHistoryResponse>('/api/v1/tracking/history', { params });
    return response.data;
  },

  getPlannedVsActual: async (employeeOid: number, dateStr?: string, period?: string): Promise<PlannedVsActualResponse> => {
    const params: Record<string, any> = { employee_oid: employeeOid };
    if (dateStr) params.date = dateStr;
    if (period) params.period = period;

    const response = await api.get<PlannedVsActualResponse>('/api/v1/tracking/planned-vs-actual', { params });
    return response.data;
  },
};
