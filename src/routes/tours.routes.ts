import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { calculateCaloriesBurned, WALK_RECOMMEND_THRESHOLD_M, estimateWalkMinutes } from '../services/calorieService';
import { findNearbyPark } from '../services/tourApiService';
import { ApiError } from '../utils/ApiError';
import { asyncHandler } from '../utils/asyncHandler';

// 이 파일은 "빵투어 세션(tours/tour_stops 테이블)" 리소스를 다루며 /api/tours 경로에 마운트된다.
// idea.md §2(8단계 흐름) 참고 — 도보만 추적하고, 실제 거리/시간/걸음 수는 클라이언트 센서 실측값이다.
export const toursRouter = Router();
toursRouter.use(requireAuth);

const PARK_SUGGEST_RADIUS_M = 1000;

/**
 * @openapi
 * /tours:
 *   post:
 *     tags: [Tours]
 *     summary: 빵투어 시작
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       201:
 *         description: 생성된 투어 세션
 */
// POST /api/tours — idea.md §2 1단계 (투어 시작 & 센서 가동)
toursRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const tour = await prisma.tour.create({ data: { userId: req.userId! } });

    res.status(201).json({ id: tour.id, started_at: tour.startedAt });
  }),
);

/**
 * @openapi
 * /tours/{tourId}/stops:
 *   post:
 *     tags: [Tours]
 *     summary: 빵집 도착 기록 (클라이언트 실측 거리/시간/걸음 수)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: tourId
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [bakery_id, distance_m, duration_minutes, steps]
 *             properties:
 *               bakery_id: { type: string }
 *               distance_m: { type: integer }
 *               duration_minutes: { type: integer }
 *               steps: { type: integer }
 *     responses:
 *       201:
 *         description: 생성된 방문 기록 (1.2km 초과 시 suggested_walk에 도착 후 산책 제안 포함)
 *       400:
 *         description: 필수 값 누락 또는 이미 종료된 투어
 *       404:
 *         description: 투어 또는 빵집 없음
 */
// POST /api/tours/:tourId/stops — idea.md §2 6~7단계 (실측 이동 완료 시점 도착 기록)
toursRouter.post(
  '/:tourId/stops',
  asyncHandler(async (req, res) => {
    const tour = await prisma.tour.findUnique({ where: { id: req.params.tourId } });
    if (!tour || tour.userId !== req.userId) throw ApiError.notFound('투어를 찾을 수 없습니다.');
    if (tour.completedAt) throw ApiError.badRequest('이미 종료된 투어입니다.');

    const {
      bakery_id: bakeryId,
      distance_m: distanceM,
      duration_minutes: durationMinutes,
      steps,
    } = req.body as { bakery_id?: string; distance_m?: number; duration_minutes?: number; steps?: number };

    if (!bakeryId || distanceM === undefined || durationMinutes === undefined || steps === undefined) {
      throw ApiError.badRequest('bakery_id, distance_m, duration_minutes, steps는 필수 값입니다.');
    }

    const [user, bakery] = await Promise.all([
      prisma.user.findUniqueOrThrow({ where: { id: req.userId } }),
      prisma.bakery.findUnique({ where: { id: bakeryId } }),
    ]);
    if (!bakery) throw ApiError.notFound('빵집을 찾을 수 없습니다.');

    const { caloriesBurned } = calculateCaloriesBurned(user.weight, durationMinutes);

    const stop = await prisma.tourStop.create({
      data: {
        tourId: tour.id,
        bakeryId: bakery.id,
        distanceM,
        durationMinutes,
        steps,
        caloriesBurned,
      },
    });

    // distance_m은 이 방문 구간에서 클라이언트가 실측한 도보 거리다. 1.2km 이하로 걸었다는 건
    // 도보로 직접 오지 않았거나(대중교통) 도보권 안에서 짧게 걸었다는 뜻이므로, 두 경우 모두
    // 도착 후 산책 제안은 손해 볼 게 없는 보너스 제안이다. 반대로 이미 1.2km 넘게 걸었다면
    // 충분히 걸은 것이므로 추가 제안을 하지 않는다.
    const suggestedWalk =
      distanceM <= WALK_RECOMMEND_THRESHOLD_M ? await buildParkWalkSuggestion(bakery.id, user.weight) : null;

    res.status(201).json({
      id: stop.id,
      tour_id: stop.tourId,
      bakery_id: stop.bakeryId,
      distance_m: stop.distanceM,
      duration_minutes: stop.durationMinutes,
      steps: stop.steps,
      calories_burned: stop.caloriesBurned,
      visited_at: stop.visitedAt,
      suggested_walk: suggestedWalk,
    });
  }),
);

