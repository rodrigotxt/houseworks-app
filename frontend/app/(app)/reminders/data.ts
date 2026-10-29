// app/(app)/reminders/data.ts
// O que os formulários de lembrete precisam: membros, tarefas ativas e se o push existe.
//
// Uma função só, usada pela criação e pela edição — se a lista de opções mudar, muda
// num lugar.

import { serverApi } from '@/lib/session/server';
import type { MembroDoLembrete, TarefaDoLembrete } from '@/components/reminders/ReminderForm';

export interface ReminderFormOptions {
  members: MembroDoLembrete[];
  tasks: TarefaDoLembrete[];
  pushEnabled: boolean;
}

export async function loadReminderFormOptions(householdId: string): Promise<ReminderFormOptions> {
  const api = await serverApi();

  const [membros, tarefas, push] = await Promise.all([
    api.households.listMembers(householdId),
    api.tasks.list(householdId, { status: 'active', pageSize: 100 }),
    api.push.config(),
  ]);

  return {
    members: membros.map((membro) => ({
      id: membro.user.id,
      name: membro.user.name,
      role: membro.role,
    })),
    tasks: tarefas.items.map((tarefa) => ({ id: tarefa.id, name: tarefa.name })),
    pushEnabled: push.enabled,
  };
}
