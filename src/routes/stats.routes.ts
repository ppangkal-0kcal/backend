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

// GET /api/stats/daily — ppangkal.md §12.8
statsRouter.get(
  '/daily',
  asyncHandler(async (req, res) => {
    const date = req.query.date ? new Date(String(req.query.date)) : new Date();
    const from = startOfDay(date);
    const to = endOfDay(date);

    const user = await prisma.user.findUnique({ where: { id: req.userId } });
    if (!user) throw ApiError.notFound('사용자를 찾을 수 없습니다.');

    const [foodLogs, routes] = await Promise.all([
      prisma.foodLog.findMany({ where: { userId: req.userId, loggedAt: { gte: from, lte: to } } }),
      prisma.route.findMany({ where: { userId: req.userId, completedAt: { gte: from, lte: to } } }),
    ]);

    const consumedCalories = foodLogs.reduce((sum, log) => sum + log.calories * log.quantity, 0);
    const burnedCalories = routes.reduce((sum, route) => sum + (route.caloriesBurned ?? 0), 0);
    const bakeriesVisited = new Set(routes.map((route) => route.bakeryId)).size;

    res.json({
      date: from.toISOString().slice(0, 10),
      consumed_calories: consumedCalories,
      burned_calories: burnedCalories,
      goal_calories: user.dailyGoalCalories,
      bakeries_visited: bakeriesVisited,
    });
  }),
);

// GET /api/stats/weekly — ppangkal.md §12.8
statsRouter.get(
  '/weekly',
  asyncHandler(async (req, res) => {
    const to = req.query.to ? new Date(String(req.query.to)) : new Date();
    const from = startOfDay(new Date(to.getTime() - 6 * 24 * 60 * 60 * 1000));

    const user = await prisma.user.findUnique({ where: { id: req.userId } });
    if (!user) throw ApiError.notFound('사용자를 찾을 수 없습니다.');

    const [foodLogs, routes] = await Promise.all([
      prisma.foodLog.findMany({ where: { userId: req.userId, loggedAt: { gte: from, lte: endOfDay(to) } } }),
      prisma.route.findMany({ where: { userId: req.userId, completedAt: { gte: from, lte: endOfDay(to) } } }),
    ]);

    const days: { date: string; consumed_calories: number; burned_calories: number }[] = [];
    for (let i = 0; i < 7; i += 1) {
      const day = new Date(from.getTime() + i * 24 * 60 * 60 * 1000);
      const dayStart = startOfDay(day);
      const dayEnd = endOfDay(day);

      const consumed = foodLogs
        .filter((log) => log.loggedAt >= dayStart && log.loggedAt <= dayEnd)
        .reduce((sum, log) => sum + log.calories * log.quantity, 0);
      const burned = routes
        .filter((route) => route.completedAt && route.completedAt >= dayStart && route.completedAt <= dayEnd)
        .reduce((sum, route) => sum + (route.caloriesBurned ?? 0), 0);

      days.push({ date: dayStart.toISOString().slice(0, 10), consumed_calories: consumed, burned_calories: burned });
    }

    const daysUnderGoal = days.filter((day) => day.consumed_calories - day.burned_calories <= user.dailyGoalCalories).length;

    res.json({ days, goal_achievement_rate: Math.round((daysUnderGoal / 7) * 100) });
  }),
);
