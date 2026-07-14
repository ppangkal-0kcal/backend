import { Router } from 'express';
import { signUserToken } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { calculateDailyGoalCalories } from '../services/calorieService';
import { ApiError } from '../utils/ApiError';
import { asyncHandler } from '../utils/asyncHandler';

export const authRouter = Router();

// POST /api/auth/signup — ppangkal.md §12.1
authRouter.post(
  '/signup',
  asyncHandler(async (req, res) => {
    const { name, gender, age, height, weight, activity_level: activityLevel } = req.body;

    if (!name || !gender || !age || !height || !weight || !activityLevel) {
      throw ApiError.badRequest('name, gender, age, height, weight, activity_level은 필수 값입니다.');
    }

    const dailyGoalCalories = calculateDailyGoalCalories({ gender, weightKg: weight, heightCm: height, age, activityLevel });

    const user = await prisma.user.create({
      data: { name, gender, age, height, weight, activityLevel, dailyGoalCalories },
    });

    res.status(201).json({
      user: { id: user.id, name: user.name, daily_goal_calories: user.dailyGoalCalories },
      token: signUserToken(user.id),
    });
  }),
);

// POST /api/auth/login — MVP는 user_id 기반 간편 로그인 (정식 인증은 Phase 2)
authRouter.post(
  '/login',
  asyncHandler(async (req, res) => {
    const { user_id: userId } = req.body;
    if (!userId) throw ApiError.badRequest('user_id는 필수 값입니다.');

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw ApiError.notFound('사용자를 찾을 수 없습니다.');

    res.json({ token: signUserToken(user.id) });
  }),
);
