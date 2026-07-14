import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { ApiError } from '../utils/ApiError';
import { asyncHandler } from '../utils/asyncHandler';

export const usersRouter = Router();
usersRouter.use(requireAuth);

// GET /api/users/me — ppangkal.md §12.2
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
