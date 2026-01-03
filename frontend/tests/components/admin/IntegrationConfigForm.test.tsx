/**
 * Tests for IntegrationConfigForm.
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { screen, fireEvent } from '@testing-library/dom';
import { MantineProvider } from '@mantine/core';
import { theme } from '@/theme';
import {
  IntegrationConfigForm,
  type IntegrationConfigFormValues,
} from '@/components/admin/IntegrationConfigForm';
import type { IntegrationKind } from '@/api/endpoints/integrations';

function renderForm(
  kind: IntegrationKind,
  initial: Partial<IntegrationConfigFormValues> = {},
) {
  const value: IntegrationConfigFormValues = {
    display_name: 'Sample',
    course_id: null,
    settings: {},
    ...initial,
  };
  const onChange = vi.fn();
  const utils = render(
    <MantineProvider theme={theme} defaultColorScheme="light">
      <IntegrationConfigForm kind={kind} value={value} onChange={onChange} />
    </MantineProvider>,
  );
  return { onChange, ...utils };
}

describe('IntegrationConfigForm', () => {
  it('renders display name and course_id labels', () => {
    renderForm('stepik');
    expect(screen.getByText('Display name')).toBeInTheDocument();
    // "course_id" appears in label text — there could be multiple
    expect(screen.getAllByText(/course_id/i).length).toBeGreaterThan(0);
  });

  it('shows stepik-specific labels for kind=stepik', () => {
    renderForm('stepik');
    expect(screen.getByText('auth_method')).toBeInTheDocument();
    expect(screen.getByText('stepik_course_ids')).toBeInTheDocument();
    expect(screen.getByText(/import_only_after/)).toBeInTheDocument();
  });

  it('shows yandex_contest labels for kind=yandex_contest', () => {
    renderForm('yandex_contest');
    expect(screen.getByText(/oauth_token/)).toBeInTheDocument();
    expect(screen.getByText('contest_ids')).toBeInTheDocument();
  });

  it('shows telegram labels for kind=telegram', () => {
    renderForm('telegram');
    expect(screen.getByText('bot_username')).toBeInTheDocument();
    expect(screen.getByText('rate_limit_per_minute')).toBeInTheDocument();
  });

  it('emits change events when display name updates', () => {
    const { container, onChange } = renderForm('manual');
    // Find the first text input (display name).
    const inputs = container.querySelectorAll('input');
    const display = inputs[0] as HTMLInputElement;
    fireEvent.change(display, { target: { value: 'New name' } });
    expect(onChange).toHaveBeenCalled();
    const lastCall = onChange.mock.calls[onChange.mock.calls.length - 1][0];
    expect(lastCall.display_name).toBe('New name');
  });
});
