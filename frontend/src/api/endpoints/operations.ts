/**
 * Operations — universal async resource.
 */
import api from '../client';
import type { Operation, Paginated } from '../types';
import { buildListParams, type ListParams } from '../pagination';

export const operationsApi = {
  list: (params: ListParams = {}) =>
    api
      .get<Paginated<Operation>>('/operations', { params: buildListParams(params) })
      .then((r) => r.data),
  get: (id: string) => api.get<Operation>(`/operations/${id}`).then((r) => r.data),
  cancel: (id: string) => api.post<void>(`/operations/${id}:cancel`).then((r) => r.data),
};
