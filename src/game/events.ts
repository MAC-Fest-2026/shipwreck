export type EventType =
  | 'APPROACH' | 'HANDOVER' | 'IDLE_DEBRIS' | 'IDLE_WARNING' | 'SHARK_SPOTTED'
  | 'SHARK_TELEGRAPH' | 'SHARK_STRIKE' | 'SURVIVOR_LOST' | 'QUICK_SAVE'
  | 'CLAW_CLOSED' | 'CLAW_OPENED' | 'SURVIVOR_GRABBED' | 'DANGLING' | 'WATER_DROP'
  | 'SURVIVOR_DELIVERED' | 'MEGALODON_WARNING' | 'MEGALODON_BREACH'
  | 'ALL_ABOARD' | 'BOAT_HAZARD' | 'BOAT_COLLISION' | 'LUNGE_WARNING'
  | 'LUNGE' | 'ISLAND_SIGHTED' | 'LANDED'
export interface GameEvent {
  type: EventType
  t: number
  id?: string
  x?: number
  points?: number
  text?: string
}
export type Emit = (type: EventType, data?: Omit<GameEvent, 'type' | 't'>) => void
