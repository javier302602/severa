import { AnalizarColumnaUnivariadoGenericoUseCase } from '../ports/in/AnalizarColumnaUnivariadoGenericoUseCase';
import { SesionAnalisisStore } from '../ports/out/SesionAnalisisStore';
import { AnalisisUnivariado, analizarColumnaUnivariado } from '../../domain/services/AnalisisUnivariadoGenerico';
import { SesionAnalisisNoEncontradaError } from '../../domain/errors/SesionAnalisisNoEncontradaError';

// Mejora 4 (Análisis de Datos General) — Fase 3.
export class AnalizarColumnaUnivariadoGenerico implements AnalizarColumnaUnivariadoGenericoUseCase {
  constructor(private readonly sesionAnalisisStore: SesionAnalisisStore) {}

  async ejecutar(analistaId: string, sesionId: string, nombreColumna: string): Promise<AnalisisUnivariado> {
    const datos = this.sesionAnalisisStore.obtener(analistaId, sesionId);
    if (!datos) {
      throw new SesionAnalisisNoEncontradaError();
    }

    return analizarColumnaUnivariado(nombreColumna, datos.columnas, datos.filas);
  }
}
