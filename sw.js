// Service worker do BoraHapp (PWA): cache leve de estáticos; API sempre na rede.
//
// POR QUE A VERSAO MUDOU PARA v2 (08/11/2026)
//
// O `fetch` terminava assim:
//
//     .catch(() => caches.match(e.request))
//
// `caches.match` resolve para **undefined** quando o arquivo nao esta no cache, e
// `respondWith(undefined)` nao e "deixa o navegador seguir": o navegador ABORTA a requisicao com
// ERR_FAILED. O cache guarda dois arquivos de proposito (o css e o icone), entao qualquer pagina
// HTML caia nesse buraco.
//
// Medido em producao em 08/11/2026: depois dos dias em que o servidor esteve fora, o painel no
// Edge do dono dava "Hum... Nao consigo chegar a esta pagina / ERR_FAILED" em
// https://borahapp.com.br/login.html -- com o servidor respondendo 200 e outro navegador, na mesma
// maquina e mesma rede, abrindo a pagina inteira. A falha de rede de ontem virou falha dura de
// hoje, e a mensagem culpava o site.
//
// Agora: cache so responde quando REALMENTE tem o arquivo. Nao tendo, o erro ORIGINAL da rede e
// propagado -- o navegador mostra a propria tela de offline, que diz a verdade e sai sozinha
// quando a rede volta.
//
// O nome do cache subiu para v2 para que o `activate` apague o `borahapp-v1`, que pode conter
// paginas gravadas enquanto o servidor estava doente.
const CACHE = 'borahapp-v2';
const ESTATICOS = ['/assets/css/styles.css?v=20260623', '/assets/img/icone-bora.svg'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ESTATICOS)).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.pathname.startsWith('/api') || url.pathname.startsWith('/auth')
      || url.pathname.startsWith('/public') || url.pathname.startsWith('/admin-bora')) {
    return; // API: sempre rede (dados ao vivo)
  }
  // Navegacao (abrir uma pagina) NUNCA sai do cache: pagina gravada enquanto o servidor estava
  // doente reapareceria depois, e o lojista veria tela velha achando que e a de agora.
  if (e.request.mode === 'navigate') return;

  // estáticos: rede primeiro, cache como fallback (offline básico)
  e.respondWith(
    fetch(e.request).then(r => {
      if (r.ok && url.origin === location.origin) {
        const cp = r.clone();
        caches.open(CACHE).then(c => c.put(e.request, cp)).catch(() => {});
      }
      return r;
    }).catch(async (erroDaRede) => {
      const doCache = await caches.match(e.request);
      if (doCache) return doCache;
      // Sem copia: propaga o erro REAL. Devolver undefined aqui era o que virava ERR_FAILED.
      throw erroDaRede;
    })
  );
});
