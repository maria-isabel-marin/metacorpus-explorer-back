const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3000';

interface ApiResponse<T> {
  status: number;
  payload: T;
}

interface CorpusListItem {
  slug: string;
  nombre: string;
}

interface MetaphorListItem {
  id: string;
  nombre: string;
  tipologia?: string | null;
  dominio_fuente?: { nombre?: string | null } | null;
  dominio_meta?: { nombre?: string | null } | null;
}

function logOk(message: string): void {
  console.log(`OK  - ${message}`);
}

function logWarn(message: string): void {
  console.warn(`WARN - ${message}`);
}

function fail(message: string): never {
  throw new Error(message);
}

function ensure(condition: unknown, message: string): void {
  if (!condition) {
    fail(message);
  }
}

async function getJson<T>(path: string): Promise<ApiResponse<T>> {
  const response = await fetch(`${BASE_URL}${path}`);
  const payload = (await response.json()) as T;
  return { status: response.status, payload };
}

function getFirstToken(value: string): string {
  const clean = value.trim();
  if (!clean) {
    return clean;
  }
  const parts = clean.split(/\s+/);
  return parts[0] ?? clean;
}

async function pickCorpusWithMetaphors(corpora: CorpusListItem[]): Promise<{ slug: string; metaphor: MetaphorListItem }> {
  for (const corpus of corpora) {
    const list = await getJson<{ data?: { items?: MetaphorListItem[] } }>(
      `/api/v1/corpora/${encodeURIComponent(corpus.slug)}/metaphors?limit=1&offset=0`
    );

    if (list.status !== 200) {
      continue;
    }

    const first = list.payload?.data?.items?.[0];
    if (first?.id) {
      return { slug: corpus.slug, metaphor: first };
    }
  }

  fail('No se encontro ningun corpus activo con metaforas para validar la API.');
}

async function main(): Promise<void> {
  console.log(`Iniciando smoke tests contra ${BASE_URL}`);

  const corporaRes = await getJson<{ data?: CorpusListItem[] }>('/api/v1/corpora');
  ensure(corporaRes.status === 200, `Estado inesperado en /api/v1/corpora. Esperado: 200, recibido: ${corporaRes.status}`);

  const corpora = Array.isArray(corporaRes.payload?.data) ? corporaRes.payload.data : [];
  ensure(corpora.length > 0, 'No hay corpus activos para ejecutar pruebas.');
  logOk('Listado de corpus activos disponible');

  const { slug: corpusSlug, metaphor } = await pickCorpusWithMetaphors(corpora);
  const secondCorpus = corpora.find((item) => item.slug !== corpusSlug);
  logOk(`Corpus seleccionado para pruebas: ${corpusSlug}`);

  const listRes = await getJson<{ data?: { total?: number; items?: MetaphorListItem[] } }>(
    `/api/v1/corpora/${encodeURIComponent(corpusSlug)}/metaphors?limit=5&offset=0`
  );
  ensure(
    listRes.status === 200,
    `Estado inesperado en /api/v1/corpora/${corpusSlug}/metaphors. Esperado: 200, recibido: ${listRes.status}`
  );
  ensure(Array.isArray(listRes.payload?.data?.items), 'Respuesta invalida: data.items no es un arreglo en listado de metaforas.');
  logOk('Listado de metaforas con paginacion');

  if (metaphor.tipologia) {
    const tipologia = encodeURIComponent(metaphor.tipologia);
    const filteredByTypology = await getJson<{ data?: { items?: MetaphorListItem[] } }>(
      `/api/v1/corpora/${encodeURIComponent(corpusSlug)}/metaphors?tipologia=${tipologia}&limit=5&offset=0`
    );

    ensure(filteredByTypology.status === 200, 'Filtro por tipologia no respondio 200.');
    logOk('Filtro por tipologia');
  } else {
    logWarn('Se omite filtro por tipologia: la metafora base no tiene tipologia.');
  }

  const sourceDomainName = metaphor.dominio_fuente?.nombre;
  if (sourceDomainName) {
    const token = getFirstToken(sourceDomainName);
    if (token) {
      const filteredBySource = await getJson<{ data?: { items?: MetaphorListItem[] } }>(
        `/api/v1/corpora/${encodeURIComponent(corpusSlug)}/metaphors?dominio_fuente=${encodeURIComponent(token)}&limit=5&offset=0`
      );
      ensure(filteredBySource.status === 200, 'Filtro por dominio_fuente no respondio 200.');
      logOk('Filtro por dominio_fuente');
    }
  } else {
    logWarn('Se omite filtro por dominio_fuente: la metafora base no tiene dominio fuente.');
  }

  const detailRes = await getJson<{ data?: { id?: string; estadisticas?: { total_expresiones?: number } } }>(
    `/api/v1/corpora/${encodeURIComponent(corpusSlug)}/metaphors/${encodeURIComponent(metaphor.id)}`
  );
  ensure(detailRes.status === 200, 'Detalle de metafora no respondio 200.');
  ensure(detailRes.payload?.data?.id === metaphor.id, 'Detalle de metafora devuelve un id distinto al solicitado.');
  logOk('Detalle de metafora conceptual');

  const expressionsRes = await getJson<{ data?: { total?: number; items?: unknown[]; limit?: number; offset?: number } }>(
    `/api/v1/corpora/${encodeURIComponent(corpusSlug)}/metaphors/${encodeURIComponent(metaphor.id)}/expressions?limit=5&offset=0`
  );
  ensure(expressionsRes.status === 200, 'Listado de expresiones por metafora no respondio 200.');
  ensure(Array.isArray(expressionsRes.payload?.data?.items), 'Expresiones por metafora: data.items no es un arreglo.');
  ensure(expressionsRes.payload?.data?.limit === 5, 'Expresiones por metafora: limit no coincide con el solicitado.');
  ensure(expressionsRes.payload?.data?.offset === 0, 'Expresiones por metafora: offset no coincide con el solicitado.');
  logOk('Expresiones por metafora con paginacion');

  const relatedRes = await getJson<{ data?: { source_metaphor?: { id?: string }; items?: Array<{ id?: string }> } }>(
    `/api/v1/corpora/${encodeURIComponent(corpusSlug)}/metaphors/${encodeURIComponent(metaphor.id)}/related`
  );
  ensure(relatedRes.status === 200, 'Metaforas relacionadas no respondio 200.');
  ensure(Array.isArray(relatedRes.payload?.data?.items), 'Metaforas relacionadas: data.items no es un arreglo.');
  ensure(relatedRes.payload?.data?.source_metaphor?.id === metaphor.id, 'Metaforas relacionadas: source_metaphor.id invalido.');

  const relatedItems = relatedRes.payload?.data?.items ?? [];
  ensure(!relatedItems.some((item) => item.id === metaphor.id), 'Metaforas relacionadas no debe incluir la metafora origen.');
  logOk('Metaforas relacionadas por dominios');

  if (secondCorpus) {
    const isolationRes = await getJson<{ error?: string }>(
      `/api/v1/corpora/${encodeURIComponent(secondCorpus.slug)}/metaphors/${encodeURIComponent(metaphor.id)}`
    );

    ensure(isolationRes.status === 404, 'Aislamiento por corpus fallo: se esperaba 404 al consultar la metafora en otro corpus.');
    logOk('Aislamiento por corpus entre slugs distintos');
  } else {
    logWarn('Se omite validacion de aislamiento entre corpus: solo hay un corpus activo.');
  }

  console.log('Smoke tests de API de metaforas finalizados correctamente.');
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`ERROR - ${message}`);
  process.exitCode = 1;
});
