// tests/recurrence.test.js
// Expansao de recorrencia: matematica de calendario pura, sem banco e sem fuso.
// E aqui que moram as bordas que o roadmap exige provar.

const { expandDueDates, validateRecurrence, EXPANSION_LIMIT } = require('../services/recurrence');
const { todayInZone, overdueCutoff, addDays } = require('../services/time');

function dates(recurrence, from, to) {
  return expandDueDates(recurrence, { from, to });
}

describe('frequencia diaria', () => {
  it('gera todos os dias da janela', () => {
    expect(dates({ frequency: 'diaria', startDate: '2025-03-01' }, '2025-03-01', '2025-03-04')).toEqual([
      '2025-03-01',
      '2025-03-02',
      '2025-03-03',
      '2025-03-04',
    ]);
  });

  it('respeita o intervalo', () => {
    expect(
      dates({ frequency: 'diaria', interval: 3, startDate: '2025-03-01' }, '2025-03-01', '2025-03-10')
    ).toEqual(['2025-03-01', '2025-03-04', '2025-03-07', '2025-03-10']);
  });
});

describe('frequencia semanal', () => {
  it('gera apenas o dia da semana escolhido', () => {
    expect(
      dates({ frequency: 'semanal', weekdays: [6], startDate: '2025-03-01' }, '2025-03-01', '2025-03-15')
    ).toEqual(['2025-03-01', '2025-03-08', '2025-03-15']);
  });

  it('aceita mais de um dia da semana, em ordem cronologica', () => {
    expect(
      dates({ frequency: 'semanal', weekdays: [4, 1], startDate: '2025-03-03' }, '2025-03-03', '2025-03-14')
    ).toEqual(['2025-03-03', '2025-03-06', '2025-03-10', '2025-03-13']);
  });

  it('intervalo 2 vira quinzenal', () => {
    expect(
      dates({ frequency: 'semanal', interval: 2, weekdays: [6], startDate: '2025-03-01' }, '2025-03-01', '2025-04-30')
    ).toEqual(['2025-03-01', '2025-03-15', '2025-03-29', '2025-04-12', '2025-04-26']);
  });

  it('nao gera nada antes da data de inicio', () => {
    expect(
      dates({ frequency: 'semanal', weekdays: [1], startDate: '2025-12-01' }, '2025-01-01', '2025-11-30')
    ).toEqual([]);
  });
});

describe('frequencia mensal', () => {
  it('dia 31 cai no ultimo dia dos meses que nao tem 31', () => {
    // Este e o comportamento que o RRULE (BYMONTHDAY) NAO tem: ele pularia fevereiro
    // e abril. E a razao de a expansao ser propria.
    expect(
      dates({ frequency: 'mensal', dayOfMonth: 31, startDate: '2025-01-31' }, '2025-01-01', '2025-04-30')
    ).toEqual(['2025-01-31', '2025-02-28', '2025-03-31', '2025-04-30']);
  });

  it('dia 31 cai em 29 de fevereiro no ano bissexto', () => {
    expect(
      dates({ frequency: 'mensal', dayOfMonth: 31, startDate: '2024-01-31' }, '2024-02-01', '2024-02-29')
    ).toEqual(['2024-02-29']);
  });

  it('atravessa a virada de ano', () => {
    expect(
      dates({ frequency: 'mensal', dayOfMonth: 10, startDate: '2025-11-10' }, '2025-11-01', '2026-02-28')
    ).toEqual(['2025-11-10', '2025-12-10', '2026-01-10', '2026-02-10']);
  });

  it('sem dayOfMonth, usa o dia da data de inicio', () => {
    expect(
      dates({ frequency: 'mensal', startDate: '2025-01-15' }, '2025-01-01', '2025-03-31')
    ).toEqual(['2025-01-15', '2025-02-15', '2025-03-15']);
  });
});

describe('frequencia anual', () => {
  it('29 de fevereiro cai em 28 nos anos nao bissextos', () => {
    expect(
      dates({ frequency: 'anual', startDate: '2024-02-29' }, '2024-01-01', '2027-12-31')
    ).toEqual(['2024-02-29', '2025-02-28', '2026-02-28', '2027-02-28']);
  });
});

describe('frequencia ocasional', () => {
  it('gera uma unica data', () => {
    expect(
      dates({ frequency: 'ocasional', startDate: '2025-07-05' }, '2025-01-01', '2025-12-31')
    ).toEqual(['2025-07-05']);
  });
});

describe('limites da expansao', () => {
  it('respeita endDate', () => {
    expect(
      dates({ frequency: 'diaria', startDate: '2025-03-01', endDate: '2025-03-03' }, '2025-03-01', '2025-03-31')
    ).toEqual(['2025-03-01', '2025-03-02', '2025-03-03']);
  });

  it('respeita a janela pedida (from no meio da serie)', () => {
    expect(
      dates({ frequency: 'diaria', startDate: '2025-01-01' }, '2025-06-10', '2025-06-12')
    ).toEqual(['2025-06-10', '2025-06-11', '2025-06-12']);
  });

  it('nunca devolve mais que o limite de seguranca', () => {
    const resultado = dates({ frequency: 'diaria', startDate: '2000-01-01' }, '2000-01-01', '2100-01-01');

    expect(resultado).toHaveLength(EXPANSION_LIMIT);
  });

  it('frequencia desconhecida devolve lista vazia', () => {
    expect(dates({ frequency: 'a_cada_lua_cheia', startDate: '2025-01-01' }, '2025-01-01', '2025-12-31')).toEqual([]);
  });
});

describe('validateRecurrence', () => {
  it('exige dias da semana no semanal', () => {
    expect(validateRecurrence({ frequency: 'semanal', startDate: '2025-01-01' })).toHaveLength(1);
    expect(validateRecurrence({ frequency: 'semanal', weekdays: [1], startDate: '2025-01-01' })).toEqual([]);
  });

  it('recusa endDate anterior ao inicio', () => {
    expect(
      validateRecurrence({ frequency: 'diaria', startDate: '2025-05-01', endDate: '2025-01-01' })
    ).toHaveLength(1);
  });
});

describe('fuso horario da casa', () => {
  it('o dia da casa nao e o dia do servidor em UTC', () => {
    // 02:00 UTC do dia 10 ainda e dia 9 em Sao Paulo (UTC-3).
    const instante = new Date('2025-07-10T02:00:00.000Z');

    expect(todayInZone('America/Sao_Paulo', instante)).toBe('2025-07-09');
    expect(todayInZone('UTC', instante)).toBe('2025-07-10');
  });

  it('sem tolerancia, so o que ja passou do dia vence', () => {
    const instante = new Date('2025-07-10T02:00:00.000Z');

    // Em Sao Paulo ainda e dia 9: a ocorrencia de hoje (9) nao esta atrasada.
    expect(overdueCutoff('America/Sao_Paulo', 0, instante)).toBe('2025-07-08');
    expect(overdueCutoff('America/Sao_Paulo', 24, instante)).toBe('2025-07-07');
  });

  it('addDays atravessa mes e ano bissexto', () => {
    expect(addDays('2025-02-28', 1)).toBe('2025-03-01');
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29');
    expect(addDays('2025-01-01', -1)).toBe('2024-12-31');
  });
});
