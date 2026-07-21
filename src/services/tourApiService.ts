import { env } from '../config/env';

// 한국관광공사 TourAPI 연동 — 공모전 제출 요건상 필수 (CLAUDE.md 참고).
// 사용 endpoint: locationBasedList2 / detailCommon2 / detailImage2
// (신청한 서비스가 v1 오퍼레이션을 제공하지 않아 KorService2 + *2로 확인함 — 응답 필드명은 v1과 동일)

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
  cat1?: string;
  cat2?: string;
  cat3?: string;
}): Promise<NearbySpot[]> {
  const url = buildUrl('locationBasedList2', {
    mapX: params.longitude,
    mapY: params.latitude,
    radius: params.radiusM,
    arrange: 'E', // 거리순 정렬 — TourAPI locationBasedList의 필수 파라미터
    ...(params.contentTypeId ? { contentTypeId: params.contentTypeId } : {}),
    ...(params.cat1 ? { cat1: params.cat1 } : {}),
    ...(params.cat2 ? { cat2: params.cat2 } : {}),
    ...(params.cat3 ? { cat3: params.cat3 } : {}),
    numOfRows: 20,
  });

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`TourAPI locationBasedList2 요청 실패: ${res.status}`);
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

// '공원' 분류코드 — TourAPI categoryCode2로 실제 조회해 확인함: 자연(A01) 하위가 아니라
// 인문(A02) > 휴양관광지(A0202) > 공원(A02020700). locationBasedList2에 cat1/cat2/cat3를
// 그대로 넘기면 TourAPI가 서버 사이드에서 걸러주므로 제목 키워드 매칭보다 정확하다.
const PARK_CATEGORY = { cat1: 'A02', cat2: 'A0202', cat3: 'A02020700' };

export async function findNearbyPark(params: {
  latitude: number;
  longitude: number;
  radiusM: number;
}): Promise<NearbySpot | null> {
  const spots = await fetchNearbySpots({ ...params, ...PARK_CATEGORY });
  if (spots.length === 0) return null;

  // arrange: 'E'로 이미 거리순 정렬되지만, 가장 가까운 항목을 명시적으로 보장한다.
  return spots.reduce((closest, spot) => (spot.distanceM < closest.distanceM ? spot : closest));
}

export async function fetchSpotDetail(contentId: string): Promise<SpotDetail> {
  const [commonRes, imageRes] = await Promise.all([
    fetch(buildUrl('detailCommon2', { contentId })),
    fetch(buildUrl('detailImage2', { contentId })),
  ]);

  if (!commonRes.ok) throw new Error(`TourAPI detailCommon2 요청 실패: ${commonRes.status}`);
  if (!imageRes.ok) throw new Error(`TourAPI detailImage2 요청 실패: ${imageRes.status}`);

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
