// O checkout do cliente para de dar zoom sozinho no iPhone.
//
// O DEFEITO (achado pelo QA em 24/10/2026): o Safari do iOS amplia a página inteira quando o campo
// que recebeu o toque tem `font-size` menor que 16px — e NÃO volta ao sair do campo. O cliente
// tocava em "Seu nome" no checkout e a página ficava ampliada e cortada lateralmente, no meio do
// pedido. Os campos do `cardapio.html` não declaravam `font-size`, e controle de formulário não
// herda o do body: ficavam nos ~13px do padrão do navegador.
//
// Isto é o cardápio PÚBLICO: a tela do cliente final, e a maioria vem de celular pelo QR da mesa.
//
// POR QUE NÃO SE RESOLVE NO VIEWPORT: dava para travar com `maximum-scale=1`, e isso impediria o
// cliente de ampliar a página — quebra a leitura de quem precisa de letra maior, por um problema
// que é nosso. 16px no campo resolve sem tirar nada de ninguém, e por isso o teste também cobra que
// o viewport continue permitindo zoom.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const RAIZ = path.join(import.meta.dirname, '..');
const HTML = fs.readFileSync(path.join(RAIZ, 'cardapio.html'), 'utf8');

/** Os campos de texto da página, com o style inline de cada um. */
function camposDeTexto(html) {
  const re = /<(input|select|textarea)\b([^>]*)>/g;
  const achados = [];
  let m;
  while ((m = re.exec(html))) {
    const attrs = m[2];
    const tipo = (/\btype=["']?([\w-]+)/.exec(attrs) || [])[1] || 'text';
    // radio e checkbox não abrem teclado e não disparam o zoom.
    if (tipo === 'radio' || tipo === 'checkbox' || tipo === 'hidden') continue;
    const id = (/\bid=["']?([\w-]+)/.exec(attrs) || [])[1] || '(sem id)';
    const fs_ = (/font-size:\s*(\d+)px/.exec(attrs) || [])[1];
    achados.push({ tag: m[1], id, tipo, fontInline: fs_ ? Number(fs_) : null });
  }
  return achados;
}

test('PREMISSA: o checkout tem campos de texto para o cliente preencher', () => {
  // Sem isto, um regex quebrado faria todo o resto passar medindo zero campo.
  const campos = camposDeTexto(HTML);
  assert.ok(campos.length >= 6,
    'esperava achar os campos do checkout (nome, telefone, bairro, endereço, observação, cupom, '
    + 'CPF); achei ' + campos.length);
  const ids = campos.map((c) => c.id);
  for (const obrigatorio of ['ckNome', 'ckTel', 'ckEnd', 'ckCpf']) {
    assert.ok(ids.includes(obrigatorio), 'não achei o campo ' + obrigatorio);
  }
});

test('existe a regra de 16px que impede o zoom', () => {
  assert.match(HTML, /input:not\(\[type=radio\]\):not\(\[type=checkbox\]\),select,textarea\{font-size:16px\}/,
    'a regra dos 16px saiu: o cliente volta a ter a página ampliada ao tocar no primeiro campo');
});

test('nenhum campo tocável do checkout fica abaixo de 16px', () => {
  // A regra de CSS cobre quem NÃO declara font-size inline. Quem declara, ganha dela — então um
  // campo com `font-size:13px` no style inline continuaria dando zoom, calado.
  const presos = camposDeTexto(HTML)
    .filter((c) => c.fontInline != null && c.fontInline < 16 && c.id !== 'pxPayload');
  assert.deepEqual(presos, [],
    'campo com font-size inline abaixo de 16px ganha da regra e volta a dar zoom: '
    + presos.map((c) => c.id + ' (' + c.fontInline + 'px)').join(', '));
});

test('o #pxPayload fica fora da regra DE PROPOSITO, e nao por esquecimento', () => {
  // É o código PIX copiável: texto longo que precisa caber, e tem o botão "Copiar código PIX" ao
  // lado — ninguém precisa tocar nele para digitar. Se o botão sumisse, o campo passaria a ser
  // tocado e os 11px voltariam a ser um problema; por isso o teste amarra os dois.
  const payload = camposDeTexto(HTML).find((c) => c.id === 'pxPayload');
  assert.ok(payload, 'não achei o campo do código PIX');
  assert.equal(payload.fontInline, 11, 'o tamanho do payload mudou; reveja a exceção deste teste');
  assert.match(HTML, /id="pxCopiar"/,
    'o botão de copiar o PIX sumiu: sem ele o cliente tem de tocar no campo de 11px, e volta o zoom');
  assert.match(HTML, /readonly/, 'o payload é somente leitura: não é campo de digitar');
});

test('o viewport CONTINUA deixando o cliente ampliar a pagina', () => {
  // A tentação é travar o zoom (`maximum-scale=1` / `user-scalable=no`) e dar o problema por
  // resolvido. Isso conserta o sintoma tirando a capacidade de ampliar de quem precisa de letra
  // maior — para corrigir um descuido nosso de 3px.
  // Olha SÓ o meta do viewport. A primeira versão varria o HTML inteiro e acusava o meu próprio
  // comentário de CSS, que explica por que não travei o zoom — ou seja, falhava com o código certo.
  // É o segundo teste meu hoje a apontar para o lugar errado por falta de escopo.
  const meta = (/<meta name="viewport"[^>]*>/.exec(HTML) || [])[0];
  assert.ok(meta, 'não achei o meta do viewport: este teste está medindo nada');
  assert.match(meta, /width=device-width/);
  assert.match(meta, /initial-scale=1/);
  assert.ok(!/maximum-scale/.test(meta), 'travou o zoom em vez de corrigir o tamanho do campo');
  assert.ok(!/user-scalable/.test(meta), 'travou o zoom em vez de corrigir o tamanho do campo');
});
