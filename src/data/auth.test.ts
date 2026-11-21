import { AuthApiError, AuthRetryableFetchError } from '@supabase/supabase-js';
import { CONNECTION_ERROR, CREDENTIALS_ERROR, signInErrorMessage } from './auth';

vi.mock('./supabase', () => ({ supabase: {} }));

test('wrong e-mail or password is reported as such', () => {
  expect(signInErrorMessage(new AuthApiError('Invalid login credentials', 400, 'invalid_credentials')))
    .toBe('E-mail ou senha incorretos.');
  expect(CREDENTIALS_ERROR).toBe('E-mail ou senha incorretos.');
});

test('network and server failures ask to check the connection', () => {
  expect(signInErrorMessage(new AuthRetryableFetchError('Failed to fetch', 0))).toBe(CONNECTION_ERROR);
  expect(signInErrorMessage(new AuthApiError('Internal error', 500, 'unexpected_failure'))).toBe(CONNECTION_ERROR);
  expect(signInErrorMessage(new TypeError('Failed to fetch'))).toBe(CONNECTION_ERROR);
  expect(CONNECTION_ERROR).toBe('Não consegui conectar. Verifique a internet e tente de novo.');
});
