/**
 * TenantDashboardPage — uses /tenants/:id/dashboard via the user's own tenant.
 */
import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/dom';
import { renderWithProviders, adminUser } from '../../testHelpers';
import TenantDashboardPage from '@/pages/dashboard/TenantDashboardPage';

vi.mock('@/api/endpoints/reporting', () => ({
  reportingApi: {
    tenantDashboard: vi.fn().mockResolvedValue({
      tenant_id: 't_1',
      active_courses: 7,
      active_users_dau: 100,
      active_users_mau: 800,
      submissions_30d: 1200,
      ai_tokens_total_30d: 50000,
      ai_cost_total_30d: 2.5,
      plagiarism_runs_30d: 80,
      storage_used_bytes: 10 * 1024 * 1024 * 1024,
      generated_at: '2026-05-07T00:00:00Z',
    }),
    tenantIntegrationsHealth: vi.fn().mockResolvedValue([
      {
        integration: 'kafka',
        status: 'healthy',
        last_check_at: '2026-05-07T00:00:00Z',
      },
    ]),
  },
}));

describe('TenantDashboardPage', () => {
  it('renders KPI cards', async () => {
    renderWithProviders(<TenantDashboardPage />, { user: adminUser });
    expect(
      screen.getByRole('heading', { name: /Дашборд тенанта/ }),
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText('Активных курсов')).toBeInTheDocument();
      expect(screen.getByText('7')).toBeInTheDocument();
    });
  });

  it('renders integrations health list', async () => {
    renderWithProviders(<TenantDashboardPage />, { user: adminUser });
    await waitFor(() => {
      expect(screen.getByTestId('integration-kafka')).toBeInTheDocument();
    });
  });
});
