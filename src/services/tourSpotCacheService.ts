import { prisma } from '../lib/prisma';
import { fetchSpotDetail, type SpotDetail } from './tourApiService';

// 관광지 상세 정보(개요/운영시간/이미지)는 자주 바뀌지 않으므로, 매 요청마다 TourAPI를
// 라이브 호출하지 않고 read-through 캐시를 둔다 (bbangkal_erd_v3.md의 TOURIST_SPOT 설계 반영).
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7일

function isFresh(fetchedAt: Date): boolean {
  return Date.now() - fetchedAt.getTime() < CACHE_TTL_MS;
}

export async function getSpotDetail(contentId: string): Promise<SpotDetail> {
  const cached = await prisma.touristSpot.findUnique({
    where: { contentId },
    include: { images: { orderBy: { seq: 'asc' } } },
  });

  if (cached && isFresh(cached.fetchedAt)) {
    return {
      contentId: cached.contentId,
      title: cached.title,
      overview: cached.overview ?? '',
      openingHours: cached.openingHours,
      latitude: cached.latitude,
      longitude: cached.longitude,
      images: cached.images.map((image) => image.originUrl),
    };
  }

  const detail = await fetchSpotDetail(contentId);
  await persistSpotDetail(detail);
  return detail;
}

async function persistSpotDetail(detail: SpotDetail): Promise<void> {
  // 캐시 만료 시에도 행을 삭제하지 않고 UPDATE로 갱신한다 — 향후 다른 테이블이 content_id를
  // 참조하게 되더라도 FK가 깨지지 않도록 하기 위함 (bbangkal_erd_v3.md 구현 시 주의사항 참고).
  await prisma.$transaction([
    prisma.touristSpot.upsert({
      where: { contentId: detail.contentId },
      update: {
        title: detail.title,
        overview: detail.overview,
        openingHours: detail.openingHours,
        latitude: detail.latitude,
        longitude: detail.longitude,
        fetchedAt: new Date(),
      },
      create: {
        contentId: detail.contentId,
        title: detail.title,
        overview: detail.overview,
        openingHours: detail.openingHours,
        latitude: detail.latitude,
        longitude: detail.longitude,
        fetchedAt: new Date(),
      },
    }),
    prisma.spotImage.deleteMany({ where: { contentId: detail.contentId } }),
    ...(detail.images.length > 0
      ? [
          prisma.spotImage.createMany({
            data: detail.images.map((originUrl, index) => ({
              contentId: detail.contentId,
              originUrl,
              seq: index,
            })),
          }),
        ]
      : []),
  ]);
}
