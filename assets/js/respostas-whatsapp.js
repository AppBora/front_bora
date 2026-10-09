// Respostas do WhatsApp — gera os textos que o lojista cola no aplicativo WhatsApp Business.
//
// Por que esta tela existe: o robô do Bora depende da Cloud API da Meta, que exige conta Meta
// Business, verificação do negócio e App Review — semanas de processo, e a Meta passa a cobrar por
// mensagem. Só que o aplicativo WhatsApp Business JÁ responde sozinho de graça (saudação, ausência e
// respostas rápidas). Para o caso principal — "manda o cardápio para quem chamar" — isso entrega o
// mesmo resultado hoje, sem API e sem custo. O que faltava era o texto com o link certo dentro.
//
// Nada aqui envia mensagem: a tela só escreve o texto. Quem cola e liga é o lojista, no aparelho dele.
(function () {
  if (!Bora.requireAuth()) return;

  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const DIAS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  // Semana começando na segunda: é como o lojista fala ("de segunda a sexta"), não como o banco guarda.
  const ORDEM = [1, 2, 3, 4, 5, 6, 0];

  /**
   * O horario que o servidor semeia quando a loja nunca mexeu: 7 dias, 18h as 23h, tudo aberto.
   *
   * <p>GET /api/horarios NAO devolve vazio — se nao houver nada, ele grava esse padrao e devolve.
   * Entao o ramo "loja sem horario cadastrado" nunca disparava, e a loja saia prometendo ao cliente
   * um horario que ninguem escolheu. Zira Centro e Zira Zona Norte estao exatamente assim.</p>
   */
  function ehOPadraoDoSistema(horarios) {
    if (!horarios || horarios.length !== 7) return false;
    return horarios.every(h => h.aberto !== false && h.abre === '18:00' && h.fecha === '23:00');
  }

  /** "18:00" -> "18h" ; "23:30" -> "23h30" ; "09:00" -> "9h". Ninguém escreve "09h" no WhatsApp. */
  function hora(h) {
    const m = /^(\d{1,2}):(\d{2})$/.exec(String(h || '').trim());
    if (!m) return String(h || '').trim();
    const hh = String(Number(m[1]));
    return m[2] === '00' ? hh + 'h' : hh + 'h' + m[2];
  }

  /**
   * Agrupa dias seguidos com o mesmo horário: "Seg a Sex 18h às 23h, Sáb e Dom 14h às 23h".
   * Sem isso o texto viraria sete linhas e não caberia num campo de WhatsApp.
   */
  function horarioLegivel(horarios) {
    const porDia = {};
    (horarios || []).forEach(h => { porDia[h.dia] = h; });

    const grupos = [];
    ORDEM.forEach(dia => {
      const h = porDia[dia];
      const abertoHoje = h && h.aberto !== false && h.abre && h.fecha;
      if (!abertoHoje) return;
      const faixa = hora(h.abre) + ' às ' + hora(h.fecha);
      const ultimo = grupos[grupos.length - 1];
      // Só emenda no grupo anterior se for o dia imediatamente seguinte NA ORDEM da semana.
      const seguido = ultimo && ORDEM.indexOf(dia) === ORDEM.indexOf(ultimo.fim) + 1;
      if (ultimo && ultimo.faixa === faixa && seguido) ultimo.fim = dia;
      else grupos.push({ inicio: dia, fim: dia, faixa: faixa });
    });

    if (!grupos.length) return null;
    return grupos.map(g => {
      const vao = g.inicio === g.fim ? DIAS[g.inicio]
        : (ORDEM.indexOf(g.fim) - ORDEM.indexOf(g.inicio) === 1
            ? DIAS[g.inicio] + ' e ' + DIAS[g.fim]
            : DIAS[g.inicio] + ' a ' + DIAS[g.fim]);
      return vao + ' ' + g.faixa;
    }).join(', ');
  }

  /**
   * Os textos. Curtos de propósito: os campos do WhatsApp Business têm limite e o cliente lê no
   * celular. Cada bloco diz onde colar, porque o caminho no aplicativo não é óbvio.
   */
  function montarTextos(nomeLoja, link, horario, temPix) {
    const blocos = [];

    blocos.push({
      id: 'saudacao',
      titulo: 'Mensagem de saudação',
      onde: 'Ferramentas comerciais → Mensagem de saudação',
      quando: 'Vai sozinha na primeira mensagem de um cliente novo, e depois de 14 dias sem conversa.',
      texto: 'Oi! 👋 Aqui é da ' + nomeLoja + '. Monte seu pedido no nosso cardápio, é rapidinho: ' + link
    });

    blocos.push({
      id: 'ausencia',
      titulo: 'Mensagem de ausência',
      onde: 'Ferramentas comerciais → Mensagem de ausência',
      quando: horario
        ? 'Vai sozinha quando alguém chama fora do horário. Configure o modo "Fora do horário de atendimento".'
        : 'Vai sozinha fora do horário. Como a loja ainda não tem horário cadastrado, o texto não promete hora nenhuma.',
      // Enxuto de propósito: com um horário de sete faixas, o texto anterior passava de 200
      // caracteres e arriscava ser cortado pelo campo do aplicativo.
      texto: horario
        ? 'Oi! Estamos fechados agora. Atendemos ' + horario + '. Já dá para escolher no cardápio: ' + link
        : 'Oi! Não estamos atendendo agora. Assim que abrirmos a gente te responde. Veja o cardápio: ' + link
    });

    const rapidas = [
      { atalho: 'cardapio', texto: 'Nosso cardápio está aqui: ' + link },
      {
        atalho: 'horario',
        texto: horario ? 'Atendemos ' + horario + '. Peça pelo cardápio: ' + link
                       : 'Me chame que eu confirmo o horário de hoje. O cardápio está aqui: ' + link
      },
      {
        atalho: 'pagamento',
        texto: temPix
          ? 'Você pode pagar por PIX na hora, direto no cardápio, ou pagar na entrega: ' + link
          : 'O pagamento é na entrega. Monte seu pedido pelo cardápio: ' + link
      }
    ];
    blocos.push({
      id: 'rapidas',
      titulo: 'Respostas rápidas',
      onde: 'Ferramentas comerciais → Respostas rápidas',
      quando: 'Você digita a barra e o atalho na conversa, e o WhatsApp completa o texto. Cadastre o atalho SEM a barra — o app põe a barra sozinho.',
      rapidas: rapidas
    });

    return blocos;
  }

  function caixaDeTexto(id, texto, rotulo) {
    const n = texto.length;
    // O contador existe porque os campos do WhatsApp Business têm limite e o lojista costuma editar
    // o texto depois de colar. Acima de 200 ele avisa, em vez de o app cortar na cara do cliente.
    const cor = n > 200 ? '#b91c1c' : '#64748b';
    const linhas = Math.min(8, Math.max(3, Math.ceil(n / 38))); // 3 linhas cortavam o link em 390px
    return `<textarea id="t-${id}" readonly rows="${linhas}" aria-label="${esc(rotulo)}"
        style="width:100%;font:inherit;font-size:14px;padding:10px;border:1px solid #e5e7eb;border-radius:10px;resize:vertical;background:#f8fafc">${esc(texto)}</textarea>
      <div style="display:flex;align-items:center;gap:10px;margin-top:8px;flex-wrap:wrap">
        <button class="btn" style="min-height:44px" onclick="__copiarResposta('t-${id}', this)">Copiar texto</button>
        <span id="st-t-${id}" role="status" aria-live="polite" style="font-size:12.5px;color:#065f46;font-weight:600"></span>
        <span style="font-size:12px;color:${cor}">${n} caracteres${n > 200 ? ' — pode ser longo demais para o campo' : ''}</span>
      </div>`;
  }

  // Renomeado de __copiar: cardapio-qr.js define outro __copiar com assinatura diferente, e o dia
  // em que as duas telas carregarem juntas um sobrescreve o outro.
  window.__copiarResposta = async (idCampo, botao) => {
    const el = document.getElementById(idCampo);
    if (!el) return;
    el.focus();
    el.setSelectionRange(0, el.value.length); // select() sozinho nao seleciona no iPhone

    let copiou = false;
    try {
      await navigator.clipboard.writeText(el.value);
      copiou = true;
    } catch (e) {
      // clipboard bloqueado: http, navegador dentro de aplicativo, permissao negada.
      try { copiou = document.execCommand('copy'); } catch (e2) { copiou = false; }
    }

    // O rotulo original fica no proprio botao: ler o texto atual fazia o clique duplo gravar
    // "✓ Copiado" como original, e o botao nunca mais voltava ao normal.
    if (!botao.dataset.rotulo) botao.dataset.rotulo = botao.textContent;
    clearTimeout(botao._volta);
    // Mentir aqui e pior que falhar: o lojista cola e nao vem nada.
    botao.textContent = copiou ? '✓ Copiado' : 'Selecionado — toque e segure para copiar';
    const status = document.getElementById('st-' + idCampo);
    if (status) status.textContent = copiou ? 'Texto copiado.' : 'Não consegui copiar: o texto está selecionado.';
    botao._volta = setTimeout(() => {
      botao.textContent = botao.dataset.rotulo;
      if (status) status.textContent = '';
    }, copiou ? 1600 : 4000);
  };

  function desenhar(blocos) {
    $('blocos').innerHTML = blocos.map(b => `
      <div class="panel">
        <h2>${esc(b.titulo)}</h2>
        <p style="color:#64748b;font-size:13px;margin:4px 0 2px"><b>No aplicativo:</b> ${esc(b.onde)}</p>
        <p style="color:#475569;font-size:13.5px;margin:2px 0 12px;max-width:68ch">${esc(b.quando)}</p>
        ${b.rapidas
          ? b.rapidas.map(r => `
              <div style="margin-bottom:16px">
                <div style="font-size:13px;font-weight:700;margin-bottom:5px">Atalho: <code style="background:#f1f5f9;padding:2px 7px;border-radius:5px">${esc(r.atalho)}</code></div>
                ${caixaDeTexto(b.id + '-' + r.atalho, r.texto, 'Resposta rápida: ' + r.atalho)}
              </div>`).join('')
          : caixaDeTexto(b.id, b.texto, b.titulo)}
      </div>`).join('');
  }

  async function carregar() {
    try {
      const cfg = await Bora.configuracao();
      const lojaId = cfg && cfg.lojaId;
      if (!lojaId) {
        $('aviso').innerHTML = `<div style="background:#fef3c7;border:1px solid #fcd34d;color:#92400e;border-radius:10px;padding:12px;margin-top:14px;font-size:14px">
          Entre em uma loja para gerar os textos. No seletor de loja, no topo da barra lateral.</div>`;
        return;
      }

      // O cardápio público é a fonte certa do nome e do PIX: é exatamente o que o cliente vê.
      const [pub, horarios] = await Promise.all([
        Bora.cardapioPublico(lojaId).catch(() => null),
        Bora.horarios().catch(() => [])
      ]);

      const nome = (pub && pub.loja && pub.loja.nome) || (cfg && cfg.nomeExibicao) || 'nossa loja';
      const temPix = !!(pub && pub.pixDisponivel);
      const padrao = ehOPadraoDoSistema(horarios);
      const horario = horarioLegivel(horarios);
      const link = location.origin + '/cardapio.html?loja=' + lojaId;

      const avisos = [];
      if (!horario) avisos.push('Esta loja não tem <b>horário de funcionamento</b> cadastrado, então os textos não prometem horário. Cadastre em <b>Ajustes Operação</b> e volte aqui que eu reescrevo.');
      else if (padrao) avisos.push('O horário abaixo (<b>' + esc(horario) + '</b>) é o <b>padrão do sistema</b>, não um horário que alguém escolheu. Confira em <b>Ajustes Operação</b> antes de colar — senão a sua loja promete ao cliente um horário que não é o dela.');
      if (!temPix) avisos.push('Esta loja ainda não recebe <b>PIX online</b>, então o texto de pagamento fala só em pagar na entrega.');
      $('aviso').innerHTML = avisos.length
        ? `<div style="background:#fef3c7;border:1px solid #fcd34d;color:#92400e;border-radius:10px;padding:12px;margin-top:14px;font-size:13.5px">
             ${avisos.map(a => '<div style="margin:3px 0">⚠ ' + a + '</div>').join('')}</div>`
        : '';

      desenhar(montarTextos(nome, link, horario, temPix));
    } catch (e) {
      $('blocos').innerHTML = `<div class="panel"><p style="color:var(--danger)">Não consegui montar os textos: ${esc(e.message || 'falha')}</p></div>`;
    }
  }

  document.addEventListener('DOMContentLoaded', carregar);
})();
