// Harness minimo para rodar os scripts do painel (IIFE + DOM global) no Node, sem npm e sem jsdom.
import vm from 'node:vm';
import fs from 'node:fs';

function elemento() {
  const e = { textContent: '', innerHTML: '', value: '', checked: false, hidden: false, style: {},
    dataset: {}, children: [], classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    addEventListener() {}, setAttribute() {}, appendChild() {}, focus() {}, querySelectorAll: () => [], querySelector: () => null };
  return e;
}

export function subir(arquivo, { Bora, globais = {}, search = '' } = {}) {
  const els = new Map();
  const ouvintes = {};
  const get = id => { if (!els.has(id)) els.set(id, elemento()); return els.get(id); };
  const document = {
    getElementById: get, hidden: false,
    addEventListener: (ev, fn) => (ouvintes[ev] ??= []).push(fn),
    querySelector: () => null, querySelectorAll: () => [], createElement: () => elemento(),
    body: elemento(),
  };
  const store = new Map();
  const localStorage = { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) };
  const ctx = vm.createContext({ document, localStorage, Bora, console, Date, Math, JSON, Number, String, Object, Array,
    Promise, setTimeout, clearInterval, setInterval, location: { search, pathname: '/x.html', origin: 'http://t' },
    window: { open() {}, location: { origin: 'http://t' } }, URLSearchParams, encodeURIComponent, ...globais });
  vm.runInContext(fs.readFileSync(arquivo, 'utf8'), ctx, { filename: arquivo });
  return {
    els, get,
    async carregarPagina() {          // dispara DOMContentLoaded e deixa as promessas assentarem
      for (const f of ouvintes.DOMContentLoaded ?? []) await f();
      for (let i = 0; i < 5; i++) await new Promise(r => setImmediate(r));
    },
  };
}
