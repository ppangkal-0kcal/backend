import { Router } from 'express';
import type { TransportMode } from '@prisma/client';
import { requireAuth } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { getDirections } from '../services/directionsService';
import { calculateCaloriesBurned } from '../services/calorieService';
import { ApiError } from '../utils/ApiError';
import { asyncHandler } from '../utils/asyncHandler';

// 이 파일은 "이동 경로(routes 테이블)" 리소스를 다루며 /api/routes 경로에 마운트된다.
export const routeRouter = Router();
routeRouter.use(requireAuth);

const VALID_MODES: TransportMode[] = ['walk', 'bike', 'bus'];

// POST /api/routes — ppangkal.md §12.5
routeRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const { bakery_id: bakeryId, transport_mode: transportMode } = req.body as {
      bakery_id?: string;
      transport_mode?: TransportMode;
    };

    if (!bakeryId || !transportMode) throw ApiError.badRequest('bakery_id, transport_mode는 필수 값입니다.');
    if (!VALID_MODES.includes(transportMode)) {
      throw ApiError.badRequest(`transport_mode는 ${VALID_MODES.join('/')} 중 하나여야 합니다.`);
    }

    const [user, bakery] = await Promise.all([
      prisma.user.findUnique({ where: { id: req.userId } }),
      prisma.bakery.findUnique({ where: { id: bakeryId } }),
    ]);
    if (!user) throw ApiError.notFound('사용자를 찾을 수 없습니다.');
    if (!bakery) throw ApiError.notFound('빵집을 찾을 수 없습니다.');

    // 사용자 현재 위치는 클라이언트가 별도로 전달하지 않는 한, 빵집 좌표를 목적지로 한
    // 기준 위치가 필요하다. MVP에서는 요청 바디의 origin_lat/origin_lng를 받는다.
    const { origin_lat: originLat, origin_lng: originLng } = req.body as { origin_lat?: number; origin_lng?: number };
    if (originLat === undefined || originLng === undefined) {
      throw ApiError.badRequest('origin_lat, origin_lng는 필수 값입니다.');
    }

    const directions = await getDirections({
      originLat,
      originLng,
      destLat: bakery.latitude,
      destLng: bakery.longitude,
      mode: transportMode,
    });

    const { metValue, caloriesBurned } = calculateCaloriesBurned(user.weight, transportMode, directions.durationMinutes);

    const route = await prisma.route.create({
      data: {
        userId: user.id,
        bakeryId: bakery.id,
        transportMode,
        distance: directions.distanceM,
        durationMinutes: directions.durationMinutes,
        fixedMetValue: metValue,
      },
    });

    res.status(201).json({
      id: route.id,
      bakery_id: route.bakeryId,
      transport_mode: route.transportMode,
      distance_m: route.distance,
      duration_minutes: route.durationMinutes,
      fixed_met_value: route.fixedMetValue,
      estimated_calories_burned: caloriesBurned,
      started_at: route.startedAt,
    });
  }),
);

// PATCH /api/routes/:routeId/complete — ppangkal.md §12.5
routeRouter.patch(
  '/:routeId/complete',
  asyncHandler(async (req, res) => {
    const route = await prisma.route.findUnique({ where: { id: req.params.routeId } });
    if (!route || route.userId !== req.userId) throw ApiError.notFound('경로를 찾을 수 없습니다.');

    const user = await prisma.user.findUniqueOrThrow({ where: { id: req.userId } });
    const { caloriesBurned } = calculateCaloriesBurned(user.weight, route.transportMode, route.durationMinutes);

    const updated = await prisma.route.update({
      where: { id: route.id },
      data: { completedAt: new Date(), caloriesBurned },
    });

    res.json({ id: updated.id, completed_at: updated.completedAt, calories_burned: updated.caloriesBurned });
  }),
);
