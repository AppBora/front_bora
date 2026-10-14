# Testes do frontend

```bash
cd bora-fase-2-frontend/testes && node --test
```

Não precisa de `npm install`, de jsdom nem de bundler: usa o `node:test` e o `node:vm` que já vêm no
Node. Roda em menos de 2 segundos.

## Por que isto existe

O frontend do Bora ficou sem **nenhum** teste até 14/10/2026, e tem conta de dinheiro na tela: o
fechamento de caixa, o total do carrinho, o desconto do cupom. Quando uma dessas contas divergia do
servidor, quem descobria era o lojista.

## O que cada arquivo cobre

| Arquivo | O que trava |
|---|---|
| `api.test.mjs` | O desvio `?api=` não funcionar fora de localhost (era phishing: dava para apontar o painel de alguém para outro servidor). O 401 virar logout, o 402 levar para Planos sem loop, corpo vazio e JSON quebrado não derrubarem a tela. |
| `caixa.test.mjs` | O fechamento do dia: PIX que ninguém pagou fora do faturamento, cancelado fora do faturamento mas contado, ticket médio, pedido de ontem fora do dia, e dia sem venda não dividir por zero. |
| `cores.test.mjs` | A cor do texto ser escolhida pela conta de contraste, não pela escolha do lojista. Foi este teste que achou que vermelho puro não passava com nenhuma das duas cores que eu tinha escolhido. |
| `estatico.test.mjs` | Todo JS compilar, nenhuma página apontar para arquivo que não existe, `api.js` vir antes do script da página, e nenhuma tela de painel esquecer o `requireAuth`. |

## Como funciona o harness

Os scripts do painel são IIFEs que falam com `document`, `Bora` e `fetch` globais. O `harness.mjs`
carrega um script de verdade dentro de um `vm.Context` com DOM e `fetch` falsos — então o teste exercita
o **arquivo que vai para produção**, não uma cópia.

## O que ainda não tem teste

`cardapio.js` (total com cupom, frete e cashback), `pdv.js`, `novo-pedido.js` e
`acerto-entregadores.js` — todos com conta de dinheiro. São os próximos. O que aparece na tela
renderizada é do qa-visual, não daqui.
