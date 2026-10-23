// O entregador desativado religava sozinho ao ser editado.
//
// `entregadores.js` montava o corpo com `ativo: true` FIXO, e o mesmo corpo servia para criar e
// para editar. Mudar so o telefone de um motoboy desligado o trazia de volta -- e o estrago nao
// fica na tela de Entregadores: `entregas.js:12` filtra inativo no seletor de motoboy, entao quem
// o lojista desligou REAPARECE na lista de despacho.
//
// E o MESMO defeito que ja foi pago no produto (item 13.4: "a tela mandava ativo: true fixo e
// religava o que tinha sido desligado"), em outra tela. Achado pelo agente de QA em 23/10/2026,
// item 9.4.
//
// A segunda metade do defeito: a tela NAO TINHA como desativar ninguem -- so editar e excluir. O
// passo 1 do proprio item de teste era impossivel de executar, e o unico caminho que sobrava era
// EXCLUIR o motoboy, que leva o historico de entregas dele junto.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { subir } from './harness.mjs';

const RAIZ = process.env.BORA_FRONT
  || 'C:/Users/user/OneDrive/Desktop/Bora/bora-fase-2-frontend';
const ler = (f) => fs.readFileSync(path.join(RAIZ, f), 'utf8');

const EQUIPE = [
  { id: 1, nome: 'Carlos Motoboy', telefone: '15991110000', veiculo: 'Moto', ativo: true },
  { id: 2, nome: 'Pedro Afastado', telefone: '15993330000', veiculo: 'Bike', ativo: false },
];

async function abrir() {
  const salvos = [];
  const Bora = {
    requireAuth: () => true,
    entregadores: async () => EQUIPE.map(e => ({ ...e })),
    board: async () => ([]),
    criarEntregador: async (body) => { salvos.push({ como: 'criar', body }); return {}; },
    atualizarEntregador: async (id, body) => { salvos.push({ como: 'editar', id, body }); return {}; },
    excluirEntregador: async () => ({}),
    // A tela recarrega sozinha de 12 em 12s (entregadores.js:66). No teste ele nao pode
    // disparar, senao o relogio fica vivo depois que o teste acaba.
    repetir: () => {},
  };
  const janela = { scrollTo() {}, location: { href: '' } };
  const pagina = subir(path.join(RAIZ, 'assets/js/entregadores.js'), {
    Bora, globais: { alert() {}, confirm: () => true, window: janela },
  });
  await pagina.carregarPagina();
  await new Promise(r => setTimeout(r, 0));
  return { pagina, salvos, janela };
}

/** Abre o lápis do entregador e salva o formulário, como o lojista faria. */
async function editarEsalvar(pagina, janela, id, mudanca = () => {}) {
  janela.__edit(id);
  mudanca(pagina);
  await pagina.get('form').__disparar('submit');
  await new Promise(r => setTimeout(r, 0));
}

test('PREMISSA: editar um entregador INATIVO nao pode religar ele', async () => {
  const { pagina, salvos, janela } = await abrir();
  await editarEsalvar(pagina, janela, 2, p => { p.get('telefone').value = '15993339999'; });

  assert.equal(salvos.length, 1, 'tinha que ter salvo uma vez');
  assert.equal(salvos[0].como, 'editar');
  assert.equal(
    salvos[0].body.ativo, false,
    'mudar o telefone religou o motoboy desligado -- e ele volta para o seletor de despacho',
  );
});

test('editar um entregador ATIVO continua deixando ele ativo', async () => {
  const { pagina, salvos, janela } = await abrir();
  await editarEsalvar(pagina, janela, 1, p => { p.get('telefone').value = '15991119999'; });
  assert.equal(salvos[0].body.ativo, true, 'o caminho normal nao pode ter quebrado');
});

test('PREMISSA: da para desativar pela tela, sem precisar excluir', () => {
  const html = ler('entregadores.html');
  assert.match(html, /id="ativo"/,
    'nao ha como desativar: o unico caminho e excluir, e excluir leva o historico de entregas junto');
});

test('desmarcar o ativo e salvar manda ativo: false', async () => {
  const { pagina, salvos, janela } = await abrir();
  await editarEsalvar(pagina, janela, 1, p => { p.get('ativo').checked = false; });
  assert.equal(salvos[0].body.ativo, false);
});

test('marcar de volta religa, porque aí foi o lojista que mandou', async () => {
  const { pagina, salvos, janela } = await abrir();
  await editarEsalvar(pagina, janela, 2, p => { p.get('ativo').checked = true; });
  assert.equal(salvos[0].body.ativo, true);
});

test('o lapis traz a situacao atual do entregador para o formulario', async () => {
  const { pagina, janela } = await abrir();
  janela.__edit(2);
  assert.equal(pagina.get('ativo').checked, false, 'abriu o inativo com a caixa marcada');
  janela.__edit(1);
  assert.equal(pagina.get('ativo').checked, true, 'abriu o ativo com a caixa desmarcada');
});

test('entregador novo nasce ativo — a caixa ja vem marcada no HTML', () => {
  // O harness nao le atributo do HTML, so o que o JS escreve. Entao o padrao do formulario se
  // mede na marcacao, que e onde ele mora de verdade.
  assert.match(ler('entregadores.html'), /id="ativo"[^>]*checked/,
    'a caixa nao vem marcada: motoboy novo nasceria sem poder receber rota');
});

test('depois de salvar, o formulario volta pronto para um entregador ATIVO', async () => {
  // resetForm roda no fim do salvar. Se ele nao remarcar a caixa, o proximo cadastro sai inativo
  // e ninguem entende por que o motoboy novo nao aparece no despacho.
  const { pagina, salvos, janela } = await abrir();
  await editarEsalvar(pagina, janela, 1, p => { p.get('ativo').checked = false; });
  assert.equal(salvos[0].body.ativo, false);
  assert.equal(pagina.get('ativo').checked, true, 'o formulario ficou com a caixa desmarcada para o proximo');
});

test('o inativo continua marcado na lista', async () => {
  const { pagina } = await abrir();
  const html = pagina.get('lista').innerHTML;
  assert.ok(html.includes('inativo'), 'o selo de inativo sumiu da lista');
});
