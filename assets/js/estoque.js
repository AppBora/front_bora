// Controle de estoque — alertas de ruptura/mínimo e ajuste rápido.
//
// ANTES reusava o PUT /api/produtos, mandando o cadastro inteiro de volta a cada ajuste. Dois
// defeitos nisso: (1) o cadastro que esta tela conhece não tem todos os campos, então cada ajuste
// apagava o que ela não sabe que existe — o código do marketplace, por exemplo; (2) o "+1" era
// calculado no NAVEGADOR, a partir da lista carregada minutos antes, e gravado como valor absoluto:
// clicar "+1" às 21h com a lista de 18h gravava o saldo de 18h mais um, e as vendas da noite sumiam.
//
// Agora usa o PUT /api/produtos/{id}/estoque, que mexe NUMA coluna e soma no banco.
(function () {
  if (!Bora.requireAuth()) return;
  const $ = id => document.getElementById(id);
  const money = v => 'R$ ' + Number(v || 0).toFixed(2).replace('.', ',');
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  let produtos = [];

  window.__ajustar = async (id, delta) => {
    // O delta vai para o servidor; a conta é do banco. Antes era `(p.estoque || 0) + delta` aqui, com
    // o `p` de uma lista que pode ter minutos de idade.
    try { await Bora.ajustarEstoqueProduto(id, delta); carregar(); }
    catch (e) { alert(e.message); carregar(); }
  };
  window.__definir = async (id, valor) => {
    const v = parseInt(valor, 10); if (isNaN(v)) return;
    // Valor absoluto: o lojista está dizendo quanto tem. Vence mesmo que tenha havido venda entre a
    // leitura da tela e o clique — ele olhou a prateleira.
    try { await Bora.definirEstoqueProduto(id, Math.max(0, v)); carregar(); }
    catch (e) { alert(e.message); carregar(); }
  };

  function status(p) {
    if (p.estoque <= 0) return '<span class="st off">RUPTURA</span>';
    if (p.estoqueMinimo != null && p.estoque <= p.estoqueMinimo) return '<span class="st" style="background:#fef3c7;color:#92400e">BAIXO</span>';
    return '<span class="st on">OK</span>';
  }

  async function carregar() {
    try {
      produtos = (await Bora.produtos()).filter(p => p.estoque != null);
      const valor = produtos.reduce((s, p) => s + (p.estoque || 0) * Number(p.custo || 0), 0);
      const baixo = produtos.filter(p => p.estoque > 0 && p.estoqueMinimo != null && p.estoque <= p.estoqueMinimo).length;
      const ruptura = produtos.filter(p => p.estoque <= 0).length;
      $('kValor').textContent = money(valor);
      $('kBaixo').textContent = baixo;
      $('kRuptura').textContent = ruptura;

      // ordena: ruptura e baixo primeiro
      const ord = [...produtos].sort((a, b) => peso(a) - peso(b));
      $('lista').innerHTML = ord.length ? ord.map(p =>
        `<tr><td><b>${esc(p.nome)}</b><br><small style="color:#94a3b8">${esc(p.categoria || '')}</small></td>
          <td><b style="font-size:16px">${p.estoque}</b></td>
          <td>${p.estoqueMinimo ?? '—'}</td>
          <td>${status(p)}</td>
          <td><div class="qty">
            <button onclick="__ajustar(${p.id},-1)">−</button>
            <input style="width:56px;text-align:center;padding:6px;border:1px solid #e5e7eb;border-radius:8px" value="${p.estoque}" onchange="__definir(${p.id},this.value)">
            <button onclick="__ajustar(${p.id},1)">+</button>
            <button onclick="__ajustar(${p.id},10)" style="background:#ecfdf5;color:#059669">+10</button>
          </div></td></tr>`).join('')
        : '<tr><td colspan="5" style="color:#94a3b8">Nenhum produto com estoque controlado. Defina o estoque em Produtos.</td></tr>';
    } catch (e) { $('lista').innerHTML = `<tr><td colspan="5" style="color:var(--danger)">${e.message}</td></tr>`; }
  }
  const peso = p => p.estoque <= 0 ? 0 : (p.estoqueMinimo != null && p.estoque <= p.estoqueMinimo ? 1 : 2);

  document.addEventListener('DOMContentLoaded', carregar);
})();
