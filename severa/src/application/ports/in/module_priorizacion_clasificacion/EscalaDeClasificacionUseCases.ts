import { CortesDeClasificacion, EscalaDeClasificacion } from '../../../../domain/shared/value-objects/EscalaDeClasificacion';

// RF-28 / RF-69 (Modo B): la escala con la que se clasifica el catálogo del
// analista.
export interface EscalaVigente {
  escala: EscalaDeClasificacion;
  // false: no configuró ninguna y rige la de CVSS.
  personalizada: boolean;
}

export interface ObtenerEscalaDeClasificacionUseCase {
  ejecutar(analistaId: string): Promise<EscalaVigente>;
}

// `anterior` es la que regía antes del cambio, para la auditoría.
export interface ResultadoCambioDeEscala extends EscalaVigente {
  anterior: EscalaVigente;
  huboCambio: boolean;
}

export interface GuardarEscalaDeClasificacionUseCase {
  // Lanza EscalaDeClasificacionInvalidaError si los cortes no sirven.
  ejecutar(analistaId: string, cortes: CortesDeClasificacion): Promise<ResultadoCambioDeEscala>;
}

export interface RestablecerEscalaDeClasificacionUseCase {
  // Vuelve a la escala CVSS.
  ejecutar(analistaId: string): Promise<ResultadoCambioDeEscala>;
}
