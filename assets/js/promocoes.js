// Tela de promoções: termômetro + criar/listar promoções.
(function () {
  if (!Bora.requireAuth()) return;
  // A APOSTROFE ENTRA NA LISTA. Sem ela, o `esc` nao servia no unico lugar em que ele e usado
  // dentro de uma string JS: o `onclick="__encerrar(id, '...')"` logo abaixo. Um codigo de promocao
  // como `X'+alert(1)+'` -- 13 caracteres numa coluna de 40 -- escapava da string e rodava na
  // sessao de quem abre Promocoes. O codigo e texto livre e um GERENTE consegue grava-lo; as
  // vitimas naturais sao o ADMINISTRADOR_LOJA e o suporte operando dentro da loja. Achado pelo QA
  // em 26/10/2026. O servidor tambem passou a recusar o valor, porque uma ponta so nao resolve.
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const FAIXA = {
    SAUDAVEL: { cor: '#22c55e', txt: '#166534', label: 'Vendas saudáveis' },
    ATENCAO:  { cor: '#f59e0b', txt: '#92400e', label: 'Atenção — queda leve' },
    QUEDA:    { cor: '#ef4444', txt: '#991b1b', label: 'Queda nas vendas' },
    SEM_DADOS:{ cor: '#94a3b8', txt: '#475569', label: 'Sem dados suficientes' }
  };
  const money = v => v == null ? '—' : 'R$ ' + Number(v).toFixed(2);
  const dt = iso => iso ? new Date(iso).toLocaleString('pt-BR') : '—';

  async function renderTermometro() {
    const el = document.getElementById('termometro'); if (!el) return;
    try {
      const t = await Bora.termometro(); const f = FAIXA[t.faixa] || FAIXA.SEM_DADOS;
      el.innerHTML = `<p style="font-weight:800;color:${f.txt}">● ${f.label}</p>
        <p><b>Últimas 24h:</b> ${money(t.atual)} · <b>Esperado:</b> ${money(t.baseline)}${t.indice != null ? ` (${Math.round(t.indice*100)}%)` : ''}</p>
        <p style="color:var(--muted);font-size:13px">${t.recomendacao || ''}</p>`;
    } catch { el.innerHTML = '<p style="color:var(--muted)">Indisponível.</p>'; }
  }

  async function carregarLista() {
    const tbody = document.getElementById('lista'); if (!tbody) return;
    try {
      const ps = await Bora.promocoes();
      const agora = Date.now();
      tbody.innerHTML = ps.map(p => {
        const vigente = p.ativa && (!p.fim || new Date(p.fim).getTime() > agora);
        const status = vigente ? '<span class="badge b-entregue">Ativa</span>' : '<span class="badge b-cancelado">Encerrada</span>';
        // Item 7.8: quantos usos faltam. Sem isto, "12/20" so diz algo para quem sabe que existe
        // limite -- e a promocao morria no 20o uso sem ninguem entender por que parou.
        const usos = (p.usos || 0);
        const temLimite = p.limiteUsos && p.limiteUsos > 0;
        const faltam = temLimite ? Math.max(0, p.limiteUsos - usos) : null;
        const usosTexto = temLimite
          ? `${usos}/${p.limiteUsos}` + (vigente ? ` <small style="color:${faltam <= 3 ? 'var(--danger)' : 'var(--muted)'}">(faltam ${faltam})</small>` : '')
          : `${usos} <small style="color:var(--muted)">(sem limite)</small>`;
        // Item 7.8: o endpoint de encerrar existia no servidor e nenhuma tela chamava.
        const acao = vigente
          ? `<button class="btn" style="padding:5px 10px;font-size:12px" onclick="__encerrar(${p.id}, '${esc(p.codigo) || ''}')">Encerrar</button>`
          : '';
        return `<tr><td>${esc(p.codigo) || '—'}</td><td>${esc(p.tipo) || '—'}</td><td>${p.percentualDesconto != null ? p.percentualDesconto + '%' : '—'}</td>` +
          `<td>${dt(p.fim)}</td><td>${usosTexto}</td><td>${esc(p.origem) || '—'}</td><td>${status}</td>` +
          `<td style="text-align:right">${acao}</td></tr>`;
      }).join('') || '<tr><td colspan="8" style="color:var(--muted)">Nenhuma promoção ainda.</td></tr>';
    } catch (e) { tbody.innerHTML = `<tr><td colspan="8" style="color:var(--danger)">${esc(e.message)}</td></tr>`; }
  }

  /**
   * Encerra a promocao agora. Item 7.8.
   *
   * Pergunta antes porque o cliente que estiver com o codigo na mao perde o desconto na hora -- e
   * nao ha como desencerrar pela tela.
   */
  window.__encerrar = async (id, codigo) => {
    if (!confirm('Encerrar a promoção ' + (codigo || '#' + id) + ' agora?\n\n'
      + 'Quem estiver com o código na mão perde o desconto imediatamente, e não dá para reabrir '
      + 'por esta tela.')) return;
    try {
      await Bora.encerrarPromocao(id);
      carregarLista();
    } catch (ex) { alert(ex.message); }
  };

  document.getElementById('form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = document.getElementById('msg'); msg.textContent = '';
    const horas = parseInt(document.getElementById('horas').value || '3', 10);
    const fim = new Date(Date.now() + horas * 3600 * 1000);
    try {
      await Bora.criarPromocao({
        tipo: document.getElementById('tipo').value,
        codigo: document.getElementById('codigo').value.trim() || 'BORA',
        percentualDesconto: Number(document.getElementById('desconto').value || 0),
        descricao: document.getElementById('descricao').value.trim(),
        inicio: new Date().toISOString(), fim: fim.toISOString(),
        // Item 7.8: era `limiteUsos: 20` fixo. Loja que faz 50 pedidos numa noite via a promocao
        // parar de valer no meio, sem aviso nenhum na tela. Vazio = sem limite (o servidor trata
        // nulo e zero como "sem limite", nos dois lugares que conferem).
        limiteUsos: limiteDigitado()
      });
      document.getElementById('form').reset();
      carregarLista();
    } catch (ex) { msg.textContent = ex.message; }
  });

  /**
   * O limite que o lojista digitou. Vazio, zero ou bobagem = sem limite.
   *
   * A primeira versao tinha um `if (bruto == null || trim() === '') return null` antes do parseInt.
   * A rodada de mutacao mostrou que ele era REDUNDANTE: `parseInt('')`, `parseInt(null)` e
   * `parseInt(undefined)` ja dao NaN, e NaN nao passa no `Number.isFinite`. Tirei em vez de deixar
   * codigo que nao decide nada -- linha que nenhum mutante consegue quebrar e linha que nao faz nada.
   */
  function limiteDigitado() {
    const n = parseInt((document.getElementById('limite') || {}).value, 10);
    return Number.isFinite(n) && n > 0 ? n : null;
  }

  document.addEventListener('DOMContentLoaded', () => { renderTermometro(); carregarLista(); });
})();
