import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Package } from 'lucide-react';
import { LanguageProvider } from '../../app/language';
import { StandardKpiCard, StandardKpiGrid } from './StandardPage';

describe('StandardKpiGrid', () => {
  it('automatically sets columns to match the number of children', () => {
    const { container } = render(
      <LanguageProvider>
        <StandardKpiGrid label="KPIs">
          <StandardKpiCard icon={<Package />} label="Card 1" value="10" />
          <StandardKpiCard icon={<Package />} label="Card 2" value="20" />
          <StandardKpiCard icon={<Package />} label="Card 3" value="30" />
        </StandardKpiGrid>
      </LanguageProvider>,
    );

    const section = container.querySelector('section');
    expect(section).toHaveClass('sales-kpi-grid');
    expect(section).toHaveClass('sales-kpi-grid-cols-3');
    expect(section?.style.getPropertyValue('--kpi-grid-cols')).toBe('3');
  });

  it('respects explicit columns prop override', () => {
    const { container } = render(
      <LanguageProvider>
        <StandardKpiGrid columns={4} label="KPIs">
          <StandardKpiCard icon={<Package />} label="Card 1" value="10" />
          <StandardKpiCard icon={<Package />} label="Card 2" value="20" />
          <StandardKpiCard icon={<Package />} label="Card 3" value="30" />
        </StandardKpiGrid>
      </LanguageProvider>,
    );

    const section = container.querySelector('section');
    expect(section).toHaveClass('sales-kpi-grid-cols-4');
    expect(section?.style.getPropertyValue('--kpi-grid-cols')).toBe('4');
  });

  it('renders subtext inside sales-kpi-trend', () => {
    render(
      <LanguageProvider>
        <StandardKpiCard
          icon={<Package />}
          label="Menu"
          value="15 รายการ"
          subtext="แค็ตตาล็อกร่วมขององค์กร"
        />
      </LanguageProvider>,
    );

    const subtextEl = screen.getByText('แค็ตตาล็อกร่วมขององค์กร');
    expect(subtextEl).toBeInTheDocument();
    expect(subtextEl.closest('.sales-kpi-trend')).toBeInTheDocument();
  });
});
