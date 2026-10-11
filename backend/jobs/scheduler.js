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

// 03:00 no fuso da operacao: fora do horario de uso e depois da virada do dia.
const DEFAULT_SCHEDULE = '0 3 * * *';

let scheduled = null;

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
            ' marcadas como atrasadas em ' +
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

  return scheduled;
}

function stopScheduler() {
  if (scheduled) {
    scheduled.stop();
    scheduled = null;
  }
}

module.exports = { startScheduler, stopScheduler };
