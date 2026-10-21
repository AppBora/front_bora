// CRUD de clientes (escopado por loja via token).
(function () {
  if (!Bora.requireAuth()) return;
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // O telefone é GUARDADO só com dígitos, porque é assim que o cardápio e os marketplaces procuram o
  // cliente — com máscara, quem era cadastrado aqui não era encontrado lá e virava um segundo cadastro.
  // Guardar cru não quer dizer mostrar cru: aqui ele volta a ficar legível para o lojista.
  const fone = v => {
    const d = String(v == null ? '' : v).replace(/\D/g, '');
    if (d.startsWith('0')) return d; // 0800 das centrais de marketplace nao tem DDD
    if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
    if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
    return v;
  };

  /**
   * Os clientes carregados, para o editar não precisar de outra chamada.
   *
   * Item 7.12 da varredura: esta tela só tinha CRIAR e EXCLUIR. Para corrigir um telefone digitado
   * errado, o único caminho era excluir e cadastrar de novo — e excluir leva o cashback e o histórico
   * do cliente junto, sem avisar. O endpoint de editar já existia (`PUT /api/clientes/{id}`); era a
   * tela que não usava.
   */
  let carregados = [];

  async function lista() {
    const tb = $('lista');
    try {
      carregados = await Bora.clientes();
      tb.innerHTML = carregados.map(c =>
        `<tr><td>${esc(c.nome) || '—'}</td><td>${esc(fone(c.telefone)) || '—'}</td><td>${esc(c.bairro) || '—'}</td>` +
        `<td style="text-align:right;white-space:nowrap">` +
        `<button class="btn ghost" style="background:#eef2ff;color:#3730a3;padding:4px 8px;margin-right:4px" onclick="__editar(${c.id})">✎</button>` +
        `<button class="btn ghost" style="background:#e5e7eb;color:#111;padding:4px 8px" onclick="__del(${c.id})">✕</button></td></tr>`
      ).join('') || '<tr><td colspan="4" style="color:#94a3b8">Nenhum cliente ainda.</td></tr>';
    } catch (e) { tb.innerHTML = `<tr><td colspan="4" style="color:var(--danger)">${esc(e.message)}</td></tr>`; }
  }

  /** Traz o cliente para o formulário. Daí o salvar vira PUT em vez de POST. */
  window.__editar = (id) => {
    const c = carregados.find(x => x.id === id);
    if (!c) return;
    $('id').value = c.id;
    $('nome').value = c.nome || '';
    // Mostra com máscara, como na lista — o servidor normaliza para dígitos ao salvar.
    $('telefone').value = fone(c.telefone) === c.telefone ? (c.telefone || '') : fone(c.telefone);
    $('endereco').value = c.endereco || '';
    $('bairro').value = c.bairro || '';
    $('referencia').value = c.referencia || '';
    $('salvar').textContent = 'Salvar alterações';
    $('cancelar').hidden = false;
    $('msg').textContent = '';
    $('nome').focus();
    if (window.scrollTo) window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  function reset() {
    $('form').reset();
    $('id').value = '';
    $('salvar').textContent = 'Adicionar cliente';
    $('cancelar').hidden = true;
    $('msg').textContent = '';
  }
  window.__cancelarEdicao = reset;

  window.__del = async (id) => {
    // O aviso diz o que se perde. A exclusao desamarra os pedidos (o historico fica), mas o cashback
    // vai com o cadastro -- e isso o lojista tem que saber ANTES de clicar.
    const c = carregados.find(x => x.id === id);
    const saldo = c && Number(c.cashback || 0) > 0
      ? '\n\nATENÇÃO: este cliente tem R$ ' + Number(c.cashback).toFixed(2).replace('.', ',')
        + ' de cashback, e o saldo vai embora com o cadastro.'
      : '';
    if (!confirm('Excluir ' + ((c && c.nome) || 'cliente') + '?'
      + '\n\nOs pedidos dele continuam no histórico, sem vínculo.' + saldo
      + '\n\nSe o que você quer é corrigir o cadastro, use o ✎.')) return;
    try { await Bora.api('/api/clientes/' + id, { method: 'DELETE' }); reset(); lista(); }
    catch (e) { alert(e.message); }
  };

  $('form').addEventListener('submit', async (e) => {
    e.preventDefault(); $('msg').textContent = '';
    const id = $('id').value;
    const corpo = JSON.stringify({
      nome: $('nome').value.trim(), telefone: $('telefone').value.trim(),
      endereco: $('endereco').value.trim(), bairro: $('bairro').value.trim(), referencia: $('referencia').value.trim()
    });
    try {
      // Editar usa o endpoint que sempre existiu; criar continua no POST.
      await Bora.api('/api/clientes' + (id ? '/' + id : ''), { method: id ? 'PUT' : 'POST', body: corpo });
      reset(); lista();
    } catch (ex) { $('msg').textContent = ex.message; }
  });

  if ($('cancelar')) $('cancelar').addEventListener('click', ev => { ev.preventDefault(); reset(); });

  document.addEventListener('DOMContentLoaded', lista);
})();
