import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { ApiError } from '../utils/ApiError';
import { asyncHandler } from '../utils/asyncHandler';

export const usersRouter = Router();
usersRouter.use(requireAuth);

/**
 * @openapi
 * /users/me:
 *   get:
 *     tags: [Users]
 *     summary: 내 프로필 조회
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: 프로필 정보
 *       404:
 *         description: 사용자 없음
 */
// GET /api/users/me — legacy/ppangkal.md §12.2
usersRouter.get(
  '/me',
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findUnique({ where: { id: req.userId } });
    if (!user) throw ApiError.notFound('사용자를 찾을 수 없습니다.');

    res.json({
      id: user.id,
      name: user.name,
      gender: user.gender,
      age: user.age,
      height: user.height,
      weight: user.weight,
      activity_level: user.activityLevel,
      daily_goal_calories: user.dailyGoalCalories,
    });
  }),
);

/**
 * @openapi
 * /users/me:
 *   patch:
 *     tags: [Users]
 *     summary: 내 프로필 부분 수정 (체중/키/나이/활동량/목표 칼로리)
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               weight: { type: number }
 *               height: { type: number }
 *               age: { type: integer }
 *               activity_level: { type: string, enum: ['여행 휴식', '관광', '도보여행'] }
 *               daily_goal_calories: { type: integer }
 *     responses:
 *       200:
 *         description: 수정된 프로필
 */
// PATCH /api/users/me — 체중/활동량/목표 칼로리 등 부분 수정
usersRouter.patch(
  '/me',
  asyncHandler(async (req, res) => {
    const { weight, height, age, activity_level: activityLevel, daily_goal_calories: dailyGoalCalories } = req.body;

    const user = await prisma.user.update({
      where: { id: req.userId },
      data: {
        ...(weight !== undefined && { weight }),
        ...(height !== undefined && { height }),
        ...(age !== undefined && { age }),
        ...(activityLevel !== undefined && { activityLevel }),
        ...(dailyGoalCalories !== undefined && { dailyGoalCalories }),
      },
    });

    res.json({
      id: user.id,
      weight: user.weight,
      height: user.height,
      age: user.age,
      activity_level: user.activityLevel,
      daily_goal_calories: user.dailyGoalCalories,
    });
  }),
);
