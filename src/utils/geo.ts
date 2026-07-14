const EARTH_RADIUS_M = 6371000;

function toRadians(deg: number): number {
  return (deg * Math.PI) / 180;
}

// Haversine 거리(m). MVP 규모(수십 곳)에서는 PostGIS 없이 애플리케이션 레벨 계산으로 충분하다.
export function haversineDistanceM(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);

  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

export function isBakeryOpenNow(openingHours: string | null): boolean {
  if (!openingHours) return false;
  const match = openingHours.match(/(\d{2}):(\d{2})-(\d{2}):(\d{2})/);
  if (!match) return false;

  const [, startH, startM, endH, endM] = match.map(Number) as unknown as [never, number, number, number, number];
  const now = new Date();
  const minutesNow = now.getHours() * 60 + now.getMinutes();
  const startMinutes = startH * 60 + startM;
  const endMinutes = endH * 60 + endM;

  return minutesNow >= startMinutes && minutesNow <= endMinutes;
}
