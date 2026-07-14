import { Router } from 'express';
import type { TransportMode } from '@prisma/client';
import { requireAuth } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { calculateCaloriesBurned, resolveBalanceStatus } from '../services/calorieService';
import { ApiError } from '../utils/ApiError';
import { asyncHandler } from '../utils/asyncHandler';

export const caloriesRouter = Router();

const MODE_LABEL_KO: Record<TransportMode, string> = { walk: '도보', bike: '자전거', bus: '버스' };
const VALID_MODES: TransportMode[] = ['walk', 'bike', 'bus'];

// POST /api/calories/calculate — ppangkal.md §12.6 (인증 불필요, 단건 미리보기 계산)
caloriesRouter.post(
  '/calculate',
  asyncHandler(async (req, res) => {
    const { user_weight: weight, transport_mode: mode, duration_minutes: durationMinutes } = req.body as {
      user_weight?: number;
      transport_mode?: TransportMode;
      duration_minutes?: number;
    };

    if (!weight || !mode || !durationMinutes) {
      throw ApiError.badRequest('user_weight, transport_mode, duration_minutes는 필수 값입니다.');
    }
    if (!VALID_MODES.includes(mode)) {
      throw ApiError.badRequest(`transport_mode는 ${VALID_MODES.join('/')} 중 하나여야 합니다.`);
    }

    const { metValue, caloriesBurned } = calculateCaloriesBurned(weight, mode, durationMinutes);

    res.json({
      met_value: metValue,
      calories_burned: caloriesBurned,
      message: `${MODE_LABEL_KO[mode]} ${durationMinutes}분 이동 시 약 ${caloriesBurned}kcal 소모`,
    });
  }),
);

// GET /api/calories/balance — ppangkal.md §12.6
caloriesRouter.get(
  '/balance',
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findUnique({ where: { id: req.userId } });
    if (!user) throw ApiError.notFound('사용자를 찾을 수 없습니다.');

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [foodLogs, routes] = await Promise.all([
      prisma.foodLog.findMany({ where: { userId: user.id, loggedAt: { gte: today } } }),
      prisma.route.findMany({ where: { userId: user.id, completedAt: { gte: today, not: null } } }),
    ]);

    const consumedCalories = foodLogs.reduce((sum, log) => sum + log.calories * log.quantity, 0);
    const burnedCalories = routes.reduce((sum, route) => sum + (route.caloriesBurned ?? 0), 0);
    const remainingCalories = user.dailyGoalCalories - consumedCalories + burnedCalories;

    res.json({
      daily_goal_calories: user.dailyGoalCalories,
      consumed_calories: consumedCalories,
      burned_calories: burnedCalories,
      remaining_calories: remainingCalories,
      status: resolveBalanceStatus(remainingCalories, user.dailyGoalCalories),
    });
  }),
);
