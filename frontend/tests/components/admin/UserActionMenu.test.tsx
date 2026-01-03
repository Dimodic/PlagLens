/**
 * Tests for UserActionMenu.
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { screen, fireEvent, waitFor } from '@testing-library/dom';
import { MantineProvider } from '@mantine/core';
import { theme } from '@/theme';
import { UserActionMenu } from '@/components/admin/UserActionMenu';
import type { UserDetail } from '@/api/endpoints/users';

const user: UserDetail = {
  id: 'usr_1',
  email: 'a@hse.ru',
  display_name: 'Alice',
  avatar_url: null,
  global_role: 'student',
  tenant_id: 't1',
  status: 'active',
  locale: 'ru',
  timezone: null,
  created_at: '2026-01-01T00:00:00Z',
  last_login_at: null,
  email_verified_at: null,
  anonymized_at: null,
};

function renderMenu(handlers: Parameters<typeof UserActionMenu>[0]) {
  return render(
    <MantineProvider theme={theme} defaultColorScheme="light">
      <UserActionMenu {...handlers} />
    </MantineProvider>,
  );
}

describe('UserActionMenu', () => {
  it('renders trigger button', () => {
    renderMenu({ user });
    expect(
      screen.getByRole('button', { name: /Действия: Alice/i }),
    ).toBeInTheDocument();
  });

  it('shows menu items when opened', async () => {
    const onView = vi.fn();
    const onResetPassword = vi.fn();
    renderMenu({ user, onView, onResetPassword });
    fireEvent.click(screen.getByRole('button', { name: /Действия: Alice/i }));
    await waitFor(() => {
      expect(screen.getByText('Открыть')).toBeInTheDocument();
      expect(screen.getByText('Сбросить пароль')).toBeInTheDocument();
    });
  });

  it('shows "Заблокировать" for active users', async () => {
    renderMenu({ user, onDisable: () => {} });
    fireEvent.click(screen.getByRole('button', { name: /Действия: Alice/i }));
    await waitFor(() => {
      expect(screen.getByText('Заблокировать')).toBeInTheDocument();
    });
  });

  it('shows "Разблокировать" for disabled users', async () => {
    renderMenu({
      user: { ...user, status: 'disabled' },
      onEnable: () => {},
    });
    fireEvent.click(screen.getByRole('button', { name: /Действия: Alice/i }));
    await waitFor(() => {
      expect(screen.getByText('Разблокировать')).toBeInTheDocument();
    });
  });

  it('calls onAnonymize when red item clicked', async () => {
    const onAnonymize = vi.fn();
    renderMenu({ user, onAnonymize });
    fireEvent.click(screen.getByRole('button', { name: /Действия: Alice/i }));
    await waitFor(() => {
      expect(screen.getByText(/Анонимизировать/)).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText(/Анонимизировать/));
    expect(onAnonymize).toHaveBeenCalledWith(user);
  });
});
