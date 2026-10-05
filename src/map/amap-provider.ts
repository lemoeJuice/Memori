import type { MapMemory, MapProvider, MapProviderEvents } from './map-provider'
import { toMapCoordinate } from './coordinate'
import { loadAmap, MAP_LOAD_ERROR } from './amap-loader'
import type { MapSettings } from './settings'

interface AMapMarker {
  on(event: string, listener: () => void): void
}

interface AMapMapInstance {
  add(markers: AMapMarker[]): void
  remove(markers: AMapMarker[]): void
  on(event: string, listener: () => void): void
  setZoomAndCenter(zoom: number, center: number[]): void
  getZoom(): number
  destroy(): void
}

export interface AMapApi {
  Map: new (container: HTMLElement, options: Record<string, unknown>) => AMapMapInstance
  Marker: new (options: Record<string, unknown>) => AMapMarker
  Pixel: new (x: number, y: number) => unknown
}

const DEFAULT_CENTER: [number, number] = [116.397, 39.908]

export class AmapProvider implements MapProvider {
  private readonly map: AMapMapInstance
  private readonly api: AMapApi
  private memories: MapMemory[] = []
  private markers: AMapMarker[] = []

  private constructor(map: AMapMapInstance, api: AMapApi, private readonly events: MapProviderEvents, private readonly surface: HTMLElement) {
    this.map = map
    this.api = api
    this.map.on('zoomend', () => this.renderMarkers())
  }

  static async create(container: HTMLElement, events: MapProviderEvents, settings: MapSettings, isCurrent: () => boolean = () => true): Promise<AmapProvider> {
    const api = await loadAmap(settings)
    if (!isCurrent()) throw new Error('地图配置已更新。')
    const surface = document.createElement('div')
    surface.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;'
    container.appendChild(surface)
    let map: AMapMapInstance
    try {
      map = new api.Map(surface, {
        zoom: 11,
        viewMode: '2D',
        mapStyle: 'amap://styles/whitesmoke',
        center: DEFAULT_CENTER,
        animateEnable: true,
        resizeEnable: true,
      })
    } catch {
      surface.remove()
      throw new Error(MAP_LOAD_ERROR)
    }
    await new Promise<void>((resolve, reject) => {
      const timer = window.setTimeout(() => {
        map.destroy()
        surface.remove()
        reject(new Error(MAP_LOAD_ERROR))
      }, 15000)
      map.on('complete', () => { clearTimeout(timer); resolve() })
    })
    return new AmapProvider(map, api, events, surface)
  }

  setMemories(memories: MapMemory[]): void {
    this.memories = memories.filter((item) => item.entry.location)
    this.renderMarkers()
  }

  focusMemory(id: string): void {
    const memory = this.memories.find((item) => item.entry.id === id)
    if (!memory?.entry.location) return
    const [longitude, latitude] = toMapCoordinate(memory.entry.location, 'amap')
    this.map.setZoomAndCenter(Math.max(14, this.map.getZoom()), [longitude, latitude])
  }

  setCenter(latitude: number, longitude: number): void {
    const [lng, lat] = toMapCoordinate({ latitude, longitude }, 'amap')
    this.map.setZoomAndCenter(Math.max(12, this.map.getZoom()), [lng, lat])
  }

  destroy(): void {
    if (this.markers.length) this.map.remove(this.markers)
    this.markers = []
    this.map.destroy()
    this.surface.remove()
  }

  private renderMarkers(): void {
    if (this.markers.length) this.map.remove(this.markers)
    this.markers = []
    const groups = cluster(this.memories, this.map.getZoom())
    for (const group of groups) {
      const position = clusterCoordinate(group)
      const mapPosition = toMapCoordinate({ latitude: position.latitude, longitude: position.longitude }, 'amap')
      const marker = new this.api.Marker({
        position: mapPosition,
        content: markerContent(group, this.map.getZoom()),
        anchor: 'center',
        offset: new this.api.Pixel(0, 0),
        title: group.length > 1 ? `${group.length} 段记忆` : (group[0].entry.placeLabel || '一段记忆'),
        zIndex: group.length > 1 ? 30 : 20,
      })
      marker.on('click', () => {
        if (group.length > 1 && !samePlace(group)) {
          const nextZoom = Math.min(18, this.map.getZoom() + 2)
          this.map.setZoomAndCenter(nextZoom, [...mapPosition])
        } else if (group.length > 1) this.events.selectCluster(group)
        else this.events.selectMemory(group[0])
      })
      this.markers.push(marker)
    }
    if (this.markers.length) this.map.add(this.markers)
  }
}

function cluster(memories: MapMemory[], zoom: number): MapMemory[][] {
  const cellSize = 36 / 2 ** Math.max(2, zoom)
  const buckets = new Map<string, MapMemory[]>()
  for (const memory of memories) {
    const location = memory.entry.location!
    const key = `${Math.floor(location.latitude / cellSize)}:${Math.floor(location.longitude / cellSize)}`
    const group = buckets.get(key) ?? []
    group.push(memory)
    buckets.set(key, group)
  }
  return [...buckets.values()]
}

function clusterCoordinate(group: MapMemory[]): { latitude: number; longitude: number } {
  const sum = group.reduce((value, memory) => ({
    latitude: value.latitude + memory.entry.location!.latitude,
    longitude: value.longitude + memory.entry.location!.longitude,
  }), { latitude: 0, longitude: 0 })
  return { latitude: sum.latitude / group.length, longitude: sum.longitude / group.length }
}

function samePlace(group: MapMemory[]): boolean {
  if (group.length < 2) return true
  const first = group[0].entry.location!
  return group.every(({ entry }) => {
    const point = entry.location!
    return Math.abs(point.latitude - first.latitude) < 0.00012 && Math.abs(point.longitude - first.longitude) < 0.00012
  })
}

function markerContent(group: MapMemory[], zoom: number): string {
  if (group.length > 1) return `<button class="map-cluster-marker" aria-label="${group.length} 段记忆">${group.length}</button>`
  const memory = group[0]
  if (memory.thumbnailUrl && zoom >= 13) {
    return `<span class="map-photo-marker"><img src="${memory.thumbnailUrl}" alt="" /></span>`
  }
  return '<span class="map-memory-marker"><i></i></span>'
}
