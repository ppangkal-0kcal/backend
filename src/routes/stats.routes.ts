import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { ApiError } from '../utils/ApiError';
import { asyncHandler } from '../utils/asyncHandler';

export const statsRouter = Router();
statsRouter.use(requireAuth);

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

/**
 * @openapi
 * /stats/daily:
 *   get:
 *     tags: [Stats]
 *     summary: 일별 칼로리 통계
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: date
 *         schema: { type: string, format: date }
 *     responses:
 *       200:
 *         description: date, consumed_calories, burned_calories, goal_calories, bakeries_visited
 *       404:
 *         description: 사용자 없음
 */
// GET /api/stats/daily — legacy/ppangkal.md §12.8
statsRouter.get(
  '/daily',
  asyncHandler(async (req, res) => {
    const date = req.query.date ? new Date(String(req.query.date)) : new Date();
    const from = startOfDay(date);
    const to = endOfDay(date);

    const user = await prisma.user.findUnique({ where: { id: req.userId } });
    if (!user) throw ApiError.notFound('사용자를 찾을 수 없습니다.');

    const [foodLogs, tours] = await Promise.all([
      prisma.foodLog.findMany({ where: { userId: req.userId, loggedAt: { gte: from, lte: to } } }),
      prisma.tour.findMany({
        where: { userId: req.userId, completedAt: { gte: from, lte: to } },
        include: { stops: true },
      }),
    ]);

    const consumedCalories = foodLogs.reduce((sum, log) => sum + log.calories * log.quantity, 0);
    const burnedCalories = tours.reduce((sum, tour) => sum + (tour.totalCaloriesBurned ?? 0), 0);
    const bakeriesVisited = new Set(tours.flatMap((tour) => tour.stops.map((stop) => stop.bakeryId))).size;

    res.json({
      date: from.toISOString().slice(0, 10),
      consumed_calories: consumedCalories,
      burned_calories: burnedCalories,
      goal_calories: user.dailyGoalCalories,
      bakeries_visited: bakeriesVisited,
    });
  }),
);

/**
 * @openapi
 * /stats/weekly:
 *   get:
 *     tags: [Stats]
 *     summary: 주간 칼로리 통계 (최근 7일)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: to
 *         schema: { type: string, format: date }
 *     responses:
 *       200:
 *         description: days[], goal_achievement_rate
 *       404:
 *         description: 사용자 없음
 */
// GET /api/stats/weekly — legacy/ppangkal.md §12.8
statsRouter.get(
  '/weekly',
  asyncHandler(async (req, res) => {
    const to = req.query.to ? new Date(String(req.query.to)) : new Date();
    const from = startOfDay(new Date(to.getTime() - 6 * 24 * 60 * 60 * 1000));

    const user = await prisma.user.findUnique({ where: { id: req.userId } });
    if (!user) throw ApiError.notFound('사용자를 찾을 수 없습니다.');

    const [foodLogs, tours] = await Promise.all([
      prisma.foodLog.findMany({ where: { userId: req.userId, loggedAt: { gte: from, lte: endOfDay(to) } } }),
      prisma.tour.findMany({ where: { userId: req.userId, completedAt: { gte: from, lte: endOfDay(to) } } }),
    ]);

    const days: { date: string; consumed_calories: number; burned_calories: number }[] = [];
    for (let i = 0; i < 7; i += 1) {
      const day = new Date(from.getTime() + i * 24 * 60 * 60 * 1000);
      const dayStart = startOfDay(day);
      const dayEnd = endOfDay(day);

      const consumed = foodLogs
        .filter((log) => log.loggedAt >= dayStart && log.loggedAt <= dayEnd)
        .reduce((sum, log) => sum + log.calories * log.quantity, 0);
      const burned = tours
        .filter((tour) => tour.completedAt && tour.completedAt >= dayStart && tour.completedAt <= dayEnd)
        .reduce((sum, tour) => sum + (tour.totalCaloriesBurned ?? 0), 0);

      days.push({ date: dayStart.toISOString().slice(0, 10), consumed_calories: consumed, burned_calories: burned });
    }

    const daysUnderGoal = days.filter((day) => day.consumed_calories - day.burned_calories <= user.dailyGoalCalories).length;

    res.json({ days, goal_achievement_rate: Math.round((daysUnderGoal / 7) * 100) });
  }),
);
