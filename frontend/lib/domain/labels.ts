// lib/domain/labels.ts
// Texto em portugues para os valores do contrato.
//
// Fica no dominio (e nao dentro de um componente) para que web, TV e qualquer cliente
// futuro escrevam a mesma coisa. Nenhum destes valores vem da API: a API manda o codigo,
// quem traduz e o cliente.

import type {
  AssignmentStrategy,
  Difficulty,
  ErrorCode,
  ExecutionStatus,
  Frequency,
  OccurrenceStatus,
} from './api/types';
import type { Capability } from './rules';

export const WEEKDAY_LABELS = [
  'domingo',
  'segunda',
  'terça',
  'quarta',
  'quinta',
  'sexta',
  'sábado',
] as const;

export const WEEKDAY_SHORT = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'] as const;

export const FREQUENCY_LABELS: Record<Frequency, string> = {
  diaria: 'Diária',
  semanal: 'Semanal',
  mensal: 'Mensal',
  anual: 'Anual',
  ocasional: 'Uma vez',
};

export const DIFFICULTY_LABELS: Record<Difficulty, string> = {
  muito_facil: 'Muito fácil',
  facil: 'Fácil',
  medio: 'Média',
  dificil: 'Difícil',
  muito_dificil: 'Muito difícil',
};

export const OCCURRENCE_STATUS_LABELS: Record<OccurrenceStatus, string> = {
  pending: 'Pendente',
  done: 'Concluída',
  overdue: 'Atrasada',
  skipped: 'Pulada',
};

export const EXECUTION_STATUS_LABELS: Record<ExecutionStatus, string> = {
  pending_review: 'Aguardando avaliação',
  approved: 'Avaliada',
  auto_approved: 'Aprovada automaticamente',
};

export const ASSIGNMENT_LABELS: Record<AssignmentStrategy, string> = {
  fixed: 'Responsável fixo',
  rotate: 'Rodízio entre os membros',
};

export const ROLE_LABELS = {
  owner: 'Dono da casa',
  adult: 'Adulto',
  child: 'Criança',
} as const;

/** Apoio de cada papel, para quem esta decidindo qual aplicar. */
export const ROLE_HINTS: Record<keyof typeof ROLE_LABELS, string> = {
  owner: 'Administra a casa, os membros e o convite.',
  adult: 'Cria tarefas, escolhe quem faz e avalia. Não administra membros.',
  child: 'Executa o que foi designado e acompanha o próprio placar.',
};

/** O que cada capacidade permite, em uma linha. */
export const CAPABILITY_LABELS: Record<Capability, string> = {
  canManageTasks: 'Criar e editar tarefas',
  canAssign: 'Escolher quem faz cada tarefa',
  canRate: 'Avaliar o que os outros fizeram',
  canManageMembers: 'Administrar membros e convites',
};

/** Uma frase que descreve a regra — usada na lista de tarefas. */
export function describeRecurrence(recurrence: {
  frequency: Frequency;
  interval?: number | null;
  weekdays?: number[] | null;
  dayOfMonth?: number | null;
  startDate: string;
}): string {
  const intervalo = recurrence.interval ?? 1;
  const aCada = intervalo > 1 ? 'A cada ' + intervalo + ' ' : '';

  switch (recurrence.frequency) {
    case 'diaria':
      return intervalo === 1 ? 'Todos os dias' : 'A cada ' + intervalo + ' dias';

    case 'semanal': {
      const dias = (recurrence.weekdays ?? [])
        .slice()
        .sort((a, b) => a - b)
        .map((dia) => WEEKDAY_LABELS[dia]);

      if (dias.length === 0) return 'Semanal';
      if (intervalo === 1 && dias.length === 1) {
        return 'Toda ' + (dias[0] === 'domingo' || dias[0] === 'sábado' ? 'todo ' : '') + dias[0];
      }

      return aCada + 'semana' + (intervalo > 1 ? 's' : '') + ': ' + dias.join(', ');
    }

    case 'mensal':
      return recurrence.dayOfMonth
        ? 'Todo dia ' + recurrence.dayOfMonth
        : 'Todo mês no dia ' + recurrence.startDate.slice(8);

    case 'anual':
      return 'Uma vez por ano';

    case 'ocasional':
      return 'Uma vez só';

    default:
      return 'Recorrência personalizada';
  }
}

/**
 * Mensagem amigavel por CODIGO de erro.
 *
 * A API ja manda uma mensagem em portugues, mas o cliente decide pelo codigo — e e aqui
 * que essa decisao fica visivel: da para reescrever o texto sem tocar na API, e o mesmo
 * codigo pode ganhar um texto diferente por contexto.
 */
export const ERROR_MESSAGES: Partial<Record<ErrorCode, string>> = {
  VALIDATION_ERROR: 'Confira os campos destacados.',
  INVALID_CREDENTIALS: 'E-mail ou senha incorretos.',
  UNAUTHENTICATED: 'Sua sessão terminou. Entre novamente.',
  TOKEN_EXPIRED: 'Sua sessão terminou. Entre novamente.',
  TOKEN_INVALID: 'Sua sessão terminou. Entre novamente.',
  EMAIL_ALREADY_REGISTERED: 'Este e-mail já está em uso.',
  USERNAME_ALREADY_REGISTERED: 'Este nome de usuário já está em uso.',
  RATE_LIMITED: 'Muitas tentativas. Aguarde um instante.',
  NOT_HOUSEHOLD_MEMBER: 'Você não tem acesso a esta casa.',
  INSUFFICIENT_ROLE: 'Seu papel nesta casa não permite esta ação.',
  INVITE_CODE_INVALID: 'Código de convite inválido ou expirado.',
  DUPLICATE_MEMBER: 'Você já é membro desta casa.',
  LAST_OWNER_CANNOT_LEAVE: 'A casa precisa de pelo menos um responsável.',
  TASK_NOT_FOUND: 'Esta tarefa não existe mais.',
  OCCURRENCE_NOT_FOUND: 'Esta tarefa do dia não existe mais.',
  OCCURRENCE_ALREADY_COMPLETED: 'Alguém já marcou esta como feita.',
  OCCURRENCE_NOT_COMPLETED: 'Esta ainda não foi concluída.',
  OCCURRENCE_NOT_ASSIGNED_TO_YOU: 'Esta tarefa está designada a outra pessoa.',
  EXECUTION_NOT_FOUND: 'Este registro não existe mais.',
  EXECUTION_ALREADY_RATED: 'Alguém já avaliou esta tarefa.',
  CANNOT_RATE_OWN_EXECUTION: 'Você não pode avaliar o que você mesmo fez.',
  RATING_WINDOW_CLOSED: 'O prazo para avaliar esta tarefa passou.',
  ROUTE_NOT_FOUND: 'Não encontramos o que você procura.',
  INTERNAL_ERROR: 'Algo deu errado do nosso lado. Tente novamente.',
  SERVICE_UNAVAILABLE: 'O serviço está indisponível no momento.',
};

export function messageFor(code: ErrorCode, fallback: string): string {
  return ERROR_MESSAGES[code] ?? fallback;
}