/**
 * @openapi
 * /tours/{tourId}/complete:
 *   patch:
 *     tags: [Tours]
 *     summary: 투어 종료 및 결과 스냅샷 저장 (0-kcal 밸런스 확정)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: tourId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: 투어 요약 (total_steps, total_distance_m, total_calories_burned, total_calories_consumed, balance_kcal)
 *       404:
 *         description: 투어 없음
 */
// PATCH /api/tours/:tourId/complete — idea.md §2 8단계 (투어 종료 & 결과 저장)
toursRouter.patch(
  '/:tourId/complete',
  asyncHandler(async (req, res) => {
    const tour = await prisma.tour.findUnique({ where: { id: req.params.tourId }, include: { stops: true } });
    if (!tour || tour.userId !== req.userId) throw ApiError.notFound('투어를 찾을 수 없습니다.');

    const stopIds = tour.stops.map((stop) => stop.id);
    const foodLogs = await prisma.foodLog.findMany({ where: { tourStopId: { in: stopIds } } });

    const totalSteps = tour.stops.reduce((sum, stop) => sum + stop.steps, 0);
    const totalDistanceM = tour.stops.reduce((sum, stop) => sum + stop.distanceM, 0);
    const totalCaloriesBurned = tour.stops.reduce((sum, stop) => sum + stop.caloriesBurned, 0);
    const totalCaloriesConsumed = foodLogs.reduce((sum, log) => sum + log.calories * log.quantity, 0);
    const balanceKcal = totalCaloriesBurned - totalCaloriesConsumed;

    const updated = await prisma.tour.update({
      where: { id: tour.id },
      data: {
        completedAt: new Date(),
        totalSteps,
        totalDistanceM,
        totalCaloriesBurned,
        totalCaloriesConsumed,
        balanceKcal,
      },
    });

    res.json({
      id: updated.id,
      completed_at: updated.completedAt,
      total_steps: updated.totalSteps,
      total_distance_m: updated.totalDistanceM,
      total_calories_burned: updated.totalCaloriesBurned,
      total_calories_consumed: updated.totalCaloriesConsumed,
      balance_kcal: updated.balanceKcal,
    });
  }),
);

/**
 * @openapi
 * /tours/{tourId}:
 *   get:
 *     tags: [Tours]
 *     summary: 투어 상세 (요약 리포트 카드용 — 방문 빵집별 상세 포함)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: tourId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: 투어 상세 + stops[]
 *       404:
 *         description: 투어 없음
 */
// GET /api/tours/:tourId — idea.md §2 8단계 요약 리포트 카드
toursRouter.get(
  '/:tourId',
  asyncHandler(async (req, res) => {
    const tour = await prisma.tour.findUnique({
      where: { id: req.params.tourId },
      include: { stops: { include: { bakery: true }, orderBy: { visitedAt: 'asc' } } },
    });
    if (!tour || tour.userId !== req.userId) throw ApiError.notFound('투어를 찾을 수 없습니다.');

    res.json({
      id: tour.id,
      started_at: tour.startedAt,
      completed_at: tour.completedAt,
      total_steps: tour.totalSteps,
      total_distance_m: tour.totalDistanceM,
      total_calories_burned: tour.totalCaloriesBurned,
      total_calories_consumed: tour.totalCaloriesConsumed,
      balance_kcal: tour.balanceKcal,
      stops: tour.stops.map((stop) => ({
        id: stop.id,
        bakery_id: stop.bakeryId,
        bakery_name: stop.bakery.name,
        distance_m: stop.distanceM,
        duration_minutes: stop.durationMinutes,
        steps: stop.steps,
        calories_burned: stop.caloriesBurned,
        visited_at: stop.visitedAt,
      })),
    });
  }),
);

interface SuggestedWalk {
  content_id: string;
  title: string;
  round_trip_distance_m: number;
  estimated_calories_burned: number;
}

// TourAPI 조회 실패는 부가 기능(산책 제안)일 뿐이므로 방문 기록 생성 자체를 막지 않고 null로 넘어간다.
async function buildParkWalkSuggestion(bakeryId: string, userWeightKg: number): Promise<SuggestedWalk | null> {
  try {
    const bakery = await prisma.bakery.findUnique({ where: { id: bakeryId } });
    if (!bakery) return null;

    const park = await findNearbyPark({
      latitude: bakery.latitude,
      longitude: bakery.longitude,
      radiusM: PARK_SUGGEST_RADIUS_M,
    });
    if (!park) return null;

    const roundTripDistanceM = Math.round(park.distanceM * 2);
    const { caloriesBurned } = calculateCaloriesBurned(userWeightKg, estimateWalkMinutes(roundTripDistanceM));

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
