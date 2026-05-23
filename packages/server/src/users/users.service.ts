import { Injectable } from '@nestjs/common'
import { ADJECTIVES, ANIMALS } from './word-list'

@Injectable()
export class UsersService {
  generateDisplayName(exclude: Set<string> = new Set()): string {
    const shuffledAdj = [...ADJECTIVES].sort(() => Math.random() - 0.5)
    const shuffledAnimal = [...ANIMALS].sort(() => Math.random() - 0.5)

    for (const adj of shuffledAdj) {
      for (const animal of shuffledAnimal) {
        const name = `${adj}${animal}`
        if (!exclude.has(name)) return name
      }
    }
    // Fallback: append a number if somehow all 22500+ combinations are taken
    return `${ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)]}${ANIMALS[Math.floor(Math.random() * ANIMALS.length)]}${Math.floor(Math.random() * 1000)}`
  }
}
