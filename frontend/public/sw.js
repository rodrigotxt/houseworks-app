// public/sw.js
// Service worker — o mínimo para o app ser instalável e não abrir em branco sem rede.
//
// Escrito à mão de propósito: a estratégia de cache deste app é simples e explícita, e
// uma ferramenta de build de service worker seria mais uma peça para manter.
//
// O que ele NÃO faz: cachear resposta da API. A API vive em outra origem, então nem
// passa por aqui — e é bom que não passe: dado de tarefa velho é pior que dado ausente.

const VERSAO = 'houseworks-v1';
const ESSENCIAIS = ['/', '/offline', '/manifest.webmanifest'];

self.addEventListener('install', (evento) => {
  evento.waitUntil(
    caches.open(VERSAO).then((cache) => cache.addAll(ESSENCIAIS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (evento) => {
  // Descarta caches de versões anteriores.
  evento.waitUntil(
    caches
      .keys()
      .then((chaves) => Promise.all(chaves.filter((c) => c !== VERSAO).map((c) => caches.delete(c))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (evento) => {
  const requisicao = evento.request;

  // Só GET da própria origem: POST/PATCH de tarefa nunca pode ser servido do cache.
  if (requisicao.method !== 'GET') return;
  if (new URL(requisicao.url).origin !== self.location.origin) return;

  const url = new URL(requisicao.url);

  // Arquivos com hash no nome são imutáveis: cache primeiro, rede depois.
  if (url.pathname.startsWith('/_next/static/')) {
    evento.respondWith(
      caches.match(requisicao).then(
        (emCache) =>
          emCache ||
          fetch(requisicao).then((resposta) => {
            const copia = resposta.clone();
            caches.open(VERSAO).then((cache) => cache.put(requisicao, copia));
            return resposta;
          })
      )
    );
    return;
  }

  // Navegação: rede primeiro (o dado é do servidor), cache como rede de segurança.
  if (requisicao.mode === 'navigate') {
    evento.respondWith(
      fetch(requisicao)
        .then((resposta) => {
          const copia = resposta.clone();
          caches.open(VERSAO).then((cache) => cache.put(requisicao, copia));
          return resposta;
        })
        .catch(() => caches.match(requisicao).then((emCache) => emCache || caches.match('/offline')))
    );
  }
});
