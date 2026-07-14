import type { TransportMode } from '@prisma/client';
import { env } from '../config/env';

// Google Maps Directions API — 도보/자전거는 walking/bicycling, 버스는 transit(bus)로 매핑한다.
const MODE_MAP: Record<TransportMode, string> = {
  walk: 'walking',
  bike: 'bicycling',
  bus: 'transit',
};

export interface DirectionsResult {
  distanceM: number;
  durationMinutes: number;
}

export async function getDirections(params: {
  originLat: number;
  originLng: number;
  destLat: number;
  destLng: number;
  mode: TransportMode;
}): Promise<DirectionsResult> {
  const url = new URL('https://maps.googleapis.com/maps/api/directions/json');
  url.searchParams.set('origin', `${params.originLat},${params.originLng}`);
  url.searchParams.set('destination', `${params.destLat},${params.destLng}`);
  url.searchParams.set('mode', MODE_MAP[params.mode]);
  if (params.mode === 'bus') url.searchParams.set('transit_mode', 'bus');
  url.searchParams.set('key', env.googleMaps.apiKey);

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Google Directions API 요청 실패: ${res.status}`);
  }

  const data = (await res.json()) as {
    routes: { legs: { distance: { value: number }; duration: { value: number } }[] }[];
  };

  const leg = data.routes[0]?.legs[0];
  if (!leg) {
    throw new Error('경로를 찾을 수 없습니다.');
  }

  return {
    distanceM: leg.distance.value,
    durationMinutes: Math.round(leg.duration.value / 60),
  };
}
