import Swal from 'sweetalert2';
import { fireEvent, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { accountFailure, confirmFeedback, successFeedback } from './feedback';

afterEach(() => Swal.close());

it('renders notification titles as text, not HTML, without taking focus', async () => {
  const input = document.createElement('input');
  document.body.append(input);
  input.focus();
  successFeedback('<img src=x onerror=alert(1)>', 'Close notification');
  await vi.waitFor(() => expect(screen.getByRole('status')).toBeVisible());
  expect(Swal.getTitle()?.innerText).toBe('<img src=x onerror=alert(1)>');
  expect(Swal.getTitle()?.querySelector('img')).toBeNull();
  expect(input).toHaveFocus();
  input.remove();
});

it('cancels a meaningful confirmation without confirming an action', async () => {
  const result = confirmFeedback({
    title: 'Discard draft?',
    text: 'Unsaved draft changes will be lost.',
    confirmLabel: 'Discard draft',
    cancelLabel: 'Keep editing',
  });
  const cancel = await screen.findByRole('button', { name: 'Keep editing' });
  fireEvent.click(cancel);
  await expect(result).resolves.toBe(false);
});

it('does not expose arbitrary failure details', () => {
  expect(
    accountFailure(new Error('private host and credential'), true),
  ).not.toContain('private');
});
