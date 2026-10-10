import { Vulnerabilidad } from '../../../../domain/entities/Vulnerabilidad';
import { EscalaDeClasificacion } from '../../../../domain/shared/value-objects/EscalaDeClasificacion';

// RF-24 / RF-90: el catálogo (completo o filtrado) en un archivo agrupado por
// nivel de riesgo. Recibe la escala con la que se clasificó, para que el
// archivo no salga filtrado con una escala y agrupado con otra.
export interface ExportadorDeCatalogoAgrupado {
  exportar(vulnerabilidades: Vulnerabilidad[], escala: EscalaDeClasificacion): Promise<Buffer>;
}
