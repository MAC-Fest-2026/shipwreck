export type BoatSharkKind = 'regularShark' | 'megalodon'

export type EventType =
  | 'APPROACH' | 'HANDOVER' | 'IDLE_DEBRIS' | 'IDLE_WARNING' | 'SHARK_SPOTTED'
  | 'SHARK_TELEGRAPH' | 'SHARK_STRIKE' | 'SURVIVOR_LOST' | 'QUICK_SAVE'
  | 'CLAW_CLOSED' | 'CLAW_OPENED' | 'SURVIVOR_GRABBED' | 'DANGLING' | 'WATER_DROP' | 'WATER_SPLASH'
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
  impact?: 'rock' | 'pier' | 'debris' | 'shark'
  impactDetails?: { z: number; damage: number; speed: number; shark?: BoatSharkKind }
  heavySplash?: boolean
  // Z is in world coordinates, like the existing X coordinate.
  boatSplash?: { z: number; shark: BoatSharkKind; stage: 'breach' | 'reentry' }
}
export type Emit = (type: EventType, data?: Omit<GameEvent, 'type' | 't'>) => void
