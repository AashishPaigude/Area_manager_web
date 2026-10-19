import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  Navigation, Clock, Activity, Flag, MapPin, CalendarCheck, UserCheck, Timer,
  LogIn, LogOut, Filter, RefreshCw, AlertTriangle, Building2, ChevronRight,
  Crosshair, Battery, Gauge, Copy, Check, Play, Pause, SkipForward, SkipBack,
  Layers, Info, ListOrdered, ShieldCheck, CheckCircle2, ZoomIn, ZoomOut, RotateCcw
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from "@/components/ui/select";
import { MapContainer, TileLayer, Marker, Popup, Polyline, Circle, Tooltip, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { trackingService, TrackHistoryResponse, WaypointItem, SiteVisitItem } from "@/services/trackingService";
import { getFieldOfficers, FieldOfficer, getBranches, Branch } from "@/services/visitService";

const STOP_COLORS = [
  "#8b5cf6", // purple
  "#0ea5e9", // sky
  "#06b6d4", // cyan
  "#10b981", // emerald
  "#f59e0b", // amber
  "#f97316", // orange
  "#ec4899", // pink
];

// Helper: Calculate bearing between two GPS coordinates
function calculateBearing(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const y = Math.sin(dLng) * Math.cos((lat2 * Math.PI) / 180);
  const x =
    Math.cos((lat1 * Math.PI) / 180) * Math.sin((lat2 * Math.PI) / 180) -
    Math.sin((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.cos(dLng);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

// Helper: Haversine distance in meters between two coordinates
function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Helper: Parse HH:MM:SS string to integer seconds
function parseTimeToSeconds(tStr?: string): number {
  if (!tStr) return 0;
  const parts = tStr.split(":");
  return (parseInt(parts[0], 10) || 0) * 3600 + (parseInt(parts[1], 10) || 0) * 60 + (parseInt(parts[2], 10) || 0);
}

// Playback clean point representation (guaranteed outlier/spike free)
export interface CleanPlaybackPoint {
  lat: number;
  lng: number;
  time?: string;
  speed?: number;
  isOnSite: boolean;
  siteName?: string;
  bearing?: number;
}

// Helper: Perpendicular distance from point p to line segment (a, b) in meters
function perpendicularDistanceMeters(p: [number, number], a: [number, number], b: [number, number]): number {
  const midLat = (a[0] + b[0]) / 2.0;
  const latScale = 111320.0;
  const lngScale = 111320.0 * Math.cos((midLat * Math.PI) / 180.0);

  const px = (p[1] - a[1]) * lngScale;
  const py = (p[0] - a[0]) * latScale;
  const bx = (b[1] - a[1]) * lngScale;
  const by = (b[0] - a[0]) * latScale;

  const segLenSq = bx * bx + by * by;
  if (segLenSq === 0) {
    return Math.sqrt(px * px + py * py);
  }

  const t = Math.max(0, Math.min(1, (px * bx + py * by) / segLenSq));
  const projX = t * bx;
  const projY = t * by;
  const dx = px - projX;
  const dy = py - projY;
  return Math.sqrt(dx * dx + dy * dy);
}

// Helper: Ramer-Douglas-Peucker (RDP) polyline simplification to eliminate micro-jitter and smooth road corridors
function simplifyPathRDP(coords: [number, number][], epsilonMeters: number = 5.0): [number, number][] {
  if (coords.length <= 2) return coords;

  let dMax = 0;
  let index = 0;
  const a = coords[0];
  const b = coords[coords.length - 1];

  for (let i = 1; i < coords.length - 1; i++) {
    const d = perpendicularDistanceMeters(coords[i], a, b);
    if (d > dMax) {
      dMax = d;
      index = i;
    }
  }

  if (dMax > epsilonMeters) {
    const rec1 = simplifyPathRDP(coords.slice(0, index + 1), epsilonMeters);
    const rec2 = simplifyPathRDP(coords.slice(index), epsilonMeters);
    return rec1.slice(0, -1).concat(rec2);
  } else {
    return [a, b];
  }
}

// Helper: Filter abnormal GPS spikes, lateral V-deflections, slingshots, and stationary dwell oscillations from display transit polyline
function filterTransitSpikes(legWps: WaypointItem[]): {
  coords: [number, number][];
  points: CleanPlaybackPoint[];
} {
  if (legWps.length <= 2) {
    return {
      coords: legWps.map(w => [w.lat, w.lng]),
      points: legWps.map(w => ({
        lat: w.lat,
        lng: w.lng,
        time: w.time,
        speed: w.speed,
        isOnSite: false,
      })),
    };
  }

  const cleanCoords: [number, number][] = [[legWps[0].lat, legWps[0].lng]];
  const cleanPoints: CleanPlaybackPoint[] = [{
    lat: legWps[0].lat,
    lng: legWps[0].lng,
    time: legWps[0].time,
    speed: legWps[0].speed,
    isOnSite: false,
  }];
  const cleanWps: WaypointItem[] = [legWps[0]];

  for (let i = 1; i < legWps.length; i++) {
    const curr = legWps[i];

    // For the final destination point of the leg:
    if (i === legWps.length - 1) {
      const prev = cleanWps[cleanWps.length - 1];
      const distPrev = prev ? haversineMeters(prev.lat, prev.lng, curr.lat, curr.lng) : 0;
      const acc = curr.accuracy || 20;
      // If the final point has bad accuracy (>35m) and is a wide jump, ignore it to prevent endpoint spikes
      if (acc > 35.0 && distPrev > 35.0) {
        break;
      }
      cleanCoords.push([curr.lat, curr.lng]);
      cleanPoints.push({
        lat: curr.lat,
        lng: curr.lng,
        time: curr.time,
        speed: curr.speed,
        isOnSite: false,
      });
      break;
    }

    const prev = cleanWps[cleanWps.length - 1];
    const nextPt = legWps[i + 1];

    const dtPrev = Math.max(1, parseTimeToSeconds(curr.time) - parseTimeToSeconds(prev.time));
    const distPrev = haversineMeters(prev.lat, prev.lng, curr.lat, curr.lng);
    const appSpdPrev = (distPrev / dtPrev) * 3.6;
    const repSpd = curr.speed || 0;
    const acc = curr.accuracy || 20;

    // 0. Stationary micro-jitter deadband: ignore micro-movements (< 7.5m) when speed is low / dwelling
    if (distPrev < 7.5 && (repSpd < 4.0 || appSpdPrev < 4.0)) {
      continue;
    }

    let isOutlier = false;

    // 1. Accuracy blowout (> 35m uncertainty) with significant jump (> 25m)
    if (acc > 35.0 && distPrev > 25.0) {
      isOutlier = true;
    }

    // 2. Slingshot / teleport jump (dt <= 5s, dist >= 55m, apparent speed > 70 km/h, reported speed <= 20 km/h)
    if (!isOutlier && dtPrev <= 5 && distPrev >= 55.0 && appSpdPrev > 70.0 && repSpd <= 20.0) {
      isOutlier = true;
    }

    // 3. Lateral excursion / V-reversal with immediate rebound (prev \ BAD / next)
    if (!isOutlier && nextPt) {
      const dtNext = Math.max(1, parseTimeToSeconds(nextPt.time) - parseTimeToSeconds(curr.time));
      const distNext = haversineMeters(curr.lat, curr.lng, nextPt.lat, nextPt.lng);
      const bIn = calculateBearing(prev.lat, prev.lng, curr.lat, curr.lng);
      const bOut = calculateBearing(curr.lat, curr.lng, nextPt.lat, nextPt.lng);
      const bDirect = calculateBearing(prev.lat, prev.lng, nextPt.lat, nextPt.lng);

      let turn = Math.abs(bOut - bIn);
      if (turn > 180) turn = 360 - turn;

      let directDevIn = Math.abs(bIn - bDirect);
      if (directDevIn > 180) directDevIn = 360 - directDevIn;

      // A. Sharp V-reversal where the direct vector between prev -> next continues the general corridor
      if (turn > 120 && distPrev > 25.0 && dtPrev <= 20 && directDevIn > 80) {
        isOutlier = true;
      }

      // B. Stationary dwell oscillation rebound (reported speed < 5 km/h, turn > 135 deg, dist > 35m)
      if (!isOutlier && turn > 135 && repSpd < 5.0 && (distPrev > 35.0 || distNext > 35.0)) {
        isOutlier = true;
      }
    }

    if (!isOutlier) {
      cleanCoords.push([curr.lat, curr.lng]);
      cleanPoints.push({
        lat: curr.lat,
        lng: curr.lng,
        time: curr.time,
        speed: curr.speed,
        isOnSite: false,
      });
      cleanWps.push(curr);
    }
  }

  return { coords: cleanCoords, points: cleanPoints };
}

// Helper: Clean actual on-site GPS logs into a realistic pedestrian walking path strictly bounded between Check-In and Check-Out anchors
function filterOnSiteKeyframes(
  sessionWps: WaypointItem[],
  entryCoord: [number, number],
  exitCoord: [number, number],
  maxRadius: number = 150.0,
  exitProximityThreshold: number = 20.0,
  entryTime?: string,
  exitTime?: string,
  siteName?: string
): { coords: [number, number][]; points: CleanPlaybackPoint[] } {
  // 1. Exclude poor accuracy points (> 25m), vehicle road speeds (> 7 km/h), and points outside premises geofence
  const validWps = sessionWps.filter(w => {
    const acc = w.accuracy ?? 20;
    const spd = w.speed ?? 0;
    if (acc > 25.0 || spd > 7.0) return false;
    const dEntry = haversineMeters(entryCoord[0], entryCoord[1], w.lat, w.lng);
    const dExit = haversineMeters(exitCoord[0], exitCoord[1], w.lat, w.lng);
    return dEntry <= maxRadius && dExit <= maxRadius;
  });

  if (validWps.length === 0) {
    const coords: [number, number][] = [entryCoord, exitCoord];
    const points: CleanPlaybackPoint[] = [
      { lat: entryCoord[0], lng: entryCoord[1], time: entryTime, speed: 0, isOnSite: true, siteName },
      { lat: exitCoord[0], lng: exitCoord[1], time: exitTime, speed: 0, isOnSite: true, siteName },
    ];
    return { coords, points };
  }

  // 2. Filter stationary micro-jitter (< 8m), acute reversals within 25m, and terminate upon reaching exit proximity
  const cleanWps: WaypointItem[] = [];
  for (let i = 0; i < validWps.length; i++) {
    const w = validWps[i];
    const curr: [number, number] = [w.lat, w.lng];
    const dExit = haversineMeters(exitCoord[0], exitCoord[1], curr[0], curr[1]);

    if (cleanWps.length >= 1) {
      const prev = cleanWps[cleanWps.length - 1];
      const dPrev = haversineMeters(prev.lat, prev.lng, w.lat, w.lng);

      // Compress micro-distance jitter (< 8m)
      if (dPrev < 8.0) {
        continue;
      }

      // Suppress stationary acute reversals (> 135 deg)
      if (i < validWps.length - 1) {
        const nextPt = validWps[i + 1];
        const bIn = calculateBearing(prev.lat, prev.lng, w.lat, w.lng);
        const bOut = calculateBearing(w.lat, w.lng, nextPt.lat, nextPt.lng);
        let turn = Math.abs(bOut - bIn);
        if (turn > 180) turn = 360 - turn;
        if (turn > 135 && dPrev < 25.0) {
          continue;
        }
      }
    }
    cleanWps.push(w);

    // Stop accepting internal points once path reaches physical exit threshold near end of session
    if (i >= Math.floor(validWps.length / 2) && dExit <= exitProximityThreshold) {
      break;
    }
  }

  // 3. Build keyframe path anchored strictly at exact Check-In and Check-Out coordinates
  const keyframes: [number, number][] = [entryCoord];
  const points: CleanPlaybackPoint[] = [{
    lat: entryCoord[0],
    lng: entryCoord[1],
    time: entryTime,
    speed: 0,
    isOnSite: true,
    siteName,
  }];

  for (const w of cleanWps) {
    const pt: [number, number] = [w.lat, w.lng];
    const last = keyframes[keyframes.length - 1];
    const dToExit = haversineMeters(pt[0], pt[1], exitCoord[0], exitCoord[1]);
    if (haversineMeters(last[0], last[1], pt[0], pt[1]) >= 8.0 && dToExit > 5.0) {
      keyframes.push(pt);
      points.push({
        lat: pt[0],
        lng: pt[1],
        time: w.time,
        speed: w.speed || 0,
        isOnSite: true,
        siteName,
      });
    }
  }

  // Terminate strictly at exact Check-Out coordinate
  keyframes.push(exitCoord);
  points.push({
    lat: exitCoord[0],
    lng: exitCoord[1],
    time: exitTime,
    speed: 0,
    isOnSite: true,
    siteName,
  });

  return { coords: keyframes, points };
}

// Fixed Site Landmark Marker (Compact Circular Gate Badge with Beacon)
const createFixedSiteGateIcon = (label: string, radius: number) =>
  L.divIcon({
    className: "bg-transparent",
    html: `
      <div style="
        transform: translate(-50%, -50%);
        width: 26px;
        height: 26px;
        border-radius: 50%;
        background: linear-gradient(135deg, #6366f1, #4338ca);
        color: white;
        font-size: 12px;
        display: flex;
        align-items: center;
        justify-content: center;
        border: 2px solid white;
        box-shadow: 0 2px 8px rgba(67, 56, 202, 0.45);
        cursor: pointer;
        transition: transform 0.15s ease;
      " title="${label} (${radius}m)">
        🏛️
      </div>
    `,
    iconSize: [0, 0],
    iconAnchor: [0, 0],
    popupAnchor: [0, -16],
  });

// Check-In Event Marker (Sleek High-Contrast Emerald Pill Badge)
const createCheckInIcon = (sessionNum: number, timeStr?: string) =>
  L.divIcon({
    className: "checkin-marker-badge",
    html: `
      <div style="
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 3px;
        background: #059669;
        color: #ffffff;
        font-family: system-ui, -apple-system, sans-serif;
        font-size: 10px;
        font-weight: 800;
        letter-spacing: 0.3px;
        padding: 2.5px 7px;
        border-radius: 12px;
        border: 2px solid #ffffff;
        box-shadow: 0 2px 8px rgba(0,0,0,0.35);
        white-space: nowrap;
        user-select: none;
      " title="Check-In #${sessionNum} ${timeStr ? `(${timeStr})` : ''}">
        <span style="display:inline-block; width:5px; height:5px; background:#6ee7b7; border-radius:50%;"></span>
        <span>IN</span>
      </div>
    `,
    iconSize: [42, 20],
    iconAnchor: [21, 10],
    popupAnchor: [0, -12],
  });

// Check-Out Event Marker (Sleek High-Contrast Rose Pill Badge)
const createCheckOutIcon = (sessionNum: number, timeStr?: string) =>
  L.divIcon({
    className: "checkout-marker-badge",
    html: `
      <div style="
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 3px;
        background: #e11d48;
        color: #ffffff;
        font-family: system-ui, -apple-system, sans-serif;
        font-size: 10px;
        font-weight: 800;
        letter-spacing: 0.3px;
        padding: 2.5px 7px;
        border-radius: 12px;
        border: 2px solid #ffffff;
        box-shadow: 0 2px 8px rgba(0,0,0,0.35);
        white-space: nowrap;
        user-select: none;
      " title="Check-Out #${sessionNum} ${timeStr ? `(${timeStr})` : ''}">
        <span style="display:inline-block; width:5px; height:5px; background:#fecdd3; border-radius:50%;"></span>
        <span>OUT</span>
      </div>
    `,
    iconSize: [50, 20],
    iconAnchor: [25, 10],
    popupAnchor: [0, -12],
  });

// Track Disabled Marker (Compact High-Contrast Amber Pill Badge with bold 'D')
const createTrackDisabledIcon = (timeStr?: string | null) =>
  L.divIcon({
    className: "track-disabled-marker-badge",
    html: `
      <div style="
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 3px;
        background: linear-gradient(135deg, #f59e0b, #d97706);
        color: #ffffff;
        font-family: system-ui, -apple-system, sans-serif;
        font-size: 11px;
        font-weight: 900;
        letter-spacing: 0.3px;
        padding: 2.5px 7px;
        border-radius: 12px;
        border: 2px solid #ffffff;
        box-shadow: 0 2px 8px rgba(217, 119, 6, 0.45);
        white-space: nowrap;
        user-select: none;
        cursor: pointer;
        z-index: 1250;
      " title="Track Disabled ${timeStr ? `(${timeStr})` : ''}">
        <span style="display:inline-block; width:5px; height:5px; background:#fef08a; border-radius:50%;"></span>
        <span>D</span>
      </div>
    `,
    iconSize: [36, 20],
    iconAnchor: [18, 10],
    popupAnchor: [0, -12],
  });

// Track Enabled Marker (Compact High-Contrast Purple Pill Badge with bold 'E')
const createTrackEnabledIcon = (timeStr?: string | null) =>
  L.divIcon({
    className: "track-enabled-marker-badge",
    html: `
      <div style="
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 3px;
        background: linear-gradient(135deg, #a855f7, #7c3aed);
        color: #ffffff;
        font-family: system-ui, -apple-system, sans-serif;
        font-size: 11px;
        font-weight: 900;
        letter-spacing: 0.3px;
        padding: 2.5px 7px;
        border-radius: 12px;
        border: 2px solid #ffffff;
        box-shadow: 0 2px 8px rgba(124, 58, 237, 0.45);
        white-space: nowrap;
        user-select: none;
        cursor: pointer;
        z-index: 1250;
      " title="Track Enabled ${timeStr ? `(${timeStr})` : ''}">
        <span style="display:inline-block; width:5px; height:5px; background:#ddd6fe; border-radius:50%;"></span>
        <span>E</span>
      </div>
    `,
    iconSize: [36, 20],
    iconAnchor: [18, 10],
    popupAnchor: [0, -12],
  });

// Duty Punch-In Flag (Compact Non-Obscuring Green Pin)
const createDutyPunchInIcon = (timeStr?: string | null) =>
  L.divIcon({
    className: "bg-transparent",
    html: `
      <div style="
        transform: translate(-50%, -50%);
        width: 24px;
        height: 24px;
        border-radius: 50%;
        background: linear-gradient(135deg, #10b981, #059669);
        color: white;
        font-size: 11px;
        display: flex;
        align-items: center;
        justify-content: center;
        border: 2px solid white;
        box-shadow: 0 2px 8px rgba(16, 185, 129, 0.55);
        cursor: pointer;
        z-index: 1200;
        transition: transform 0.15s ease;
      " title="Duty Punch In ${timeStr ? `(${timeStr})` : ''}">
        🚩
      </div>
    `,
    iconSize: [0, 0],
    iconAnchor: [0, 0],
    popupAnchor: [0, -14],
  });

// Duty Punch-Out Flag (Compact Non-Obscuring Slate/Rose Pin)
const createDutyPunchOutIcon = (timeStr?: string | null) =>
  L.divIcon({
    className: "bg-transparent",
    html: `
      <div style="
        transform: translate(-50%, -50%);
        width: 24px;
        height: 24px;
        border-radius: 50%;
        background: linear-gradient(135deg, #334155, #0f172a);
        color: white;
        font-size: 11px;
        display: flex;
        align-items: center;
        justify-content: center;
        border: 2px solid white;
        box-shadow: 0 2px 8px rgba(15, 23, 42, 0.55);
        cursor: pointer;
        z-index: 1200;
        transition: transform 0.15s ease;
      " title="Duty Punch Out ${timeStr ? `(${timeStr})` : ''}">
        🏁
      </div>
    `,
    iconSize: [0, 0],
    iconAnchor: [0, 0],
    popupAnchor: [0, -14],
  });

// Current Active Location Pin (Glowing Blue Beacon with Pulsing Halo)
const createCurrentLocationIcon = (timeStr?: string | null) =>
  L.divIcon({
    className: "bg-transparent",
    html: `
      <div style="
        transform: translate(-50%, -50%);
        width: 24px;
        height: 24px;
        border-radius: 50%;
        background: linear-gradient(135deg, #2563eb, #1d4ed8);
        color: white;
        font-size: 11px;
        display: flex;
        align-items: center;
        justify-content: center;
        border: 2px solid white;
        box-shadow: 0 0 0 4px rgba(37, 99, 235, 0.4), 0 2px 8px rgba(37, 99, 235, 0.6);
        cursor: pointer;
        z-index: 1200;
        transition: transform 0.15s ease;
      " title="Current Location ${timeStr ? `(${timeStr})` : ''}">
        📍
      </div>
    `,
    iconSize: [0, 0],
    iconAnchor: [0, 0],
    popupAnchor: [0, -14],
  });

// Playback Moving Marker Icon (Sleek directional navigation puck with bearing rotation, glowing radar halo, ZERO numbers)
const createPlaybackVehicleIcon = (bearing: number = 0, isOnSite: boolean = false) =>
  L.divIcon({
    className: "bg-transparent",
    html: `
      <div style="
        transform: translate(-50%, -50%);
        position: relative;
        width: 34px;
        height: 34px;
        display: flex;
        align-items: center;
        justify-content: center;
      ">
        <div style="
          position: absolute;
          width: 32px;
          height: 32px;
          border-radius: 50%;
          background: ${isOnSite ? "rgba(13, 148, 136, 0.35)" : "rgba(37, 99, 235, 0.35)"};
          animation: ping 1.5s cubic-bezier(0, 0, 0.2, 1) infinite;
        "></div>
        <div style="
          width: 24px;
          height: 24px;
          border-radius: 50%;
          background: ${isOnSite ? "linear-gradient(135deg, #0d9488, #0f766e)" : "linear-gradient(135deg, #2563eb, #1d4ed8)"};
          border: 2px solid #ffffff;
          box-shadow: 0 2px 8px rgba(0,0,0,0.35);
          display: flex;
          align-items: center;
          justify-content: center;
          transform: rotate(${bearing}deg);
          transition: transform 0.2s ease;
        ">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="white" style="display:block;">
            <path d="M12 2L3 22l9-4 9 4z"/>
          </svg>
        </div>
      </div>
    `,
    iconSize: [0, 0],
    iconAnchor: [0, 0],
  });

// Distinct Waypoint Marker (Clean Minimal Dots with NO numbers)
const createWaypointIcon = (
  _displayLabel: string,
  isOnSite: boolean = false,
  isSelected: boolean = false
) =>
  L.divIcon({
    className: "bg-transparent",
    html: isOnSite ? `
      <div style="
        transform: translate(-50%, -50%);
        width: ${isSelected ? "14px" : "8px"};
        height: ${isSelected ? "14px" : "8px"};
        border-radius: 50%;
        background: ${isSelected ? "#f59e0b" : "#0d9488"};
        border: 2px solid white;
        box-shadow: 0 1px 4px rgba(0,0,0,0.25);
        cursor: pointer;
        transition: all 0.2s ease;
      "></div>
    ` : `
      <div style="
        transform: translate(-50%, -50%);
        width: ${isSelected ? "14px" : "8px"};
        height: ${isSelected ? "14px" : "8px"};
        border-radius: 50%;
        background: ${isSelected ? "#f59e0b" : "#3b82f6"};
        border: 2px solid white;
        box-shadow: 0 1px 4px rgba(0,0,0,0.25);
        cursor: pointer;
        transition: all 0.2s ease;
      "></div>
    `,
    iconSize: [0, 0],
    iconAnchor: [0, 0],
    popupAnchor: [0, -10],
  });

const createArrowIcon = (bearing: number) =>
  L.divIcon({
    className: "bg-transparent",
    html: `
      <div style="
        transform: translate(-50%, -50%) rotate(${bearing}deg);
        display: flex;
        align-items: center;
        justify-content: center;
        width: 14px;
        height: 14px;
        background: #1e40af;
        color: #93c5fd;
        border-radius: 50%;
        border: 1px solid white;
        box-shadow: 0 1px 3px rgba(0,0,0,0.25);
        font-size: 8px;
        pointer-events: none;
      ">
        ▲
      </div>
    `,
    iconSize: [0, 0],
    iconAnchor: [0, 0],
  });

function MapController({
  positions,
  focusedPoint,
  playbackPoint,
  isPlaying,
}: {
  positions: [number, number][];
  focusedPoint: [number, number] | null;
  playbackPoint: [number, number] | null;
  isPlaying: boolean;
}) {
  const map = useMap();

  useEffect(() => {
    map.setMaxZoom(24);
    if (isPlaying && playbackPoint) {
      // Pan smoothly along playback path without changing the user's zoom level
      map.panTo(playbackPoint, { animate: true, duration: 0.4 });
    } else if (focusedPoint) {
      map.setView(focusedPoint, Math.min(22, map.getZoom() > 20 ? map.getZoom() : 20), { animate: true });
    } else if (positions.length > 1) {
      map.fitBounds(positions, { padding: [50, 50], maxZoom: 20, animate: true });
    } else if (positions.length === 1) {
      map.setView(positions[0], 20, { animate: true });
    }
  }, [positions, focusedPoint, playbackPoint, isPlaying, map]);

  return null;
}

export default function RouteHistory() {
  const [officers, setOfficers] = useState<FieldOfficer[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedBranch, setSelectedBranch] = useState<string>("ALL");
  const [selectedOfficerOid, setSelectedOfficerOid] = useState<number | null>(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const val = params.get("employee_oid") || params.get("officer_id") || params.get("emp_oid");
      return val ? parseInt(val, 10) : null;
    } catch {
      return null;
    }
  });
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const val = params.get("date");
      if (val) return val;
    } catch {}
    const d = new Date();
    return d.toISOString().split("T")[0];
  });
  
  const [historyData, setHistoryData] = useState<TrackHistoryResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  
  // Layer visibility toggles
  const [mapType, setMapType] = useState<"streets" | "satellite">("streets");
  const [showRoutePath, setShowRoutePath] = useState<boolean>(true);
  const [showWaypoints, setShowWaypoints] = useState<boolean>(false);
  const [showCheckInOut, setShowCheckInOut] = useState<boolean>(true);
  const [showGeofences, setShowGeofences] = useState<boolean>(true);
  const [showDirectionArrows, setShowDirectionArrows] = useState<boolean>(true);

  // Interactive inspection and playback state
  const [selectedTripNumber, setSelectedTripNumber] = useState<number | null>(null);
  const [selectedWaypointIndex, setSelectedWaypointIndex] = useState<number | null>(null);
  const [playbackIndex, setPlaybackIndex] = useState<number>(0);
  const [focusedPoint, setFocusedPoint] = useState<[number, number] | null>(null);
  const [copiedCoord, setCopiedCoord] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1);

  // Initial load: Fetch active field officers and branches list
  useEffect(() => {
    async function loadMasterData() {
      try {
        const [officersData, branchesData] = await Promise.all([
          getFieldOfficers(),
          getBranches().catch(() => [] as Branch[]),
        ]);
        setOfficers(officersData);
        setBranches(branchesData);
      } catch (err: any) {
        console.error("Failed to load field officers and branches:", err);
      }
    }
    loadMasterData();
  }, []);

  // Filter officers by selected branch if multiple branches exist
  const filteredOfficers = useMemo(() => {
    if (selectedBranch === "ALL") return officers;
    const bOid = Number(selectedBranch);
    return officers.filter(o => o.branch_oid === bOid);
  }, [officers, selectedBranch]);

  // Reset selected trip when officer or date changes
  useEffect(() => {
    setSelectedTripNumber(null);
  }, [selectedOfficerOid, selectedDate]);

  // Fetch track history data when selected officer, date, or trip changes
  const fetchTrackHistory = useCallback(async (tripNumOverride?: number) => {
    if (!selectedOfficerOid) return;
    try {
      setLoading(true);
      setError(null);
      setSelectedWaypointIndex(null);
      setPlaybackIndex(0);
      setFocusedPoint(null);
      setIsPlaying(false);
      const tripToFetch = tripNumOverride !== undefined ? tripNumOverride : (selectedTripNumber || undefined);
      const res = await trackingService.getTrackHistory(selectedOfficerOid, selectedDate, tripToFetch);
      setHistoryData(res);
      if (res.selected_trip_number) {
        setSelectedTripNumber(res.selected_trip_number);
      }
    } catch (err: any) {
      console.error("Failed to fetch track history:", err);
      setError(err?.response?.data?.message || err?.message || "Failed to fetch track history from server.");
      setHistoryData(null);
    } finally {
      setLoading(false);
    }
  }, [selectedOfficerOid, selectedDate, selectedTripNumber]);

  useEffect(() => {
    fetchTrackHistory();
  }, [selectedOfficerOid, selectedDate]);

  const selectedOfficerObj = useMemo(() => {
    return officers.find(o => o.oid === selectedOfficerOid);
  }, [officers, selectedOfficerOid]);

  const waypoints = historyData?.waypoints ?? [];
  const siteVisits = historyData?.site_visits ?? [];
  const attendance = historyData?.attendance;
  const summary = historyData?.summary;

  const startTimeStr = waypoints.length > 0 ? waypoints[0].time : "—";
  const endTimeStr = waypoints.length > 0 ? waypoints[waypoints.length - 1].time : "—";

  // Segment waypoints into discrete Transit legs, Clean On-Site visit sessions, and Chronological Clean Playback Path
  const { transitSegments, onSiteSegments, allRoutePositions, cleanPlaybackPath } = useMemo(() => {
    if (waypoints.length === 0) {
      return { transitSegments: [], onSiteSegments: [], allRoutePositions: [], cleanPlaybackPath: [] };
    }

    const transitSegs: [number, number][][] = [];
    const onSiteSegs: {
      sessionId: number;
      siteId?: number | null;
      siteName?: string | null;
      positions: [number, number][];
    }[] = [];
    const allPositions: [number, number][] = [];
    const orderedPlaybackPoints: CleanPlaybackPoint[] = [];

    const appendToPlayback = (pt: CleanPlaybackPoint) => {
      if (orderedPlaybackPoints.length > 0) {
        const last = orderedPlaybackPoints[orderedPlaybackPoints.length - 1];
        if (Math.abs(last.lat - pt.lat) < 0.00003 && Math.abs(last.lng - pt.lng) < 0.00003) {
          if (!last.time && pt.time) last.time = pt.time;
          return;
        }
      }
      orderedPlaybackPoints.push({ ...pt, bearing: pt.bearing ?? 0 });
    };

    // 1. Group waypoints into alternating states based on authoritative SITE_VISIT_SESSION windows
    const sessionWpsMap = new Map<number, WaypointItem[]>();
    for (const sv of siteVisits) {
      sessionWpsMap.set(sv.session_id, []);
    }

    const rawTransitLegs: {
      wps: WaypointItem[];
      prevSv?: SiteVisitItem;
      nextSv?: SiteVisitItem;
    }[] = [];

    let currentTransitWps: WaypointItem[] = [];
    let currentSvIdx = 0;

    for (let i = 0; i < waypoints.length; i++) {
      const wp = waypoints[i];

      // Authoritative state matching: Check if waypoint belongs to an active site visit session
      let matchedSv: SiteVisitItem | undefined;
      for (const sv of siteVisits) {
        if (sv.check_in && sv.check_out && wp.time >= sv.check_in && wp.time <= sv.check_out) {
          matchedSv = sv;
          break;
        }
      }

      if (!matchedSv) {
        // STATE = OFF_SITE (Transit)
        // Check if segment_id changed (physical gap from disabled interval)
        if (currentTransitWps.length > 0) {
          const prevWp = currentTransitWps[currentTransitWps.length - 1];
          const prevSeg = prevWp.segment_id ?? 1;
          const currSeg = wp.segment_id ?? 1;
          if (currSeg !== prevSeg) {
            // Split into a separate transit leg across the disabled gap with no bridge
            rawTransitLegs.push({
              wps: currentTransitWps,
              prevSv: currentSvIdx > 0 && currentSvIdx - 1 < siteVisits.length ? siteVisits[currentSvIdx - 1] : undefined,
              nextSv: undefined,
            });
            currentTransitWps = [];
          }
        }
        currentTransitWps.push(wp);
      } else {

        // STATE = SITE_SESSION(sessionId)
        if (currentTransitWps.length > 0) {
          rawTransitLegs.push({
            wps: currentTransitWps,
            prevSv: currentSvIdx > 0 && currentSvIdx - 1 < siteVisits.length ? siteVisits[currentSvIdx - 1] : undefined,
            nextSv: currentSvIdx < siteVisits.length ? siteVisits[currentSvIdx] : undefined,
          });
          currentTransitWps = [];
          currentSvIdx++;
        }
        sessionWpsMap.get(matchedSv.session_id)?.push(wp);
      }
    }

    if (currentTransitWps.length > 0) {
      rawTransitLegs.push({
        wps: currentTransitWps,
        prevSv: currentSvIdx > 0 && currentSvIdx - 1 < siteVisits.length ? siteVisits[currentSvIdx - 1] : undefined,
        nextSv: undefined,
      });
    }

    // 2. Form chronological events timeline (interleaving transit legs and site visits in real-time order)
    type TimelineItem =
      | { type: "transit"; leg: typeof rawTransitLegs[0]; startTime: string }
      | { type: "site"; sv: SiteVisitItem; startTime: string };

    const timeline: TimelineItem[] = [];
    for (const leg of rawTransitLegs) {
      const startTime = leg.wps[0]?.time || leg.prevSv?.check_out || "00:00:00";
      timeline.push({ type: "transit", leg, startTime });
    }
    for (const sv of siteVisits) {
      if (sv.entry_lat && sv.entry_lng) {
        timeline.push({ type: "site", sv, startTime: sv.check_in || "00:00:00" });
      }
    }
    timeline.sort((a, b) => a.startTime.localeCompare(b.startTime));

    // 3. Process each chronological event: Clean coordinates, render polylines, and build clean playback nodes
    const punchInLat = attendance?.punch_in_lat ?? (waypoints.length > 0 ? waypoints[0].lat : null);
    const punchInLng = attendance?.punch_in_lng ?? (waypoints.length > 0 ? waypoints[0].lng : null);
    const punchOutLat = attendance?.punch_out_lat ?? (waypoints.length > 0 ? waypoints[waypoints.length - 1].lat : null);
    const punchOutLng = attendance?.punch_out_lng ?? (waypoints.length > 0 ? waypoints[waypoints.length - 1].lng : null);

    let hasAnchoredPunchIn = false;
    for (let tIdx = 0; tIdx < timeline.length; tIdx++) {
      const item = timeline[tIdx];
      if (item.type === "transit") {
        const leg = item.leg;
        const { coords: cleanCoords, points: cleanPoints } = filterTransitSpikes(leg.wps);
        let coords = cleanCoords;
        let points = cleanPoints;

        // 1. Prepend Duty Punch-In anchor directly if this is the start of the trip, else previous site Check-Out
        if (!hasAnchoredPunchIn && punchInLat != null && punchInLng != null) {
          const punchInCoord: [number, number] = [punchInLat, punchInLng];
          if (coords.length === 0 || coords[0][0] !== punchInCoord[0] || coords[0][1] !== punchInCoord[1]) {
            coords = [punchInCoord, ...coords];
            points = [
              { lat: punchInCoord[0], lng: punchInCoord[1], time: attendance?.punch_in || waypoints[0]?.time, speed: 0, isOnSite: false },
              ...points,
            ];
          }
          hasAnchoredPunchIn = true;
        } else if (leg.prevSv && leg.prevSv.exit_lat != null && leg.prevSv.exit_lng != null) {
          const exitCoord: [number, number] = [leg.prevSv.exit_lat, leg.prevSv.exit_lng];
          if (coords.length === 0 || coords[0][0] !== exitCoord[0] || coords[0][1] !== exitCoord[1]) {
            coords = [exitCoord, ...coords];
            points = [
              { lat: exitCoord[0], lng: exitCoord[1], time: leg.prevSv.check_out, speed: 0, isOnSite: false },
              ...points,
            ];
          }
        }

        // 2. Append Duty Punch-Out anchor directly if this is the end of the trip, else next site Check-In
        const hasMoreTransit = timeline.slice(tIdx + 1).some(it => it.type === "transit");
        if (!hasMoreTransit && attendance?.punch_out && punchOutLat != null && punchOutLng != null) {
          const punchOutCoord: [number, number] = [punchOutLat, punchOutLng];
          const last = coords[coords.length - 1];
          if (!last || last[0] !== punchOutCoord[0] || last[1] !== punchOutCoord[1]) {
            coords = [...coords, punchOutCoord];
            points = [
              ...points,
              { lat: punchOutCoord[0], lng: punchOutCoord[1], time: attendance.punch_out, speed: 0, isOnSite: false },
            ];
          }
        } else if (leg.nextSv && leg.nextSv.entry_lat != null && leg.nextSv.entry_lng != null) {
          const entryCoord: [number, number] = [leg.nextSv.entry_lat, leg.nextSv.entry_lng];
          const last = coords[coords.length - 1];
          if (!last || last[0] !== entryCoord[0] || last[1] !== entryCoord[1]) {
            coords = [...coords, entryCoord];
            points = [
              ...points,
              { lat: entryCoord[0], lng: entryCoord[1], time: leg.nextSv.check_in, speed: 0, isOnSite: false },
            ];
          }
        }

        // Apply RDP simplification to road polyline to eliminate high-frequency clutter
        const simplifiedCoords = simplifyPathRDP(coords, 5.0);

        if (simplifiedCoords.length > 0) {
          transitSegs.push(simplifiedCoords);
          for (const pt of simplifiedCoords) {
            allPositions.push(pt);
          }
          for (const p of points) {
            appendToPlayback(p);
          }
        }
      } else {
        const sv = item.sv;
        const entryCoord: [number, number] = [sv.entry_lat!, sv.entry_lng!];
        const exitCoord: [number, number] = [
          sv.exit_lat != null ? sv.exit_lat : sv.entry_lat!,
          sv.exit_lng != null ? sv.exit_lng : sv.entry_lng!,
        ];
        const sessionWps = sessionWpsMap.get(sv.session_id) ?? [];
        const { coords: cleanOnSiteCoords, points: cleanOnSitePoints } = filterOnSiteKeyframes(
          sessionWps,
          entryCoord,
          exitCoord,
          sv.radius || 150.0,
          20.0,
          sv.check_in,
          sv.check_out,
          sv.site_name || undefined
        );

        onSiteSegs.push({
          sessionId: sv.session_id,
          siteId: sv.site_id,
          siteName: sv.site_name,
          positions: cleanOnSiteCoords,
        });

        for (const pt of cleanOnSiteCoords) {
          allPositions.push(pt);
        }
        for (const p of cleanOnSitePoints) {
          appendToPlayback(p);
        }
      }
    }

    // 4. Calculate directional bearings for playback
    for (let i = 0; i < orderedPlaybackPoints.length; i++) {
      if (i < orderedPlaybackPoints.length - 1) {
        orderedPlaybackPoints[i].bearing = calculateBearing(
          orderedPlaybackPoints[i].lat,
          orderedPlaybackPoints[i].lng,
          orderedPlaybackPoints[i + 1].lat,
          orderedPlaybackPoints[i + 1].lng
        );
      } else if (i > 0) {
        orderedPlaybackPoints[i].bearing = orderedPlaybackPoints[i - 1].bearing;
      }
    }

    return {
      transitSegments: transitSegs,
      onSiteSegments: onSiteSegs,
      allRoutePositions: allPositions,
      cleanPlaybackPath: orderedPlaybackPoints,
    };
  }, [waypoints, siteVisits, attendance]);

  // Full Route Playback Animation Loop: Steps strictly along clean path nodes without jumping to ignored points
  useEffect(() => {
    let timer: any;
    if (isPlaying && cleanPlaybackPath.length > 0) {
      const baseDurationMs = 650;
      const stepDurationMs = Math.max(50, Math.round(baseDurationMs / playbackSpeed));
      timer = setInterval(() => {
        setPlaybackIndex(prev => {
          const next = prev + 1;
          if (next >= cleanPlaybackPath.length) {
            setIsPlaying(false);
            return cleanPlaybackPath.length - 1;
          }
          return next;
        });
      }, stepDurationMs);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [isPlaying, cleanPlaybackPath.length, playbackSpeed]);

  const handleTogglePlay = () => {
    if (cleanPlaybackPath.length === 0) return;
    if (!isPlaying) {
      if (playbackIndex >= cleanPlaybackPath.length - 1) {
        setPlaybackIndex(0);
      }
      setSelectedWaypointIndex(null);
      setIsPlaying(true);
    } else {
      setIsPlaying(false);
    }
  };

  const handleResetPlayback = () => {
    setIsPlaying(false);
    setPlaybackIndex(0);
    setSelectedWaypointIndex(null);
    if (cleanPlaybackPath.length > 0) {
      setFocusedPoint([cleanPlaybackPath[0].lat, cleanPlaybackPath[0].lng]);
    }
  };

  // Unique Fixed Sites visited today for Geofence rendering
  const uniqueFixedSites = useMemo(() => {
    const map = new Map<number, SiteVisitItem>();
    for (const sv of siteVisits) {
      const siteKey = sv.site_id || sv.session_id;
      const lat = sv.gate_lat || sv.entry_lat;
      const lng = sv.gate_lng || sv.entry_lng;
      if (lat && lng && !map.has(siteKey)) {
        map.set(siteKey, {
          ...sv,
          gate_lat: lat,
          gate_lng: lng,
          radius: sv.radius || 300,
        });
      }
    }
    return Array.from(map.values());
  }, [siteVisits]);

  // Interrupted Track Gaps (Where tracking was disabled with 'D' and re-enabled with 'E')
  const trackGaps = useMemo(() => {
    const gaps: {
      pausePoint: WaypointItem;
      resumePoint: WaypointItem;
      durationStr: string;
      distanceKm: number;
    }[] = [];

    for (let i = 0; i < waypoints.length - 1; i++) {
      const p1 = waypoints[i];
      const p2 = waypoints[i + 1];
      const seg1 = p1.segment_id ?? 1;
      const seg2 = p2.segment_id ?? 1;

      if (seg2 !== seg1) {
        const dtSec = Math.max(0, parseTimeToSeconds(p2.time) - parseTimeToSeconds(p1.time));
        const mins = Math.floor(dtSec / 60);
        const secs = dtSec % 60;
        const durStr = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
        const distKm = haversineMeters(p1.lat, p1.lng, p2.lat, p2.lng) / 1000;

        gaps.push({
          pausePoint: p1,
          resumePoint: p2,
          durationStr: durStr,
          distanceKm: Number(distKm.toFixed(2)),
        });
      }
    }
    return gaps;
  }, [waypoints]);

  // Intermediate directional arrows computed along distinct segments with distance-based decimation (prevents overlapping icon clutter)
  const routeSegments = useMemo(() => {
    const segments: { midpoint: [number, number]; bearing: number; isOnSite: boolean }[] = [];
    const MIN_ARROW_SPACING_M = 120.0; // Place directional flow arrow at most once every 120m

    const punchInCoord: [number, number] | null = attendance?.punch_in_lat && attendance?.punch_in_lng
      ? [attendance.punch_in_lat, attendance.punch_in_lng]
      : (waypoints.length > 0 ? [waypoints[0].lat, waypoints[0].lng] : null);

    const punchOutCoord: [number, number] | null = attendance?.punch_out_lat && attendance?.punch_out_lng
      ? [attendance.punch_out_lat, attendance.punch_out_lng]
      : (waypoints.length > 0 ? [waypoints[waypoints.length - 1].lat, waypoints[waypoints.length - 1].lng] : null);

    // Collect all landmark points where arrows should NEVER overlap (Punch In/Out, Site In/Out, Gaps D/E)
    const landmarkPoints: [number, number][] = [];
    if (punchInCoord) landmarkPoints.push(punchInCoord);
    if (punchOutCoord) landmarkPoints.push(punchOutCoord);
    for (const sv of siteVisits) {
      if (sv.entry_lat && sv.entry_lng) landmarkPoints.push([sv.entry_lat, sv.entry_lng]);
      if (sv.exit_lat && sv.exit_lng) landmarkPoints.push([sv.exit_lat, sv.exit_lng]);
    }
    for (const gap of trackGaps) {
      landmarkPoints.push([gap.pausePoint.lat, gap.pausePoint.lng]);
      landmarkPoints.push([gap.resumePoint.lat, gap.resumePoint.lng]);
    }

    const isNearLandmarkOrEndpoint = (lat: number, lng: number) => {
      // Generous deadzone near Punch-In: NO arrow should ever appear at the start of tracking!
      if (punchInCoord && haversineMeters(lat, lng, punchInCoord[0], punchInCoord[1]) < 220.0) return true;
      // Deadzone near Punch-Out:
      if (punchOutCoord && haversineMeters(lat, lng, punchOutCoord[0], punchOutCoord[1]) < 120.0) return true;
      // Near any site visit (IN, OUT) or track interruption (D, E) landmark
      for (const [lLat, lLng] of landmarkPoints) {
        if (haversineMeters(lat, lng, lLat, lLng) < 60.0) return true;
      }
      return false;
    };

    // Transit road arrows
    for (let segIdx = 0; segIdx < transitSegments.length; segIdx++) {
      const seg = transitSegments[segIdx];
      if (seg.length < 2) continue;

      const isFirstSegment = segIdx === 0;

      // Compute total distance of this segment
      let totalSegDist = 0;
      for (let i = 0; i < seg.length - 1; i++) {
        totalSegDist += haversineMeters(seg[i][0], seg[i][1], seg[i + 1][0], seg[i + 1][1]);
      }

      // If this is the very first segment leaving Punch-In, skip arrows entirely if under 280m
      // to guarantee zero arrow clutter at the start of tracking
      if (isFirstSegment && totalSegDist < 280.0) {
        continue;
      }

      // Ignore micro-segments under 40m to avoid clutter near stops
      if (totalSegDist < 40.0) continue;

      if (totalSegDist <= MIN_ARROW_SPACING_M) {
        // Only place if not the first segment leaving punch-in and not near any landmark
        if (!isFirstSegment) {
          const midIdx = Math.floor(seg.length / 2);
          const p1 = seg[Math.max(0, midIdx - 1)];
          const p2 = seg[midIdx];
          const midLat = (p1[0] + p2[0]) / 2;
          const midLng = (p1[1] + p2[1]) / 2;
          if (!isNearLandmarkOrEndpoint(midLat, midLng)) {
            const bearing = calculateBearing(p1[0], p1[1], p2[0], p2[1]);
            segments.push({
              midpoint: [midLat, midLng],
              bearing,
              isOnSite: false,
            });
          }
        }
        continue;
      }

      // Long segment: place arrows at distance intervals (~120m)
      let accumDist = 0;
      // Delay first arrow on initial segment to keep start clean
      let lastArrowDist = isFirstSegment ? 120.0 : 0;

      for (let i = 0; i < seg.length - 1; i++) {
        const p1 = seg[i];
        const p2 = seg[i + 1];
        const subDist = haversineMeters(p1[0], p1[1], p2[0], p2[1]);
        accumDist += subDist;

        if (accumDist - lastArrowDist >= MIN_ARROW_SPACING_M && subDist >= 5.0) {
          const midLat = (p1[0] + p2[0]) / 2;
          const midLng = (p1[1] + p2[1]) / 2;
          if (!isNearLandmarkOrEndpoint(midLat, midLng)) {
            const bearing = calculateBearing(p1[0], p1[1], p2[0], p2[1]);
            segments.push({
              midpoint: [midLat, midLng],
              bearing,
              isOnSite: false,
            });
            lastArrowDist = accumDist;
          }
        }
      }
    }

    // On-site Clean IN -> OUT arrows (at most 1 arrow if distance is meaningful >= 30m)
    for (const onSite of onSiteSegments) {
      const seg = onSite.positions;
      if (seg.length >= 2) {
        const p1 = seg[0];
        const p2 = seg[seg.length - 1];
        const d = haversineMeters(p1[0], p1[1], p2[0], p2[1]);
        if (d >= 30.0) {
          const midLat = (p1[0] + p2[0]) / 2;
          const midLng = (p1[1] + p2[1]) / 2;
          if (!isNearLandmarkOrEndpoint(midLat, midLng)) {
            const bearing = calculateBearing(p1[0], p1[1], p2[0], p2[1]);
            segments.push({
              midpoint: [midLat, midLng],
              bearing,
              isOnSite: true,
            });
          }
        }
      }
    }

    return segments;
  }, [transitSegments, onSiteSegments, attendance, waypoints, siteVisits, trackGaps]);

  const handleSelectWaypoint = (idx: number) => {
    setSelectedWaypointIndex(idx);
    const wp = waypoints[idx];
    if (wp) {
      setFocusedPoint([wp.lat, wp.lng]);
    }
  };

  const handleFocusSiteVisit = (sv: SiteVisitItem) => {
    const targetLat = sv.entry_lat || sv.gate_lat || sv.exit_lat;
    const targetLng = sv.entry_lng || sv.gate_lng || sv.exit_lng;

    if (targetLat && targetLng) {
      setFocusedPoint([targetLat, targetLng]);
    }

    // Highlight the nearest on-site point for this visit session
    const siteWpIndex = waypoints.findIndex(wp => 
      (wp.is_on_site && (wp.site_id === sv.site_id || wp.site_name === sv.site_name)) ||
      (targetLat && targetLng && Math.abs(wp.lat - targetLat) < 0.0004 && Math.abs(wp.lng - targetLng) < 0.0004)
    );
    if (siteWpIndex !== -1) {
      setSelectedWaypointIndex(siteWpIndex);
    }

    // Smoothly scroll up to the map so the user immediately sees the site movements
    const mapElem = document.getElementById("route-history-map-card");
    if (mapElem) {
      mapElem.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedCoord(text);
    setTimeout(() => setCopiedCoord(null), 2000);
  };

  const punchInOutStr = attendance
    ? `${attendance.punch_in || "Not Punched"} / ${attendance.punch_out || "Not Punched"}`
    : "— / —";

  const actualPlannedVisits = summary
    ? `${summary.actual_visits} / ${summary.planned_visits}`
    : "0 / 0";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Track History</h1>
        <div className="mt-1.5 flex items-start gap-2 rounded-md border border-amber-200/70 bg-amber-50/70 p-2.5 text-xs text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-300 max-w-4xl">
          <span className="shrink-0 text-sm leading-none pt-0.5">📍</span>
          <div>
            <span className="font-semibold">Location Accuracy Notice: </span>
            <span className="text-amber-800 dark:text-amber-300/90 leading-relaxed">
              GPS data may be influenced by environmental factors (e.g., tall buildings, indoor locations, weather conditions, heavy tree cover, network coverage, etc.). As a result, the user’s location may not always be exact and can vary depending on these conditions.
            </span>
          </div>
        </div>
      </div>

      {/* Filters bar */}
      <div className="flex flex-wrap gap-3 items-center">
        <Filter className="h-4 w-4 text-muted-foreground" />
        
        {/* Branch Selection (Only shown when user/manager handles multiple branches) */}
        {branches.length > 1 && (
          <Select
            value={selectedBranch}
            onValueChange={v => {
              setSelectedBranch(v);
              setSelectedOfficerOid(null);
            }}
          >
            <SelectTrigger className="h-8 w-44 text-xs border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
              <SelectValue placeholder="All Branches" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Branches</SelectItem>
              {branches.map(b => (
                <SelectItem key={b.oid} value={String(b.oid)}>
                  {b.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {/* Officer Selection */}
        <Select
          value={selectedOfficerOid ? String(selectedOfficerOid) : ""}
          onValueChange={v => setSelectedOfficerOid(Number(v))}
        >
          <SelectTrigger className="h-8 w-52 text-xs border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
            <SelectValue placeholder="Select Field Officer" />
          </SelectTrigger>
          <SelectContent>
            {filteredOfficers.map(o => (
              <SelectItem key={o.oid} value={String(o.oid)}>
                {o.name} ({o.emp_code || `EMP${o.oid}`})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Date Selection */}
        <Input
          type="date"
          value={selectedDate}
          onChange={e => setSelectedDate(e.target.value)}
          className="h-8 w-36 text-xs border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm"
        />

        <Button
          variant="outline"
          size="sm"
          onClick={() => fetchTrackHistory()}
          disabled={loading || !selectedOfficerOid}
          className="btn-white-fill h-8 gap-1.5 text-xs rounded-md"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          Reload Route
        </Button>
      </div>

      {/* Duty Punch Trips Selector & Count Banner (Only shown when GPS track exists and multiple trips were recorded) */}
      {selectedOfficerOid && waypoints.length > 0 && historyData?.punch_sessions && historyData.punch_sessions.length > 1 && (
        <div className="bg-white dark:bg-card border shadow-xs rounded-xl p-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="h-7 w-7 rounded-lg bg-primary/10 text-primary flex items-center justify-center font-bold text-xs">
              📌
            </div>
            <div>
              <div className="text-xs font-extrabold text-foreground flex items-center gap-2">
                <span>Duty Trips Recorded on {selectedDate}:</span>
                <Badge variant="secondary" className="font-mono text-[11px] font-bold px-2 py-0.5 bg-primary/10 text-primary border-primary/20">
                  {historyData.total_punch_trips} Trips
                </Badge>
              </div>
              <div className="text-[10px] text-muted-foreground">
                Showing individual trip: <strong>Trip #{selectedTripNumber || historyData.selected_trip_number || 1} of {historyData.total_punch_trips}</strong>
              </div>
            </div>
          </div>

          {/* Individual Trip Selector Buttons */}
          <div className="flex flex-wrap items-center gap-2">
            {historyData.punch_sessions.map((ps) => {
              const isSelected = (selectedTripNumber || historyData.selected_trip_number || 1) === ps.trip_number;
              return (
                <Button
                  key={`trip-btn-${ps.session_id}-${ps.trip_number}`}
                  size="sm"
                  variant={isSelected ? "default" : "outline"}
                  className={`h-8 px-3 text-xs font-semibold gap-2 transition-all ${
                    isSelected 
                      ? "shadow-sm ring-2 ring-primary/20" 
                      : "bg-muted/40 hover:bg-muted text-muted-foreground hover:text-foreground"
                  }`}
                  onClick={() => {
                    setSelectedTripNumber(ps.trip_number);
                    fetchTrackHistory(ps.trip_number);
                  }}
                >
                  <span className={`w-2 h-2 rounded-full ${ps.is_active ? "bg-emerald-400 animate-pulse" : "bg-slate-400"}`} />
                  <span className="font-bold">Trip #{ps.trip_number}</span>
                  <span className="font-mono text-[10px] opacity-90">
                    {ps.in_time} – {ps.out_time || "Active"}
                  </span>
                  {ps.duration_str && (
                    <span className="text-[10px] opacity-80 border-l border-current/20 pl-1.5 hidden sm:inline">
                      {ps.duration_str}
                    </span>
                  )}
                </Button>
              );
            })}
          </div>
        </div>
      )}

      {/* Error state */}
      {error && (
        <Card className="border-red-500/30 bg-red-500/5 p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs text-red-600 dark:text-red-400 font-medium">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
            <Button size="sm" variant="outline" onClick={() => fetchTrackHistory()} className="h-7 text-xs border-red-500/30">
              Retry
            </Button>
          </div>
        </Card>
      )}

      {/* Main Content Layout */}
      {selectedOfficerOid && historyData ? (
        <>
          {/* Route Summary KPI Strip */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "Punch-In / Punch-Out", value: punchInOutStr, icon: UserCheck, color: "text-rose-600" },
              { label: "Total Working Hours", value: attendance?.work_hours || "00:00", icon: Clock, color: "text-violet-600" },
              { label: "Actual / Planned Visits", value: actualPlannedVisits, icon: CalendarCheck, color: "text-emerald-600" },
              { label: "Total GPS Distance", value: `${summary?.total_distance_km ?? 0} km`, icon: Navigation, color: "text-sky-600" },
            ].map(m => (
              <Card key={m.label} className="border-border shadow-sm">
                <CardContent className="p-3 flex items-center gap-3">
                  <div className={`h-8 w-8 rounded-lg bg-muted flex items-center justify-center shrink-0 ${m.color}`}>
                    <m.icon className="h-4 w-4" />
                  </div>
                  <div>
                    <div className="text-[9px] font-bold text-muted-foreground tracking-wider leading-tight">{m.label}</div>
                    <div className="text-sm font-extrabold font-mono-data">{m.value}</div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Leaflet Map with Route, Fixed Site Geofences, and Check-In/Out Events */}
          <Card id="route-history-map-card" className="border-border shadow-sm overflow-hidden scroll-mt-6">
            <CardHeader className="py-2.5 px-4 border-b flex flex-col md:flex-row md:items-center md:justify-between gap-2.5 bg-card">
              {/* Left Title & Officer Info */}
              <div className="flex items-center gap-2.5 flex-wrap">
                <div className="h-7 w-7 rounded-lg bg-primary/10 text-primary flex items-center justify-center font-bold">
                  <Navigation className="h-3.5 w-3.5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-foreground">Route Map</span>
                    <span className="text-xs font-semibold text-muted-foreground">•</span>
                    <span className="text-xs font-semibold text-primary">{selectedOfficerObj?.name}</span>
                  </div>
                </div>

                {/* Clickable Layer Toggle Pills */}
                <div className="flex items-center gap-1.5 ml-1 pl-2 border-l flex-wrap">
                  <button
                    type="button"
                    onClick={() => setShowGeofences(!showGeofences)}
                    className={`h-6 px-2.5 rounded-full text-[10px] font-bold inline-flex items-center gap-1.5 border transition-all cursor-pointer shadow-2xs hover:shadow-xs active:scale-95 ${
                      showGeofences
                        ? "bg-primary/10 text-primary border-primary/30 hover:bg-primary/20"
                        : "bg-muted/40 text-muted-foreground/60 border-dashed border-border hover:bg-muted hover:text-foreground"
                    }`}
                    title="Toggle Fixed Site Geofences"
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${showGeofences ? "bg-primary" : "bg-muted-foreground/40"}`} />
                    <span>Geofences ({uniqueFixedSites.length})</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setShowCheckInOut(!showCheckInOut)}
                    className={`h-6 px-2.5 rounded-full text-[10px] font-bold inline-flex items-center gap-1.5 border transition-all cursor-pointer shadow-2xs hover:shadow-xs active:scale-95 ${
                      showCheckInOut
                        ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20"
                        : "bg-muted/40 text-muted-foreground/60 border-dashed border-border hover:bg-muted hover:text-foreground"
                    }`}
                    title="Toggle Check-In & Check-Out Visit Gates"
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${showCheckInOut ? "bg-emerald-500" : "bg-muted-foreground/40"}`} />
                    <span>Visits ({siteVisits.length})</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setShowRoutePath(!showRoutePath)}
                    className={`h-6 px-2.5 rounded-full text-[10px] font-bold inline-flex items-center gap-1.5 border transition-all cursor-pointer shadow-2xs hover:shadow-xs active:scale-95 ${
                      showRoutePath
                        ? "bg-sky-500/10 text-sky-700 dark:text-sky-400 border-sky-500/30 hover:bg-sky-500/20"
                        : "bg-muted/40 text-muted-foreground/60 border-dashed border-border hover:bg-muted hover:text-foreground"
                    }`}
                    title="Toggle GPS Travel Path"
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${showRoutePath ? "bg-sky-500" : "bg-muted-foreground/40"}`} />
                    <span>Path</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setShowWaypoints(!showWaypoints)}
                    className={`h-6 px-2.5 rounded-full text-[10px] font-bold inline-flex items-center gap-1.5 border transition-all cursor-pointer shadow-2xs hover:shadow-xs active:scale-95 ${
                      showWaypoints
                        ? "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30 hover:bg-amber-500/20"
                        : "bg-muted/40 text-muted-foreground/60 border-dashed border-border hover:bg-muted hover:text-foreground"
                    }`}
                    title="Toggle GPS Waypoint Breadcrumbs"
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${showWaypoints ? "bg-amber-500" : "bg-muted-foreground/40"}`} />
                    <span>Points ({waypoints.length})</span>
                  </button>
                </div>
              </div>

              {/* Right Playback & Map Layer Controls (Strictly Side-by-Side) */}
              <div className="flex items-center gap-2 flex-nowrap shrink-0 overflow-x-auto">
                {/* Route Playback Controller */}
                {cleanPlaybackPath.length > 0 && (
                  <div className="flex items-center gap-1 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 shadow-xs p-1 rounded-full">
                    <Button
                      size="sm"
                      className={`h-6 px-2.5 text-[10px] font-bold gap-1 rounded-full transition-all ${
                        isPlaying 
                          ? "bg-amber-500 text-white shadow-xs animate-pulse hover:bg-amber-600" 
                          : "bg-slate-900 text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white shadow-xs"
                      }`}
                      title={isPlaying ? "Pause Route Playback" : "Play Route from Punch-In to Punch-Out"}
                      onClick={handleTogglePlay}
                    >
                      {isPlaying ? (
                        <>
                          <Pause className="h-3 w-3 fill-current" />
                          <span>Pause</span>
                        </>
                      ) : (
                        <>
                          <Play className="h-3 w-3 fill-current" />
                          <span>Play Route</span>
                        </>
                      )}
                    </Button>

                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 px-2 text-[10px] font-semibold gap-1 rounded-full text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                      title="Reset Route to Punch In"
                      onClick={handleResetPlayback}
                    >
                      <RotateCcw className="h-3 w-3 text-slate-500" />
                      <span>Reset</span>
                    </Button>

                    <div className="h-3 w-px bg-slate-200 dark:bg-slate-700 mx-0.5" />

                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6 rounded-full text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                      title="Previous Point"
                      disabled={playbackIndex <= 0}
                      onClick={() => setPlaybackIndex(prev => Math.max(0, prev - 1))}
                    >
                      <SkipBack className="h-3 w-3" />
                    </Button>

                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6 rounded-full text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                      title="Next Point"
                      disabled={playbackIndex >= cleanPlaybackPath.length - 1}
                      onClick={() => setPlaybackIndex(prev => Math.min(cleanPlaybackPath.length - 1, prev + 1))}
                    >
                      <SkipForward className="h-3 w-3" />
                    </Button>

                    <div className="h-3 w-px bg-slate-200 dark:bg-slate-700 mx-0.5" />

                    {/* Speed Adjustment Settings */}
                    <div className="flex items-center">
                      <Select
                        value={String(playbackSpeed)}
                        onValueChange={v => setPlaybackSpeed(Number(v))}
                      >
                        <SelectTrigger className="h-6 w-auto gap-1 border-0 bg-transparent px-2 py-0 text-[10px] font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full focus:ring-0 focus:outline-none shadow-none cursor-pointer">
                          <Gauge className="h-3 w-3 text-primary" />
                          <span>{playbackSpeed}x</span>
                        </SelectTrigger>
                        <SelectContent className="min-w-[7.5rem] p-1 z-[2000]">
                          <SelectItem value="0.5" className="text-xs py-1">0.5x (Slow)</SelectItem>
                          <SelectItem value="1" className="text-xs py-1 font-semibold">1.0x (Normal)</SelectItem>
                          <SelectItem value="2" className="text-xs py-1">2.0x (Fast)</SelectItem>
                          <SelectItem value="4" className="text-xs py-1">4.0x (Faster)</SelectItem>
                          <SelectItem value="8" className="text-xs py-1">8.0x (Max)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Current Vehicle Position Timestamp (NO numbers like 11/11) */}
                    {cleanPlaybackPath[playbackIndex]?.time && (
                      <div className="flex items-center gap-1 text-[10px] font-mono text-slate-500 dark:text-slate-400 px-1.5 border-l border-slate-200 dark:border-slate-700">
                        <Clock className="h-3 w-3 text-primary" />
                        <span>{cleanPlaybackPath[playbackIndex].time}</span>
                      </div>
                    )}
                  </div>
                )}

                {/* Map Type Layer Switcher (Street vs Satellite) */}
                <div className="flex items-center gap-0.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 shadow-xs p-1 rounded-full">
                  <Button
                    size="sm"
                    variant="ghost"
                    className={`h-6 px-2.5 rounded-full text-[10px] font-bold transition-all ${
                      mapType === "streets" 
                        ? "bg-primary text-primary-foreground shadow-xs" 
                        : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                    }`}
                    onClick={() => setMapType("streets")}
                  >
                    🗺️ Street
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className={`h-6 px-2.5 rounded-full text-[10px] font-bold transition-all ${
                      mapType === "satellite" 
                        ? "bg-primary text-primary-foreground shadow-xs" 
                        : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                    }`}
                    onClick={() => setMapType("satellite")}
                  >
                    🛰️ Satellite
                  </Button>
                </div>
              </div>
            </CardHeader>

            <CardContent className="p-0 relative">
              {/* Floating Route Timeline Info Pill (Top-Right) */}
              {waypoints.length > 0 && (
                <div className="absolute top-3 right-3 z-[1000] bg-background/95 backdrop-blur-md border shadow-md rounded-full px-3 py-1 flex items-center gap-2 text-xs pointer-events-auto">
                  <div className="flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                    <span className="text-[10px] text-muted-foreground font-medium">In:</span>
                    <span className="font-mono font-bold text-foreground text-[11px]">{attendance?.punch_in || startTimeStr}</span>
                  </div>
                  <div className="h-2.5 w-px bg-border"></div>
                  <div className="flex items-center gap-1">
                    <span className={`w-1.5 h-1.5 rounded-full ${attendance?.punch_out ? "bg-rose-500" : "bg-amber-500 animate-pulse"}`}></span>
                    <span className="text-[10px] text-muted-foreground font-medium">Out:</span>
                    <span className="font-mono font-bold text-foreground text-[11px]">
                      {attendance?.punch_out ? attendance.punch_out : "Active"}
                    </span>
                  </div>
                  <div className="h-2.5 w-px bg-border"></div>
                  <div className="text-[10px] font-mono text-muted-foreground font-semibold">
                    {summary?.total_distance_km ?? 0} km
                  </div>
                </div>
              )}

              <div style={{ height: 450 }} className="w-full">
                <MapContainer
                  center={
                    allRoutePositions.length > 0
                      ? allRoutePositions[0]
                      : attendance?.punch_in_lat && attendance?.punch_in_lng
                      ? [attendance.punch_in_lat, attendance.punch_in_lng]
                      : [18.5204, 73.8567]
                  }
                  zoom={14}
                  maxZoom={24}
                  minZoom={3}
                  className="h-full w-full outline-none z-0"
                  zoomControl={true}
                  attributionControl={true}
                >
                  {mapType === "streets" ? (
                    <TileLayer
                      key="streets-layer"
                      url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
                      maxNativeZoom={19}
                      maxZoom={24}
                      attribution='&copy; OpenStreetMap contributors'
                    />
                  ) : (
                    <TileLayer
                      key="satellite-layer"
                      attribution='&copy; Esri, Maxar, Earthstar Geographics'
                      url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                      maxNativeZoom={19}
                      maxZoom={24}
                    />
                  )}

                  {/* Dynamic map view controller */}
                  <MapController
                    positions={allRoutePositions}
                    focusedPoint={focusedPoint}
                    playbackPoint={isPlaying && cleanPlaybackPath[playbackIndex] ? [cleanPlaybackPath[playbackIndex].lat, cleanPlaybackPath[playbackIndex].lng] : null}
                    isPlaying={isPlaying}
                  />

                  {/* 1. FIXED PHYSICAL SITES & EXACT DATABASE GEOFENCE RADIUS CIRCLES */}
                  {showGeofences && uniqueFixedSites.map(site => {
                    const radiusMeters = site.radius || 300;
                    return (
                      <React.Fragment key={`fixed-site-${site.site_id}`}>
                        {/* Exact Database Geofence Radius Circle */}
                        <Circle
                          center={[site.gate_lat!, site.gate_lng!]}
                          radius={radiusMeters}
                          pathOptions={{
                            color: "#6366f1",
                            fillColor: "#6366f1",
                            fillOpacity: 0.08,
                            weight: 1.5,
                            dashArray: "6 4",
                          }}
                        />

                        {/* Fixed Site Gate Landmark Pin */}
                        <Marker
                          position={[site.gate_lat!, site.gate_lng!]}
                          icon={createFixedSiteGateIcon(site.gate_name || site.site_name || `Site #${site.site_id}`, radiusMeters)}
                        >
                          <Tooltip direction="top" offset={[0, -26]} opacity={0.95}>
                            <div className="font-sans text-[11px]">
                              <strong>🏛️ {site.site_name}</strong>
                              <div className="text-muted-foreground text-[10px]">
                                Gate: {site.gate_name || "Main Gate"} • Geofence Radius: <strong>{radiusMeters}m</strong> (from DB)
                              </div>
                            </div>
                          </Tooltip>
                          <Popup>
                            <div className="p-1 min-w-[210px] text-xs">
                              <div className="font-bold text-sm text-foreground flex items-center justify-between border-b pb-1">
                                <span>🏛️ {site.site_name}</span>
                                <Badge variant="outline" className="text-[9px] font-mono">Site #{site.site_id}</Badge>
                              </div>
                              <div className="mt-1.5 space-y-1 text-muted-foreground text-[11px]">
                                <div>Gate: <strong className="text-foreground">{site.gate_name || "Main Gate"}</strong></div>
                                <div>Geofence Radius: <strong className="text-foreground">{radiusMeters} meters</strong> (Database configured)</div>
                                <div>Coordinates: <strong className="text-foreground font-mono">{site.gate_lat?.toFixed(5)}, {site.gate_lng?.toFixed(5)}</strong></div>
                              </div>
                            </div>
                          </Popup>
                        </Marker>
                      </React.Fragment>
                    );
                  })}

                  {/* 2. TRANSIT / ROAD TRAVEL POLYLINES (Deep Travel Blue) */}
                  {showRoutePath && transitSegments.map((seg, idx) => (
                    <React.Fragment key={`transit-seg-${idx}`}>
                      {/* Outer Casing */}
                      <Polyline
                        positions={seg}
                        pathOptions={{
                          color: mapType === "satellite" ? "#0f172a" : "#1e3a8a",
                          weight: mapType === "satellite" ? 6 : 5.5,
                          opacity: 0.85,
                          lineCap: "round",
                          lineJoin: "round",
                        }}
                      />

                      {/* Vibrant Glowing Core Trajectory Line */}
                      <Polyline
                        positions={seg}
                        pathOptions={{
                          color: mapType === "satellite" ? "#38bdf8" : "#2563eb",
                          weight: mapType === "satellite" ? 4 : 3.5,
                          opacity: 1,
                          lineCap: "round",
                          lineJoin: "round",
                        }}
                      />
                    </React.Fragment>
                  ))}

                  {/* 3. ON-SITE PREMISES POLYLINES (Clean Emerald Green from verified Check-In to Check-Out) */}
                  {showRoutePath && onSiteSegments.map((onSite, idx) => (
                    <React.Fragment key={`onsite-seg-${onSite.sessionId}-${idx}`}>
                      {/* Outer Casing */}
                      <Polyline
                        positions={onSite.positions}
                        pathOptions={{
                          color: "#064e3b",
                          weight: mapType === "satellite" ? 6 : 5.5,
                          opacity: 0.9,
                          lineCap: "round",
                          lineJoin: "round",
                        }}
                      />

                      {/* Clean Emerald Green Path between Verified Check-In and Check-Out Anchors */}
                      <Polyline
                        positions={onSite.positions}
                        pathOptions={{
                          color: "#059669",
                          weight: mapType === "satellite" ? 4 : 3.5,
                          opacity: 1,
                          lineCap: "round",
                          lineJoin: "round",
                        }}
                      />
                    </React.Fragment>
                  ))}

                  {/* 4. DIRECTIONAL FLOW ARROWS */}
                  {showRoutePath && showDirectionArrows && routeSegments.map((seg, idx) => (
                    <Marker
                      key={`dir-arrow-${idx}`}
                      position={seg.midpoint}
                      icon={createArrowIcon(seg.bearing)}
                    />
                  ))}

                  {/* 5. VERIFIED SITE VISIT CHECK-IN & CHECK-OUT LANDMARKS */}
                  {showCheckInOut && siteVisits.map((sv, idx) => {
                    const sessionNum = idx + 1;
                    const isSameCoord = Boolean(sv.exit_lat && sv.exit_lng && sv.entry_lat === sv.exit_lat && sv.entry_lng === sv.exit_lng && sv.check_out);

                    return (
                      <React.Fragment key={`sv-event-${sv.session_id}-${idx}`}>
                        {/* Check-In Marker (Visit Start) */}
                        {sv.entry_lat && sv.entry_lng && (
                          <Marker
                            position={[
                              sv.entry_lat,
                              isSameCoord ? sv.entry_lng - 0.00005 : sv.entry_lng
                            ]}
                            icon={createCheckInIcon(sessionNum, sv.check_in || undefined)}
                            zIndexOffset={1000}
                          >
                            <Tooltip direction="top" offset={[0, -14]} opacity={0.95}>
                              <div className="font-sans text-[11px]">
                                <span className="font-bold text-emerald-600">🟢 Check-In #{sessionNum}</span>
                                <span className="ml-1 font-mono font-semibold">{sv.check_in}</span>
                                <div className="text-[10px] text-muted-foreground">{sv.site_name}</div>
                              </div>
                            </Tooltip>
                            <Popup>
                              <div className="p-1 min-w-[210px] text-xs">
                                <div className="font-bold text-sm text-foreground flex items-center justify-between border-b pb-1">
                                  <span>🟢 Check-In #{sessionNum}</span>
                                  <Badge variant="outline" className="text-[9px] font-mono">{sv.check_in}</Badge>
                                </div>
                                <div className="mt-1.5 space-y-1 text-muted-foreground text-[11px]">
                                  <div>Site: <strong className="text-foreground">{sv.site_name}</strong></div>
                                  <div>Coordinates: <strong className="text-foreground font-mono">{sv.entry_lat.toFixed(5)}, {sv.entry_lng.toFixed(5)}</strong></div>
                                </div>
                              </div>
                            </Popup>
                          </Marker>
                        )}

                        {/* Check-Out Marker */}
                        {sv.exit_lat && sv.exit_lng && sv.check_out && (
                          <Marker
                            position={[
                              sv.exit_lat,
                              isSameCoord ? sv.exit_lng + 0.00005 : sv.exit_lng
                            ]}
                            icon={createCheckOutIcon(sessionNum, sv.check_out || undefined)}
                            zIndexOffset={1000}
                          >
                            <Tooltip direction="top" offset={[0, -14]} opacity={0.95}>
                              <div className="font-sans text-[11px]">
                                <span className="font-bold text-red-600">🔴 Check-Out #{sessionNum}</span>
                                <span className="ml-1 font-mono font-semibold">{sv.check_out}</span>
                              </div>
                            </Tooltip>
                            <Popup>
                              <div className="p-1 min-w-[210px] text-xs">
                                <div className="font-bold text-sm text-foreground flex items-center justify-between border-b pb-1">
                                  <span>🔴 Check-Out #{sessionNum}</span>
                                  <Badge variant="outline" className="text-[9px] font-mono">{sv.check_out}</Badge>
                                </div>
                                <div className="mt-1.5 space-y-1 text-muted-foreground text-[11px]">
                                  <div>Site: <strong className="text-foreground">{sv.site_name}</strong></div>
                                  <div>Coordinates: <strong className="text-foreground font-mono">{sv.exit_lat.toFixed(5)}, {sv.exit_lng.toFixed(5)}</strong></div>
                                </div>
                              </div>
                            </Popup>
                          </Marker>
                        )}
                      </React.Fragment>
                    );
                  })}

                  {/* 6. DAILY DUTY PUNCH-IN & PUNCH-OUT FLAGS */}
                  {waypoints.length > 0 && (
                    <>
                      {/* Daily Duty Punch-In Flag (Anchored directly to tracking start) */}
                      {(() => {
                        const inLat = attendance?.punch_in_lat ?? waypoints[0].lat;
                        const inLng = attendance?.punch_in_lng ?? waypoints[0].lng;
                        return (
                          <Marker
                            position={[inLat, inLng]}
                            icon={createDutyPunchInIcon(attendance?.punch_in || startTimeStr)}
                            zIndexOffset={1200}
                          >
                            <Tooltip direction="top" offset={[0, -14]} opacity={0.95}>
                              <div className="font-sans text-[11px] font-semibold">
                                <span className="text-emerald-600">🚩 Duty Punch-In Location</span>
                                <span className="ml-1 font-mono text-foreground font-bold">{attendance?.punch_in || startTimeStr}</span>
                              </div>
                            </Tooltip>
                            <Popup>
                              <div className="p-1 text-xs">
                                <div className="font-bold text-emerald-600 border-b pb-1 flex items-center gap-1">
                                  <span>🚩</span> Duty Punch-In
                                </div>
                                <div className="mt-1.5 space-y-1 text-muted-foreground text-[11px]">
                                  <div>Time: <strong className="text-foreground font-mono">{attendance?.punch_in || startTimeStr}</strong></div>
                                  <div>Coordinates: <strong className="text-foreground font-mono">{inLat.toFixed(5)}, {inLng.toFixed(5)}</strong></div>
                                </div>
                              </div>
                            </Popup>
                          </Marker>
                        );
                      })()}

                      {/* Daily Duty Punch-Out Flag (Only if Punched Out) OR Current Active Location */}
                      {waypoints.length > 1 && (
                        Boolean(attendance?.punch_out) ? (
                          <Marker
                            position={[
                              attendance?.punch_out_lat ?? waypoints[waypoints.length - 1].lat,
                              attendance?.punch_out_lng ?? waypoints[waypoints.length - 1].lng
                            ]}
                            icon={createDutyPunchOutIcon(attendance?.punch_out)}
                            zIndexOffset={1200}
                          >
                            <Tooltip direction="top" offset={[0, -14]} opacity={0.95}>
                              <div className="font-sans text-[11px] font-semibold">
                                <span className="text-slate-800 dark:text-slate-200">🏁 Duty Punch-Out Location</span>
                                <span className="ml-1 font-mono text-foreground font-bold">{attendance?.punch_out}</span>
                              </div>
                            </Tooltip>
                            <Popup>
                              <div className="p-1 text-xs">
                                <div className="font-bold text-slate-800 dark:text-slate-200 border-b pb-1 flex items-center gap-1">
                                  <span>🏁</span> Duty Punch-Out
                                </div>
                                <div className="mt-1.5 space-y-1 text-muted-foreground text-[11px]">
                                  <div>Time: <strong className="text-foreground font-mono">{attendance?.punch_out}</strong></div>
                                  <div>Coordinates: <strong className="text-foreground font-mono">{waypoints[waypoints.length - 1].lat.toFixed(5)}, {waypoints[waypoints.length - 1].lng.toFixed(5)}</strong></div>
                                </div>
                              </div>
                            </Popup>
                          </Marker>
                        ) : (
                          <Marker
                            position={[
                              waypoints[waypoints.length - 1].lat,
                              waypoints[waypoints.length - 1].lng
                            ]}
                            icon={createCurrentLocationIcon(waypoints[waypoints.length - 1].time)}
                            zIndexOffset={1200}
                          >
                            <Tooltip direction="top" offset={[0, -14]} opacity={0.95}>
                              <div className="font-sans text-[11px] font-semibold">
                                <span className="text-blue-600 dark:text-blue-400 font-bold">📍 Current Location (Active on Duty)</span>
                                <span className="ml-1 font-mono text-foreground font-bold">{waypoints[waypoints.length - 1].time}</span>
                              </div>
                            </Tooltip>
                            <Popup>
                              <div className="p-1 text-xs">
                                <div className="font-bold text-blue-600 dark:text-blue-400 border-b pb-1 flex items-center gap-1">
                                  <span>📍</span> Current Live Position
                                </div>
                                <div className="mt-1.5 space-y-1 text-muted-foreground text-[11px]">
                                  <div>Status: <strong className="text-emerald-600 font-semibold">Active on Duty (Not Punched Out)</strong></div>
                                  <div>Latest Fix: <strong className="text-foreground font-mono">{waypoints[waypoints.length - 1].time}</strong></div>
                                  <div>Coordinates: <strong className="text-foreground font-mono">{waypoints[waypoints.length - 1].lat.toFixed(5)}, {waypoints[waypoints.length - 1].lng.toFixed(5)}</strong></div>
                                </div>
                              </div>
                            </Popup>
                          </Marker>
                        )
                      )}
                    </>
                  )}

                  {/* 6.5. INTERRUPTED TRACK GAP MARKERS (D for Disabled, E for Enabled) */}
                  {showRoutePath && trackGaps.map((gap, gIdx) => (
                    <React.Fragment key={`track-gap-${gIdx}`}>
                      {/* Subtle Muted Dashed Gap Line */}
                      <Polyline
                        positions={[
                          [gap.pausePoint.lat, gap.pausePoint.lng],
                          [gap.resumePoint.lat, gap.resumePoint.lng]
                        ]}
                        pathOptions={{
                          color: "#d97706",
                          weight: 2,
                          dashArray: "6 6",
                          opacity: 0.8,
                        }}
                      />

                      {/* Disabled Marker (D - Amber) */}
                      <Marker
                        position={[gap.pausePoint.lat, gap.pausePoint.lng]}
                        icon={createTrackDisabledIcon(gap.pausePoint.time)}
                        zIndexOffset={1250}
                      >
                        <Tooltip direction="top" offset={[0, -12]} opacity={0.95}>
                          <div className="font-sans text-[11px] font-semibold">
                            <span className="text-amber-600 font-bold">⚠️ Track Disabled (D)</span>
                            <span className="ml-1 font-mono text-foreground font-bold">{gap.pausePoint.time}</span>
                          </div>
                        </Tooltip>
                        <Popup>
                          <div className="p-1 text-xs min-w-[200px]">
                            <div className="font-bold text-amber-600 border-b pb-1 flex items-center justify-between">
                              <span className="flex items-center gap-1.5">
                                <span className="w-4 h-4 rounded bg-amber-600 text-white font-extrabold text-[9px] flex items-center justify-center">D</span>
                                Track Disabled
                              </span>
                              <Badge variant="outline" className="text-[9px] font-mono border-amber-400 text-amber-600">Break #{gIdx + 1}</Badge>
                            </div>
                            <div className="mt-1.5 space-y-1 text-muted-foreground text-[11px]">
                              <div>Time: <strong className="text-foreground font-mono">{gap.pausePoint.time}</strong></div>
                              <div>Coordinates: <strong className="text-foreground font-mono">{gap.pausePoint.lat.toFixed(5)}, {gap.pausePoint.lng.toFixed(5)}</strong></div>
                              <div>Interruption Gap: <strong className="text-amber-600 font-semibold">{gap.durationStr}</strong> ({gap.distanceKm} km)</div>
                            </div>
                          </div>
                        </Popup>
                      </Marker>

                      {/* Enabled Marker (E - Purple) */}
                      <Marker
                        position={[gap.resumePoint.lat, gap.resumePoint.lng]}
                        icon={createTrackEnabledIcon(gap.resumePoint.time)}
                        zIndexOffset={1250}
                      >
                        <Tooltip direction="top" offset={[0, -12]} opacity={0.95}>
                          <div className="font-sans text-[11px] font-semibold">
                            <span className="text-purple-600 font-bold">📡 Track Enabled (E)</span>
                            <span className="ml-1 font-mono text-foreground font-bold">{gap.resumePoint.time}</span>
                            <span className="ml-1 text-[10px] text-muted-foreground">({gap.durationStr} gap)</span>
                          </div>
                        </Tooltip>
                        <Popup>
                          <div className="p-1 text-xs min-w-[200px]">
                            <div className="font-bold text-purple-600 border-b pb-1 flex items-center justify-between">
                              <span className="flex items-center gap-1.5">
                                <span className="w-4 h-4 rounded bg-purple-600 text-white font-extrabold text-[9px] flex items-center justify-center">E</span>
                                Track Enabled
                              </span>
                              <Badge variant="outline" className="text-[9px] font-mono border-purple-400 text-purple-600">Resumed</Badge>
                            </div>
                            <div className="mt-1.5 space-y-1 text-muted-foreground text-[11px]">
                              <div>Time: <strong className="text-foreground font-mono">{gap.resumePoint.time}</strong></div>
                              <div>Coordinates: <strong className="text-foreground font-mono">{gap.resumePoint.lat.toFixed(5)}, {gap.resumePoint.lng.toFixed(5)}</strong></div>
                              <div>Gap Duration: <strong className="text-purple-600 font-semibold">{gap.durationStr}</strong></div>
                              <div>Gap Distance: <strong className="text-foreground font-semibold">{gap.distanceKm} km</strong></div>
                            </div>
                          </div>
                        </Popup>
                      </Marker>
                    </React.Fragment>
                  ))}

                  {/* PLAYBACK MOVING VEHICLE MARKER (Only shown during active playback animation) */}
                  {isPlaying && cleanPlaybackPath.length > 0 && playbackIndex < cleanPlaybackPath.length && (
                    <Marker
                      key="playback-moving-vehicle"
                      position={[cleanPlaybackPath[playbackIndex].lat, cleanPlaybackPath[playbackIndex].lng]}
                      icon={createPlaybackVehicleIcon(
                        cleanPlaybackPath[playbackIndex].bearing || 0,
                        cleanPlaybackPath[playbackIndex].isOnSite
                      )}
                      zIndexOffset={3000}
                    >
                      <Tooltip direction="top" offset={[0, -18]} opacity={0.95}>
                        <div className="font-sans text-[11px] flex flex-col gap-0.5">
                          <div className="flex items-center gap-1 font-bold text-foreground">
                            <span>{cleanPlaybackPath[playbackIndex].isOnSite ? "🏢 On-Site Movement" : "🚗 Route In Transit"}</span>
                            {cleanPlaybackPath[playbackIndex].siteName && (
                              <span className="text-[10px] text-teal-600 font-semibold">
                                ({cleanPlaybackPath[playbackIndex].siteName})
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 text-[10px] text-muted-foreground font-mono">
                            {cleanPlaybackPath[playbackIndex].time && (
                              <span>🕒 {cleanPlaybackPath[playbackIndex].time}</span>
                            )}
                            {cleanPlaybackPath[playbackIndex].speed != null && cleanPlaybackPath[playbackIndex].speed! > 0 && (
                              <span>⚡ {cleanPlaybackPath[playbackIndex].speed!.toFixed(1)} km/h</span>
                            )}
                          </div>
                        </div>
                      </Tooltip>
                    </Marker>
                  )}

                  {/* 7. SEQUENTIAL GPS WAYPOINT PINS */}
                  {waypoints.map((wp, idx) => {
                    const isSelected = selectedWaypointIndex === idx;
                    const isPunchInPoint = idx === 0;
                    const isPunchOutPoint = idx === waypoints.length - 1;
                    const isOnSite = Boolean(wp.is_on_site);
                    const label = wp.display_label || (idx + 1).toString();

                    if (isPlaying) return null; // When playing, do NOT render or highlight any waypoint pins
                    if (!showWaypoints && !isSelected) return null;
                    if (isPunchInPoint || isPunchOutPoint) return null;
                    if (isOnSite && !isSelected) return null;

                    return (
                      <Marker
                        key={`wp-marker-${wp.oid || idx}`}
                        position={[wp.lat, wp.lng]}
                        icon={createWaypointIcon(label, isOnSite, isSelected)}
                        zIndexOffset={isSelected ? 1000 : 100}
                        eventHandlers={{
                          click: () => handleSelectWaypoint(idx),
                        }}
                      >
                        <Tooltip direction="top" offset={[0, -18]} opacity={0.95}>
                          <div className="font-sans text-[11px]">
                            <span className="font-bold">
                              {isOnSite ? `🏢 On-Site Movement #${label}` : `🛣️ Transit Point #${label}`}
                            </span>
                            <span className="ml-1.5 font-mono text-primary font-semibold">{wp.time}</span>
                            {isOnSite && wp.site_name && (
                              <div className="text-[10px] text-teal-600 font-semibold mt-0.5">
                                Inside: {wp.site_name}
                              </div>
                            )}
                          </div>
                        </Tooltip>

                        <Popup>
                          <div className="p-1 min-w-[200px] text-xs">
                            <div className="flex items-center justify-between border-b pb-1 mb-1.5 font-bold">
                              <span className="text-primary font-mono">
                                {isOnSite ? `🏢 On-Site Point #${label}` : `🛣️ Waypoint #${label}`} of {waypoints.length}
                              </span>
                              <Badge variant="secondary" className="text-[9px] font-mono">
                                {wp.time}
                              </Badge>
                            </div>

                            <div className="space-y-1 text-muted-foreground text-[11px]">
                              <div className="flex justify-between items-center">
                                <span>Coordinates:</span>
                                <span className="font-mono text-foreground font-semibold">
                                  {wp.lat.toFixed(5)}, {wp.lng.toFixed(5)}
                                </span>
                              </div>
                              <div className="flex justify-between items-center">
                                <span>GPS Accuracy:</span>
                                <span className="font-mono text-foreground font-semibold">
                                  {wp.accuracy != null ? `±${wp.accuracy.toFixed(1)} m` : "—"}
                                </span>
                              </div>
                              <div className="flex justify-between items-center">
                                <span>Speed:</span>
                                <span className="font-mono text-foreground font-semibold">
                                  {wp.speed != null ? `${wp.speed.toFixed(1)} km/h` : "0.0 km/h"}
                                </span>
                              </div>
                              {wp.battery != null && (
                                <div className="flex justify-between items-center">
                                  <span>Battery:</span>
                                  <span className="font-mono text-foreground font-semibold">
                                    {wp.battery}%
                                  </span>
                                </div>
                              )}
                            </div>

                            <Button
                              size="sm"
                              variant="outline"
                              className="w-full mt-2 h-6 text-[10px] gap-1"
                              onClick={() => handleCopy(`${wp.lat}, ${wp.lng}`)}
                            >
                              {copiedCoord === `${wp.lat}, ${wp.lng}` ? (
                                <>
                                  <Check className="h-3 w-3 text-emerald-500" />
                                  Copied Coordinates
                                </>
                              ) : (
                                <>
                                  <Copy className="h-3 w-3" />
                                  Copy Coordinates
                                </>
                              )}
                            </Button>
                          </div>
                        </Popup>
                      </Marker>
                    );
                  })}

                  {/* Floating Vertical Map Legend (Bottom-Right Corner Rectangle) */}
                  <div className="absolute bottom-3 right-3 z-[1000] bg-background/95 backdrop-blur-md border shadow-md rounded-lg p-2 flex flex-col gap-1.5 text-[10px] pointer-events-auto select-none min-w-[105px]">
                    <div className="flex items-center gap-1.5">
                      <span className="w-3.5 h-1 rounded bg-blue-600 shadow-xs"></span>
                      <span className="font-semibold text-foreground">Road Travel</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="w-3.5 h-1 rounded bg-emerald-500 border border-emerald-700 shadow-xs"></span>
                      <span className="font-semibold text-foreground">Site Visit (IN → OUT)</span>
                    </div>
                    <div className="h-px w-full bg-border my-0.5"></div>
                    <div className="flex items-center gap-1.5">
                      <span className="w-3.5 h-3.5 rounded-full bg-emerald-500 text-white flex items-center justify-center text-[7.5px] shadow-xs">🚩</span>
                      <span className="font-semibold text-foreground">Punch In</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="w-3.5 h-3.5 rounded-full bg-indigo-600 text-white flex items-center justify-center text-[8px] shadow-xs">🏛️</span>
                      <span className="font-semibold text-foreground">Site</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="px-1 py-0.2 rounded bg-emerald-600 text-white font-extrabold text-[7.5px] shadow-xs">IN</span>
                      <span className="font-semibold text-foreground">Check In</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="px-1 py-0.2 rounded bg-rose-600 text-white font-extrabold text-[7.5px] shadow-xs">OUT</span>
                      <span className="font-semibold text-foreground">Check Out</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {attendance?.punch_out ? (
                        <>
                          <span className="w-3.5 h-3.5 rounded-full bg-slate-800 text-white flex items-center justify-center text-[7.5px] shadow-xs">🏁</span>
                          <span className="font-semibold text-foreground">Punch Out</span>
                        </>
                      ) : (
                        <>
                          <span className="w-3.5 h-3.5 rounded-full bg-blue-600 text-white flex items-center justify-center text-[7.5px] shadow-xs">📍</span>
                          <span className="font-semibold text-foreground">Current Location</span>
                        </>
                      )}
                    </div>
                    <div className="h-px w-full bg-border my-0.5"></div>
                    <div className="flex items-center gap-1.5">
                      <span className="px-1 py-0.2 rounded bg-amber-600 text-white font-extrabold text-[7.5px] shadow-xs">D</span>
                      <span className="font-semibold text-foreground">Track Disabled</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="px-1 py-0.2 rounded bg-purple-600 text-white font-extrabold text-[7.5px] shadow-xs">E</span>
                      <span className="font-semibold text-foreground">Track Enabled</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="w-3.5 h-0.5 border-b-2 border-dashed border-amber-500"></span>
                      <span className="font-semibold text-muted-foreground text-[8.5px]">Disabled Gap</span>
                    </div>
                  </div>
                </MapContainer>
              </div>

              {/* Map overlay badge if zero waypoints */}
              {waypoints.length === 0 && !loading && (
                <div className="absolute inset-0 bg-background/60 backdrop-blur-xs flex items-center justify-center z-10">
                  <div className="bg-card border shadow-lg rounded-xl p-4 text-center max-w-sm">
                    <MapPin className="h-8 w-8 text-muted-foreground mx-auto mb-2 opacity-50" />
                    <h4 className="font-bold text-sm">No GPS Route Data</h4>
                    <p className="text-xs text-muted-foreground mt-1">
                      No GPS location logs recorded for officer <strong>{selectedOfficerObj?.name}</strong> on {selectedDate}.
                    </p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Actual Site Visit Sessions List */}
          <Card className="border-border shadow-sm">
            <CardHeader className="py-3 px-4 border-b">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Building2 className="h-4 w-4 text-primary" />
                Actual Site Visit Sessions ({siteVisits.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y divide-border">
                {siteVisits.map((sv, idx) => {
                  const radiusMeters = sv.radius || 300;
                  const isInsideGeofence = sv.distance_from_gate_m == null || sv.distance_from_gate_m <= radiusMeters;

                  return (
                    <div key={sv.session_id} className="p-3.5 flex items-center justify-between hover:bg-muted/20 transition-colors">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="w-5 h-5 rounded-full bg-indigo-600 text-white flex items-center justify-center text-[10px] font-bold">
                            #{idx + 1}
                          </span>
                          <span className="text-xs font-bold text-foreground">{sv.site_name || `Site #${sv.site_id}`}</span>
                        </div>

                        <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground pl-7">
                          <div className="flex items-center gap-1">
                            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                            <span>Check-In: <strong className="text-foreground font-mono">{sv.check_in || "—"}</strong></span>
                          </div>
                          <div className="flex items-center gap-1">
                            <span className="w-2 h-2 rounded-full bg-rose-500"></span>
                            <span>Check-Out: <strong className="text-foreground font-mono">{sv.check_out || "—"}</strong></span>
                          </div>
                          {sv.distance_from_gate_m != null && (
                            <div className="flex items-center gap-1">
                              <ShieldCheck className={`h-3.5 w-3.5 ${isInsideGeofence ? "text-emerald-500" : "text-amber-500"}`} />
                              <span>{sv.distance_from_gate_m}m from gate</span>
                              <span className={`text-[10px] font-semibold ${isInsideGeofence ? "text-emerald-600" : "text-amber-600"}`}>
                                ({isInsideGeofence ? "Verified Inside Geofence" : "Outside Geofence"})
                              </span>
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <div className="text-xs font-bold font-mono text-primary">
                            {sv.duration_minutes ? `${sv.duration_minutes}m` : "—"}
                          </div>
                          <div className="text-[9px] text-muted-foreground">{sv.raw_points_count} GPS points</div>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs gap-1"
                          onClick={() => handleFocusSiteVisit(sv)}
                        >
                          <Crosshair className="h-3 w-3" />
                          View on Map
                        </Button>
                      </div>
                    </div>
                  );
                })}

                {siteVisits.length === 0 && (
                  <div className="p-6 text-center text-xs text-muted-foreground">
                    No site visit sessions recorded for this date.
                  </div>
                )}
              </div>
            </CardContent>
          </Card>


          {/* Sequential GPS Coordinates Logs Table (Only shown when GPS track waypoints exist) */}
          {waypoints.length > 0 && (
            <Card className="border-border shadow-sm">
              <CardHeader className="py-3 px-4 border-b flex flex-row items-center justify-between">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <ListOrdered className="h-4 w-4 text-primary" />
                  Sequential GPS Coordinates Logs ({waypoints.length} Points)
                </CardTitle>
                <span className="text-xs text-muted-foreground">
                  Chronological sequence recorded by GPS device
                </span>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-muted/50 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider border-b">
                      <tr>
                        <th className="px-4 py-2.5">Seq #</th>
                        <th className="px-4 py-2.5">Recorded Time</th>
                        <th className="px-4 py-2.5">Latitude, Longitude</th>
                        <th className="px-4 py-2.5">Accuracy</th>
                        <th className="px-4 py-2.5">Speed</th>
                        <th className="px-4 py-2.5">Battery</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {waypoints.map((wp, idx) => {
                        const isSelected = selectedWaypointIndex === idx;
                        const isFirst = idx === 0;
                        const isLast = idx === waypoints.length - 1;
                        const coordStr = `${wp.lat.toFixed(5)}, ${wp.lng.toFixed(5)}`;
                        const recordedTime = isFirst
                          ? (attendance?.punch_in || wp.time)
                          : isLast
                          ? (attendance?.punch_out || wp.time)
                          : wp.time;

                        return (
                          <tr
                            key={`row-wp-${idx}`}
                            onClick={() => handleSelectWaypoint(idx)}
                            className={`transition-colors cursor-pointer ${
                              isSelected
                                ? "bg-amber-500/15 dark:bg-amber-500/20 font-medium"
                                : "hover:bg-muted/40"
                            }`}
                          >
                            <td className="px-4 py-2.5">
                              <div className="flex items-center">
                                <span
                                  className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white shadow-2xs ${
                                    isFirst
                                      ? "bg-emerald-600"
                                      : isLast
                                      ? "bg-red-600"
                                      : isSelected
                                      ? "bg-amber-500"
                                      : "bg-blue-600"
                                  }`}
                                  title={isFirst ? "Punch In (#1)" : isLast ? `Punch Out (#${idx + 1})` : `Point #${idx + 1}`}
                                >
                                  {idx + 1}
                                </span>
                              </div>
                            </td>
                            <td className="px-4 py-2.5 font-mono font-semibold text-foreground">
                              <div className="flex items-center gap-1.5">
                                <span>{recordedTime}</span>
                                {isFirst && (
                                  <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-sans font-medium">(Punch In)</span>
                                )}
                                {isLast && (
                                  <span className={`text-[10px] font-sans font-medium ${attendance?.punch_out ? "text-rose-600 dark:text-rose-400" : "text-amber-600 dark:text-amber-400"}`}>
                                    ({attendance?.punch_out ? "Punch Out" : "Latest Ping"})
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="px-4 py-2.5 font-mono text-muted-foreground">
                              {coordStr}
                            </td>
                            <td className="px-4 py-2.5">
                              {wp.accuracy != null ? (
                                <span className="font-mono text-xs">±{wp.accuracy.toFixed(1)}m</span>
                              ) : (
                                "—"
                              )}
                            </td>
                            <td className="px-4 py-2.5">
                              <div className="flex items-center gap-1">
                                <Gauge className="h-3 w-3 text-muted-foreground" />
                                <span className="font-mono">{wp.speed != null ? `${wp.speed.toFixed(1)} km/h` : "0.0 km/h"}</span>
                              </div>
                            </td>
                            <td className="px-4 py-2.5">
                              {wp.battery != null ? (
                                <div className="flex items-center gap-1">
                                  <Battery className="h-3 w-3 text-muted-foreground" />
                                  <span className="font-mono">{wp.battery}%</span>
                                </div>
                              ) : (
                                "—"
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      ) : (
        <Card className="p-12 text-center text-sm text-muted-foreground flex flex-col items-center justify-center gap-2">
          {loading ? (
            <>
              <RefreshCw className="h-6 w-6 animate-spin text-primary" />
              <span>Loading track history data from server...</span>
            </>
          ) : (
            <span>Select a Field Officer to view track history.</span>
          )}
        </Card>
      )}
    </div>
  );
}
