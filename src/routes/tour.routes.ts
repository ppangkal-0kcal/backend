import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { fetchNearbySpots } from '../services/tourApiService';
import { getSpotDetail } from '../services/tourSpotCacheService';
import { calculateCaloriesBurned, estimateWalkMinutes } from '../services/calorieService';
import { ApiError } from '../utils/ApiError';
import { asyncHandler } from '../utils/asyncHandler';

export const tourRouter = Router();
tourRouter.use(requireAuth);

/**
 * @openapi
 * /tour/nearby:
 *   get:
 *     tags: [Tour]
 *     summary: 주변 관광지 목록 (TourAPI locationBasedList1)
 *     security: [{ bearerAuth: [] }]
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
 *         schema: { type: number, default: 2 }
 *       - in: query
 *         name: content_type
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: 관광지 목록 (도보 소요시간/소모 칼로리 포함)
 *       400:
 *         description: lat, lng 누락
 */
// GET /api/tour/nearby — legacy/ppangkal.md §12.4, 한국관광공사 TourAPI locationBasedList1 연동 (필수)
tourRouter.get(
  '/nearby',
  asyncHandler(async (req, res) => {
    const lat = Number(req.query.lat);
    const lng = Number(req.query.lng);
    const radiusKm = Number(req.query.radius_km ?? 2);

    if (Number.isNaN(lat) || Number.isNaN(lng)) {
      throw ApiError.badRequest('lat, lng는 필수 값입니다.');
    }

    const user = await prisma.user.findUnique({ where: { id: req.userId } });
    if (!user) throw ApiError.notFound('사용자를 찾을 수 없습니다.');

    const spots = await fetchNearbySpots({
      latitude: lat,
      longitude: lng,
      radiusM: radiusKm * 1000,
      contentTypeId: req.query.content_type as string | undefined,
    });

    res.json({
      spots: spots.map((spot) => {
        const walkMinutes = estimateWalkMinutes(spot.distanceM);
        const { caloriesBurned } = calculateCaloriesBurned(user.weight, walkMinutes);

        return {
          content_id: spot.contentId,
          title: spot.title,
          distance_m: Math.round(spot.distanceM),
          walk_minutes: walkMinutes,
          estimated_calories_burned: caloriesBurned,
          mapx: spot.mapx,
          mapy: spot.mapy,
        };
      }),
    });
  }),
);

/**
 * @openapi
 * /tour/spots/{contentId}:
 *   get:
 *     tags: [Tour]
 *     summary: 관광지 상세 (TourAPI detailCommon1 + detailImage1, 7일 캐시)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: contentId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: 관광지 상세 + 이미지
 */
// GET /api/tour/spots/:contentId — detailCommon1 + detailImage1 결합 (필수)
// TourAPI를 매 요청 라이브 호출하지 않고 tourist_spots/spot_images 캐시를 read-through로 사용한다.
tourRouter.get(
  '/spots/:contentId',
  asyncHandler(async (req, res) => {
    const detail = await getSpotDetail(req.params.contentId);

    res.json({
      content_id: detail.contentId,
      title: detail.title,
      overview: detail.overview,
      opening_hours: detail.openingHours,
      images: detail.images,
    });
  }),
);
