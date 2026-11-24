import beach from '../../assets/room-covers/beach.jpg';
import cityNight from '../../assets/room-covers/city-night.jpg';
import forest from '../../assets/room-covers/forest.jpg';
import lake from '../../assets/room-covers/lake.jpg';
import mountainNight from '../../assets/room-covers/mountain-night.jpg';
import neonParty from '../../assets/room-covers/neon-party.jpg';
import palace from '../../assets/room-covers/palace.jpg';
import pool from '../../assets/room-covers/pool.jpg';

/**
 * Real photographic covers a room owner can put behind the stage (and on the
 * room's card in the rooms list). Stored in `rooms.background` as `photo:<id>`
 * so the bundled artwork keeps working without a CDN.
 */
export const ROOM_COVERS = [
  { id: 'city-night', label: 'ليل المدينة', url: cityNight },
  { id: 'neon-party', label: 'حفلة نيون', url: neonParty },
  { id: 'beach', label: 'شاطئ هادئ', url: beach },
  { id: 'mountain-night', label: 'جبال ونجوم', url: mountainNight },
  { id: 'lake', label: 'بحيرة جبلية', url: lake },
  { id: 'forest', label: 'غابة ضباب', url: forest },
  { id: 'palace', label: 'قصر فخم', url: palace },
  { id: 'pool', label: 'مسبح فاخر', url: pool },
] as const;

const PREFIX = 'photo:';

export function coverValue(id: string): string {
  return `${PREFIX}${id}`;
}

/** Bundled cover URL for a stored `photo:<id>` value, else null. */
export function coverUrlFor(value: string): string | null {
  if (!value.startsWith(PREFIX)) return null;
  return ROOM_COVERS.find((cover) => coverValue(cover.id) === value)?.url ?? null;
}
