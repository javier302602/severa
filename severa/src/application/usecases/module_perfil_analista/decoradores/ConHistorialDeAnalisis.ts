import { TipoDeAnalisisDeDataset, TipoDeAnalisisDelCatalogo } from '../../../../domain/services/historial/HistorialDeAnalisis';
import {
  OpcionesDeRegistroEnHistorial,
  RegistrarEnHistorialDeAnalisisUseCase
} from '../../../ports/in/module_perfil_analista/RegistrarEnHistorialDeAnalisisUseCase';

// RF-11. Envuelven un caso de uso para que, cuando termina bien, quede
// anotado en el historial del analista. Si el caso de uso falla no se anota
// nada (el error sigue su camino tal cual). Mismo espíritu que los
// decoradores de auditoría: ni el caso de uso ni su controlador saben que el
// historial existe.
//
// El resultado solo expone `ejecutar`: sirve para casos de uso de un único
// método, que son todos los de análisis.

type CasoDeUso<A extends unknown[], R> = { ejecutar(...args: A): Promise<R> };

// Para los análisis del pipeline genérico: todos reciben (analistaId,
// sesionId, ...) en ese orden.
export function conHistorialDeSesion<A extends unknown[], R>(
  usecase: CasoDeUso<[string, string, ...A], R>,
  historial: RegistrarEnHistorialDeAnalisisUseCase,
  tipo: TipoDeAnalisisDeDataset,
  opciones?: (resultado: R, args: [string, string, ...A]) => OpcionesDeRegistroEnHistorial
): CasoDeUso<[string, string, ...A], R> {
  return {
    async ejecutar(...args: [string, string, ...A]): Promise<R> {
      const resultado = await usecase.ejecutar(...args);
      await historial.deSesion(args[0], args[1], tipo, opciones?.(resultado, args));
      return resultado;
    }
  };
}

// Para los análisis del catálogo de vulnerabilidades. No todos reciben el
// analistaId en la misma posición, así que quien decora dice cuál es.
export function conHistorialDelCatalogo<A extends unknown[], R>(
  usecase: CasoDeUso<A, R>,
  historial: RegistrarEnHistorialDeAnalisisUseCase,
  tipo: TipoDeAnalisisDelCatalogo,
  analistaIdDe: (args: A) => string,
  opciones?: (resultado: R, args: A) => OpcionesDeRegistroEnHistorial
): CasoDeUso<A, R> {
  return {
    async ejecutar(...args: A): Promise<R> {
      const resultado = await usecase.ejecutar(...args);
      await historial.delCatalogo(analistaIdDe(args), tipo, opciones?.(resultado, args));
      return resultado;
    }
  };
}
