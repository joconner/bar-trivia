import { Injectable } from '@nestjs/common'
import { RoomState } from './room-state'

@Injectable()
export class RoomStateStore {
  private readonly rooms = new Map<string, RoomState>()

  get(roomCode: string): RoomState | undefined {
    return this.rooms.get(roomCode)
  }

  set(roomCode: string, state: RoomState): void {
    this.rooms.set(roomCode, state)
  }

  delete(roomCode: string): void {
    this.rooms.delete(roomCode)
  }

  has(roomCode: string): boolean {
    return this.rooms.has(roomCode)
  }
}
