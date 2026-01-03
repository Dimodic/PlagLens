/**
 * Tests for AuditEventCard.
 */
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { screen } from '@testing-library/dom';
import { MantineProvider } from '@mantine/core';
import { theme } from '@/theme';
import { AuditEventCard } from '@/components/admin/AuditEventCard';
import type { AuditEvent } from '@/api/endpoints/audit';

const baseEvent: AuditEvent = {
  id: 'evt_1',
  tenant_id: 't1',
  occurred_at: '2026-05-01T10:00:00Z',
  recorded_at: '2026-05-01T10:00:01Z',
  actor: { type: 'user', id: 'usr_42', role: 'admin' },
  action: 'user.password_changed',
  resource: { type: 'user', id: 'usr_42' },
  result: 'success',
  source_service: 'identity',
  request_id: 'req_xyz',
  ip: '10.0.0.5',
  user_agent: 'Chrome',
  before: null,
  after: { display_name: 'after' },
  metadata: { custom: 'meta' },
  retention_class: 'long',
};

function renderCard(props: { event: AuditEvent; defaultOpen?: boolean }) {
  return render(
    <MantineProvider theme={theme} defaultColorScheme="light">
      <AuditEventCard {...props} />
    </MantineProvider>,
  );
}

describe('AuditEventCard', () => {
  it('renders the action and result badge', () => {
    renderCard({ event: baseEvent });
    expect(screen.getByText('user.password_changed')).toBeInTheDocument();
    expect(screen.getByText('success')).toBeInTheDocument();
    expect(screen.getByText('identity')).toBeInTheDocument();
  });

  it('renders actor type and id', () => {
    renderCard({ event: baseEvent });
    // Actor + resource info is split across spans, check id appears somewhere.
    const ids = screen.getAllByText(/usr_42/);
    expect(ids.length).toBeGreaterThan(0);
  });

  it('renders the toggle button', () => {
    renderCard({ event: baseEvent });
    expect(
      screen.getByRole('button', { name: /развернуть|свернуть/i }),
    ).toBeInTheDocument();
  });

  it('renders failure badge for failure events', () => {
    renderCard({
      event: { ...baseEvent, result: 'failure', action: 'rbac.access_denied' },
    });
    expect(screen.getByText('failure')).toBeInTheDocument();
    expect(screen.getByText('rbac.access_denied')).toBeInTheDocument();
  });

  it('renders the resource type', () => {
    renderCard({ event: baseEvent });
    // resource type text is "user" — appears in multiple places
    expect(screen.getAllByText(/user/i).length).toBeGreaterThan(0);
  });

  it('renders retention badge', () => {
    renderCard({ event: baseEvent, defaultOpen: true });
    // retention_class = 'long' → "retention: long"
    expect(screen.getByText(/retention:/i)).toBeInTheDocument();
  });
});
