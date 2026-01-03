/**
 * Pretty-print a USD cost amount.
 *
 *  $0.00012     → 0.012¢
 *  $0.012       → 1.2¢
 *  $0.12        → $0.12
 *  $1.234       → $1.23
 */
import type { ComponentProps } from 'react';

export function formatCost(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—';
  if (value === 0) return '$0';
  if (value < 0.001) {
    return `${(value * 100).toFixed(3)}¢`;
  }
  if (value < 0.1) {
    return `${(value * 100).toFixed(2)}¢`;
  }
  return `$${value.toFixed(value < 1 ? 3 : 2)}`;
}

interface CostFormatterProps extends ComponentProps<'span'> {
  value: number | null | undefined;
}

export function CostFormatter({ value, ...rest }: CostFormatterProps) {
  return <span {...rest}>{formatCost(value)}</span>;
}

export default CostFormatter;
