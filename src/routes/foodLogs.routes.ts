import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { ApiError } from '../utils/ApiError';
import { asyncHandler } from '../utils/asyncHandler';

export const foodLogsRouter = Router();
foodLogsRouter.use(requireAuth);

// POST /api/food-logs — ppangkal.md §12.7
foodLogsRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const {
      bread_item_id: breadItemId,
      route_id: routeId,
      quantity = 1,
      photo_url: photoUrl = null,
    } = req.body as { bread_item_id?: string; route_id?: string | null; quantity?: number; photo_url?: string | null };

    if (!breadItemId) throw ApiError.badRequest('bread_item_id는 필수 값입니다.');

    const breadItem = await prisma.breadItem.findUnique({ where: { id: breadItemId } });
    if (!breadItem) throw ApiError.notFound('빵 메뉴를 찾을 수 없습니다.');

    const foodLog = await prisma.foodLog.create({
      data: {
        userId: req.userId!,
        breadItemId,
        routeId: routeId ?? undefined,
        calories: breadItem.calories,
        quantity,
        photoUrl,
      },
    });

    res.status(201).json({
      id: foodLog.id,
      bread_item_id: foodLog.breadItemId,
      route_id: foodLog.routeId,
      calories: foodLog.calories,
      quantity: foodLog.quantity,
      logged_at: foodLog.loggedAt,
    });
  }),
);

// GET /api/food-logs — ppangkal.md §12.7
foodLogsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const from = req.query.from ? new Date(String(req.query.from)) : new Date(new Date().setHours(0, 0, 0, 0));
    const to = req.query.to ? new Date(String(req.query.to)) : new Date();

    const foodLogs = await prisma.foodLog.findMany({
      where: { userId: req.userId, loggedAt: { gte: from, lte: to } },
      orderBy: { loggedAt: 'desc' },
    });

    res.json({
      food_logs: foodLogs.map((log) => ({
        id: log.id,
        bread_item_id: log.breadItemId,
        route_id: log.routeId,
        calories: log.calories,
        quantity: log.quantity,
        photo_url: log.photoUrl,
        logged_at: log.loggedAt,
      })),
    });
  }),
);
