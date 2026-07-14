import {
  calculateCaloriesBurned,
  calculateDailyGoalCalories,
  resolveBalanceStatus,
} from '../calorieService';

describe('calculateCaloriesBurned', () => {
  it('applies the formula from ppangkal.md §2.3: 70kg, walk, 12min', () => {
    // 3.5 × 70 × 0.2 × 1.05 = 51.45 -> 51. Note: ppangkal.md's own worked example
    // text says "51.5kcal" / "약 52kcal", but that doesn't match its own formula —
    // we follow the formula, not the doc's rounded display text.
    const result = calculateCaloriesBurned(70, 'walk', 12);
    expect(result.metValue).toBe(3.5);
    expect(result.caloriesBurned).toBe(51);
  });

  it('uses the bike MET value', () => {
    const result = calculateCaloriesBurned(70, 'bike', 30);
    expect(result.metValue).toBe(6.8);
    expect(result.caloriesBurned).toBe(250);
  });

  it('uses the bus MET value', () => {
    const result = calculateCaloriesBurned(70, 'bus', 30);
    expect(result.metValue).toBe(1.3);
    expect(result.caloriesBurned).toBe(48);
  });
});

describe('calculateDailyGoalCalories', () => {
  it('applies the male Harris-Benedict formula with the 관광 multiplier', () => {
    const goal = calculateDailyGoalCalories({
      gender: 'male',
      weightKg: 70,
      heightCm: 175,
      age: 29,
      activityLevel: '관광',
    });
    // BMR = 66 + 13.7*70 + 5*175 - 6.8*29 = 1702.8; * 1.375 = 2341.35
    expect(goal).toBe(2341);
  });

  it('throws on an unknown activity level', () => {
    expect(() =>
      calculateDailyGoalCalories({
        gender: 'female',
        weightKg: 60,
        heightCm: 165,
        age: 25,
        activityLevel: 'unknown',
      }),
    ).toThrow();
  });
});

describe('resolveBalanceStatus', () => {
  it('returns green at or above 30% remaining', () => {
    expect(resolveBalanceStatus(900, 2000)).toBe('green');
  });

  it('returns yellow between 10% and 30% remaining', () => {
    expect(resolveBalanceStatus(300, 2000)).toBe('yellow');
  });

  it('returns red under 10% remaining or over budget', () => {
    expect(resolveBalanceStatus(100, 2000)).toBe('red');
    expect(resolveBalanceStatus(-50, 2000)).toBe('red');
  });
});
