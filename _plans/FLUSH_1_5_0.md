# Storagefy 1.5.0 — `flush()` e internos fora dos tipos

Plano escrito em 2026-11-14. Status: **decisões aprovadas (recomendações do §3, 2026-11-14); passos 1–8 feitos, falta validar no AGC (passo 8) e publicar**.

## 1. Por que

O AGC (`frontend/src/platform/storage/deviceStorage.ts`, `clearAccountData`) precisa limpar os dados da pessoa ao fim
da sessão e **esperar a gravação** — senão a página fecha e o dado fica no aparelho. Não existe jeito público de esperar
as gravações; o AGC lia `adapter.stores[key].writing`, que não está no README:

- 1.3.0: `writing` era a Promise da gravação em andamento.
- 1.4.0 (`ab1ac92`, refatoração "Internal"): `KeptStore` virou classe; a Promise virou `_writing` e `writing` virou
  **booleano**. Esperar um booleano termina na hora — o AGC passou a dizer "pronto" antes de gravar. Typecheck não pegou
  (`Promise.allSettled` aceita qualquer valor); pegou o teste com portão do AGC.

Dois defeitos a corrigir na lib:

1. **Falta uma API documentada para "garantir que está gravado".**
2. **Os tipos publicados expõem os internos** (`stores`, `KeptStore`, 15 campos `_…` como públicos) — quem usa
   TypeScript os vê como API.

## 2. Por que `flush` e não "esperar as gravações"

Esperar só a gravação em andamento (`ownWritesDone`, ou um `writesDone` documentado) falha no Pinia, conferido no código
do Pinia 3.0.4 (`pinia.mjs:1441-1450`):

- `$patch` avisa os inscritos **na hora** (a gravação começa antes da próxima linha);
- mudança direta (`store.x = 1`) avisa por um `watch` com `flush: "pre"` — **depois**, numa tarefa seguinte.

`store.x = null; await espera()` → nada em andamento ainda → resolve na hora → a página fecha com o dado antigo.

