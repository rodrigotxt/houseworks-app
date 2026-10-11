// lib/domain/api/index.ts
// A fachada unica sobre a API. Quem consome escreve:
//
//   const api = createApiClient({ baseUrl });
//   await api.tasks.list(householdId, { status: 'active' });

import { createTransport, type ApiClientOptions } from './client';
import { authResource } from './resources/auth';
import { executionsResource } from './resources/executions';
import { householdsResource } from './resources/households';
import { occurrencesResource } from './resources/occurrences';
import { statsResource } from './resources/stats';
import { tasksResource } from './resources/tasks';

export function createApiClient(options: ApiClientOptions) {
  const transport = createTransport(options);

  return {
    auth: authResource(transport),
    households: householdsResource(transport),
    tasks: tasksResource(transport),
    occurrences: occurrencesResource(transport),
    executions: executionsResource(transport),
    stats: statsResource(transport),
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;

export { ApiError, isApiError } from './errors';
export { buildQuery } from './client';
export type { ApiClientOptions } from './client';
export * from './types';
