import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { screen } from '@testing-library/dom';
import { MantineProvider } from '@mantine/core';
import { UsageMeter } from '@/components/ai/UsageMeter';
import { theme } from '@/theme';

function withTheme(ui: React.ReactNode) {
  return (
    <MantineProvider theme={theme} defaultColorScheme="light">
      {ui}
    </MantineProvider>
  );
}

describe('<UsageMeter />', () => {
  it('shows percent of usage', () => {
    render(withTheme(<UsageMeter used={500} max={1000} unit="tokens" />));
    expect(screen.getByText('50.0%')).toBeInTheDocument();
  });

  it('renders without limit when max is null', () => {
    render(withTheme(<UsageMeter used={500} max={null} unit="tokens" />));
    expect(screen.getByText(/без лимита/)).toBeInTheDocument();
  });

  it('renders cost units with $/¢', () => {
    render(withTheme(<UsageMeter used={1.5} max={10} unit="cost" />));
    expect(screen.getByText('15.0%')).toBeInTheDocument();
  });

  it('renders label', () => {
    render(withTheme(<UsageMeter used={0} max={100} label="Bandwidth" />));
    expect(screen.getByText('Bandwidth')).toBeInTheDocument();
  });
});
