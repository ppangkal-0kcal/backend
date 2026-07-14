import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { fetchNearbySpots } from '../services/tourApiService';
import { getSpotDetail } from '../services/tourSpotCacheService';
import { calculateCaloriesBurned } from '../services/calorieService';
import { ApiError } from '../utils/ApiError';
import { asyncHandler } from '../utils/asyncHandler';

export const tourRouter = Router();
tourRouter.use(requireAuth);

const AVG_WALK_SPEED_M_PER_MIN = 4000 / 60; // 도보 평균 4km/h — 지점별 정밀 시간은 Directions API 호출로 대체 가능

// GET /api/tour/nearby — ppangkal.md §12.4, 한국관광공사 TourAPI locationBasedList1 연동 (필수)
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
        const walkMinutes = Math.round(spot.distanceM / AVG_WALK_SPEED_M_PER_MIN);
        const { caloriesBurned } = calculateCaloriesBurned(user.weight, 'walk', walkMinutes);

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
