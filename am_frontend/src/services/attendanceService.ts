import api from './api';

export interface AttendanceSummary {
  present: number;
  absent: number;
  missed_punch?: number;
  total_officers: number;
}

export interface AttendanceRecord {
  employee_oid: number;
  employee_name: string;
  emp_code?: string | null;
  attendance_date: string;
  punch_in?: string | null;
  punch_out?: string | null;
  working_hours: string;
  status: string;
  punch_in_attempts?: number;
  max_attempts?: number;
  attempts_exhausted?: boolean;
  is_missed_punch?: boolean;
  in_buffer?: boolean;
  buffer_remaining_seconds?: number;
}

export interface AttendanceListData {
  summary: AttendanceSummary;
  records: AttendanceRecord[];
}

export interface AttendanceResponse {
  data: AttendanceListData;
}

/**
 * Fetch real-time Field Officer attendance data.
 * GET /api/v1/attendance
 */
export const getAttendance = async (
  date?: string,
  status?: string,
  startDate?: string,
  endDate?: string
): Promise<AttendanceResponse> => {
  try {
    const params: Record<string, string> = {};
    if (startDate && endDate) {
      params.start_date = startDate;
      params.end_date = endDate;
    } else if (date) {
      params.date = date;
    }
    if (status && status !== 'ALL') {
      params.status = status;
    } else if (status === 'ALL') {
      params.status = 'ALL';
    }
    const response = await api.get<AttendanceResponse>('/api/v1/attendance', { params });
    return response.data;
  } catch (error: any) {
    const message =
      error.response?.data?.message ||
      error.response?.data?.detail ||
      error.message ||
      'Failed to fetch attendance records from server';
    throw new Error(message);
  }
};
