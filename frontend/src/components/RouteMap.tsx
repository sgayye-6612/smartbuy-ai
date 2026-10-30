import 'leaflet/dist/leaflet.css'
import type { LatLngExpression, LatLngBoundsExpression } from 'leaflet'
import { useEffect } from 'react'
import { CircleMarker, MapContainer, Polyline, TileLayer, Tooltip, useMap } from 'react-leaflet'

type Point = { lat: number; lng: number; name: string }

function FitBounds({ bounds }: { bounds: LatLngBoundsExpression }) {
  const map = useMap()
  useEffect(() => {
    map.fitBounds(bounds, { padding: [36, 36] })
  }, [map, bounds])
  return null
}

/** Route map using OpenStreetMap tiles (free, with attribution). */
export default function RouteMap({ pickup, drop, route, estimated }: { pickup: Point; drop: Point; route: [number, number][]; estimated?: boolean }) {
  const line: LatLngExpression[] = route.length >= 2 ? route : [[pickup.lat, pickup.lng], [drop.lat, drop.lng]]
  const bounds: LatLngBoundsExpression = line as [number, number][]
  return (
    <div className="relative overflow-hidden rounded-2xl border border-line">
      <MapContainer center={[pickup.lat, pickup.lng]} zoom={12} scrollWheelZoom={false} className="h-64 w-full md:h-80" attributionControl>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <Polyline positions={line} pathOptions={{ color: '#059669', weight: 5, opacity: 0.9, dashArray: estimated ? '8 8' : undefined }} />
        <CircleMarker center={[pickup.lat, pickup.lng]} radius={8} pathOptions={{ color: '#ffffff', weight: 3, fillColor: '#059669', fillOpacity: 1 }}>
          <Tooltip direction="top" offset={[0, -8]}>Pickup: {pickup.name}</Tooltip>
        </CircleMarker>
        <CircleMarker center={[drop.lat, drop.lng]} radius={8} pathOptions={{ color: '#ffffff', weight: 3, fillColor: '#e11d48', fillOpacity: 1 }}>
          <Tooltip direction="top" offset={[0, -8]}>Drop: {drop.name}</Tooltip>
        </CircleMarker>
        <FitBounds bounds={bounds} />
      </MapContainer>
      {estimated && (
        <div className="absolute right-3 top-3 z-[400] rounded-lg bg-card/90 px-2.5 py-1 text-[11px] font-semibold text-muted shadow">Approximate route</div>
      )}
    </div>
  )
}
