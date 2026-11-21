import { describe, expect, test } from 'vitest';
import { formatBRL, fromCents, parseBRL, toCents } from './money';

describe('money', () => {
  test('formatBRL', () => {
    expect(formatBRL(1183524)).toBe('11.835,24');
    expect(formatBRL(1183524, { symbol: true })).toBe('R$ 11.835,24');
    expect(formatBRL(-60000)).toBe('-600,00');
    expect(formatBRL(-60000, { symbol: true })).toBe('-R$ 600,00');
    expect(formatBRL(0)).toBe('0,00');
  });
  test('toCents / fromCents', () => {
    expect(toCents(2581.24)).toBe(258124);
    expect(fromCents(258124)).toBe(2581.24);
  });
  test('parseBRL', () => {
    expect(parseBRL('1.234,56')).toBe(123456);
    expect(parseBRL('1234,5')).toBe(123450);
    expect(parseBRL('-12,30')).toBe(-1230);
    expect(parseBRL('R$ 10')).toBe(1000);
    expect(parseBRL('abc')).toBeNull();
    expect(parseBRL('')).toBeNull();
  });
});
