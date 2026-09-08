'use client'

import 'leaflet/dist/leaflet.css'
import 'react-leaflet-cluster/dist/assets/MarkerCluster.css'
import 'react-leaflet-cluster/dist/assets/MarkerCluster.Default.css'
import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import MarkerClusterGroup from 'react-leaflet-cluster'
import { MapContainer, Marker, Popup, TileLayer, useMap } from 'react-leaflet'
import Spin from './ui/Spin'

const OPOLE = [50.6751, 17.9213]

function dateText(value) {
	if (!value) return 'Bez daty'
	return new Intl.DateTimeFormat('pl-PL', {
		day: '2-digit',
		month: 'short',
		year: 'numeric',
		timeZone: 'Europe/Warsaw',
	}).format(new Date(value))
}

function isInOpole(order) {
	return String(order.locality || '')
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '')
		.toLowerCase() === 'opole'
}

function FitBounds({ orders }) {
	const map = useMap()
	useEffect(() => {
		if (!orders.length) return
		const bounds = orders.map(order => [order.lat, order.lng])
		map.fitBounds(bounds, { padding: [32, 32], maxZoom: 13 })
	}, [map, orders])
	return null
}

export default function ReservationsMapClient() {
	const [data, setData] = useState({ workOrders: [], missingCoordinates: 0 })
	const [loading, setLoading] = useState(true)
	const [geocoding, setGeocoding] = useState(false)
	const [message, setMessage] = useState('')
	const [area, setArea] = useState('all')
	const [locality, setLocality] = useState('all')
	const [period, setPeriod] = useState('all')
	const [markerIcon, setMarkerIcon] = useState(null)

	async function load() {
		try {
			const response = await fetch('/api/admin/reservations/map', { cache: 'no-store' })
			const json = await response.json()
			if (!response.ok || !json.success) throw new Error(json.error)
			setData(json.data)
		} catch (error) {
			setMessage(error.message || 'Nie udało się wczytać mapy.')
		} finally {
			setLoading(false)
		}
	}

	useEffect(() => {
		void Promise.resolve().then(load)
		import('leaflet').then(L => {
			setMarkerIcon(
				L.divIcon({
					className: 'opx-order-map-marker',
					html: '<span></span>',
					iconSize: [18, 18],
					iconAnchor: [9, 9],
				})
			)
		})
	}, [])

	const localities = useMemo(
		() => [...new Set(data.workOrders.map(order => order.locality).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pl')),
		[data.workOrders]
	)

	const workOrders = useMemo(() => {
		const current = new Date()
		const minDate =
			period === '30'
				? new Date(new Date(current).setDate(current.getDate() - 30))
				: period === '90'
					? new Date(new Date(current).setDate(current.getDate() - 90))
					: period === 'year'
						? new Date(new Date(current).setFullYear(current.getFullYear() - 1))
						: null

		return data.workOrders.filter(order => {
			if (area === 'opole' && !isInOpole(order)) return false
			if (area === 'outside' && isInOpole(order)) return false
			if (locality !== 'all' && order.locality !== locality) return false
			if (minDate && new Date(order.visitDate || order.createdAt) < minDate) return false
			return true
		})
	}, [area, data.workOrders, locality, period])

	async function geocode() {
		setGeocoding(true)
		setMessage('')
		try {
			const response = await fetch('/api/admin/reservations/map', { method: 'POST' })
			const json = await response.json()
			if (!response.ok || !json.success) throw new Error(json.error)
			const result = json.data
			setMessage(
				`Uzupełniono: ${result.geocoded}; z pamięci adresów: ${result.cached}; bez wyniku: ${result.notFound}. Pozostało: ${result.remaining}. W tym miesiącu: ${result.monthlyRequests}/${result.monthlyLimit} zapytań.`
			)
			await load()
		} catch (error) {
			setMessage(error.message || 'Nie udało się uzupełnić współrzędnych.')
		} finally {
			setGeocoding(false)
		}
	}

	return (
		<div className='space-y-4'>
			<div className='opx-panel flex flex-wrap items-start justify-between gap-3 rounded-md p-4'>
				<div>
					<p className='font-bold text-[#132c43]'>Mapa wykonanych zleceń</p>
					<p className='mt-1 text-sm text-[#5f7487]'>
						{data.workOrders.length} punktów na mapie
						{data.missingCoordinates ? ` · ${data.missingCoordinates} adresów bez współrzędnych` : ''}
					</p>
				</div>
				{data.missingCoordinates ? (
					<button
						type='button'
						onClick={geocode}
						disabled={geocoding}
						className='opx-btn-primary w-full px-4 py-2 text-sm disabled:cursor-wait disabled:opacity-70 sm:w-auto'
					>
						{geocoding ? 'Uzupełniam…' : 'Uzupełnij do 25 adresów'}
					</button>
				) : null}
			</div>

			<div className='grid gap-3 sm:grid-cols-3'>
				<label className='space-y-1 text-sm font-bold text-white'>
					<span>Obszar</span>
					<select value={area} onChange={event => setArea(event.target.value)} className='opx-input'>
						<option value='all'>Wszystkie lokalizacje</option>
						<option value='opole'>Opole</option>
						<option value='outside'>Poza miastem Opole</option>
					</select>
				</label>
				<label className='space-y-1 text-sm font-bold text-white'>
					<span>Miejscowość</span>
					<select value={locality} onChange={event => setLocality(event.target.value)} className='opx-input'>
						<option value='all'>Wszystkie miejscowości</option>
						{localities.map(item => <option key={item} value={item}>{item}</option>)}
					</select>
				</label>
				<label className='space-y-1 text-sm font-bold text-white'>
					<span>Okres</span>
					<select value={period} onChange={event => setPeriod(event.target.value)} className='opx-input'>
						<option value='all'>Cała historia</option>
						<option value='30'>Ostatnie 30 dni</option>
						<option value='90'>Ostatnie 90 dni</option>
						<option value='year'>Ostatni rok</option>
					</select>
				</label>
			</div>

			{message ? <p className='rounded-md bg-[#fff4ec] px-3 py-2 text-sm text-[#8c3c00]'>{message}</p> : null}

			{loading ? (
				<div className='py-12 text-center'><Spin tip='Ładowanie mapy…' /></div>
			) : workOrders.length ? (
				<div className='h-[52vh] min-h-[360px] overflow-hidden rounded-md border border-white/15 sm:h-[62vh] sm:min-h-[420px]'>
					<MapContainer center={OPOLE} zoom={10} scrollWheelZoom className='h-full w-full touch-manipulation'>
						<TileLayer
							url='https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
							attribution='&copy; OpenStreetMap'
						/>
						<FitBounds orders={workOrders} />
						{markerIcon ? (
							<MarkerClusterGroup chunkedLoading>
								{workOrders.map(order => (
									<Marker key={order.id} position={[order.lat, order.lng]} icon={markerIcon}>
										<Popup minWidth={220}>
											<div className='space-y-2 text-sm text-[#132c43]'>
												<p className='flex flex-wrap gap-x-1 font-bold'>
													<span>{order.name || 'Klient'}</span>
													{order.phone ? <span>· {order.phone}</span> : null}
												</p>
												<p>{dateText(order.visitDate)} {order.visitTime ? String(order.visitTime).slice(0, 5) : ''}</p>
												<p>{order.service || 'Brak usługi'}</p>
												<p>{order.address || 'Brak adresu'}</p>
												<div className='flex flex-wrap gap-2 pt-1'>
													<a className='font-bold text-[#2c70b7]' href={`tel:${order.phone}`}>Zadzwoń</a>
													<Link className='font-bold text-[#2c70b7]' href={`/admin/work-order?id=${order.id}`}>Otwórz zlecenie</Link>
												</div>
											</div>
										</Popup>
									</Marker>
								))}
							</MarkerClusterGroup>
						) : null}
					</MapContainer>
				</div>
			) : (
				<p className='opx-panel rounded-md p-4 text-sm text-[#5f7487]'>
					Brak punktów spełniających wybrane filtry.
				</p>
			)}
		</div>
	)
}
