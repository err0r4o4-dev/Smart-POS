import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LanguageProvider, useLanguage } from '../../app/language';
import { HelpPage } from './HelpPage';

function HelpHarness() {
  const { setLanguage } = useLanguage();
  return (
    <>
      <button onClick={() => setLanguage('en')}>English</button>
      <HelpPage />
    </>
  );
}

describe('store help', () => {
  it('shows store guidance, switches language and excludes developer instructions', () => {
    localStorage.setItem('smartpos.language', 'th');
    const { container } = render(
      <LanguageProvider>
        <HelpHarness />
      </LanguageProvider>,
    );
    expect(
      screen.getByRole('heading', { name: 'คู่มือใช้งานร้าน' }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'English' }));
    expect(
      screen.getByRole('heading', { name: 'Store help' }),
    ).toBeInTheDocument();
    expect(container.textContent).not.toMatch(
      /npm|localhost|Docker|developer|repository|[\u0e01-\u0e3a\u0e40-\u0e5b]/i,
    );
  });
});
