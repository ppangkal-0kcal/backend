// idea.md §4: 도보만 추적한다 (GPS 속도 필터로 시속 20km 초과 구간은 걸음 집계에서 제외되므로
// 자전거/버스 MET는 더 이상 쓰이지 않는다).
export const WALK_MET_VALUE = 3.5;

// 도보 평균 4km/h — 실측 전 사전 안내(빵집 리스트 배지 등)에서 소요시간을 추정할 때 사용.
// 실제 투어 진행 중에는 클라이언트의 만보기/GPS 실측값으로 대체된다.
export const AVG_WALK_SPEED_M_PER_MIN = 4000 / 60;

// 직선거리 1.2km ≈ 실제 도보경로 1.5km 내외 (도로망 보정 계수 약 1.2~1.4배 감안) — idea.md §3.
// 이 거리 이내면 도보 이동을 적극 권장하고, 초과하면 도착 후 산책 제안으로 전환한다.
export const WALK_RECOMMEND_THRESHOLD_M = 1200;

export function estimateWalkMinutes(distanceM: number): number {
  return Math.round(distanceM / AVG_WALK_SPEED_M_PER_MIN);
}

// legacy/ppangkal.md §2.1: 활동량 계수
const ACTIVITY_MULTIPLIERS: Record<string, number> = {
  '여행 휴식': 1.2,
  관광: 1.375,
  도보여행: 1.55,
};

export interface CalorieBurnResult {
  metValue: number;
  caloriesBurned: number;
}

// 소모 칼로리(kcal) = 고정 MET(도보 3.5) × 체중(kg) × 시간(h) × 1.05
export function calculateCaloriesBurned(weightKg: number, durationMinutes: number): CalorieBurnResult {
  const hours = durationMinutes / 60;
  const caloriesBurned = Math.round(WALK_MET_VALUE * weightKg * hours * 1.05);
  return { metValue: WALK_MET_VALUE, caloriesBurned };
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
