import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { ApiError } from '../utils/ApiError';
import { asyncHandler } from '../utils/asyncHandler';

export const foodLogsRouter = Router();
foodLogsRouter.use(requireAuth);

/**
 * @openapi
 * /food-logs:
 *   post:
 *     tags: [FoodLogs]
 *     summary: 섭취 기록 생성
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [bread_item_id]
 *             properties:
 *               bread_item_id: { type: string }
 *               tour_stop_id: { type: string, nullable: true }
 *               quantity: { type: integer, default: 1 }
 *               photo_url: { type: string, nullable: true }
 *     responses:
 *       201:
 *         description: 생성된 섭취 기록
 *       400:
 *         description: bread_item_id 누락
 *       404:
 *         description: 빵 메뉴 또는 tour_stop_id를 찾을 수 없음
 */
// POST /api/food-logs — idea.md §2 7단계 (실제 섭취 시점에만 생성 — 예상치는 저장하지 않음)
foodLogsRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const {
      bread_item_id: breadItemId,
      tour_stop_id: tourStopId,
      quantity = 1,
      photo_url: photoUrl = null,
    } = req.body as {
      bread_item_id?: string;
      tour_stop_id?: string | null;
      quantity?: number;
      photo_url?: string | null;
    };

    if (!breadItemId) throw ApiError.badRequest('bread_item_id는 필수 값입니다.');

    const breadItem = await prisma.breadItem.findUnique({ where: { id: breadItemId } });
    if (!breadItem) throw ApiError.notFound('빵 메뉴를 찾을 수 없습니다.');

    if (tourStopId) {
      const tourStop = await prisma.tourStop.findUnique({ where: { id: tourStopId } });
      if (!tourStop) throw ApiError.notFound('tour_stop_id를 찾을 수 없습니다.');
    }

    const foodLog = await prisma.foodLog.create({
      data: {
        userId: req.userId!,
        breadItemId,
        tourStopId: tourStopId ?? undefined,
        calories: breadItem.calories,
        quantity,
        photoUrl,
      },
    });

    res.status(201).json({
      id: foodLog.id,
      bread_item_id: foodLog.breadItemId,
      tour_stop_id: foodLog.tourStopId,
      calories: foodLog.calories,
      quantity: foodLog.quantity,
      logged_at: foodLog.loggedAt,
    });
  }),
);

/**
 * @openapi
 * /food-logs:
 *   get:
 *     tags: [FoodLogs]
 *     summary: 섭취 기록 조회 (기간 필터)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: from
 *         schema: { type: string, format: date-time }
 *       - in: query
 *         name: to
 *         schema: { type: string, format: date-time }
 *     responses:
 *       200:
 *         description: 섭취 기록 목록
 */
// GET /api/food-logs — legacy/ppangkal.md §12.7
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
        tour_stop_id: log.tourStopId,
        calories: log.calories,
        quantity: log.quantity,
        photo_url: log.photoUrl,
        logged_at: log.loggedAt,
      })),
    });
  }),
);
