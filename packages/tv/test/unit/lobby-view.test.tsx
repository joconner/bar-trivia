// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import type { RoomStateDto } from '@bar-trivia/shared'
import { LobbyView } from '../../src/views/LobbyView'

// QRCodeSVG uses canvas/SVG APIs that aren't fully available in jsdom.
// Stub it to a simple div so tests can focus on LobbyView's own logic.
vi.mock('qrcode.react', () => ({
  QRCodeSVG: ({ value }: { value: string }) =>
    `<div data-testid="qr-code" data-value="${value}"></div>`,
}))

afterEach(cleanup)

const BASE_STATE: RoomStateDto = {
  roomCode: 'MURP',
  phase: 'lobby',
  packTitle: 'Bar Trivia Night',
  gameTitle: 'Friday Quiz',
  totalQuestions: 10,
  currentQuestionIndex: null,
  lateJoinPolicy: 'open',
  phoneTextMode: 'heads_up',
  players: [],
  leaderboard: [],
  currentQuestion: null,
  finalPodium: null,
}

function renderLobby(state: Partial<RoomStateDto> = {}, hostname = '192.168.1.50') {
  Object.defineProperty(window, 'location', {
    value: {
      hostname,
      origin: `http://${hostname}`,
      pathname: '/tv/MURP',
      search: '',
      href: `http://${hostname}/tv/MURP`,
    },
    writable: true,
    configurable: true,
  })
  return render(<LobbyView state={{ ...BASE_STATE, ...state }} />)
}

describe('LobbyView — routable hostname (LAN IP)', () => {
  it('renders the room code prominently', () => {
    const { container } = renderLobby()
    const roomCode = container.querySelector('.room-code')
    expect(roomCode?.textContent).toBe('MURP')
  })

  it('renders the game title', () => {
    const { getByText } = renderLobby()
    expect(getByText('Friday Quiz')).toBeTruthy()
  })

  it('renders the pack title', () => {
    const { getByText } = renderLobby()
    expect(getByText('Bar Trivia Night')).toBeTruthy()
  })

  it('renders "Join the game!" label', () => {
    const { getByText } = renderLobby()
    expect(getByText('Join the game!')).toBeTruthy()
  })

  it('does not show the non-routable warning on a LAN IP', () => {
    const { container } = renderLobby()
    expect(container.querySelector('.qr-warning')).toBeNull()
  })

  it('renders "Trivia starts soon..."', () => {
    const { getByText } = renderLobby()
    expect(getByText('Trivia starts soon...')).toBeTruthy()
  })
})

describe('LobbyView — non-routable hostname', () => {
  it('shows the non-routable warning on localhost', () => {
    const { container } = renderLobby({}, 'localhost')
    expect(container.querySelector('.qr-warning')).toBeTruthy()
  })

  it('warning names the non-routable hostname', () => {
    const { container } = renderLobby({}, 'localhost')
    expect(container.querySelector('.qr-warning')?.textContent).toContain('localhost')
  })

  it('does not show the QR wrapper on a non-routable host', () => {
    const { container } = renderLobby({}, '127.0.0.1')
    expect(container.querySelector('.qr-wrapper')).toBeNull()
  })

  it('shows the warning on a *.localhost subdomain', () => {
    const { container } = renderLobby({}, 'myapp.localhost')
    expect(container.querySelector('.qr-warning')).toBeTruthy()
  })
})

describe('LobbyView — player list', () => {
  const withPlayers: Partial<RoomStateDto> = {
    players: [
      { participantId: 'p-1', displayName: 'Alice', score: 0 },
      { participantId: 'p-2', displayName: 'Bob', score: 0 },
    ],
  }

  it('shows "Waiting for players..." when no players', () => {
    const { getByText } = renderLobby({ players: [] })
    expect(getByText('Waiting for players...')).toBeTruthy()
  })

  it('renders player names when players have joined', () => {
    const { getByText } = renderLobby(withPlayers)
    expect(getByText('Alice')).toBeTruthy()
    expect(getByText('Bob')).toBeTruthy()
  })

  it('shows correct player count', () => {
    const { container } = renderLobby(withPlayers)
    const heading = container.querySelector('.players-heading')
    expect(heading?.textContent).toContain('2')
  })

  it('does not show "Waiting for players..." when players exist', () => {
    const { queryByText } = renderLobby(withPlayers)
    expect(queryByText('Waiting for players...')).toBeNull()
  })
})
