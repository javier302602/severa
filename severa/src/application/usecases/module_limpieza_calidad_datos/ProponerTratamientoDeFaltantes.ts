import { PropuestaDeLimpieza, ProponerTratamientoDeFaltantesUseCase } from '../../ports/in/module_limpieza_calidad_datos/LimpiezaDeDatasetUseCases';
import { SesionAnalisisStore } from '../../ports/out/dataset/SesionAnalisisStore';
import { proponerTratamientoDeFaltantes } from '../../../domain/services/data-cleaning/TratamientoDeFaltantesGenerico';
import { obtenerSesion } from '../../utils/ResolverDatasetDeSesion';

// RF-120 (M-15, Ronda 2): opciones y recomendación por cada variable con
// valores faltantes. Solo lectura — proponer no aplica nada.
export class ProponerTratamientoDeFaltantes implements ProponerTratamientoDeFaltantesUseCase {
  constructor(private readonly sesionAnalisisStore: SesionAnalisisStore) {}

  async ejecutar(analistaId: string, sesionId: string): Promise<PropuestaDeLimpieza> {
    const datos = obtenerSesion(this.sesionAnalisisStore, analistaId, sesionId);
    return {
      totalFilas: datos.filas.length,
      totalColumnas: datos.columnas.length,
      propuestas: proponerTratamientoDeFaltantes(datos.columnas, datos.filas, datos.tiposCorregidos)
    };
  }
}
