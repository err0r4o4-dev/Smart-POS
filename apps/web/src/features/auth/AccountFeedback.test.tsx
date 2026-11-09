import { fireEvent, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';
import { renderInEnglish as render } from '../../test/render';
import { ForgotPasswordPage } from './AuthPages';

afterEach(() => vi.unstubAllGlobals());

it('uses account-safe recovery instructions instead of server-provided copy', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
    data: { message: 'private account detail' },
  }), { status: 202 })));
  render(<BrowserRouter><ForgotPasswordPage /></BrowserRouter>);
  fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'person@example.test' } });
  fireEvent.click(screen.getByRole('button', { name: 'Request reset link' }));
  expect(await screen.findByRole('status')).toHaveTextContent(/if an eligible account/i);
  expect(screen.queryByText(/private account detail/)).not.toBeInTheDocument();
});

it('explains rate limiting without exposing backend details or losing input', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
    error: { message: 'private account detail' },
  }), { status: 429 })));
  render(<BrowserRouter><ForgotPasswordPage /></BrowserRouter>);
  fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'person@example.test' } });
  fireEvent.click(screen.getByRole('button', { name: 'Request reset link' }));
  expect(await screen.findByRole('alert')).toHaveTextContent(/too many requests/i);
  expect(screen.queryByText(/private account detail/)).not.toBeInTheDocument();
  expect(screen.getByLabelText('Email address')).toHaveValue('person@example.test');
});
