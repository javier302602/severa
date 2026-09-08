// RF-139: pieza habilitadora. Generaliza el algoritmo de NivelDeRiesgoValue.desde()
// (buscar el primer umbral cuyo mínimo no supera el valor, en orden descendente)
// pero con los umbrales como DATO elegido por el analista, no como constante de
// módulo — es la diferencia real entre esto y ClasificadorDeRiesgo.ts/NivelDeRiesgo.ts,
// que se mantienen intactos y siguen siendo el preset CVSS (ver auditoría M-09).
//
// Deliberadamente NO reemplaza NivelDeRiesgoValue: vive aparte, consumido solo por
// ClasificadorDeRiesgoGenerico.ts sobre RegistroDatasetGenerico. Nada del pipeline
// CVSS existente pasa por acá.
export type TipoDeCriterioClasificacion = 'numerica' | 'ordinal';

export interface UmbralDeClasificacion {
  minimo: number;
  etiqueta: string;
}

const SIN_CLASIFICAR = 'Sin clasificar';

export interface CriterioDeClasificacionJSON {
  nombreColumna: string;
  tipo: TipoDeCriterioClasificacion;
  umbrales?: UmbralDeClasificacion[];
  ordenCategorias?: string[];
}

export class CriterioDeClasificacionValue {
  private constructor(
    public readonly nombreColumna: string,
    public readonly tipo: TipoDeCriterioClasificacion,
    public readonly umbrales?: UmbralDeClasificacion[],
    public readonly ordenCategorias?: string[]
  ) {}

  static numerica(nombreColumna: string, umbrales: UmbralDeClasificacion[]): CriterioDeClasificacionValue {
    // Se ordena descendente por mínimo acá (no se confía en el orden que
    // mande el analista) — mismo criterio de robustez que UMBRALES en
    // NivelDeRiesgo.ts, que sí depende de estar pre-ordenado a mano.
    const ordenados = [...umbrales].sort((a, b) => b.minimo - a.minimo);
    return new CriterioDeClasificacionValue(nombreColumna, 'numerica', ordenados, undefined);
  }

  static ordinal(nombreColumna: string, ordenCategorias: string[]): CriterioDeClasificacionValue {
    return new CriterioDeClasificacionValue(nombreColumna, 'ordinal', undefined, [...ordenCategorias]);
  }

  // Clasifica un valor crudo (tal como viene de RegistroDatasetGenerico.valores,
  // sin tipar) contra este criterio. Nunca lanza: un valor que no calza con
  // ningún umbral/categoría cae en SIN_CLASIFICAR en vez de romper el ranking
  // completo por una fila con datos inconsistentes (mismo espíritu que
  // CalidadDeDatosGenerico.ts, que reporta inconsistencias en vez de abortar).
  clasificar(valor: unknown): string {
    if (valor === null || valor === undefined || (typeof valor === 'string' && valor.trim() === '')) {
      return SIN_CLASIFICAR;
    }

    if (this.tipo === 'numerica') {
      const numero = typeof valor === 'number' ? valor : Number(valor);
      if (!Number.isFinite(numero)) {
        return SIN_CLASIFICAR;
      }
      const umbral = (this.umbrales ?? []).find((item) => numero >= item.minimo);
      return umbral ? umbral.etiqueta : SIN_CLASIFICAR;
    }

    const texto = String(valor);
    const indice = (this.ordenCategorias ?? []).indexOf(texto);
    return indice === -1 ? SIN_CLASIFICAR : this.ordenCategorias![indice];
  }

  toJSON(): CriterioDeClasificacionJSON {
    return {
      nombreColumna: this.nombreColumna,
      tipo: this.tipo,
      umbrales: this.umbrales,
      ordenCategorias: this.ordenCategorias
    };
  }

  static desdeJSON(json: CriterioDeClasificacionJSON): CriterioDeClasificacionValue {
    return new CriterioDeClasificacionValue(json.nombreColumna, json.tipo, json.umbrales, json.ordenCategorias);
  }
}
