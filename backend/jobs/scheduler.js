// jobs/scheduler.js
// Agendador em processo (node-cron).
//
// O job e uma OTIMIZACAO, nao um requisito de correcao: as rotas de agenda fazem
// backfill antes de responder (services/occurrences.js). Se o container ficar parado,
// a primeira leitura reconstroi o que falta. Quando houver mais de uma replica, este
// job deve sair para um worker separado — senao N replicas fazem o mesmo trabalho
// (o que ainda e correto, gracas ao indice unico, apenas redundante).

const cron = require('node-cron');
const { runDailyJob } = require('../services/occurrences');
const { runReminderJob } = require('../services/reminders');

// 03:00 no fuso da operacao: fora do horario de uso e depois da virada do dia.
const DEFAULT_SCHEDULE = '0 3 * * *';

// Lembretes: de minuto em minuto. A janela de entrega e curta (10 min), entao um
// intervalo maior perderia avisos — e "tomar o remedio as 21h" nao pode chegar 21h40.
const DEFAULT_REMINDER_SCHEDULE = '* * * * *';

let scheduled = null;
let reminderJob = null;

function startScheduler() {
  if (scheduled) {
    return scheduled;
  }

  const expression = process.env.OCCURRENCES_CRON || DEFAULT_SCHEDULE;
  const timezone = process.env.TZ || 'America/Sao_Paulo';

  if (!cron.validate(expression)) {
    console.error('[scheduler] expressao cron invalida: ' + expression + ' — job nao agendado');
    return null;
  }

  scheduled = cron.schedule(
    expression,
    async () => {
      try {
        const summary = await runDailyJob();
        console.log(
          '[scheduler] ocorrencias: ' +
            summary.created +
            ' criadas, ' +
            summary.overdue +
            ' marcadas como atrasadas, ' +
            summary.autoApproved +
            ' execucoes auto-aprovadas em ' +
            summary.households +
            ' casa(s)'
        );
      } catch (error) {
        // Um job que morre em silencio e pior do que um job que falha alto.
        console.error('[scheduler] falha ao gerar ocorrencias:', error);
      }
    },
    { timezone }
  );

  console.log('[scheduler] geracao de ocorrencias agendada para "' + expression + '" (' + timezone + ')');

  const reminderExpression = process.env.REMINDERS_CRON || DEFAULT_REMINDER_SCHEDULE;

  if (!cron.validate(reminderExpression)) {
    console.error(
      '[scheduler] expressao cron de lembretes invalida: ' + reminderExpression + ' — job nao agendado'
    );
  } else {
    reminderJob = cron.schedule(
      reminderExpression,
      async () => {
        try {
          const summary = await runReminderJob();

          // Silencio quando nada aconteceu: um log por minuto, para sempre, e ruido.
          if (
            summary.delivered > 0 ||
            summary.skipped > 0 ||
            summary.cancelled > 0 ||
            summary.missed > 0 ||
            summary.failures > 0
          ) {
            console.log(
              '[scheduler] lembretes: ' +
                summary.delivered +
                ' entregues, ' +
                summary.skipped +
                ' pulados, ' +
                summary.cancelled +
                ' cancelados, ' +
                summary.missed +
                ' perdidos, ' +
                summary.failures +
                ' falhas'
            );
          }
        } catch (error) {
          console.error('[scheduler] falha ao despachar lembretes:', error);
        }
      },
      { timezone }
    );

    console.log(
      '[scheduler] despacho de lembretes agendado para "' + reminderExpression + '"'
    );
  }

  return scheduled;
}

function stopScheduler() {
  if (scheduled) {
    scheduled.stop();
    scheduled = null;
  }

  if (reminderJob) {
    reminderJob.stop();
    reminderJob = null;
  }
}

module.exports = { startScheduler, stopScheduler };
