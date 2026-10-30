import 'leaflet/dist/leaflet.css'
import { MapPin } from 'lucide-react'
import { useEffect } from 'react'
import { MapContainer, TileLayer, useMap, useMapEvents } from 'react-leaflet'

function Recenter({ lat, lng }: { lat: number; lng: number }) {
  const map = useMap()
  useEffect(() => {
    const c = map.getCenter()
    if (Math.abs(c.lat - lat) > 1e-5 || Math.abs(c.lng - lng) > 1e-5) map.setView([lat, lng], Math.max(map.getZoom(), 16))
  }, [map, lat, lng])
  return null
}

function OnMove({ onMove }: { onMove: (lat: number, lng: number) => void }) {
  useMapEvents({
    moveend: (e) => {
      const c = e.target.getCenter()
      onMove(Number(c.lat.toFixed(6)), Number(c.lng.toFixed(6)))
    },
  })
  return null
}

/** "Move the map to place the pin" picker, as in Swiggy / Zomato address screens. */
export default function PinMap({ lat, lng, onMove }: { lat: number; lng: number; onMove: (lat: number, lng: number) => void }) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-line">
      <MapContainer center={[lat, lng]} zoom={16} className="h-52 w-full" scrollWheelZoom attributionControl>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <Recenter lat={lat} lng={lng} />
        <OnMove onMove={onMove} />
      </MapContainer>
      {/* Fixed pin in the centre of the map */}
      <div className="pointer-events-none absolute inset-0 z-[500] grid place-items-center">
        <div className="-mt-8 flex flex-col items-center">
          <MapPin size={36} className="fill-rose-500 text-white drop-shadow-lg" strokeWidth={1.5} />
          <span className="h-1.5 w-3 rounded-full bg-black/30 blur-[1px]" />
        </div>
      </div>
      <div className="pointer-events-none absolute inset-x-0 top-2 z-[500] text-center">
        <span className="rounded-full bg-ink/80 px-3 py-1 text-[11px] font-semibold text-canvas">Move the map to place the pin exactly</span>
      </div>
    </div>
  )
}
