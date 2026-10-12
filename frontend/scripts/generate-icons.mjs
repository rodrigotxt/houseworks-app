// scripts/generate-icons.mjs
// Gera a arte da marca: os icones do PWA e os do app de TV.
//
// Versionado para a arte ser reproduzivel: mudou a cor da marca, roda de novo em vez de
// alguem editar PNG a mao.
//
//   npm run gen:icons
//
// POR QUE A ARTE DO APP DE TV E GERADA AQUI, e nao dentro de tv/: o projeto de TV e Gradle,
// sem npm proprio — e o sharp ja vive aqui. Uma marca so, um gerador so.

import { mkdirSync, writeFileSync } from 'node:fs';
import sharp from 'sharp';

const MARCA = '#0f766e';
const BRANCO = '#ffffff';

/** O desenho do icone: um quadrado arredondado com um "visto". */
function svgIcone({ tamanho, mascara }) {
  // No maskable o sistema recorta a imagem (circulo, quadrado ou gota), entao o desenho
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
        fill="none" stroke="${BRANCO}" stroke-width="${tamanho * 0.11}"
        stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;
}

/**
 * O banner do app de TV: 320x180, formato fixo exigido pelo launcher do Android TV.
 *
 * Sem `android:banner` o app nao aparece direito na fileira de apps da TV — nao e enfeite,
 * e requisito. O visto fica a esquerda e o nome a direita, para a leitura bater com a dos
 * outros apps da fileira.
 */
function svgBanner() {
  const largura = 320;
  const altura = 180;
  const escala = 34;
  const cx = 64;
  const cy = altura / 2;

  const pontos = [
    [cx - escala * 0.85, cy - escala * 0.05],
    [cx - escala * 0.22, cy + escala * 0.6],
    [cx + escala * 0.9, cy - escala * 0.75],
  ];

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${largura}" height="${altura}" viewBox="0 0 ${largura} ${altura}">
  <rect width="${largura}" height="${altura}" fill="${MARCA}"/>
  <path d="M ${pontos[0][0]} ${pontos[0][1]} L ${pontos[1][0]} ${pontos[1][1]} L ${pontos[2][0]} ${pontos[2][1]}"
        fill="none" stroke="${BRANCO}" stroke-width="${escala * 0.42}"
        stroke-linecap="round" stroke-linejoin="round"/>
  <text x="120" y="102" font-family="DejaVu Sans, Liberation Sans, sans-serif"
        font-size="34" font-weight="bold" fill="${BRANCO}">HouseWorks</text>
</svg>`;
}

async function escrever(caminho, svg) {
  mkdirSync(caminho.slice(0, caminho.lastIndexOf('/')), { recursive: true });
  const png = await sharp(Buffer.from(svg)).png().toBuffer();
  writeFileSync(caminho, png);
  console.log('  ' + caminho + '  ' + png.length + ' bytes');
}

// ---- PWA ----
const alvos = [
  { arquivo: 'public/icons/icon-192.png', tamanho: 192, mascara: false },
  { arquivo: 'public/icons/icon-512.png', tamanho: 512, mascara: false },
  { arquivo: 'public/icons/icon-maskable-512.png', tamanho: 512, mascara: true },
  { arquivo: 'app/icon.png', tamanho: 512, mascara: false },
];

for (const alvo of alvos) {
  await escrever(alvo.arquivo, svgIcone(alvo));
}

// ---- app de TV ----
// As densidades que o Android procura. Cada aparelho escolhe a mais proxima da propria tela.
const densidades = [
  { pasta: 'mipmap-mdpi', tamanho: 48 },
  { pasta: 'mipmap-hdpi', tamanho: 72 },
  { pasta: 'mipmap-xhdpi', tamanho: 96 },
  { pasta: 'mipmap-xxhdpi', tamanho: 144 },
  { pasta: 'mipmap-xxxhdpi', tamanho: 192 },
];

const raizTv = '../tv/app/src/main/res';

for (const densidade of densidades) {
  await escrever(
    raizTv + '/' + densidade.pasta + '/ic_launcher.png',
    svgIcone({ tamanho: densidade.tamanho, mascara: false })
  );
}

// `drawable-xhdpi` e nao `drawable`: o guia de TV do Google pede o banner com 320x180 PIXELS
// em xhdpi, que e a densidade que os aparelhos de TV reportam. Numa pasta sem densidade o
// sistema trataria a imagem como mdpi e a esticaria — banner borrado numa tela grande, que
// e justamente onde ele aparece.
await escrever(raizTv + '/drawable-xhdpi/banner.png', svgBanner());

console.log('Arte gerada.');
