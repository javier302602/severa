import { DiagnosticoDataset } from './data-cleaning/CalidadDeDatosGenerico';
import { MatrizCorrelacion } from './descriptive-statistics/CorrelacionGenerico';
import { ResultadoDeteccionOutliers } from './data-cleaning/DeteccionOutliersGenerico';
import { VocabularioDataset, VOCABULARIO_NEUTRO, detectarVocabularioDataset } from './reportes/VocabularioDeDominioGenerico';

// Mejora 4 (Análisis de Datos General) — Fase 5. Mismo rol que
// InterpretadorDeResultados.ts (RF-81) pero para el módulo de dataset
// genérico: función pura de dominio, recibe valores YA calculados por
// CalidadDeDatosGenerico/CorrelacionGenerico/DeteccionOutliersGenerico y
// devuelve prosa — no repite ningún cálculo, no sabe nada de PDF/Word/HTTP.
// No se reutiliza InterpretadorDeResultados.ts directamente porque su
// vocabulario (CVSS, severidad, ranking de urgencia) es específico del
// dataset de vulnerabilidades; acá se replica el mismo PATRÓN (umbral ->
// frase), no el contenido.
const UMBRAL_FALTANTE_ALTO_PORCENTAJE = 20;
const UMBRAL_CORRELACION_DEBIL = 0.3;
const UMBRAL_CORRELACION_FUERTE = 0.7;

export function generarInterpretacionDataset(
  diagnostico: DiagnosticoDataset,
  matrizCorrelacion: MatrizCorrelacion,
  outliers: ResultadoDeteccionOutliers
): string[] {
  // RF-134: se deriva UNA sola vez acá (no en cada interpretarX por
  // separado) a partir de los nombres de columna del propio diagnóstico —
  // el llamador (RecopilarDatosDeInformeDataset.ts) no necesita saber que
  // esto existe ni pasar nada nuevo.
  const vocabulario = detectarVocabularioDataset(diagnostico.columnas.map((columna) => columna.nombre));

  return [
    interpretarComposicionDataset(diagnostico, vocabulario),
    interpretarCalidadDatos(diagnostico, vocabulario),
    interpretarCorrelacionMasFuerte(matrizCorrelacion),
    interpretarOutliers(outliers)
  ];
}

export function interpretarComposicionDataset(
  diagnostico: DiagnosticoDataset,
  vocabulario: VocabularioDataset = VOCABULARIO_NEUTRO
): string {
  const conteoPorTipo = new Map<string, number>();
  diagnostico.columnas.forEach((columna) => {
    conteoPorTipo.set(columna.tipo, (conteoPorTipo.get(columna.tipo) ?? 0) + 1);
  });
  const composicion = [...conteoPorTipo.entries()].map(([tipo, cantidad]) => `${cantidad} ${tipo}`).join(', ');
  // RF-134: con vocabulario neutro se mantiene "fila(s)" (redacción de
  // siempre, sin distinguir singular/plural) — con un dominio detectado sí
  // tiene sentido distinguir singular/plural porque la palabra cambia de
  // verdad (1 espécimen / 2 especímenes), a diferencia de "fila(s)" que
  // nunca lo hizo.
  const unidad =
    vocabulario.dominio === VOCABULARIO_NEUTRO.dominio
      ? 'fila(s)'
      : diagnostico.totalFilas === 1
        ? vocabulario.unidadSingular
        : vocabulario.unidadPlural;

  return `El dataset contiene ${diagnostico.totalFilas} ${unidad} y ${diagnostico.columnas.length} columna(s) (${composicion}).`;
}

