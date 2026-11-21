import { describe, expect, test } from 'vitest';
import { addMonths, compareMonth, currentMonth, dueDateFor, monthLabel, monthShort, monthsOfYear, toMonth } from './month';

describe('month', () => {
  test('addMonths crosses year boundaries', () => {
    expect(addMonths('2026-11', 3)).toBe('2027-02');
    expect(addMonths('2027-01', -1)).toBe('2026-12');
    expect(addMonths('2026-11', 0)).toBe('2026-11');
    expect(addMonths('2026-01', -13)).toBe('2024-12');
  });
  test('monthsOfYear', () => {
    expect(monthsOfYear(2026)).toHaveLength(12);
    expect(monthsOfYear(2026)[0]).toBe('2026-01');
    expect(monthsOfYear(2026)[11]).toBe('2026-12');
  });
  test('toMonth', () => {
    expect(toMonth('2026-11-21')).toBe('2026-11');
    expect(toMonth(new Date(2026, 10, 21))).toBe('2026-11');
  });
  test('compareMonth', () => {
    expect(compareMonth('2026-11', '2027-01')).toBeLessThan(0);
    expect(compareMonth('2027-01', '2026-11')).toBeGreaterThan(0);
    expect(compareMonth('2026-11', '2026-11')).toBe(0);
  });
  test('labels', () => {
    expect(monthLabel('2026-11')).toBe('Nov/2026');
    expect(monthShort('2026-11')).toBe('NOV');
    expect(monthShort('2026-03')).toBe('MAR');
  });
  test('dueDateFor clamps', () => {
    expect(dueDateFor('2027-02', 31)).toBe('2027-02-28');
    expect(dueDateFor('2028-02', 30)).toBe('2028-02-29');
    expect(dueDateFor('2026-11', 10)).toBe('2026-11-10');
    expect(dueDateFor('2026-11', 31)).toBe('2026-11-30');
  });
  test('currentMonth matches YYYY-MM', () => {
    expect(currentMonth()).toMatch(/^\d{4}-\d{2}$/);
  });
});
