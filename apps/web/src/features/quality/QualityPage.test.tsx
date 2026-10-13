import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QualityPage } from './QualityPage';

const mocks = vi.hoisted(() => ({ request: vi.fn() }));

vi.mock('../../app/OrganizationProvider', () => ({
  useOrganization: () => ({
    context: {
      organization: { id: 'org-1' },
      permissions: [
        'quality.read',
        'quality.batch.create',
        'quality.batch.manage',
      ],
    },
    branchID: 'branch-1',
    can: () => true,
  }),
}));

vi.mock('../../app/AuthProvider', () => ({
  useAuth: () => ({
    state: { session: { user: { id: 'user-1' } } },
  }),
}));

vi.mock('../../lib/organization-api', () => ({
  organizationRequest: mocks.request,
}));

function renderQualityPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <QualityPage view="batches" />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('QualityPage pagination styling and alignment', () => {
  beforeEach(() => {
    mocks.request.mockReset();
    mocks.request.mockImplementation((path: string) => {
      if (path.includes('/products?status=ACTIVE')) {
        return Promise.resolve({
          items: [
            {
              id: 'p1',
              name: 'Product 1',
              variants: [
                { id: 'v1', sku: 'SKU-1', name: 'Variant 1', status: 'ACTIVE' },
              ],
            },
          ],
          total: 5,
        });
      }
      if (path.includes('/quality/lots')) {
        return Promise.resolve([]);
      }
      if (path.includes('/quality/batches')) {
        return Promise.resolve([
          {
            id: 'bal-1',
            quantity: '40.000',
            location_id: 'loc-1',
            variant_id: 'v1',
            sellable: true,
          },
          {
            id: 'bal-2',
            quantity: '30.000',
            location_id: 'loc-1',
            variant_id: 'v1',
            sellable: true,
          },
          {
            id: 'bal-3',
            quantity: '200.000',
            location_id: 'loc-1',
            variant_id: 'v1',
            sellable: true,
          },
        ]);
      }
      return Promise.resolve([]);
    });
  });

  it('renders top and bottom pagination matching catalog pagination format', async () => {
    renderQualityPage();

    // Verify pagination in VariantPickers
    await waitFor(() => {
      expect(screen.getAllByText('หน้า 1 / 1 • 5 รายการ')).toHaveLength(2);
    });

    // Verify bottom pagination matching Image 3 style
    await waitFor(() => {
      expect(screen.getByText('หน้า 1 / 1 • 3 รายการ')).toBeInTheDocument();
    });

    // Check previous & next buttons have button-secondary class and Thai labels
    const prevButtons = screen.getAllByRole('button', { name: 'ก่อนหน้า' });
    const nextButtons = screen.getAllByRole('button', { name: 'ถัดไป' });

    expect(prevButtons).toHaveLength(3);
    expect(nextButtons).toHaveLength(3);

    prevButtons.forEach((btn) => {
      expect(btn).toHaveClass('button-secondary');
      expect(btn).toBeDisabled();
    });

    nextButtons.forEach((btn) => {
      expect(btn).toHaveClass('button-secondary');
      expect(btn).toBeDisabled();
    });

    // Ensure raw bilingual labels from old design are gone
    expect(screen.queryByText('ก่อนหน้า / Previous')).not.toBeInTheDocument();
    expect(screen.queryByText('ถัดไป / Next')).not.toBeInTheDocument();
  });

  it('renders supply-picker pagination container with ordered controls', async () => {
    const { container } = renderQualityPage();

    await waitFor(() => {
      expect(screen.getAllByText('หน้า 1 / 1 • 5 รายการ')).toHaveLength(2);
    });

    const supplyPickers = container.querySelectorAll(
      '.supply-picker .catalog-pagination',
    );
    expect(supplyPickers.length).toBeGreaterThanOrEqual(1);

    supplyPickers.forEach((pickerPagination) => {
      const prev = pickerPagination.querySelector('button:first-of-type');
      const span = pickerPagination.querySelector('span');
      const next = pickerPagination.querySelector('button:last-of-type');

      expect(prev).toHaveTextContent('ก่อนหน้า');
      expect(span).toHaveTextContent('หน้า 1 / 1 • 5 รายการ');
      expect(next).toHaveTextContent('ถัดไป');
    });
  });

  it('places pagination below the lot fields inside variant picker', async () => {
    renderQualityPage();

    await waitFor(() => {
      expect(
        screen.getByText('บันทึก lot จริง / Record observed lot'),
      ).toBeInTheDocument();
    });

    const batchForm = screen
      .getByText('บันทึก lot จริง / Record observed lot')
      .closest('.card')
      ?.querySelector('form');
    expect(batchForm).toBeInTheDocument();

    const supplyPicker = batchForm?.querySelector('.supply-picker');
    expect(supplyPicker).toBeInTheDocument();

    const batchFields = supplyPicker?.querySelector('.loyalty-form');
    expect(batchFields).toBeInTheDocument();

    const pagination = supplyPicker?.querySelector('.catalog-pagination');
    expect(pagination).toBeInTheDocument();

    // Verify pagination is positioned AFTER the batch fields in the DOM
    expect(
      Boolean(
        batchFields &&
        pagination &&
        batchFields.compareDocumentPosition(pagination) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ),
    ).toBe(true);
  });
});
