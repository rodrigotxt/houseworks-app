// scripts/generate-icons.mjs
// Gera os ícones do PWA a partir de um SVG.
//
// Versionado para os ícones serem reproduzíveis: mudou a cor da marca, roda de novo em
// vez de alguém editar PNG à mão.
//
//   npm run gen:icons

import { mkdirSync, writeFileSync } from 'node:fs';
import sharp from 'sharp';

const MARCA = '#0f766e';
const CLAUDE = '#ffffff';

/** O desenho: um quadrado arredondado com um "visto". */
function svg({ tamanho, mascara }) {
  // No maskable o sistema recorta a imagem (círculo, quadrado ou gota), então o desenho
  // precisa caber na zona segura de 80% — e o fundo vai de borda a borda.
  const margem = mascara ? 0.22 : 0.16;
  const raio = mascara ? 0 : 0.22;
  const centro = tamanho / 2;
  const escala = tamanho * (0.5 - margem);

  const pontos = [
    [centro - escala * 0.85, centro - escala * 0.05],
    [centro - escala * 0.22, centro + escala * 0.6],
    [centro + escala * 0.9, centro - escala * 0.75],
  ];

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${tamanho}" height="${tamanho}" viewBox="0 0 ${tamanho} ${tamanho}">
  <rect width="${tamanho}" height="${tamanho}" rx="${tamanho * raio}" fill="${MARCA}"/>
  <path d="M ${pontos[0][0]} ${pontos[0][1]} L ${pontos[1][0]} ${pontos[1][1]} L ${pontos[2][0]} ${pontos[2][1]}"
        fill="none" stroke="${CLAUDE}" stroke-width="${tamanho * 0.11}"
        stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;
}

const alvos = [
  { arquivo: 'public/icons/icon-192.png', tamanho: 192, mascara: false },
  { arquivo: 'public/icons/icon-512.png', tamanho: 512, mascara: false },
  { arquivo: 'public/icons/icon-maskable-512.png', tamanho: 512, mascara: true },
  { arquivo: 'app/icon.png', tamanho: 512, mascara: false },
];

mkdirSync('public/icons', { recursive: true });

for (const alvo of alvos) {
  const png = await sharp(Buffer.from(svg(alvo))).png().toBuffer();
  writeFileSync(alvo.arquivo, png);
  console.log('  ' + alvo.arquivo + '  ' + alvo.tamanho + 'x' + alvo.tamanho + (alvo.mascara ? ' (maskable)' : ''));
}

console.log('Ícones gerados.');
