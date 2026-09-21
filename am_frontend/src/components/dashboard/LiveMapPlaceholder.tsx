import React, { useEffect, useRef, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap, Polygon, Polyline } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import api from "../../services/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, MapPin, AlertTriangle, Maximize2 } from "lucide-react";

// Standard Blue Icon for Officers
import icon from "leaflet/dist/images/marker-icon.png";
import iconShadow from "leaflet/dist/images/marker-shadow.png";

const DefaultIcon = L.icon({
  iconUrl: icon,
  shadowUrl: iconShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41]
});
L.Marker.prototype.options.icon = DefaultIcon;

// Custom Red Glowing Icon for SOS Alerts
const SosIcon = L.divIcon({
  className: "bg-transparent",
  html: `<div style="
    background-color: #EF4444; 
    width: 24px; 
    height: 24px; 
    border-radius: 50%; 
    border: 3px solid white; 
    box-shadow: 0 0 15px rgba(239, 68, 68, 0.9);
    display: flex;
    align-items: center;
    justify-content: center;
    color: white;
    font-size: 10px;
    font-weight: bold;
  ">!</div>`,
  iconSize: [24, 24],
  iconAnchor: [12, 12]
});

const IncidentIcon = L.divIcon({
  className: "bg-transparent",
  html: `<div style="
    background-color: #F59E0B;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    border: 2px solid white;
    box-shadow: 0 0 8px rgba(245, 158, 11, 0.8);
  "></div>`,
  iconSize: [18, 18],
  iconAnchor: [9, 9]
});

// Custom Green Icon for Officers
const OfficerIcon = L.divIcon({
  className: "bg-transparent",
  html: `<div style="
    background-color: #22C55E;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    border: 2px solid white;
    box-shadow: 0 0 8px rgba(34, 197, 94, 0.8);
  "></div>`,
  iconSize: [18, 18],
  iconAnchor: [9, 9]
});

const SiteIcon = L.divIcon({
  className: "bg-transparent",
  html: `<div class="radar-container">
    <div class="radar-dot"></div>
    <div class="radar-wave wave-1"></div>
    <div class="radar-wave wave-2"></div>
    <div class="radar-wave wave-3"></div>
  </div>
  <style>
    .radar-container {
      position: relative;
      width: 16px;
      height: 16px;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .radar-dot {
      background-color: #3b82f6;
      width: 16px;
      height: 16px;
      border-radius: 50%;
      border: 2px solid white;
      box-shadow: 0 0 10px rgba(59, 130, 246, 0.9);
      z-index: 10;
    }
    .radar-wave {
      position: absolute;
      width: 100%;
      height: 100%;
      border-radius: 50%;
      background: rgba(59, 130, 246, 0.4);
      z-index: 1;
      animation: radar-pulse 3s infinite linear;
    }
    .wave-1 { animation-delay: 0s; }
    .wave-2 { animation-delay: 1s; }
    .wave-3 { animation-delay: 2s; }
    
    @keyframes radar-pulse {
      0% { transform: scale(1); opacity: 0.8; }
      100% { transform: scale(4); opacity: 0; }
    }
  </style>`,
  iconSize: [16, 16],
  iconAnchor: [8, 8]
});

interface OfficerLocation {
  officer_name: string;
  role: string;
  latitude: number;
  longitude: number;
  shift_start: string;
}

interface IncidentLocation {
  id: number;
  category: string;
  fact_found?: string;
  reported_at: string;
  latitude: number;
  longitude: number;
}

interface MapFocusTarget {
  id?: number | string;
  latitude: number;
  longitude: number;
  type?: 'incident' | 'site';
}

interface SiteLocation {
  id: number;
  name: string;
  latitude: number;
  longitude: number;
  geofence_data?: [number, number][];
  geofence_type?: string;
  client_name?: string;
}

function MapFocusController({ focusTarget }: { focusTarget?: MapFocusTarget | null }) {
  const map = useMap();

  useEffect(() => {
    if (!focusTarget) {
      return;
    }

    const zoom = focusTarget.type === 'site' ? 16 : 15;

    map.flyTo([focusTarget.latitude, focusTarget.longitude], zoom, {
      animate: true,
      duration: 0.9,
    });
  }, [focusTarget, map]);

  return null;
}

const formatTime12h = (dateStr: string | null | undefined): string => {
  if (!dateStr) return "–";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  const pad = (n: number) => n.toString().padStart(2, "0");
  let h = d.getHours();
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return `${pad(h)}:${pad(d.getMinutes())} ${ampm}`;
};

