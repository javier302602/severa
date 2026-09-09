import { Vulnerabilidad } from '../../../../domain/entities/Vulnerabilidad';

// M-08 (retoma, RF-65): cross-tab de dos variables de agrupación
// independientes — defaults retrocompatibles ('tipoAcceso'/'estadoRemediacion'/
// 'cvssScore'), aunque acá "retrocompatible" es solo un default razonable:
// esta ruta no existía antes de esta retoma, no hay comportamiento previo
// que preservar.
export interface CompararPorCategoriasCruzadasUseCase {
  ejecutar(
    analistaId: string,
    variableAgrupacionA?: string,
    variableAgrupacionB?: string,
    variableValor?: string,
    vulnerabilidades?: Vulnerabilidad[]
  ): Promise<unknown>;
}