export function interpretarCalidadDatos(
  diagnostico: DiagnosticoDataset,
  vocabulario: VocabularioDataset = VOCABULARIO_NEUTRO
): string {
  // RF-134: con vocabulario neutro (el caso de siempre, sin cambios) se
  // mantiene la redacción EXACTA de antes — "fila(s) duplicada(s)" es
  // gramaticalmente correcta porque "fila" es femenino, y así no se rompe
  // ningún texto ya generado para el caso default. Con un dominio detectado,
  // "duplicado(s) exacto(s)" pasa a sustantivo masculino invariable (no un
  // adjetivo pegado a la unidad) y la unidad va en frase preposicional —
  // gramaticalmente segura sin importar el género real de esa palabra (ver
  // nota de alcance en VocabularioDeDominioGenerico.ts: sin campo de género,
  // se evita el problema en vez de resolverlo con más diccionario).
  const esNeutro = vocabulario.dominio === VOCABULARIO_NEUTRO.dominio;
  const baseDuplicados =
    diagnostico.filasDuplicadas === 0
      ? esNeutro
        ? 'No se detectaron filas duplicadas exactas.'
        : `No se detectaron duplicados exactos de ${vocabulario.unidadPlural}.`
      : esNeutro
        ? `Se detectaron ${diagnostico.filasDuplicadas} fila(s) duplicada(s) exacta(s).`
        : `Se detectaron ${diagnostico.filasDuplicadas} duplicado(s) exacto(s) de ${vocabulario.unidadPlural}.`;

  const columnasConFaltantesAltos = diagnostico.columnas.filter(
    (columna) => columna.porcentajeFaltante > UMBRAL_FALTANTE_ALTO_PORCENTAJE
  );

  if (columnasConFaltantesAltos.length === 0) {
    return `${baseDuplicados} Ninguna columna supera el ${UMBRAL_FALTANTE_ALTO_PORCENTAJE}% de valores faltantes.`;
  }

  const nombres = columnasConFaltantesAltos
    .map((columna) => `"${columna.nombre}" (${columna.porcentajeFaltante.toFixed(1)}%)`)
    .join(', ');
  return `${baseDuplicados} Las columnas ${nombres} superan el ${UMBRAL_FALTANTE_ALTO_PORCENTAJE}% de valores faltantes, ` +
    'lo que podría sesgar sus estadísticos.';
}

export function interpretarCorrelacionMasFuerte(matriz: MatrizCorrelacion): string {
  if (matriz.columnas.length < 2) {
    return 'No hay al menos dos columnas numéricas elegibles para calcular correlaciones entre pares.';
  }

  let mejorA: string | null = null;
  let mejorB: string | null = null;
  let mejorValor = 0;

  for (const fila of matriz.filas) {
    for (const celda of fila.correlaciones) {
      if (celda.columna === fila.columna || celda.valor === null) continue;
      if (mejorA === null || Math.abs(celda.valor) > Math.abs(mejorValor)) {
        mejorA = fila.columna;
        mejorB = celda.columna;
        mejorValor = celda.valor;
      }
    }
  }

  if (mejorA === null || mejorB === null) {
    return 'No se pudo calcular ninguna correlación entre las columnas numéricas disponibles (pares de datos insuficientes).';
  }

  const a = mejorA;
  const b = mejorB;
  const valor = mejorValor;
  const fuerza =
    Math.abs(valor) < UMBRAL_CORRELACION_DEBIL ? 'débil' : Math.abs(valor) < UMBRAL_CORRELACION_FUERTE ? 'moderada' : 'fuerte';
  const direccion = valor >= 0 ? 'positiva' : 'negativa';
  return `La relación lineal más fuerte encontrada es entre "${a}" y "${b}" (r = ${valor.toFixed(3)}), una correlación ${fuerza} y ${direccion}.`;
}

// M-15 (RF-119): el texto ya no dice "criterio 1.5×IQR" a secas — el conteo
// ahora es la UNIÓN de lo que marca IQR y lo que marca desviación estándar
// (ver DeteccionOutliersGenerico.ValorAtipico.detectadoPor), así que un valor
// puede sumar al total por sigma aunque IQR no lo hubiera marcado.
export function interpretarOutliers(resultado: ResultadoDeteccionOutliers): string {
  const total = resultado.columnas.reduce((acumulado, columna) => acumulado + columna.cantidadValoresAtipicos, 0);

  if (total === 0) {
    return 'No se detectaron valores atípicos (criterios IQR y desviación estándar) en ninguna columna numérica.';
  }

  const detalle = resultado.columnas
    .filter((columna) => columna.cantidadValoresAtipicos > 0)
    .map((columna) => `"${columna.columna}" (${columna.cantidadValoresAtipicos})`)
    .join(', ');
  return `Se detectaron ${total} valor(es) atípico(s) en total (criterios IQR y desviación estándar), concentrados en: ${detalle}.`;
}