export function LiveMapPlaceholder({ focusTarget }: { focusTarget?: MapFocusTarget | null }) {
  const [locations, setLocations] = useState<OfficerLocation[]>([]);
  const [activeIncidents, setActiveIncidents] = useState<IncidentLocation[]>([]);
  const [sites, setSites] = useState<SiteLocation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isFullscreenOpen, setIsFullscreenOpen] = useState(false);
  const incidentMarkerRefs = useRef<Record<number | string, L.Marker>>({});
  const siteMarkerRefs = useRef<Record<number | string, L.Marker>>({});

  // Center on Pune
  const defaultCenter: [number, number] = [18.5204, 73.8567];

  useEffect(() => {
    const fetchData = async () => {
      try {
        // Fetch live officers AND site locations
        const [locationsRes, companiesRes] = await Promise.all([
          api.get('/patrol/live-locations'),
          api.get('/locations/companies')
        ]);

        setLocations(locationsRes.data);

        // Flatten sites from companies
        const allSites: SiteLocation[] = (companiesRes.data || []).flatMap((comp: any) =>
          (comp.sites || []).map((s: any) => ({
            ...s,
            company_name: comp.name
          }))
        );
        setSites(allSites);
        setActiveIncidents([]);

      } catch (error) {
        console.error("Failed to fetch map data:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!focusTarget?.id) {
      return;
    }

    if (focusTarget.type === 'incident') {
      const marker = incidentMarkerRefs.current[focusTarget.id];
      if (marker) {
        marker.openPopup();
      }
    } else if (focusTarget.type === 'site') {
      const marker = siteMarkerRefs.current[focusTarget.id];
      if (marker) {
        marker.openPopup();
      }
    }
  }, [focusTarget, activeIncidents, sites]);

  const activeSosCount = activeIncidents.filter((incident) => incident.category === "EMERGENCY_SOS").length;

  const renderMap = (mapKey: string) => (
    <MapContainer
      key={mapKey}
      center={defaultCenter}
      zoom={12}
      style={{ height: "100%", width: "100%", zIndex: 0 }}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      {/* Floating Legend Overlay */}
      <div className="absolute bottom-4 left-4 z-[1000] p-3 rounded-xl border border-border/80 bg-background/95 backdrop-blur-md shadow-lg flex flex-col gap-2.5 max-w-[200px] pointer-events-auto">
        <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/80 border-b border-border/50 pb-1.5">Map Legend</p>
        <div className="flex items-center gap-2">
          <span 
            className="h-3 w-3 rounded-full border border-white shrink-0" 
            style={{ 
              backgroundColor: '#3B82F6', 
              boxShadow: '0 0 8px rgba(59, 130, 246, 0.8)' 
            }} 
          />
          <span className="text-[11px] font-semibold text-foreground">Secure Zones (Blue)</span>
        </div>
        <div className="flex items-center gap-2">
          <span 
            className="h-3 w-3 rounded-full border border-white shrink-0" 
            style={{ 
              backgroundColor: '#22C55E', 
              boxShadow: '0 0 8px rgba(34, 197, 94, 0.8)' 
            }} 
          />
          <span className="text-[11px] font-semibold text-foreground">Active Officers (Green)</span>
        </div>
        <div className="flex items-center gap-2">
          <span 
            className="h-3 w-3 rounded-full border border-white shrink-0" 
            style={{ 
              backgroundColor: '#F59E0B', 
              boxShadow: '0 0 8px rgba(245, 158, 11, 0.8)' 
            }} 
          />
          <span className="text-[11px] font-semibold text-foreground">Alerts / Warnings (Orange)</span>
        </div>
        <div className="flex items-center gap-2">
          <span 
            className="h-3 w-3 rounded-full border border-white shrink-0 animate-pulse" 
            style={{ 
              backgroundColor: '#EF4444', 
              boxShadow: '0 0 10px rgba(239, 68, 68, 0.9)' 
            }} 
          />
          <span className="text-[11px] font-semibold text-foreground">Critical SOS (Red)</span>
        </div>
      </div>

      {/* Render Site Geofences and Markers */}
      {sites.filter(site => Array.isArray(site.geofence_data) && site.geofence_data.length > 0).map((site) => {
        const points = site.geofence_data!;

        // Determine Marker Position: Prioritize center of geofence, fallback to site coordinates
        let markerPos: [number, number] | null = null;

        if (points.length > 0) {
          // Calculate bounding box center for the geofence
          const lats = points.map(p => p[0]);
          const lngs = points.map(p => p[1]);
          const centerLat = (Math.min(...lats) + Math.max(...lats)) / 2;
          const centerLng = (Math.min(...lngs) + Math.max(...lngs)) / 2;
          markerPos = [centerLat, centerLng];
        } else if (typeof site.latitude === 'number' && typeof site.longitude === 'number') {
          markerPos = [site.latitude, site.longitude];
        }

        return (
          <React.Fragment key={`site-group-${site.id}`}>
            {/* Site Marker (Radar for Geofenced) */}
            {markerPos && (
              <Marker
                position={markerPos}
                icon={SiteIcon}
                ref={(ref) => {
                  if (ref) {
                    siteMarkerRefs.current[site.id] = ref;
                  }
                }}
              >
                <Popup>
                  <div className="text-xs">
                    <p className="font-bold text-primary">{site.name}</p>
                    <p className="text-muted-foreground">{site.client_name || 'General'}</p>
                    <p className="mt-1 text-[10px] text-muted-foreground italic">Geofenced Secure Site</p>
                  </div>
                </Popup>
              </Marker>
            )}

            {/* Polygon for 3+ points */}
            {points.length >= 3 && (
              <Polygon
                positions={points}
                pathOptions={{
                  color: '#3B82F6', // Brand Blue
                  fillColor: '#3B82F6', // Brand Blue
                  fillOpacity: 0.35, // Significantly higher opacity
                  weight: 4, // Thicker border
                  lineJoin: 'round'
                }}
              >
                <Popup>
                  <div className="text-xs">
                    <p className="font-bold text-primary">{site.name}</p>
                    <p className="mt-1 font-semibold text-[10px] uppercase tracking-wider text-blue-500">Secure Geofenced Zone</p>
                  </div>
                </Popup>
              </Polygon>
            )}

            {/* Polyline for 2 points (Incomplete geofence) */}
            {points.length === 2 && (
              <Polyline
                positions={points}
                pathOptions={{
                  color: '#3B82F6', // Brand Blue
                  weight: 4,
                  dashArray: '10, 10'
                }}
              />
            )}
          </React.Fragment>
        );
      })}

      <MapFocusController focusTarget={focusTarget} />

      {locations.map((loc, index) => (
        <Marker key={`officer-${index}`} position={[loc.latitude, loc.longitude]} icon={OfficerIcon}>
          <Popup>
            <div className="text-sm">
              <p className="font-bold border-b pb-1 mb-1 text-primary">{loc.officer_name}</p>
              <p className="text-muted-foreground">{loc.role}</p>
              <p className="text-xs mt-1">
                Shift Started: {formatTime12h(loc.shift_start)}
              </p>
            </div>
          </Popup>
        </Marker>
      ))}

      {activeIncidents.map((incident) => {
        const isSos = incident.category === "EMERGENCY_SOS";
        return (
          <Marker
            key={`incident-${incident.id}`}
            position={[incident.latitude, incident.longitude]}
            icon={isSos ? SosIcon : IncidentIcon}
            ref={(ref) => {
              if (ref) {
                incidentMarkerRefs.current[incident.id] = ref;
              }
            }}
          >
            <Popup>
              <div className={`text-sm ${isSos ? "border-l-4 border-status-critical pl-2" : "border-l-4 border-status-warning pl-2"}`}>
                <p className={`font-bold flex items-center gap-1 ${isSos ? "text-status-critical" : "text-status-warning"}`}>
                  <AlertTriangle className="h-4 w-4" />
                  {isSos ? "SOS TRIGGERED" : incident.category}
                </p>
                <p className="font-mono text-xs mt-1">{formatTime12h(incident.reported_at)}</p>
                <p className="text-muted-foreground mt-1">{incident.fact_found || "No remarks provided"}</p>
              </div>
            </Popup>
          </Marker>
        );
      })}
    </MapContainer>
  );

  return (
    <>
      <Card className="h-[560px] flex flex-col border-border relative">
        <CardHeader className="pb-2">
          <CardTitle className="text-lg flex items-center justify-between">
            <div className="flex items-center gap-2">
              <MapPin className="h-5 w-5 text-primary" />
              Live Tactical Map
            </div>
            <div className="flex items-center gap-2">
              {activeSosCount > 0 && (
                <span className="text-xs flex items-center gap-1 font-bold text-status-critical bg-status-critical/10 px-2 py-1 rounded-full">
                  <AlertTriangle className="h-3 w-3" />
                  {activeSosCount} Active SOS
                </span>
              )}
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={() => setIsFullscreenOpen(true)}
                title="Open full map"
              >
                <Maximize2 className="h-4 w-4" />
              </Button>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent className="flex-1 p-0 overflow-hidden rounded-b-xl relative z-0">
          {isLoading && (
            <div className="absolute inset-0 z-[1000] flex items-center justify-center bg-background/50 backdrop-blur-sm">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          )}
          {renderMap("dashboard-map")}
        </CardContent>
      </Card>

      <Dialog open={isFullscreenOpen} onOpenChange={setIsFullscreenOpen}>
        <DialogContent className="max-w-[100vw] w-[100vw] h-[100vh] p-0 rounded-none">
          <DialogHeader className="px-4 py-3 border-b">
            <DialogTitle className="flex items-center gap-2">
              <MapPin className="h-5 w-5 text-primary" />
              Full Tactical Map
            </DialogTitle>
          </DialogHeader>
          <div className="h-[calc(100vh-64px)] w-full">
            {renderMap("fullscreen-map")}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}