// lib/domain/rules.ts
// As regras da API, espelhadas no cliente.
//
// PARA QUE SERVE: esconder ou desabilitar o que nao pode ser feito, para o usuario nao
// bater numa parede. NAO E SEGURANCA — a API valida tudo de novo e continua sendo a
// unica autoridade. Se estas funcoes e a API divergirem, quem manda e a API.
//
// Manter em sincronia com services/executions.js do backend.

import type { Difficulty, Household, Membership, TaskExecution, TaskOccurrence } from './api/types';

export type Capability = 'canAssign' | 'canRate' | 'canManageTasks' | 'canManageMembers';

/** Pontuacao derivada da dificuldade — espelho de utils/points.js. */
export const POINTS_BY_DIFFICULTY: Record<Difficulty, number> = {
  muito_facil: 1,
  facil: 2,
  medio: 3,
  dificil: 5,
  muito_dificil: 8,
};

export function pointsForDifficulty(difficulty: Difficulty): number {
  return POINTS_BY_DIFFICULTY[difficulty] ?? 0;
}

export function hasCapability(
  membership: Membership | undefined | null,
  capability: Capability
): boolean {
  return membership?.capabilities?.[capability] === true;
}

export function findMembership(
  memberships: Membership[] | undefined,
  householdId: string
): Membership | undefined {
  return memberships?.find((membership) => membership.householdId === householdId);
}

// ---- tarefas ----

export function canCreateTask(membership?: Membership | null): boolean {
  return hasCapability(membership, 'canManageTasks');
}

export function canEditTask(membership?: Membership | null, task?: { createdBy?: { id: string } } | null, userId?: string): boolean {
  void task;
  void userId;
  return hasCapability(membership, 'canManageTasks');
}

export function canDeleteTaskForever(membership?: Membership | null): boolean {
  return membership?.role === 'owner';
}

export function canManageMembers(membership?: Membership | null): boolean {
  return membership?.role === 'owner';
}

export function canAssignTask(membership?: Membership | null): boolean {
  return hasCapability(membership, 'canAssign');
}

// ---- ocorrencias ----

/**
 * Quem administra tarefas conclui qualquer ocorrencia; os demais, apenas as proprias ou
 * as que nao tem responsavel definido. Espelha assertCanComplete.
 */
export function canComplete(
  occurrence: Pick<TaskOccurrence, 'status' | 'assignedTo'>,
  membership?: Membership | null,
  userId?: string
): boolean {
  if (occurrence.status === 'done' || occurrence.status === 'skipped') return false;

  if (hasCapability(membership, 'canManageTasks')) return true;

  const responsavel = occurrence.assignedTo?.id ?? null;
  return responsavel === null || responsavel === userId;
}

export function canSkip(
  occurrence: Pick<TaskOccurrence, 'status'>,
  membership?: Membership | null
): boolean {
  return occurrence.status !== 'done' && hasCapability(membership, 'canManageTasks');
}

export function canUndoOccurrence(
  occurrence: Pick<TaskOccurrence, 'status'>,
  membership?: Membership | null
): boolean {
  // O dono desfaz a qualquer tempo; quem executou, apenas dentro da janela — e para
  // saber se foi ele, a tela precisa da execucao (GET /occurrences/:id/executions).
  return occurrence.status === 'done' && Boolean(membership);
}

// ---- execucao e avaliacao ----

/** Prazo de avaliacao: conclusao + ratingWindowHours da casa. */
export function ratingDeadline(household: Pick<Household, 'ratingWindowHours'>, execution: Pick<TaskExecution, 'completionDate'>): Date {
  return new Date(new Date(execution.completionDate).getTime() + household.ratingWindowHours * 3600_000);
}

export function isRatingWindowOpen(
  household: Pick<Household, 'ratingWindowHours'>,
  execution: Pick<TaskExecution, 'completionDate'>,
  now: Date = new Date()
): boolean {
  return ratingDeadline(household, execution) > now;
}

/**
 * A regra central do produto: quem executou nunca avalia a propria execucao — e so
 * avalia quem tem canRate, dentro da janela.
 */
export function canRateExecution(
  execution: Pick<TaskExecution, 'status' | 'executedBy' | 'completionDate'>,
  household: Pick<Household, 'ratingWindowHours'>,
  membership?: Membership | null,
  userId?: string,
  now: Date = new Date()
): boolean {
  if (execution.status !== 'pending_review') return false;
  if (execution.executedBy?.id === userId) return false;
  if (!hasCapability(membership, 'canRate')) return false;

  return isRatingWindowOpen(household, execution, now);
}

// ---- agenda ----

export function isOccurrenceOverdue(occurrence: Pick<TaskOccurrence, 'status'>): boolean {
  return occurrence.status === 'overdue';
}

export function isUnassigned(occurrence: Pick<TaskOccurrence, 'assignedTo'>): boolean {
  return occurrence.assignedTo === null;
}

export function belongsTo(occurrence: Pick<TaskOccurrence, 'assignedTo'>, userId?: string): boolean {
  return occurrence.assignedTo?.id === userId;
}

/** Progresso de um conjunto de ocorrencias — o resumo que o painel da TV mostra. */
export function completionProgress(occurrences: Pick<TaskOccurrence, 'status'>[]) {
  const total = occurrences.length;
  const done = occurrences.filter((o) => o.status === 'done').length;
  const late = occurrences.filter((o) => o.status === 'overdue').length;

  return { total, done, late, rate: total === 0 ? 0 : done / total };
}
