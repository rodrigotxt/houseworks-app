// lib/domain/api/resources/stats.ts

import type { Transport } from '../client';
import { unwrap } from '../client';
import type { Envelope, HouseholdStats, Period, Score } from '../types';

export interface Ranking {
  period: Period;
  from: string;
  to: string;
  entries: {
    position: number;
    user: { id: string; name: string; username: string };
    points: number;
    completed: number;
    onTimeRate: number;
  }[];
}

export interface WindowQuery {
  from?: string;
  to?: string;
}

export function statsResource(transport: Transport) {
  return {
    household(householdId: string, query: WindowQuery = {}) {
      return transport
        .request<Envelope<HouseholdStats>>('/households/' + householdId + '/stats', { query })
        .then(unwrap);
    },

    leaderboard(householdId: string, query: WindowQuery & { period?: Period } = {}) {
      return transport
        .request<Envelope<Ranking>>('/households/' + householdId + '/leaderboard', { query })
        .then(unwrap);
    },

    myScore(query: WindowQuery & { householdId: string; period?: Period }) {
      return transport.request<Envelope<Score>>('/me/score', { query }).then(unwrap);
    },
  };
}
