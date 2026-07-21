import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { calculateCaloriesBurned, estimateWalkMinutes, WALK_RECOMMEND_THRESHOLD_M } from '../services/calorieService';
import { buildParkWalkSuggestion, fetchRestaurantEnrichment } from '../services/tourApiService';
import { ApiError } from '../utils/ApiError';
import { asyncHandler } from '../utils/asyncHandler';
import { haversineDistanceM, isBakeryOpenNow } from '../utils/geo';

export const bakeriesRouter = Router();

/**
 * @openapi
 * /bakeries:
 *   get:
 *     tags: [Bakeries]
 *     summary: 주변 빵집 목록 (거리/평점/추천순 정렬)
 *     parameters:
 *       - in: query
 *         name: lat
 *         required: true
 *         schema: { type: number }
 *       - in: query
 *         name: lng
 *         required: true
 *         schema: { type: number }
 *       - in: query
 *         name: radius_km
 *         schema: { type: number, default: 3 }
 *       - in: query
 *         name: sort
 *         schema: { type: string, enum: [distance, rating, recommended], default: distance }
 *       - in: query
 *         name: user_weight
 *         schema: { type: number }
 *         description: 제공 시 각 빵집의 예상 도보 소모 칼로리(estimated_walk_calories)를 함께 계산
 *     responses:
 *       200:
 *         description: 빵집 목록 (walk_recommended, estimated_walk_calories, suggested_walk 포함 — suggested_walk는 도보 비권장(1.2km 초과) 빵집에 user_weight 제공 시에만 채워짐)
 *       400:
 *         description: lat, lng 누락
 */
// GET /api/bakeries — legacy/ppangkal.md §12.3 (자체 DB 기준. 큐레이션 전 발굴은 Kakao Local API로 별도 확장 가능)
bakeriesRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const lat = Number(req.query.lat);
    const lng = Number(req.query.lng);
    const radiusKm = Number(req.query.radius_km ?? 3);
    const sort = (req.query.sort as string | undefined) ?? 'distance';
    const userWeight = req.query.user_weight !== undefined ? Number(req.query.user_weight) : undefined;

    if (Number.isNaN(lat) || Number.isNaN(lng)) {
      throw ApiError.badRequest('lat, lng는 필수 값입니다.');
    }
    if (userWeight !== undefined && Number.isNaN(userWeight)) {
      throw ApiError.badRequest('user_weight는 숫자여야 합니다.');
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
      // 이 목록 단계에서는 제외 — legacy/ppangkal.md §2.2 전체 가중치는 /api/bakeries/:id/items 선택 흐름에서 적용)
      const maxDistance = Math.max(...withDistance.map((e) => e.distanceM), 1);
      withDistance.sort((a, b) => {
        const scoreA = 0.3 * (1 - a.distanceM / maxDistance) + 0.2 * ((a.bakery.rating ?? 0) / 5);
        const scoreB = 0.3 * (1 - b.distanceM / maxDistance) + 0.2 * ((b.bakery.rating ?? 0) / 5);
        return scoreB - scoreA;
      });
    } else {
      withDistance.sort((a, b) => a.distanceM - b.distanceM);
    }

    // 1.2km 초과(도보 비권장) 빵집에 한해 근처 공원 산책 미리보기를 붙인다 (idea.md §3) — 체중이
    // 있어야 칼로리를 계산할 수 있으므로 user_weight 제공 시에만. 빵집별로 TourAPI를 병렬 호출한다.
    const bakeriesResponse = await Promise.all(
      withDistance.map(async ({ bakery, distanceM, isOpenNow }) => {
        const walkRecommended = distanceM <= WALK_RECOMMEND_THRESHOLD_M;
        const suggestedWalk =
          !walkRecommended && userWeight !== undefined
            ? await buildParkWalkSuggestion({
                latitude: bakery.latitude,
                longitude: bakery.longitude,
                userWeightKg: userWeight,
              })
            : null;

        return {
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
          walk_recommended: walkRecommended,
          estimated_walk_calories:
            userWeight !== undefined
              ? calculateCaloriesBurned(userWeight, estimateWalkMinutes(distanceM)).caloriesBurned
              : null,
          suggested_walk: suggestedWalk,
        };
      }),
    );

    res.json({ bakeries: bakeriesResponse });
  }),
);

/**
 * @openapi
 * /bakeries/{bakeryId}:
 *   get:
 *     tags: [Bakeries]
 *     summary: 빵집 상세 (TourAPI 등록 업체는 tour_info로 소개글/사진/대표메뉴/영업정보 보강)
 *     parameters:
 *       - in: path
 *         name: bakeryId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: 빵집 상세. tour_info는 tour_content_id가 없거나 TourAPI 호출 실패 시 null
 *       404:
 *         description: 빵집 없음
 */
// GET /api/bakeries/:bakeryId — 자체 큐레이션 필드 + (등록된 경우) TourAPI 보강 정보
bakeriesRouter.get(
  '/:bakeryId',
  asyncHandler(async (req, res) => {
    const bakery = await prisma.bakery.findUnique({ where: { id: req.params.bakeryId } });
    if (!bakery) throw ApiError.notFound('빵집을 찾을 수 없습니다.');

    const tourInfo = bakery.tourContentId ? await fetchTourInfoSafely(bakery.tourContentId) : null;

    res.json({
      id: bakery.id,
      name: bakery.name,
      latitude: bakery.latitude,
      longitude: bakery.longitude,
      address: bakery.address,
      rating: bakery.rating,
      review_count: bakery.reviewCount,
      opening_hours: bakery.openingHours,
      is_open_now: isBakeryOpenNow(bakery.openingHours),
      tour_info: tourInfo,
    });
  }),
);

// TourAPI 호출 실패는 부가 정보(보강)일 뿐이므로 빵집 상세 조회 자체를 막지 않고 null로 넘어간다.
async function fetchTourInfoSafely(contentId: string) {
  try {
    const enrichment = await fetchRestaurantEnrichment(contentId);
    return {
      overview: enrichment.overview,
      tel: enrichment.tel,
      homepage_urls: enrichment.homepageUrls,
      images: enrichment.images,
      signature_menu: enrichment.signatureMenu,
      recommended_menu: enrichment.recommendedMenu,
      open_time: enrichment.openTime,
      rest_date: enrichment.restDate,
      parking: enrichment.parking,
      packaging: enrichment.packaging,
    };
  } catch {
    return null;
  }
}

/**
 * @openapi
 * /bakeries/{bakeryId}/items:
 *   get:
 *     tags: [Bakeries]
 *     summary: 빵집의 빵 메뉴 목록
 *     parameters:
 *       - in: path
 *         name: bakeryId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: 빵 메뉴 목록
 */
// GET /api/bakeries/:bakeryId/items — legacy/ppangkal.md §12.3
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
