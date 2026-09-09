import { Vulnerabilidad } from '../../../../domain/entities/Vulnerabilidad';

// M-08 (retoma, RF-62/63/64/67): generaliza a N categorías — variableAgrupacion
// (VariableAgrupacionVulnerabilidad resuelta dentro del caso de uso, cerrada
// o abierta) y variableValor (VariableNumericaVulnerabilidad) son strings
// crudos, opcionales, con default retrocompatible ('tipoAcceso'/'cvssScore').
// No reemplaza a CompararPorTipoAccesoUseCase/CompararPorTipoDeVulnerabilidadUseCase/
// CompararPorSoftwareUseCase, que quedan intactos.
export interface CompararPorCategoriaUseCase {
  ejecutar(
    analistaId: string,
    variableAgrupacion?: string,
    variableValor?: string,
    vulnerabilidades?: Vulnerabilidad[]
  ): Promise<unknown>;
}
