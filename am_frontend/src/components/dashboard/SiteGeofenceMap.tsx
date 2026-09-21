import { useState, useEffect } from "react";
import { MapContainer, TileLayer, Marker, Polygon, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Button } from "@/components/ui/button";
import { Trash2, MapPin } from "lucide-react";

// Fix for leaflet marker icons
import icon from "leaflet/dist/images/marker-icon.png";
import iconShadow from "leaflet/dist/images/marker-shadow.png";

const DefaultIcon = L.icon({
  iconUrl: icon,
  shadowUrl: iconShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41]
});

interface SiteGeofenceMapProps {
  initialPoints: [number, number][];
  center?: [number, number];
  onPointsChange: (points: [number, number][]) => void;
}

function MapClickHandler({ onMapClick }: { onMapClick: (latlng: L.LatLng) => void }) {
  useMapEvents({
    click: (e) => {
      onMapClick(e.latlng);
    },
  });
  return null;
}

export default function SiteGeofenceMap({ initialPoints, center, onPointsChange }: SiteGeofenceMapProps) {
  const [points, setPoints] = useState<[number, number][]>(initialPoints);
  const defaultCenter: [number, number] = center || [18.5204, 73.8567]; // Default to Pune

  useEffect(() => {
    setPoints(initialPoints);
  }, [initialPoints]);

  const handleMapClick = (latlng: L.LatLng) => {
    const newPoints: [number, number][] = [...points, [latlng.lat, latlng.lng]];
    setPoints(newPoints);
    onPointsChange(newPoints);
  };

  const clearPoints = () => {
    setPoints([]);
    onPointsChange([]);
  };

  const removeLastPoint = () => {
    const newPoints = points.slice(0, -1);
    setPoints(newPoints);
    onPointsChange(newPoints);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium flex items-center gap-2">
          <MapPin className="h-4 w-4 text-primary" />
          Click on map to mark boundary points ({points.length} points)
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={removeLastPoint} disabled={points.length === 0}>
            Undo
          </Button>
          <Button variant="destructive" size="sm" onClick={clearPoints} disabled={points.length === 0}>
            <Trash2 className="h-4 w-4 mr-2" /> Clear
          </Button>
        </div>
      </div>
      
      <div className="h-[300px] rounded-md border overflow-hidden relative z-0">
        <MapContainer
          center={defaultCenter}
          zoom={13}
          style={{ height: "100%", width: "100%" }}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <MapClickHandler onMapClick={handleMapClick} />
          
          {points.length > 0 && (
            <>
              {points.map((p, i) => (
                <Marker key={i} position={p} icon={DefaultIcon} />
              ))}
              {points.length >= 3 && (
                <Polygon 
                  positions={points} 
                  pathOptions={{ 
                    color: '#3B82F6', 
                    fillColor: '#3B82F6', 
                    fillOpacity: 0.3 
                  }} 
                />
              )}
              {points.length < 3 && points.length > 1 && (
                <Polygon 
                  positions={points} 
                  pathOptions={{ 
                    color: '#3B82F6', 
                    dashArray: '5, 5'
                  }} 
                />
              )}
            </>
          )}
        </MapContainer>
      </div>
      <p className="text-[10px] text-muted-foreground italic">
        * A minimum of 3 points is required to form a valid geofence area.
      </p>
    </div>
  );
}
