import 'dotenv/config';

type JsonObject = Record<string, unknown>;

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3000';
const CORPUS_OK = process.env.CORPUS_OK ?? 'cev-amazonia-2024';
const CORPUS_ALT = process.env.CORPUS_ALT ?? 'medios-politica-2025';
const SEARCH_Q = process.env.SEARCH_Q ?? 'democracia';
const CONCORDANCE_Q = process.env.CONCORDANCE_Q ?? 'rio';

type CorpusSummary = { slug: string };

function assertCondition(condition: unknown, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function asObject(value: unknown, context: string): JsonObject {
  assertCondition(value !== null && typeof value === 'object' && !Array.isArray(value), `${context}: se esperaba objeto JSON.`);
  return value as JsonObject;
}

async function fetchJson(path: string, expectedStatus: number): Promise<JsonObject> {
  const response = await fetch(`${BASE_URL}${path}`, {
    headers: {
      Accept: 'application/json'
    }
  });

  const rawText = await response.text();
  let payload: unknown = {};

  if (rawText.trim()) {
    try {
      payload = JSON.parse(rawText);
    } catch {
      throw new Error(`Respuesta no JSON en ${path}: ${rawText.slice(0, 200)}`);
    }
  }

  if (response.status !== expectedStatus) {
    throw new Error(
      `Estado inesperado en ${path}. Esperado: ${expectedStatus}, recibido: ${response.status}. Payload: ${JSON.stringify(payload)}`
    );
  }

  return asObject(payload, `Respuesta ${path}`);
}

function logOk(testName: string): void {
  console.log(`OK  - ${testName}`);
}

async function resolveActiveCorpora(): Promise<{ corpusOk: string; corpusAlt: string | null }> {
  const corporaResponse = await fetchJson('/api/v1/corpora', 200);
  const rawData = corporaResponse.data as unknown;
  assertCondition(Array.isArray(rawData), 'Listado de corpora debe incluir data como arreglo.');

  const corpora = (rawData as unknown[])
    .map((item) => asObject(item, 'item de listado de corpora'))
    .map((item) => ({ slug: item.slug }))
    .filter((item): item is CorpusSummary => typeof item.slug === 'string' && item.slug.length > 0);

  assertCondition(corpora.length > 0, 'No hay corpora activos disponibles para ejecutar smoke tests.');

  const availableSlugs = new Set(corpora.map((item) => item.slug));

  const corpusOk = availableSlugs.has(CORPUS_OK) ? CORPUS_OK : corpora[0].slug;
  const preferredAlt = availableSlugs.has(CORPUS_ALT) && CORPUS_ALT !== corpusOk ? CORPUS_ALT : null;
  const fallbackAlt = corpora.find((item) => item.slug !== corpusOk)?.slug ?? null;
  const corpusAlt = preferredAlt ?? fallbackAlt;

  if (corpusOk !== CORPUS_OK) {
    console.log(`WARN - CORPUS_OK='${CORPUS_OK}' no está activo. Se usará '${corpusOk}'.`);
  }

  if (!corpusAlt) {
    console.log('WARN - No hay segundo corpus activo; se omite prueba de aislamiento cruzado.');
  }

  return { corpusOk, corpusAlt };
}

async function run(): Promise<void> {
  console.log(`Iniciando smoke tests contra ${BASE_URL}`);

  const openApi = await fetchJson('/api/v1/openapi.json', 200);
  assertCondition(typeof openApi.openapi === 'string', 'OpenAPI debe incluir campo openapi.');
  assertCondition(openApi.paths && typeof openApi.paths === 'object', 'OpenAPI debe incluir paths.');
  logOk('OpenAPI generado');

  const { corpusOk, corpusAlt } = await resolveActiveCorpora();

  const listPath = `/api/v1/corpora/${encodeURIComponent(corpusOk)}/expressions?limit=5&offset=0&sort=orden&order=asc`;
  const listResponse = await fetchJson(listPath, 200);
  assertCondition(listResponse['@context'], 'Listado debe incluir @context.');
  assertCondition(listResponse['@type'] === 'Collection', 'Listado debe tener @type=Collection.');

  const listItems = listResponse.items as unknown;
  assertCondition(Array.isArray(listItems), 'Listado debe incluir items como arreglo.');
  const expressionItems = listItems as unknown[];
  assertCondition(
    expressionItems.length > 0,
    `Listado sin datos en corpus '${corpusOk}'. Carga seed o ingesta antes de correr el smoke test.`
  );
  logOk('Listado paginado de expresiones');

  const firstExpression = asObject(expressionItems[0], 'Primer item de listado');
  const expressionIdRaw = firstExpression.id;
  assertCondition(typeof expressionIdRaw === 'string' && expressionIdRaw.length > 0, 'Primer item debe incluir id.');
  const expressionId = expressionIdRaw as string;

  const detailPath = `/api/v1/corpora/${encodeURIComponent(corpusOk)}/expressions/${encodeURIComponent(expressionId)}`;
  const detailResponse = await fetchJson(detailPath, 200);
  const detailData = asObject(detailResponse.data, 'Detalle de expresión');
  assertCondition(detailData.id === expressionId, 'Detalle debe corresponder al id solicitado.');
  assertCondition(typeof detailData.orden === 'number', 'Detalle debe incluir campo orden numérico.');
  logOk('Detalle de expresión con orden');

  const nearbyPath = `/api/v1/corpora/${encodeURIComponent(corpusOk)}/expressions/${encodeURIComponent(expressionId)}/nearby?range=5`;
  const nearbyResponse = await fetchJson(nearbyPath, 200);
  const anchor = asObject(nearbyResponse.anchor, 'Nearby anchor');
  assertCondition(anchor.id === expressionId, 'Nearby debe devolver anchor con el id solicitado.');
  assertCondition(Array.isArray(nearbyResponse.items), 'Nearby debe incluir items.');
  logOk('Endpoint nearby funcional');

  const searchPath = `/api/v1/corpora/${encodeURIComponent(corpusOk)}/expressions/search?q=${encodeURIComponent(SEARCH_Q)}&limit=5&offset=0`;
  const searchResponse = await fetchJson(searchPath, 200);
  assertCondition(searchResponse['@type'] === 'SearchResult', 'Search debe tener @type=SearchResult.');
  assertCondition(Array.isArray(searchResponse.items), 'Search debe incluir items arreglo.');
  logOk('Búsqueda full-text');

  const searchWithoutQPath = `/api/v1/corpora/${encodeURIComponent(corpusOk)}/expressions/search`;
  await fetchJson(searchWithoutQPath, 400);
  logOk('Validación de error en search sin q');

  const concordancePath = `/api/v1/corpora/${encodeURIComponent(corpusOk)}/expressions/concordance?q=${encodeURIComponent(CONCORDANCE_Q)}&limit=5&offset=0`;
  const concordanceResponse = await fetchJson(concordancePath, 200);
  assertCondition(concordanceResponse['@type'] === 'ConcordanceResult', 'Concordance debe tener @type=ConcordanceResult.');
  assertCondition(Array.isArray(concordanceResponse.items), 'Concordance debe incluir items arreglo.');
  logOk('Concordancia KWIC');

  if (corpusAlt) {
    const isolationPath = `/api/v1/corpora/${encodeURIComponent(corpusAlt)}/expressions/${encodeURIComponent(expressionId)}`;
    await fetchJson(isolationPath, 404);
    logOk('Aislamiento por corpus (404 cruzado)');
  }

  const filterPath = `/api/v1/corpora/${encodeURIComponent(corpusOk)}/expressions?tipologia=estructural&cat_gramatical=V&fuente=Amazonia&limit=5`;
  const filterResponse = await fetchJson(filterPath, 200);
  assertCondition(Array.isArray(filterResponse.items), 'Listado filtrado debe incluir items arreglo.');
  logOk('Listado con filtros combinables');

  console.log('Smoke tests finalizados correctamente.');
}

run().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`ERROR - ${message}`);
  process.exitCode = 1;
});