`flush` **lê o estado atual do store** em vez de depender do aviso: grava agora o que o store tem, se ainda não estiver
gravado, e resolve quando estiver. O aviso atrasado do Pinia chega depois e não grava de novo — a regra da 1.4.0 ("a
parte guardada não mudou → nada grava, ninguém é avisado") já cobre. Precedente: `persistor.flush()` do redux-persist.

Descartados:

- **`flush` no storage adapter**: não enxerga o estado que o `KeptStore` ainda não mandou gravar (`_latest`) nem o aviso
  atrasado do Pinia.
- **`setInStorage` devolver um controle**: muda a API sem ganho sobre o `flush`.

## 3. Decisões (a aprovar)

| # | Decisão | Recomendação |
|---|---|---|
| D1 | Nome e lugar | `flush(key?)` nos store adapters (`StoreAdapter`, vale para Pinia, React, Svelte). Sem `key`: todos os stores do adapter |
| D2 | Resposta | `Promise<boolean>`, **nunca rejeita por falha de gravação**: `true` = o estado do store (o da chamada ou um mais novo) está gravado; `false` = alguma gravação não foi salva — o motivo vai ao `onError`, como hoje (uma vez só, não duas) |
| D3 | Chave que não está sendo guardada (`flush("erro-de-digitacao")`, ou já destruída) | **Rejeita** com erro claro — é engano do app, como o `setInStorage` com um store errado. Sem `key` e sem nenhum store: `true` |
| D4 | `flush` antes do `setInStorage` terminar | Espera a primeira gravação do `setInStorage`, depois faz o flush (o estado já guardado não é regravado) |
| D5 | Store cujo estado não dá para ler (React só com `subscribe`, que entrega o estado ao ouvinte) | Só espera as gravações em andamento — **nunca grava `{}`** (hoje `_currentOf` devolve `{}` para ele). Esses stores avisam na hora, então não há aviso atrasado a cobrir. Documentado |
| D6 | O que o `flush` espera | Só as gravações **deste store** (incluindo a regravação do localStorage que o `TabFollower` faz pelo `persist`). Não espera mudanças de outras abas sendo aplicadas — elas não são o estado deste store a garantir |
| D7 | `destroy`/guardar de novo durante o flush | Termina a gravação em andamento e resolve; nenhuma gravação nova depois do `destroy` |
| D8 | `timeout` | `flush` de estado já gravado não renova a expiração (igual à 1.4.0: o que não muda não grava) |
| D9 | Internos fora dos tipos | `stripInternal` **não funciona** com tipos gerados do JSDoc (testado, TS 5.8.3: o `@internal` fica no `.d.ts`). Usar `@private`/`@protected` no JSDoc → vira `private`/`protected` no `.d.ts` e o TS recusa o acesso (testado). Inventário arquivo por arquivo do que é API (README) e do que é interno |
| D10 | Versão | **1.5.0** (recurso novo). "Upgrading to 1.5.0": quem lia internos pelos tipos passa a ter erro de tipo — usar `flush`. Sem mudança de comportamento em tempo de execução |

## 4. Passos (cada um testado antes do próximo)

1. **Inventário da API** — ler README + `dist/types` e listar o que é público e o que é interno. Saída: tabela nesta
   seção (sem código).
2. **`flush` no `KeptStore`** — `flush()`: espera a primeira gravação (D4); se o estado é legível (D5), chama
   `onChange(current())`; espera `ownWritesDone`; responde pela parte guardada (`_stored` definido = gravado; falha zera
   `_stored`, já é assim no `persist`). Store adapter: capacidade "lê o estado" por adapter (D5) em vez de um `{}`
   enganoso; `flush(key?)` no `StoreAdapter` (D1–D3, D7).
3. **Testes unitários** (§5.1) — 100% de cobertura mantida.
4. **Mutação manual** das decisões (§5.4) — cada mutação tem de ser morta por um teste.
5. **Internos `@private`/`@protected`** (D9) + `tests/types/usage.ts` com o uso do `flush` e `@ts-expect-error` nos
   internos.
6. **Testes em navegador real** (§5.2) — Chromium, Firefox, WebKit.
7. **Documentação** (§6).
8. **Antes de publicar** (roteiro do `buildproject.txt`): build, `test:coverage`, `test:browser`, `npm pack`, instalar
   numa pasta limpa (ESM e CommonJS), validar no AGC (tipos, build, tamanho). **Publicação é do usuário**; depois
   comparar o shasum publicado.
9. **AGC** (depois da 1.5.0 instalada): `clearAccountData` = `restore` + `await adapter.flush()`; avaliar retirar o
   `changed` próprio (a 1.4.0 já não grava o que não mudou) — com teste; o teste do portão volta a passar. Entra na
   revisão (b) do passo 4 do F9.4.

## 5. Testes

### 5.1 Unitários (Vitest; storages: IndexedDB com `fake-indexeddb`, localStorage, sessionStorage)

Stores: Pinia, Redux, Zustand, Jotai, Svelte, React só-`subscribe`.

1. **Pinia, mudança direta + `flush` na mesma tarefa** → gravado antes de resolver (com a gravação presa num portão:
   não resolve antes do portão abrir). É o caso do AGC.
2. Pinia `$patch` + `flush`.
3. **Aviso atrasado do Pinia depois do flush → nenhuma segunda gravação e nenhuma segunda mensagem às abas** (contar
   `set` e mensagens do canal).
4. Nada mudou → nenhuma gravação, nenhuma mensagem, `true`.
5. Só `ignoreKeys` mudou → nenhuma gravação.
6. Rajada de mudanças + `flush` → o último estado gravado, no máximo uma gravação depois da em andamento.
7. Gravação não salva (`set` → `false`) → `false`, `onError` uma vez.
8. Storage que lança → `false`, sem rejeitar, `onError`.
9. Falha e depois sucesso → o `flush` seguinte responde `true`.
10. `flush()` de todos: grava cada um; um falhando → `false`, os outros gravados mesmo assim.
11. Chave desconhecida / destruída → rejeita com o erro de D3; sem `key` e sem stores → `true`.
12. `flush` antes do `setInStorage` terminar → espera; estado já guardado não é regravado (D4).
13. `destroy` durante o flush → resolve depois da gravação em andamento; nada grava depois (D7). Guardar de novo a
    mesma chave durante o flush.
14. React só-`subscribe` → só espera; **nunca grava `{}`** (D5).
15. Estado `null`/`undefined` → remove a chave, `true`.
16. `timeout`: flush sem mudança não renova; com mudança grava com a expiração.
17. Dois `flush` ao mesmo tempo → mesma resposta, uma gravação.
18. Duas abas (dois Pinias, mesmo banco e canal): `flush` na A → B recebe a mudança uma vez; mudança da B sendo
    aplicada na A não é regravada pelo flush da A.
19. Pacote publicado (`publishedPackage.test.js`): `flush` existe em ESM e CommonJS.

### 5.2 Navegador real (Playwright, 3 motores; IndexedDB e localStorage)

1. Pinia: mudança direta, `await flush()`, **recarrega a página na hora** → o estado novo está lá.
2. Mesmo caso fechando a aba e abrindo outra.
3. Duas abas: `flush` numa → a outra recebe a mudança uma vez.

### 5.3 Tipos (`tests/types/usage.ts`)

`flush()` e `flush("k")` → `Promise<boolean>`; `flush(1)` recusado; `@ts-expect-error` em `stores`, `_writing` e nos
demais internos do inventário.

### 5.4 Mutação manual (cada uma tem de quebrar um teste)

Tirar o `onChange(current())` · não esperar a gravação · responder sempre `true` · ignorar a regra "não legível" (D5) ·
não esperar o `setInStorage` (D4) · `flush()` só do primeiro store · resolver em vez de rejeitar na chave desconhecida ·
contar `onError` duas vezes · gravar depois do `destroy`.

## 6. Documentação

- **README**: seção `flush(key?)` em "Store adapters" (o que garante, D2–D8, exemplo de sair da conta); nota em "Sync
  between tabs" (flush avisa as abas como qualquer gravação); "Upgrading to 1.5.0" (D10).
- **CHANGELOG** 1.5.0: Added (`flush`), Changed (internos `private`/`protected` nos tipos).
- **JSDoc** de `flush` e dos internos.
- **Site** (`docsCode`): `store/vue-store.astro`, `store/react-store.astro`, `store/svelte-store.astro` e
  `exports-usage.astro` — onde mostram `setInStorage`/`destroyAll`, incluir o `flush`; `npm run generate` → `../docs`.
  Deploy (`npm run deploy`) é do usuário.
- `buildproject.txt` sem mudança (o roteiro já cobre).

## 7. Registro

**2026-11-14**

- **Passo 1 — inventário.** Regra: público = o que o README **ou o site** documentam (o site documenta
  `emitDataChange`, o README não). Público depois da mudança: storage adapters — `get`, `set`, `delete`, `has`,
  `list`, `getAll`, `reset`, `clear`, `setExpire`/`getExpire`/`deleteExpire`/`clearExpire`, `onDataChanged`,
  `emitDataChange`, `destroy`, `waitReadiness` (IndexedDB); store adapters — `setInStorage`, `getFromStorage`, `flush`,
  `destroy`, `destroyAll`. O resto: `@protected` quando uma subclasse da lib usa (`dbName`, `encrypt`, `metaKey`,
  `expireKey`, `revisionKey`, `revisions`, `enableSyncTabs`, `sharedBetweenTabs`, `adapter` do store adapter), `@private`
  nos demais (`prefix`, `adapterId`, `expireCheckInterval`, `password`, `keyDerivation`, `channel`, `channelName`,
  `_derivedKeys`, `_pendingWrites`, `_barrier`, `_expireTimer`, `isReady`, `storeName`, `dbPromise`, `kind`, `stores`,
  `_loaded`, `omitKeys`). Os `protected` que já existiam ficaram. `KeptStore`, `TabFollower`, `RevisionBook`,
  `CrossTabChannel` não são exportados e ficam inalcançáveis.
- **Achado:** `getPiniaAdapter()` dava só `{ setInStorage, getFromStorage }` (o README dizia "um store adapter") —
  agora também `flush`, `destroy`, `destroyAll`, ligados ao adapter.
- **Passo 2 — código.** `StoreAdapter.flush(key?)`, `_startKeeping`, `_canRead` (React: `getState` ou `get`);
  `KeptStore.flush()`, `keeping()`, `readable`, `_lastWriteFailed` (marcado em cada gravação: `false` não salva ou
  lançou). Uma gravação que falhou antes é regravada pelo flush (cada tentativa vai ao `onError`).
- **Passo 3 — testes.** `tests/fixes/flush.test.js` (54, os de comportamento nos 3 storages) + `getPiniaAdapter` no
  `entryPoint.test.js`. Suíte: **1309 testes, 100%** de cobertura.
- **Passo 4 — mutação: 15/15 mortas** (M1 sem `onChange`, M2 sem espera, M3 sempre `true`, M4 ignora `readable`, M5
  sem esperar o `setInStorage`, M6 só o 1º store, M7 chave desconhecida resolve, M8/M10/M15 marcação da falha, M9
  grava depois do `destroy`, M11 `_canRead` sempre `true`, M12 `every`→`some`, M13 `flush` sem `bind`, M14 `keeping`
  não registrado).
- **Passo 5 — tipos.** `usage.ts`: `flush` → `Promise<boolean>`, `flush(42)` recusado, `@ts-expect-error` em `stores`,
  `adapter`, `password`, `channel`, `revisions`, `dbPromise`, `_pendingWrites`. Conferido que pega: tirando o
  `@private` do `stores`, o teste falha.
- **Passo 6 — navegador:** `tests/browser/flush.spec.js`, 6 casos × 3 motores = 18 (recarregar logo depois, fechar a
  aba, duas abas com uma mensagem e uma gravação). Suíte de navegador: **129**.
  **Limite conhecido:** com a M1, os testes de navegador **passam** — no Pinia o aviso da mudança direta chega num
  microtask, antes de o flush voltar do primeiro `await`; quem garante no Pinia é a espera. A leitura do estado atual
  (M1) protege as bibliotecas que avisam tarde de verdade; quem a prende são os testes unitários (store que só avisa
  quando mandado). O risco no Pinia era de uma verificação **síncrona** (ler `writing` logo após a mudança), não de
  qualquer espera.
- **Passo 7 — documentação:** README (seção `flush`, helpers, TypeScript, "Upgrading to 1.5.0"), CHANGELOG 1.5.0,
  JSDoc; site — `vue-store`, `react-store`, `svelte-store` (API + boas práticas), `exports-usage` (exemplo de sair);
  `npm run generate` → `docs/`. Versão 1.5.0 em `package.json` e `package-lock.json`.
- **Passo 8 (parcial):** `npm pack` → 60 arquivos, shasum `b889deceb8808ed1af5fbdde0e885f36d71761a7` (vale se nada mudar
  até publicar); instalado numa pasta limpa — ESM (`flush` grava e responde `true`; `getPiniaAdapter` com os 5 métodos)
  e CommonJS ok. **Falta:** validar no AGC (tipos, build, tamanho) com o pacote local, antes de publicar.
