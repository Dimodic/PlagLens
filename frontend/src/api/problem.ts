/**
 * RFC 7807 Problem helpers.
 * - parseProblem: extract a Problem from any axios error / response body
 * - showProblemNotification: surface it via Mantine notifications
 */
import type { AxiosError } from 'axios';
import type { Problem } from './types';

const DEFAULT_PROBLEM: Problem = {
  title: 'Произошла ошибка',
  status: 0,
  code: 'UNKNOWN',
};

export function parseProblem(input: unknown): Problem {
  // axios error?
  if (input && typeof input === 'object' && 'isAxiosError' in input) {
    const err = input as AxiosError<unknown>;
    const data = err.response?.data;
    if (data && typeof data === 'object') {
      const maybe = data as Partial<Problem> & Record<string, unknown>;
      if (typeof maybe.code === 'string' && typeof maybe.title === 'string') {
        const merged: Problem = {
          ...DEFAULT_PROBLEM,
          ...(maybe as Problem),
        };
        if (typeof merged.status !== 'number' || !merged.status) {
          merged.status = err.response?.status ?? 0;
        }
        return merged;
      }
    }
    if (err.code === 'ERR_NETWORK') {
      return {
        ...DEFAULT_PROBLEM,
        status: 0,
        code: 'NETWORK_ERROR',
        title: 'Нет соединения с сервером',
        detail: err.message,
      };
    }
    return {
      ...DEFAULT_PROBLEM,
      status: err.response?.status ?? 0,
      code: 'HTTP_ERROR',
      title: err.message || 'Ошибка запроса',
    };
  }
  // raw object
  if (input && typeof input === 'object') {
    const maybe = input as Partial<Problem>;
    if (typeof maybe.code === 'string' && typeof maybe.title === 'string') {
      return { ...DEFAULT_PROBLEM, ...(maybe as Problem) };
    }
  }
  if (input instanceof Error) {
    return { ...DEFAULT_PROBLEM, title: input.message, code: 'CLIENT_ERROR' };
  }
  return DEFAULT_PROBLEM;
}

/** Human-readable summary for toasts/alerts. */
export function problemMessage(p: Problem): string {
  if (p.detail) return p.detail;
  if (p.errors && p.errors.length > 0) {
    return p.errors.map((e) => `${e.field}: ${e.message}`).join('; ');
  }
  return p.title;
}

/**
 * Toasts are disabled product-wide, so this no longer pops a notification —
 * it just logs the Problem for debugging. Errors surface inline (ProblemAlert)
 * at the place the action happened. Kept async + same signature so existing
 * callers don't change.
 */
export async function showProblemNotification(p: Problem): Promise<void> {
  console.error('[Problem]', p.code, p.title, problemMessage(p));
}
