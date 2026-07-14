import { env } from '../config/env';

// 한국관광공사 TourAPI 연동 — 공모전 제출 요건상 필수 (CLAUDE.md 참고).
// 사용 endpoint: locationBasedList1 / detailCommon1 / detailImage1

interface TourApiResponse<T> {
  response: {
    header: { resultCode: string; resultMsg: string };
    body: { items: { item: T[] | T } | '' };
  };
}

interface LocationBasedListItem {
  contentid: string;
  title: string;
  mapx: string;
  mapy: string;
  dist: string;
}

interface DetailCommonItem {
  contentid: string;
  title: string;
  overview: string;
  usetime?: string;
  mapx: string;
  mapy: string;
}

interface DetailImageItem {
  originimgurl: string;
}

export interface NearbySpot {
  contentId: string;
  title: string;
  distanceM: number;
  mapx: number;
  mapy: number;
}

export interface SpotDetail {
  contentId: string;
  title: string;
  overview: string;
  openingHours: string | null;
  latitude: number;
  longitude: number;
  images: string[];
}

function buildUrl(operation: string, params: Record<string, string | number>): string {
  const url = new URL(`${env.tourApi.baseUrl}/${operation}`);
  url.searchParams.set('serviceKey', env.tourApi.serviceKey);
  url.searchParams.set('MobileOS', 'ETC');
  url.searchParams.set('MobileApp', 'ppangkal');
  url.searchParams.set('_type', 'json');
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, String(value));
  }
  return url.toString();
}

function toArray<T>(items: { item: T[] | T } | ''): T[] {
  if (items === '') return [];
  return Array.isArray(items.item) ? items.item : [items.item];
}

export async function fetchNearbySpots(params: {
  latitude: number;
  longitude: number;
  radiusM: number;
  contentTypeId?: string;
}): Promise<NearbySpot[]> {
  const url = buildUrl('locationBasedList1', {
    mapX: params.longitude,
    mapY: params.latitude,
    radius: params.radiusM,
    ...(params.contentTypeId ? { contentTypeId: params.contentTypeId } : {}),
    numOfRows: 20,
  });

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`TourAPI locationBasedList1 요청 실패: ${res.status}`);
  }
  const data = (await res.json()) as TourApiResponse<LocationBasedListItem>;
  const items = toArray(data.response.body.items);

  return items.map((item) => ({
    contentId: item.contentid,
    title: item.title,
    distanceM: Number(item.dist),
    mapx: Number(item.mapx),
    mapy: Number(item.mapy),
  }));
}

export async function fetchSpotDetail(contentId: string): Promise<SpotDetail> {
  const [commonRes, imageRes] = await Promise.all([
    fetch(buildUrl('detailCommon1', { contentId })),
    fetch(buildUrl('detailImage1', { contentId })),
  ]);

  if (!commonRes.ok) throw new Error(`TourAPI detailCommon1 요청 실패: ${commonRes.status}`);
  if (!imageRes.ok) throw new Error(`TourAPI detailImage1 요청 실패: ${imageRes.status}`);

  const commonData = (await commonRes.json()) as TourApiResponse<DetailCommonItem>;
  const imageData = (await imageRes.json()) as TourApiResponse<DetailImageItem>;

  const [common] = toArray(commonData.response.body.items);
  const images = toArray(imageData.response.body.items);

  return {
    contentId,
    title: common?.title ?? '',
    overview: common?.overview ?? '',
    openingHours: common?.usetime ?? null,
    latitude: Number(common?.mapy ?? 0),
    longitude: Number(common?.mapx ?? 0),
    images: images.map((img) => img.originimgurl),
  };
}
