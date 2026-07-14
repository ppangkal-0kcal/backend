import { env } from '../config/env';

// Kakao Local API(키워드 검색)로 반경 내 빵집을 검색한다.
export interface KakaoBakeryResult {
  name: string;
  latitude: number;
  longitude: number;
  address: string;
  distanceM: number;
}

export async function searchNearbyBakeries(params: {
  latitude: number;
  longitude: number;
  radiusM: number;
}): Promise<KakaoBakeryResult[]> {
  const url = new URL('https://dapi.kakao.com/v2/local/search/keyword.json');
  url.searchParams.set('query', '빵집');
  url.searchParams.set('x', String(params.longitude));
  url.searchParams.set('y', String(params.latitude));
  url.searchParams.set('radius', String(Math.min(params.radiusM, 20000)));
  url.searchParams.set('sort', 'distance');

  const res = await fetch(url, {
    headers: { Authorization: `KakaoAK ${env.kakao.restApiKey}` },
  });
  if (!res.ok) {
    throw new Error(`Kakao Local API 요청 실패: ${res.status}`);
  }

  const data = (await res.json()) as {
    documents: { place_name: string; x: string; y: string; road_address_name: string; distance: string }[];
  };

  return data.documents.map((doc) => ({
    name: doc.place_name,
    latitude: Number(doc.y),
    longitude: Number(doc.x),
    address: doc.road_address_name,
    distanceM: Number(doc.distance),
  }));
}
