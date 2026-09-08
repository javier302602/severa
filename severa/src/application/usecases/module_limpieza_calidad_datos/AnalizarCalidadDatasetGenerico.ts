import {
  AnalizarCalidadDatasetGenericoUseCase,
  OpcionesAnalisisCalidad,
  ResultadoAnalisisCalidad
} from '../../ports/in/module_limpieza_calidad_datos/AnalizarCalidadDatasetGenericoUseCase';
import { SesionAnalisisStore } from '../../ports/out/dataset/SesionAnalisisStore';
import { analizarDataset, detectarFilasIncompletas, detectarFilasDuplicadas, validarRango } from '../../../domain/services/data-cleaning/CalidadDeDatosGenerico';
import { SesionAnalisisNoEncontradaError } from '../../../domain/errors/SesionAnalisisNoEncontradaError';
import { ColumnaDeDatasetInvalidaError } from '../../../domain/errors/ColumnaDeDatasetInvalidaError';

const UMBRAL_FILA_INCOMPLETA_DEFECTO = 50;

// M-15 (RF-114/RF-116/RF-117), Ronda 1. Solo detección/diagnóstico
// configurable — nada de esto persiste un dataset "procesado" ni imputa
// nada, eso es RF-120/121/122/123, Ronda 2 (deliberadamente fuera de
// alcance acá).
export class AnalizarCalidadDatasetGenerico implements AnalizarCalidadDatasetGenericoUseCase {
  constructor(private readonly sesionAnalisisStore: SesionAnalisisStore) {}

  async ejecutar(analistaId: string, sesionId: string, opciones: OpcionesAnalisisCalidad): Promise<ResultadoAnalisisCalidad> {
    const datos = this.sesionAnalisisStore.obtener(analistaId, sesionId);
    if (!datos) {
      throw new SesionAnalisisNoEncontradaError();
    }

    const umbralFilaIncompleta = opciones.umbralFilaIncompleta ?? UMBRAL_FILA_INCOMPLETA_DEFECTO;
    if (!Number.isFinite(umbralFilaIncompleta) || umbralFilaIncompleta < 0 || umbralFilaIncompleta > 100) {
      throw new Error('umbralFilaIncompleta debe ser un número entre 0 y 100');
    }

    // RF-116: sin columnasClave, se comparan TODAS las columnas — mismo
    // criterio (y mismo total) que contarFilasDuplicadas() usa siempre para
    // el diagnóstico embebido en /analizar.
    const columnasClave = opciones.columnasClave ?? datos.columnas;
    columnasClave.forEach((columna) => {
      if (!datos.columnas.includes(columna)) {
        throw new ColumnaDeDatasetInvalidaError(`La columna clave "${columna}" no existe en este dataset`);
      }
    });

    const diagnostico = analizarDataset(datos.columnas, datos.filas);
    const filasIncompletas = detectarFilasIncompletas(datos.columnas, datos.filas, umbralFilaIncompleta);
    const duplicados = detectarFilasDuplicadas(columnasClave, datos.filas);
    const validacionRango = this.validarRangoSiCorresponde(opciones, datos.columnas, datos.filas, diagnostico);

    return { diagnostico, filasIncompletas, duplicados, validacionRango };
  }

  private validarRangoSiCorresponde(
    opciones: OpcionesAnalisisCalidad,
    columnasDelDataset: string[],
    filas: Array<Record<string, unknown>>,
    diagnostico: ReturnType<typeof analizarDataset>
  ) {
    if (opciones.rangoColumna === undefined) {
      return undefined;
    }

    if (!columnasDelDataset.includes(opciones.rangoColumna)) {
      throw new ColumnaDeDatasetInvalidaError(`La columna "${opciones.rangoColumna}" no existe en este dataset`);
    }

    if (opciones.rangoMinimo === undefined || opciones.rangoMaximo === undefined) {
      throw new Error('Debe indicar rangoMinimo y rangoMaximo junto con rangoColumna');
    }
    if (!Number.isFinite(opciones.rangoMinimo) || !Number.isFinite(opciones.rangoMaximo)) {
      throw new Error('rangoMinimo y rangoMaximo deben ser números finitos');
    }
    if (opciones.rangoMinimo > opciones.rangoMaximo) {
      throw new Error('rangoMinimo no puede ser mayor que rangoMaximo');
    }

    // RF-117: solo columnas numéricas esta ronda (decisión tomada al
    // planear) — se usa el tipo ya calculado en el mismo diagnóstico, sin
    // volver a inferirlo.
    const columnaInfo = diagnostico.columnas.find((columna) => columna.nombre === opciones.rangoColumna);
    if (!columnaInfo || columnaInfo.tipo !== 'numerica') {
      throw new ColumnaDeDatasetInvalidaError(`La columna "${opciones.rangoColumna}" no es numérica`);
    }

    return validarRango(opciones.rangoColumna, filas, opciones.rangoMinimo, opciones.rangoMaximo);
  }
}
