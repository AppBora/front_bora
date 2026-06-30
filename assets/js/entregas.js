// Entregas & Roteirização — agrupa pedidos prontos/em rota por bairro, atribui entregador e despacha.
(function () {
  if (!Bora.requireAuth()) return;
  const money = v => 'R$ ' + Number(v || 0).toFixed(2).replace('.', ',');
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const mins = iso => iso ? Math.floor((Date.now() - new Date(iso).getTime()) / 60000) : 0;

  let entregadores = [];
  const optsEntregador = sel => '<option value="">— motoboy —</option>' +
    entregadores.filter(e => e.ativo !== false).map(e => `<option ${e.nome === sel ? 'selected' : ''}>${esc(e.nome)}</option>`).join('');

  window.__despachar = async (id) => { try { await Bora.mudarStatus(id, 'SAIU_PARA_ENTREGA'); carregar(); } catch (e) { alert(e.message); } };
  window.__entregue = async (id) => { try { await Bora.mudarStatus(id, 'ENTREGUE'); carregar(); } catch (e) { alert(e.message); } };
  window.__setEntregador = async (id, nome) => { try { await Bora.definirEntregador(id, nome); } catch (e) { alert(e.message); } };
  window.__despacharBairro = async (ids) => {
    for (const id of ids) { try { await Bora.mudarStatus(id, 'SAIU_PARA_ENTREGA'); } catch (e) {} }
    carregar();
  };

  function linha(p, emRota) {
    const tempo = mins(p.atualizadoEm || p.criadoEm);
    const acao = emRota
      ? `<button class="btn" style="padding:7px 12px" onclick="__entregue(${p.id})">✓ Entregue</button>`
      : `<button class="btn" style="padding:7px 12px" onclick="__despachar(${p.id})">🛵 Despachar</button>`;
    return `<tr>
      <td><b>${esc(p.codigo) || '#' + p.id}</b></td>
      <td>${esc(p.clienteNome) || '—'}<br><small style="color:#94a3b8">${esc(p.clienteEndereco || '')}</small></td>
      <td>${money(p.valorTotal)}</td>
      <td><select style="width:140px;padding:7px;border:1px solid #e5e7eb;border-radius:8px"
            onchange="__setEntregador(${p.id}, this.value)">${optsEntregador(p.entregador)}</select></td>
      <td>${tempo} min</td>
      <td style="text-align:right">${acao}</td>
    </tr>`;
  }

  function grupoBairro(bairro, prontos) {
    const ids = prontos.map(p => p.id).join(',');
    return `<div class="panel" style="margin-bottom:14px">
      <h2 style="display:flex;justify-content:space-between;align-items:center">
        <span>📍 ${esc(bairro)} <span style="color:#94a3b8;font-weight:600;font-size:13px">· ${prontos.length} pedido(s)</span></span>
        <button class="btn" style="padding:8px 14px" onclick="__despacharBairro([${ids}])">🛵 Despachar rota</button>
      </h2>
      <table class="table"><thead><tr><th>Cód.</th><th>Cliente / Endereço</th><th>Valor</th><th>Entregador</th><th>Espera</th><th></th></tr></thead>
        <tbody>${prontos.map(p => linha(p, false)).join('')}</tbody></table>
    </div>`;
  }

  async function carregar() {
    try {
      const [board, resumo, ents] = await Promise.all([Bora.board(), Bora.resumo(), Bora.entregadores()]);
      entregadores = ents || [];
      const prontos = board.filter(p => p.status === 'PRONTO');
      const emRota = board.filter(p => p.status === 'SAIU_PARA_ENTREGA');

      document.getElementById('kpiProntos').textContent = prontos.length;
      document.getElementById('kpiSaiu').textContent = resumo.saiuParaEntrega;
      document.getElementById('kpiHora').textContent = resumo.entreguesUltimaHora;

      // agrupa prontos por bairro
      const grupos = {};
      prontos.forEach(p => { const b = (p.clienteBairro || 'Sem bairro'); (grupos[b] = grupos[b] || []).push(p); });
      const blocos = Object.entries(grupos).sort((a, b) => b[1].length - a[1].length)
        .map(([b, lst]) => grupoBairro(b, lst)).join('');

      const rotaTabela = `<div class="panel">
        <h2>🛵 Em rota (${emRota.length})</h2>
        <table class="table"><thead><tr><th>Cód.</th><th>Cliente / Endereço</th><th>Valor</th><th>Entregador</th><th>Saiu há</th><th></th></tr></thead>
          <tbody>${emRota.map(p => linha(p, true)).join('') || '<tr><td colspan="6" style="color:#94a3b8">Ninguém em rota.</td></tr>'}</tbody></table>
      </div>`;

      document.getElementById('rotas').innerHTML =
        (blocos || '<div class="panel" style="margin-bottom:14px"><p style="color:#94a3b8">Nenhum pedido pronto aguardando rota.</p></div>') + rotaTabela;
    } catch (e) { document.getElementById('rotas').innerHTML = `<div class="panel"><p style="color:var(--danger)">${e.message}</p></div>`; }
  }

  document.addEventListener('DOMContentLoaded', () => { carregar(); setInterval(carregar, 10000); });
})();
