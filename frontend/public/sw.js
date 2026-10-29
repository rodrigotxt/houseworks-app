// public/sw.js
// Service worker — o mínimo para o app ser instalável e não abrir em branco sem rede.
//
// Escrito à mão de propósito: a estratégia de cache deste app é simples e explícita, e
// uma ferramenta de build de service worker seria mais uma peça para manter.
//
// O que ele NÃO faz: cachear resposta da API. A API vive em outra origem, então nem
// passa por aqui — e é bom que não passe: dado de tarefa velho é pior que dado ausente.

const VERSAO = 'houseworks-v2';
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

// ---------------------------------------------------------------- push
//
// O serviço de push do navegador entrega o payload aqui, MESMO com o app fechado — é
// essa a razão de o lembrete funcionar num PWA instalado. O payload vem da API
// (services/channels.js) e é sempre JSON.
//
// Sem este handler o push chega e não aparece nada: o navegador exige que o service
// worker mostre uma notificação para cada evento (userVisibleOnly).

self.addEventListener('push', (evento) => {
  let dados = {};

  try {
    dados = evento.data ? evento.data.json() : {};
  } catch {
    dados = { title: 'HouseWorks', body: evento.data ? evento.data.text() : 'Você tem um lembrete.' };
  }

  const titulo = dados.title || 'HouseWorks';
  const corpo = dados.body || 'Você tem um lembrete.';

  evento.waitUntil(
    self.registration.showNotification(titulo, {
      body: corpo,
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      tag: dados.tag || 'houseworks-reminder',
      // Um lembrete de remédio merece insistir; o "tag" já substitui o anterior do
      // mesmo lembrete em vez de empilhar.
      renotify: true,
      data: {
        url: dados.url || '/reminders',
        reminderId: dados.reminderId || null,
      },
    })
  );
});

// Clique na notificação: reusa uma janela aberta do app quando existir; senão abre uma.
// Jogar o usuário numa segunda aba de um PWA instalado é ruído puro.
self.addEventListener('notificationclick', (evento) => {
  evento.notification.close();

  const destino = new URL(
    (evento.notification.data && evento.notification.data.url) || '/reminders',
    self.location.origin
  ).href;

  evento.waitUntil(
    (async () => {
      const janelas = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      });

      for (const janela of janelas) {
        if (janela.url.startsWith(self.location.origin)) {
          await janela.focus();
          if ('navigate' in janela) await janela.navigate(destino);
          return;
        }
      }

      await self.clients.openWindow(destino);
    })()
  );
});
