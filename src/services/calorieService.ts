import type { TransportMode } from '@prisma/client';

// ppangkal.md §2.3: 이동 수단별 고정 MET 값
export const FIXED_MET: Record<TransportMode, number> = {
  walk: 3.5,
  bike: 6.8,
  bus: 1.3,
};

// ppangkal.md §2.1: 활동량 계수
const ACTIVITY_MULTIPLIERS: Record<string, number> = {
  '여행 휴식': 1.2,
  관광: 1.375,
  도보여행: 1.55,
};

export interface CalorieBurnResult {
  metValue: number;
  caloriesBurned: number;
}

// 소모 칼로리(kcal) = 고정 MET × 체중(kg) × 시간(h) × 1.05
export function calculateCaloriesBurned(
  weightKg: number,
  mode: TransportMode,
  durationMinutes: number,
): CalorieBurnResult {
  const metValue = FIXED_MET[mode];
  const hours = durationMinutes / 60;
  const caloriesBurned = Math.round(metValue * weightKg * hours * 1.05);
  return { metValue, caloriesBurned };
}

export function resolveActivityMultiplier(activityLevel: string): number {
  const multiplier = ACTIVITY_MULTIPLIERS[activityLevel];
  if (multiplier === undefined) {
    throw new Error(
      `알 수 없는 activity_level입니다: ${activityLevel} (허용값: ${Object.keys(ACTIVITY_MULTIPLIERS).join(', ')})`,
    );
  }
  return multiplier;
}

// Harris-Benedict 공식 기반 일일 목표 칼로리
export function calculateDailyGoalCalories(params: {
  gender: 'male' | 'female';
  weightKg: number;
  heightCm: number;
  age: number;
  activityLevel: string;
}): number {
  const { gender, weightKg, heightCm, age, activityLevel } = params;

  const bmr =
    gender === 'male'
      ? 66 + 13.7 * weightKg + 5 * heightCm - 6.8 * age
      : 655 + 9.6 * weightKg + 1.8 * heightCm - 4.7 * age;

  const multiplier = resolveActivityMultiplier(activityLevel);
  return Math.round(bmr * multiplier);
}

export type CalorieBalanceStatus = 'green' | 'yellow' | 'red';

export function resolveBalanceStatus(remainingCalories: number, goalCalories: number): CalorieBalanceStatus {
  if (goalCalories <= 0) return 'red';
  const remainingRatio = remainingCalories / goalCalories;
  if (remainingRatio >= 0.3) return 'green';
  if (remainingRatio >= 0.1) return 'yellow';
  return 'red';
}
