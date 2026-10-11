// lib/domain/api/types.ts
// Apelidos curtos sobre os tipos GERADOS do contrato (schema.d.ts).
//
// Ninguem escreve interface de API a mao aqui: se a API mudar, regenerar
// (npm run gen:api) e o TypeScript aponta todos os lugares afetados.

import type { components } from './schema';

type Schemas = components['schemas'];

// ---- erros ----
export type ErrorCode = Schemas['ErrorCode'];
export type ValidationIssue = Schemas['ValidationIssue'];
export type ApiErrorBody = Schemas['ErrorResponse'];

// ---- identidade ----
export type User = Schemas['User'];
export type UserRef = Schemas['UserRef'];

// ---- casa ----
export type Household = Schemas['Household'];
export type Membership = Schemas['Membership'];
export type InviteCode = Schemas['InviteCode'];

// ---- tarefa ----
export type Task = Schemas['Task'];
export type Recurrence = Schemas['Recurrence'];
export type Frequency = Recurrence['frequency'];
export type Difficulty = Task['difficulty'];
export type AssignmentStrategy = NonNullable<Task['assignmentStrategy']>;

// ---- ocorrencia ----
export type TaskOccurrence = Schemas['TaskOccurrence'];
export type OccurrenceStatus = TaskOccurrence['status'];

// ---- execucao ----
export type TaskExecution = Schemas['TaskExecution'];
export type ExecutionStatus = TaskExecution['status'];

// ---- desempenho ----
export type HouseholdStats = Schemas['HouseholdStats'];
export type MemberStats = Schemas['MemberStats'];
export type TaskStats = Schemas['TaskStats'];
export type LeaderboardEntry = Schemas['LeaderboardEntry'];
export type Score = Schemas['Score'];
export type Period = Score['period'];

// ---- corpo das requisicoes ----
export type RegisterRequest = Schemas['RegisterRequest'];
export type LoginRequest = Schemas['LoginRequest'];
export type CreateHouseholdRequest = Schemas['CreateHouseholdRequest'];
export type UpdateHouseholdRequest = Schemas['UpdateHouseholdRequest'];
export type JoinHouseholdRequest = Schemas['JoinHouseholdRequest'];
export type UpdateMemberRequest = Schemas['UpdateMemberRequest'];
export type CreateTaskRequest = Schemas['CreateTaskRequest'];
export type UpdateTaskRequest = Schemas['UpdateTaskRequest'];
export type CompleteOccurrenceRequest = Schemas['CompleteOccurrenceRequest'];
export type SkipOccurrenceRequest = Schemas['SkipOccurrenceRequest'];
export type RateExecutionRequest = Schemas['RateExecutionRequest'];

// ---- utilitarios ----
export type PageMeta = Schemas['PageMeta'];
export type HealthStatus = Schemas['HealthStatus'];

/** Envelope de sucesso com um recurso. */
export type Envelope<T> = { data: T };

/** Envelope de uma listagem paginada. */
export type Paged<T> = { data: T[]; meta: PageMeta };

/** O que as funcoes de listagem devolvem depois de desembrulhar o envelope. */
export type Page<T> = { items: T[]; meta: PageMeta };
