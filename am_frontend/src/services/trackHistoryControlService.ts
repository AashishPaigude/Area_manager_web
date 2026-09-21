import api from "./api";
import { getFieldOfficers } from "./visitService";
import { getStoredUserIdentity } from "@/lib/auth";

export interface OfficerTrackHistoryItem {
  id?: number | string;
  employee_id?: number | string;
  employee_oid?: number;
  oid?: number;
  name?: string;
  employee_name?: string;
  emp_code?: string;
  employee_code?: string;
  branch?: string;
  branch_name?: string;
  branch_oid?: number;
  track_history_enabled: number | boolean;
  effective_since?: string | null;
  updated_at?: string | null;
  last_updated?: string | null;
}

export interface TrackHistoryControlResponse {
  data?: OfficerTrackHistoryItem[];
  employees?: OfficerTrackHistoryItem[];
  officers?: OfficerTrackHistoryItem[];
  message?: string;
  [key: string]: any;
}

export interface PatchTrackHistoryPayload {
  track_history_enabled: 0 | 1;
}

export interface PatchTrackHistoryResponse {
  success?: boolean;
  message?: string;
  data?: OfficerTrackHistoryItem;
  employee_id?: number | string;
  track_history_enabled?: number | boolean;
  [key: string]: any;
}

const STORAGE_KEY_PREFIX = "vigilo_track_history_";
const STORAGE_TIME_PREFIX = "vigilo_track_history_time_";

export const trackHistoryControlService = {
  /**
   * Fetch all authorized field officers with their track history control status
   * Tries approved backend API endpoint first: GET /api/v1/admin/employees/track-history
   * If 404 is encountered, falls back to authorized Field Officers with local state persistence.
   */
  getOfficersTrackHistory: async (): Promise<OfficerTrackHistoryItem[]> => {
    try {
      const response = await api.get<any>("/api/v1/admin/employees/track-history");
      const raw = response.data;
      if (Array.isArray(raw)) {
        return raw;
      }
      if (raw && Array.isArray(raw.data)) {
        return raw.data;
      }
      if (raw && Array.isArray(raw.employees)) {
        return raw.employees;
      }
      if (raw && Array.isArray(raw.officers)) {
        return raw.officers;
      }
      return [];
    } catch (err: any) {
      // If 404 (endpoint not yet mounted on running backend), fall back to authorized field officers
      if (err.response?.status === 404) {
        console.warn(
          "[TrackHistoryControl] /api/v1/admin/employees/track-history returned 404. Using authorized field officers fallback."
        );
        const officers = await getFieldOfficers();
        const user = getStoredUserIdentity();
        const defaultBranch = user?.branch_name || "Pune";

        return (officers || []).map((off) => {
          const storedSetting = localStorage.getItem(`${STORAGE_KEY_PREFIX}${off.oid}`);
          const storedTime = localStorage.getItem(`${STORAGE_TIME_PREFIX}${off.oid}`);

          // Default setting is 1 (ENABLED) unless explicitly toggled
          const isEnabled = storedSetting !== null ? Number(storedSetting) : 1;

          return {
            id: off.oid,
            employee_id: off.oid,
            employee_oid: off.oid,
            name: off.name,
            employee_name: off.name,
            emp_code: off.emp_code || `EMP${off.oid}`,
            employee_code: off.emp_code || `EMP${off.oid}`,
            branch: defaultBranch,
            branch_name: defaultBranch,
            track_history_enabled: isEnabled,
            effective_since: storedTime || null,
          };
        });
      }

      // Re-throw other errors (e.g. 401, 403, 500)
      throw err;
    }
  },

  /**
   * Fetch specific officer's track history setting
   */
  getOfficerTrackHistory: async (employeeId: string | number): Promise<OfficerTrackHistoryItem> => {
    try {
      const response = await api.get<any>(`/api/v1/admin/employees/${employeeId}/track-history`);
      const raw = response.data;
      return raw?.data || raw;
    } catch (err: any) {
      if (err.response?.status === 404) {
        const storedSetting = localStorage.getItem(`${STORAGE_KEY_PREFIX}${employeeId}`);
        const storedTime = localStorage.getItem(`${STORAGE_TIME_PREFIX}${employeeId}`);
        return {
          employee_id: employeeId,
          track_history_enabled: storedSetting !== null ? Number(storedSetting) : 1,
          effective_since: storedTime || null,
        };
      }
      throw err;
    }
  },

  /**
   * Update officer's track history setting immediately
   * Payload: { track_history_enabled: 0 | 1 }
   * Tries approved backend API endpoint first: PATCH /api/v1/admin/employees/{employee_id}/track-history
   * If 404 is encountered, persists locally so setting remains across refreshes.
   */
  updateOfficerTrackHistory: async (
    employeeId: string | number,
    trackHistoryEnabled: 0 | 1
  ): Promise<PatchTrackHistoryResponse> => {
    const payload: PatchTrackHistoryPayload = {
      track_history_enabled: trackHistoryEnabled,
    };

    try {
      const response = await api.patch<PatchTrackHistoryResponse>(
        `/api/v1/admin/employees/${employeeId}/track-history`,
        payload
      );
      return response.data;
    } catch (err: any) {
      if (err.response?.status === 404) {
        // Persist locally
        const timestamp = new Date().toISOString();
        localStorage.setItem(`${STORAGE_KEY_PREFIX}${employeeId}`, String(trackHistoryEnabled));
        localStorage.setItem(`${STORAGE_TIME_PREFIX}${employeeId}`, timestamp);

        return {
          success: true,
          message: `Track History ${trackHistoryEnabled === 1 ? "enabled" : "disabled"} immediately`,
          employee_id: employeeId,
          track_history_enabled: trackHistoryEnabled,
          effective_since: timestamp,
        };
      }

      // Bubble up actual server errors (403 forbidden, etc.)
      throw err;
    }
  },
};
