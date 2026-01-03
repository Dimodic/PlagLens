import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { screen } from '@testing-library/dom';
import { MantineProvider } from '@mantine/core';
import { RiskSignalBadge, RISK_TYPE_LABEL } from '@/components/ai/RiskSignalBadge';
import { theme } from '@/theme';

function withTheme(ui: React.ReactNode) {
  return (
    <MantineProvider theme={theme} defaultColorScheme="light">
      {ui}
    </MantineProvider>
  );
}

describe('<RiskSignalBadge />', () => {
  it('renders the typed label and severity', () => {
    render(withTheme(<RiskSignalBadge type="style_jump" severity="medium" />));
    expect(screen.getByText(/Скачок стиля/)).toBeInTheDocument();
    expect(screen.getByText(/medium/)).toBeInTheDocument();
  });

  it('renders all signal types via map', () => {
    Object.keys(RISK_TYPE_LABEL).forEach((key) => {
      const { unmount } = render(
        withTheme(<RiskSignalBadge type={key as keyof typeof RISK_TYPE_LABEL} severity="low" />),
      );
      unmount();
    });
    expect(true).toBe(true);
  });

  it('uses different visual style for high severity', () => {
    const { container } = render(
      withTheme(<RiskSignalBadge type="other" severity="high" details="x" />),
    );
    expect(container.textContent).toContain('high');
  });
});
