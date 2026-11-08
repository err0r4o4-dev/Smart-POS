import { fireEvent, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { useLanguage } from '../../app/language';
import { render } from '../../test/render';
import { QueryFeedback } from './QueryFeedback';

it('switches error guidance without losing the retry action', () => {
  const retry = vi.fn();
  const error = new Error('ข้อมูลสถานะชำระเงินไม่ถูกต้อง');
  function FeedbackHarness() {
    const { setLanguage } = useLanguage();
    return (
      <>
        <button onClick={() => setLanguage('en')}>English</button>
        <QueryFeedback loading={false} error={error} retry={retry} />
      </>
    );
  }
  render(<FeedbackHarness />);
  expect(screen.getByRole('alert')).toHaveTextContent(
    'ตรวจสอบสถานะชำระเงินไม่ได้',
  );
  fireEvent.click(screen.getByRole('button', { name: 'English' }));
  expect(screen.getByRole('alert')).toHaveTextContent(
    'Could not verify payment status. Check the order status before trying again.',
  );
  expect(screen.getByRole('alert')).not.toHaveTextContent(error.message);
  fireEvent.click(screen.getByRole('button', { name: 'Try loading again' }));
  expect(retry).toHaveBeenCalledOnce();
});
