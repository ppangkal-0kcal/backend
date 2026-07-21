import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { calculateCaloriesBurned, resolveBalanceStatus } from '../services/calorieService';
import { ApiError } from '../utils/ApiError';
import { asyncHandler } from '../utils/asyncHandler';

export const caloriesRouter = Router();

/**
 * @openapi
 * /calories/calculate:
 *   post:
 *     tags: [Calories]
 *     summary: 도보 소모 칼로리 미리보기 (인증 불필요) — idea.md §4, 도보만 추적
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [user_weight, duration_minutes]
 *             properties:
 *               user_weight: { type: number, example: 65 }
 *               duration_minutes: { type: number, example: 20 }
 *     responses:
 *       200:
 *         description: met_value, calories_burned, message
 *       400:
 *         description: 필수 값 누락
 */
// POST /api/calories/calculate — idea.md §4 (인증 불필요, 단건 미리보기 계산, 도보 고정)
caloriesRouter.post(
  '/calculate',
  asyncHandler(async (req, res) => {
    const { user_weight: weight, duration_minutes: durationMinutes } = req.body as {
      user_weight?: number;
      duration_minutes?: number;
    };

    if (!weight || !durationMinutes) {
      throw ApiError.badRequest('user_weight, duration_minutes는 필수 값입니다.');
    }

    const { metValue, caloriesBurned } = calculateCaloriesBurned(weight, durationMinutes);

    res.json({
      met_value: metValue,
      calories_burned: caloriesBurned,
      message: `도보 ${durationMinutes}분 이동 시 약 ${caloriesBurned}kcal 소모`,
    });
  }),
);

/**
 * @openapi
 * /calories/balance:
 *   get:
 *     tags: [Calories]
 *     summary: 오늘의 실시간 칼로리 밸런스 (잔여 칼로리 + green/yellow/red 상태)
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: daily_goal_calories, consumed_calories, burned_calories, remaining_calories, status
 *       404:
 *         description: 사용자 없음
 */
// GET /api/calories/balance — legacy/ppangkal.md §12.6
caloriesRouter.get(
  '/balance',
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findUnique({ where: { id: req.userId } });
    if (!user) throw ApiError.notFound('사용자를 찾을 수 없습니다.');

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [foodLogs, tours] = await Promise.all([
      prisma.foodLog.findMany({ where: { userId: user.id, loggedAt: { gte: today } } }),
      prisma.tour.findMany({ where: { userId: user.id, completedAt: { gte: today, not: null } } }),
    ]);

    const consumedCalories = foodLogs.reduce((sum, log) => sum + log.calories * log.quantity, 0);
    const burnedCalories = tours.reduce((sum, tour) => sum + (tour.totalCaloriesBurned ?? 0), 0);
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
