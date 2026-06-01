// Stable, well-known identifiers shared between server and clients.

// The synthetic "house" user owns the seeded shared packs. Hosts can run rooms
// from these packs but cannot edit or delete them. The id is a sentinel string
// (not a uuid) so it's recognizable in logs, screenshots, and DB inspection.
export const HOUSE_USER_ID = 'house-user'
