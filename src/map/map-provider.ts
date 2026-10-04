import type { MemoryEntry } from '../data/types'

export interface MapMemory {
  entry: MemoryEntry
  thumbnailUrl?: string
}

export interface MapProvider {
  setMemories(memories: MapMemory[]): void
  focusMemory(id: string): void
  setCenter(latitude: number, longitude: number): void
  destroy(): void
}

export interface MapProviderEvents {
  selectMemory(memory: MapMemory): void
  selectCluster(memories: MapMemory[]): void
}
