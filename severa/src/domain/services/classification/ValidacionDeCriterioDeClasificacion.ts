import {
  CriterioDeClasificacionValue,
  TipoDeCriterioClasificacion,
  UmbralDeClasificacion
} from '../../shared/value-objects/CriterioDeClasificacion';
import { TipoColumna } from '../variable-detection/DetectorDeTipoDeColumna';
import { ColumnaDeDatasetInvalidaError } from '../../errors/ColumnaDeDatasetInvalidaError';

export interface DefinicionDeCriterio {
  nombreColumna: string;
  tipo: TipoDeCriterioClasificacion;
  umbrales?: UmbralDeClasificacion[];
  ordenCategorias?: string[];
}

// RF-139: arma el criterio si es apto para una columna de ese tipo vigente, o
// lanza ColumnaDeDatasetInvalidaError con el motivo. Un solo lugar para la
// regla, porque la usan quien guarda el criterio
// (ConfigurarCriterioDeClasificacion) y quien anticipa si se va a poder
// guardar (la vista previa de una plantilla de análisis, RF-12, que la evalúa
// con los tipos tal como quedarían después de aplicarla).
export function construirCriterioParaColumna(definicion: DefinicionDeCriterio, tipoColumna: TipoColumna): CriterioDeClasificacionValue {
  const { nombreColumna } = definicion;

  if (tipoColumna === 'texto' || tipoColumna === 'fecha') {
    throw new ColumnaDeDatasetInvalidaError(
      `La columna "${nombreColumna}" no es apta para clasificación (tipo detectado: ${tipoColumna}). RF-139 exige una variable numérica u ordinal.`
    );
  }

  if (tipoColumna === 'numerica') {
    if (definicion.tipo !== 'numerica' || !definicion.umbrales || definicion.umbrales.length === 0) {
      throw new ColumnaDeDatasetInvalidaError(
        `La columna "${nombreColumna}" es numérica: debe indicar tipo "numerica" y al menos un umbral`
      );
    }
    return CriterioDeClasificacionValue.numerica(nombreColumna, definicion.umbrales);
  }

  if (definicion.tipo !== 'ordinal' || !definicion.ordenCategorias || definicion.ordenCategorias.length === 0) {
    throw new ColumnaDeDatasetInvalidaError(
      `La columna "${nombreColumna}" es categórica: debe indicar tipo "ordinal" y el orden de categorías`
    );
  }
  return CriterioDeClasificacionValue.ordinal(nombreColumna, definicion.ordenCategorias);
}
