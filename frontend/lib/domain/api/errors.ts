// lib/domain/api/errors.ts
// O erro da API como objeto tipado.
//
// O cliente decide pelo CODE, nunca pelo texto da mensagem — a mensagem pode mudar
// (ou ser traduzida) sem quebrar ninguem.

import type { ApiErrorBody, ErrorCode, ValidationIssue } from './types';

export class ApiError extends Error {
  readonly status: number;
  readonly code: ErrorCode;
  readonly details: ValidationIssue[];
  /** Correlaciona com o log do servidor. Mostre numa tela de erro. */
  readonly requestId?: string;

  constructor(
    status: number,
    code: ErrorCode,
    message: string,
    details: ValidationIssue[] = [],
    requestId?: string
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
    this.requestId = requestId;
  }

  /** O corpo veio no formato do contrato? */
  static isErrorBody(value: unknown): value is ApiErrorBody {
    if (typeof value !== 'object' || value === null) return false;
    const corpo = value as Record<string, unknown>;
    return typeof corpo.error === 'object' && corpo.error !== null;
  }

  static fromBody(status: number, body: ApiErrorBody): ApiError {
    const { code, message, details, requestId } = body.error;
    return new ApiError(status, code, message, details ?? [], requestId);
  }

  /** Falha de rede, timeout, resposta que nao e JSON: nao ha codigo do catalogo. */
  static fromUnexpected(status: number, message: string): ApiError {
    return new ApiError(status, 'INTERNAL_ERROR' as ErrorCode, message);
  }

  /** A sessao acabou e o usuario precisa autenticar de novo. */
  get isSessionExpired(): boolean {
    return this.code === 'UNAUTHENTICATED' || this.code === 'TOKEN_INVALID' || this.code === 'TOKEN_EXPIRED';
  }

  /** Ele nao pode fazer isso (papel, casa, regra de negocio). */
  get isForbidden(): boolean {
    return (
      this.status === 403 ||
      this.code === 'INSUFFICIENT_ROLE' ||
      this.code === 'NOT_HOUSEHOLD_MEMBER' ||
      this.code === 'CANNOT_RATE_OWN_EXECUTION'
    );
  }

  /** Alguem chegou antes: recarregar resolve. */
  get isConflict(): boolean {
    return this.status === 409;
  }

  /** Erro por campo, pronto para um formulario. */
  issueFor(field: string): string | undefined {
    return this.details.find((issue) => issue.field === field)?.issue;
  }
}

export function isApiError(value: unknown): value is ApiError {
  return value instanceof ApiError;
}
