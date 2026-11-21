import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Sidebar from './Sidebar';

test('sidebar lists the five sections in order', () => {
  render(<MemoryRouter><Sidebar /></MemoryRouter>);
  expect(screen.getAllByRole('link').map(a => a.textContent)).toEqual(
    ['Painel', 'Mês a mês', 'Receitas e contracheques', 'Despesas', 'Cartões']);
});
