import type { EstrategiaDeFaltantes, OperacionDeBitacora, TipoColumna, TipoColumnaDetallado } from '../api/analisisDatosService';

// Cómo se le nombra cada tipo de variable al analista. Mismo texto que usa el
// backend en sus mensajes (ETIQUETA_DE_TIPO_DETALLADO en
// DetectorDeTipoDeColumna.ts), para que la pantalla y los errores hablen igual.
export const ETIQUETA_DE_TIPO_DETALLADO: Record<TipoColumnaDetallado, string> = {
  numerica_continua: 'Numérica continua',
  numerica_discreta: 'Numérica discreta',
  categorica_nominal: 'Categórica nominal',
  categorica_ordinal: 'Categórica ordinal',
  binaria: 'Binaria',
  fecha: 'Fecha',
  fecha_hora: 'Fecha y hora',
  texto_libre: 'Texto libre',
  identificador: 'Identificador'
};

// En el orden en que conviene ofrecerlos en un selector.
export const TIPOS_DE_COLUMNA_DETALLADOS = Object.keys(ETIQUETA_DE_TIPO_DETALLADO) as TipoColumnaDetallado[];

// Para diagnósticos que solo traen el tipo general.
export const ETIQUETA_DE_TIPO_GENERAL: Record<TipoColumna, string> = {
  numerica: 'Numérica',
  categorica: 'Categórica',
  fecha: 'Fecha',
  texto: 'Texto'
};

export const ETIQUETA_DE_ESTRATEGIA: Record<EstrategiaDeFaltantes, string> = {
  eliminar_registros: 'Eliminar los registros',
  eliminar_columna: 'Eliminar la variable',
  imputar: 'Imputar'
};

export const ETIQUETA_DE_OPERACION: Record<OperacionDeBitacora, string> = {
  eliminar_registros: 'Eliminación de registros',
  eliminar_columna: 'Eliminación de la variable',
  imputar: 'Imputación',
  corregir_tipo: 'Corrección de tipo',
  definir_variable_objetivo: 'Variable objetivo',
  configurar_criterio: 'Criterio de clasificación'
};

export function nombreDeVersion(version: number): string {
  return version === 0 ? 'Original' : `Versión ${version}`;
}
