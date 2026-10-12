// components/tv/FocoInicial.tsx
// Poe o foco no primeiro item assim que a tela abre — so na TV.
//
// Sem isto, a TV abre sem NENHUM destaque visivel: nao ha mouse passeando para revelar que
// a tela e interativa, e a primeira seta so parece funcionar por sorte. Um painel de parede
// parado e indistinguivel de um painel travado.
//
// Nao renderiza nada: existe so pelo efeito.

'use client';

import { useEffect } from 'react';

interface FocoInicialProps {
  /** Seletor do elemento que recebe o foco ao abrir. */
  seletor: string;
}

export default function FocoInicial({ seletor }: FocoInicialProps) {
  useEffect(() => {
    // Fora da TV, nao mexe: no computador o foco inicial atrapalharia quem usa o teclado,
    // e no celular nem existe.
    if (!document.documentElement.hasAttribute('data-tv')) return;

    const alvo = document.querySelector<HTMLElement>(seletor);

    // preventScroll: o item pode estar abaixo da dobra, e rolar a tela ate ele na abertura
    // esconderia o cabecalho. Quem rola e o usuario, ao andar com as setas.
    alvo?.focus({ preventScroll: true });
  }, [seletor]);

  return null;
}
