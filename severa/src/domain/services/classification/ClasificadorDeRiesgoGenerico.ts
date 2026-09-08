import { RegistroDatasetGenerico } from '../../entities/RegistroDatasetGenerico';
import { CriterioDeClasificacionValue } from '../../shared/value-objects/CriterioDeClasificacion';

// RF-139: contraparte genérica de ClasificadorDeRiesgo.ts (CVSS) — vive aparte
// a propósito, no lo reemplaza. Lee el valor de la columna elegida por el
// analista (criterio.nombreColumna) desde RegistroDatasetGenerico.valores y
// delega la clasificación en el propio CriterioDeClasificacionValue.
export function clasificar(registro: RegistroDatasetGenerico, criterio: CriterioDeClasificacionValue): string {
  const valor = registro.valores[criterio.nombreColumna];
  return criterio.clasificar(valor);
}
