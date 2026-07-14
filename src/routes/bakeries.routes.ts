import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { ApiError } from '../utils/ApiError';
import { asyncHandler } from '../utils/asyncHandler';
import { haversineDistanceM, isBakeryOpenNow } from '../utils/geo';

export const bakeriesRouter = Router();

// GET /api/bakeries — ppangkal.md §12.3 (자체 DB 기준. 큐레이션 전 발굴은 Kakao Local API로 별도 확장 가능)
bakeriesRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const lat = Number(req.query.lat);
    const lng = Number(req.query.lng);
    const radiusKm = Number(req.query.radius_km ?? 3);
    const sort = (req.query.sort as string | undefined) ?? 'distance';

    if (Number.isNaN(lat) || Number.isNaN(lng)) {
      throw ApiError.badRequest('lat, lng는 필수 값입니다.');
    }

    const bakeries = await prisma.bakery.findMany();

    const withDistance = bakeries
      .map((bakery) => ({
        bakery,
        distanceM: haversineDistanceM({ lat, lng }, { lat: bakery.latitude, lng: bakery.longitude }),
        isOpenNow: isBakeryOpenNow(bakery.openingHours),
      }))
      .filter((entry) => entry.distanceM <= radiusKm * 1000);

    if (sort === 'rating') {
      withDistance.sort((a, b) => (b.bakery.rating ?? 0) - (a.bakery.rating ?? 0));
    } else if (sort === 'recommended') {
      // 거리 30% + 평점 20% (칼로리 적합도/영업 여부는 빵 메뉴 선택 이후에만 계산 가능하므로
      // 이 목록 단계에서는 제외 — ppangkal.md §2.2 전체 가중치는 /api/bakeries/:id/items 선택 흐름에서 적용)
      const maxDistance = Math.max(...withDistance.map((e) => e.distanceM), 1);
      withDistance.sort((a, b) => {
        const scoreA = 0.3 * (1 - a.distanceM / maxDistance) + 0.2 * ((a.bakery.rating ?? 0) / 5);
        const scoreB = 0.3 * (1 - b.distanceM / maxDistance) + 0.2 * ((b.bakery.rating ?? 0) / 5);
        return scoreB - scoreA;
      });
    } else {
      withDistance.sort((a, b) => a.distanceM - b.distanceM);
    }

    res.json({
      bakeries: withDistance.map(({ bakery, distanceM, isOpenNow }) => ({
        id: bakery.id,
        name: bakery.name,
        latitude: bakery.latitude,
        longitude: bakery.longitude,
        address: bakery.address,
        rating: bakery.rating,
        review_count: bakery.reviewCount,
        opening_hours: bakery.openingHours,
        distance_m: Math.round(distanceM),
        is_open_now: isOpenNow,
      })),
    });
  }),
);

// GET /api/bakeries/:bakeryId/items — ppangkal.md §12.3
bakeriesRouter.get(
  '/:bakeryId/items',
  asyncHandler(async (req, res) => {
    const items = await prisma.breadItem.findMany({ where: { bakeryId: req.params.bakeryId } });

    res.json({
      bread_items: items.map((item) => ({
        id: item.id,
        bakery_id: item.bakeryId,
        name: item.name,
        category: item.category,
        price: item.price,
        calories: item.calories,
        base_weight_g: item.baseWeightG,
        carb_g: item.carbG,
        protein_g: item.proteinG,
        fat_g: item.fatG,
        source_grade: item.sourceGrade,
        source_note: item.sourceNote,
        image_url: item.imageUrl,
        is_available: item.isAvailable,
      })),
    });
  }),
);
