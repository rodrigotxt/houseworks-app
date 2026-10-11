// scripts/generate-api-types.mjs
// Gera os tipos do cliente a partir do CONTRATO, e nao de interfaces escritas a mao.
// Assim o front nao consegue divergir da API sem o build reclamar.
//
// O contrato vive em docs/openapi.yaml, na raiz deste repositorio. Para apontar para outro:
//
//   API_SPEC=/caminho/para/openapi.yaml npm run gen:api
//
// O arquivo gerado e versionado de proposito: o frontend continua compilando sem rodar a
// geracao. O que ele nao faz e compilar contra um contrato desatualizado em silencio — o
// schema commitado e a fonte, e um contrato novo so entra depois de `npm run gen:api`.

import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const padrao = '../docs/openapi.yaml';
const spec = resolve(process.env.API_SPEC ?? padrao);
const destino = 'lib/domain/api/schema.d.ts';

if (!existsSync(spec)) {
  console.error('Contrato nao encontrado em: ' + spec);
  console.error('Rode com API_SPEC=/caminho/openapi.yaml npm run gen:api');
  process.exit(1);
}

console.log('Gerando tipos de ' + spec);
execFileSync('npx', ['openapi-typescript', spec, '-o', destino], { stdio: 'inherit' });
console.log('Tipos gerados em ' + destino);
