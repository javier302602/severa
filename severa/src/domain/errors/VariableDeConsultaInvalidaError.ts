// RF-27/RF-28 (M-04, retoma): el analista pidió una `variable` que no está
// en VARIABLES_NUMERICAS_VULNERABILIDAD/VARIABLES_CATEGORICAS_VULNERABILIDAD
// (ver VariablesVulnerabilidad.ts) — mismo espíritu que ColumnaDeDatasetInvalidaError
// (M-09) pero ese error es del pipeline genérico (columnas arbitrarias de un
// dataset); acá el conjunto de variables válidas es fijo y conocido de
// antemano, así que el mensaje puede listarlas.
export class VariableDeConsultaInvalidaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'VariableDeConsultaInvalidaError';
  }
}
