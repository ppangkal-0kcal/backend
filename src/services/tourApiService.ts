import { env } from '../config/env';
import { calculateCaloriesBurned, estimateWalkMinutes } from './calorieService';

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
  tel?: string;
  homepage?: string;
  firstimage?: string;
  firstimage2?: string;
}

interface DetailImageItem {
  originimgurl: string;
}

// 음식점(contentTypeId=39) 전용 부가정보 — detailIntro2 응답. 대표/추천 메뉴, 영업정보 등
// detailCommon2엔 없는 필드가 여기 있다.
interface DetailIntroFoodItem {
  firstmenu?: string;
  treatmenu?: string;
  opentimefood?: string;
  restdatefood?: string;
  parkingfood?: string;
  packing?: string;
  infocenterfood?: string;
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

export interface SuggestedWalk {
  content_id: string;
  title: string;
  round_trip_distance_m: number;
  estimated_calories_burned: number;
}

const PARK_SUGGEST_RADIUS_M = 1000;

// 빵집 좌표 기준 근처 공원을 찾아 왕복 산책 제안을 만든다 — idea.md §3: 도보 유도 대상이 아닌
// 빵집(리스트 단계) 또는 도보 실측 거리가 짧았던 방문(투어 도착 단계) 둘 다에서 쓰는 공용 로직.
// TourAPI 호출 실패는 부가 기능일 뿐이므로 호출부의 본 응답을 막지 않고 null을 반환한다.
export async function buildParkWalkSuggestion(params: {
  latitude: number;
  longitude: number;
  userWeightKg: number;
}): Promise<SuggestedWalk | null> {
  try {
    const park = await findNearbyPark({
      latitude: params.latitude,
      longitude: params.longitude,
      radiusM: PARK_SUGGEST_RADIUS_M,
    });
    if (!park) return null;

    const roundTripDistanceM = Math.round(park.distanceM * 2);
    const { caloriesBurned } = calculateCaloriesBurned(params.userWeightKg, estimateWalkMinutes(roundTripDistanceM));

    return {
      content_id: park.contentId,
      title: park.title,
      round_trip_distance_m: roundTripDistanceM,
      estimated_calories_burned: caloriesBurned,
    };
  } catch {
    return null;
  }
}

export interface RestaurantEnrichment {
  overview: string | null;
  tel: string | null;
  homepageUrls: string[];
  images: string[];
  signatureMenu: string | null;
  recommendedMenu: string | null;
  openTime: string | null;
  restDate: string | null;
  parking: string | null;
  packaging: string | null;
}

// TourAPI의 homepage 필드는 <a href="...">...</a> 형태의 HTML 조각을 그대로 준다 — API 응답에
// HTML을 그대로 흘려보내지 않고 URL만 뽑아 배열로 정리한다.
function extractHrefs(html?: string): string[] {
  if (!html) return [];
  return [...html.matchAll(/href="([^"]+)"/g)].map((match) => match[1]);
}

// 빵집을 TourAPI 음식점(contentTypeId=39) 콘텐츠로 등록해둔 경우에만 호출 — 대표/추천 메뉴,
// 소개글, 사진, 영업정보를 보강한다. 등록 안 된 빵집(Bakery.tourContentId가 NULL)에는 쓰지 않음.
export async function fetchRestaurantEnrichment(contentId: string): Promise<RestaurantEnrichment> {
  const [commonRes, introRes] = await Promise.all([
    fetch(buildUrl('detailCommon2', { contentId })),
    fetch(buildUrl('detailIntro2', { contentId, contentTypeId: 39 })),
  ]);

  if (!commonRes.ok) throw new Error(`TourAPI detailCommon2 요청 실패: ${commonRes.status}`);
  if (!introRes.ok) throw new Error(`TourAPI detailIntro2 요청 실패: ${introRes.status}`);

  const commonData = (await commonRes.json()) as TourApiResponse<DetailCommonItem>;
  const introData = (await introRes.json()) as TourApiResponse<DetailIntroFoodItem>;

  const [common] = toArray(commonData.response.body.items);
  const [intro] = toArray(introData.response.body.items);

  return {
    overview: common?.overview || null,
    tel: common?.tel || null,
    homepageUrls: extractHrefs(common?.homepage),
    images: [common?.firstimage, common?.firstimage2].filter((url): url is string => Boolean(url)),
    signatureMenu: intro?.firstmenu || null,
    recommendedMenu: intro?.treatmenu || null,
    openTime: intro?.opentimefood || null,
    restDate: intro?.restdatefood || null,
    parking: intro?.parkingfood || null,
    packaging: intro?.packing || null,
  };
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
