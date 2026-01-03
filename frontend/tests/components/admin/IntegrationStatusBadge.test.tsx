/**
 * Tests for IntegrationStatusBadge.
 */
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { screen } from '@testing-library/dom';
import { MantineProvider } from '@mantine/core';
import { theme } from '@/theme';
import { IntegrationStatusBadge } from '@/components/admin/IntegrationStatusBadge';

function renderBadge(status: 'active' | 'pending_auth' | 'disabled' | 'error') {
  return render(
    <MantineProvider theme={theme} defaultColorScheme="light">
      <IntegrationStatusBadge status={status} />
    </MantineProvider>,
  );
}

describe('IntegrationStatusBadge', () => {
  it('renders "активно" for active', () => {
    renderBadge('active');
    expect(screen.getByText('активно')).toBeInTheDocument();
  });

  it('renders "нужна авторизация" for pending_auth', () => {
    renderBadge('pending_auth');
    expect(screen.getByText('нужна авторизация')).toBeInTheDocument();
  });

  it('renders "отключено" for disabled', () => {
    renderBadge('disabled');
    expect(screen.getByText('отключено')).toBeInTheDocument();
  });

  it('renders "ошибка" for error', () => {
    renderBadge('error');
    expect(screen.getByText('ошибка')).toBeInTheDocument();
  });
});
