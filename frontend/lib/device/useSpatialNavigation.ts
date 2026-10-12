// lib/device/useSpatialNavigation.ts
// Liga as setas do controle remoto ao foco da pagina.
//
// SO NA TV. No computador e no celular as setas tem outro sentido (rolar a pagina, mover
// o cursor num campo) e assumir o controle delas atrapalharia. O hook so e montado quando
// o shell sabe que o aparelho e uma TV.

'use client';

import { useEffect } from 'react';

import { pickNext, type Box, type Direction } from './spatial';

/** Tudo em que o foco pode pousar. A ordem aqui nao importa: quem decide e a geometria. */
const SELETOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

const TECLAS: Record<string, Direction> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
};

/**
 * Visivel de verdade: `getClientRects` devolve vazio quando o elemento — ou qualquer
 * ancestral — esta com `display: none`. Conferir so o proprio elemento deixaria o foco
 * entrar em coisas dentro de um dialogo fechado.
 */
function visivel(elemento: HTMLElement): boolean {
  if (elemento.getClientRects().length === 0) return false;

  const estilo = getComputedStyle(elemento);
  return estilo.visibility !== 'hidden' && estilo.opacity !== '0';
}

/**
 * A seta deve chegar ao navegador em vez de mover o foco?
 *
 * Dentro de um campo de texto, esquerda e direita movem o cursor — roubar isso tornaria
 * o campo inutilizavel. Cima e baixo, num campo de UMA linha, nao fazem nada: por isso
 * eles continuam navegando, senao nao haveria como sair do formulario usando so o
 * controle remoto (nao existe Tab num controle).
 */
function pertenceAoCampo(elemento: Element | null, direcao: Direction): boolean {
  if (!elemento || !(elemento instanceof HTMLElement)) return false;

  if (elemento.isContentEditable) return true;
  if (elemento.tagName === 'TEXTAREA') return true;

  if (elemento.tagName === 'INPUT') {
    const tipo = elemento.getAttribute('type');
    if (tipo === 'checkbox' || tipo === 'radio') return false;
    return direcao === 'left' || direcao === 'right';
  }

  return false;
}

export function useSpatialNavigation(ativo: boolean) {
  useEffect(() => {
    if (!ativo) return;

    function aoTeclar(evento: KeyboardEvent) {
      const direcao = TECLAS[evento.key];
      if (!direcao) return;

      // Com modificador, a combinacao e do sistema (Alt+seta volta no historico, por
      // exemplo) — nao e navegacao de foco.
      if (evento.altKey || evento.ctrlKey || evento.metaKey || evento.shiftKey) return;

      if (pertenceAoCampo(document.activeElement, direcao)) return;

      const alvos = Array.from(document.querySelectorAll<HTMLElement>(SELETOR)).filter(visivel);
      if (alvos.length === 0) return;

      const atual = document.activeElement as HTMLElement | null;
      const indiceAtual = atual ? alvos.indexOf(atual) : -1;

      // Nada focado: a primeira seta ENTRA no painel, em vez de nao fazer nada. Numa TV
      // isso e a diferenca entre o controle funcionar e parecer quebrado.
      if (indiceAtual === -1) {
        evento.preventDefault();
        alvos[0].focus();
        alvos[0].scrollIntoView({ block: 'nearest', inline: 'nearest' });
        return;
      }

      const caixas: Box[] = alvos.map((elemento) => elemento.getBoundingClientRect());
      const proximo = pickNext(caixas[indiceAtual], caixas, direcao);

      // Nada naquela direcao: NAO consome a tecla. No fim da lista, a seta rola a pagina,
      // que e o comportamento esperado — em vez de nao acontecer nada.
      if (proximo === -1) return;

      evento.preventDefault();
      alvos[proximo].focus();
      alvos[proximo].scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }

    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  }, [ativo]);
}
