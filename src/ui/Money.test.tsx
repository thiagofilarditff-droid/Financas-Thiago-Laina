import { render } from '@testing-library/react';
import { expect, test } from 'vitest';
import Money from './Money';

test('formats cents in pt-BR', () => {
  const { container } = render(<Money cents={1183524} />);
  expect(container.textContent).toBe('11.835,24');
});
test('symbol form', () => {
  const { container } = render(<Money cents={1183524} symbol />);
  expect(container.textContent).toBe('R$ 11.835,24');
});
test('negative', () => {
  const { container } = render(<Money cents={-60000} />);
  expect(container.textContent).toBe('-600,00');
});
