import { Router } from 'express';
import { signUserToken } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { calculateDailyGoalCalories } from '../services/calorieService';
import { ApiError } from '../utils/ApiError';
import { asyncHandler } from '../utils/asyncHandler';

export const authRouter = Router();

/**
 * @openapi
 * /auth/signup:
 *   post:
 *     tags: [Auth]
 *     summary: 회원가입
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, gender, age, height, weight, activity_level]
 *             properties:
 *               name: { type: string }
 *               gender: { type: string, example: F }
 *               age: { type: integer, example: 28 }
 *               height: { type: number, example: 162 }
 *               weight: { type: number, example: 55 }
 *               activity_level: { type: string, enum: ['여행 휴식', '관광', '도보여행'] }
 *     responses:
 *       201:
 *         description: 가입 성공, JWT 토큰 발급
 *       400:
 *         description: 필수 값 누락
 */
// POST /api/auth/signup — legacy/ppangkal.md §12.1
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

/**
 * @openapi
 * /auth/login:
 *   post:
 *     tags: [Auth]
 *     summary: 간편 로그인 (MVP, user_id 기반)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [user_id]
 *             properties:
 *               user_id: { type: string }
 *     responses:
 *       200:
 *         description: JWT 토큰 발급
 *       400:
 *         description: user_id 누락
 *       404:
 *         description: 사용자 없음
 */
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
