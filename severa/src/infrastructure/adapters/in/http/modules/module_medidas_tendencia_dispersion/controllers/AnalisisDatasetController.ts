import express from 'express';
import { container } from '../../../../../../config/container';
import { SesionAnalisisNoEncontradaError } from '../../../../../../../domain/errors/SesionAnalisisNoEncontradaError';

// Mejora 4 (Análisis de Datos General) — Fase 3/4. Módulo NUEVO y separado del
// resto de SEVERA: rutas propias bajo /analisis-datos/..., nunca
// /dataset/... (ese prefijo es del módulo de vulnerabilidades y no debe
// confundirse con este).
//
// RF-14 (Vertical Slicing, sección IV/V del doc de arquitectura): la ruta
// POST /analisis-datos/analizar (Fase 2) se movió a
// AnalisisDatasetAnalizarController.ts (module_carga_gestion_datasets, M-03);
// /outliers (Fase 4) a AnalisisDatasetOutliersController.ts
// (module_limpieza_calidad_datos, M-15); /informe (Fase 5) a
// AnalisisDatasetInformeController.ts (module_reportes_exportacion, M-10).
// Este archivo conserva las rutas de estadísticas descriptivas/univariado/
// correlación (M-06). Mismo comportamiento, solo cambia el archivo.
export const analisisDatasetRouter = express.Router();

// Fase 3: reciben sesionId (no un archivo) en la URL. analistaId sale
// siempre del token — el store verifica que el sesionId le pertenezca antes
// de devolver nada; si no existe, expiró, o es de otro analista, responde
// 404 sin distinguir el motivo (SesionAnalisisNoEncontradaError), nunca 403.
analisisDatasetRouter.get('/analisis-datos/:sesionId/estadisticas-descriptivas', async (req, res) => {
  const analistaId = req.analistaAutenticado!.id;
  // RF-109: por defecto (sin el query param, o con cualquier valor que no
  // sea literalmente "true") se excluyen las columnas identificador.
  const incluirIdentificadores = req.query.incluirIdentificadores === 'true';

  try {
    const columnas = await container.calcularEstadisticasDescriptivasGenericoUseCase.ejecutar(
      analistaId,
      req.params.sesionId,
      incluirIdentificadores
    );
    res.json({ columnas });
  } catch (error) {
    if (error instanceof SesionAnalisisNoEncontradaError) {
      res.status(404).json({ error: error.message });
      return;
    }
    res.status(400).json({ error: error instanceof Error ? error.message : 'Error desconocido' });
  }
});

// nombreColumna viaja en la URL (no en query) para que sea inequívoco que
// identifica un recurso ("la columna X de esta sesión"); el frontend debe
// codificarlo con encodeURIComponent porque los nombres de columna de un
// dataset real suelen tener espacios u otros caracteres no válidos en una URL.
// numeroDeIntervalos (RF-39): override manual y opcional del número de
// intervalos de la distribución agrupada, en vez del cálculo automático por
// Sturges. Un valor inválido (no entero, fuera de [2,30]) cae en el mismo
// catch de abajo — NumeroDeIntervalosInvalidoError responde 400 con mensaje
// claro, igual que cualquier otro error de dominio de esta ruta.
analisisDatasetRouter.get('/analisis-datos/:sesionId/univariado/:nombreColumna', async (req, res) => {
  const analistaId = req.analistaAutenticado!.id;
  const numeroDeIntervalos = req.query.numeroDeIntervalos !== undefined ? Number(req.query.numeroDeIntervalos) : undefined;

  try {
    const analisis = await container.analizarColumnaUnivariadoGenericoUseCase.ejecutar(
      analistaId,
      req.params.sesionId,
      req.params.nombreColumna,
      numeroDeIntervalos
    );
    res.json(analisis);
  } catch (error) {
    if (error instanceof SesionAnalisisNoEncontradaError) {
      res.status(404).json({ error: error.message });
      return;
    }
    res.status(400).json({ error: error instanceof Error ? error.message : 'Error desconocido' });
  }
});

// Fase 4: matriz de correlación de Pearson entre todas las columnas
// numéricas de la sesión. Devuelve los datos crudos de la matriz (filas x
// columnas x valor) para que el FRONTEND arme el heatmap — este endpoint no
// genera ninguna imagen. Las columnas que no califican (no numéricas, o
// numéricas con menos de 2 valores válidos) no rompen la respuesta: quedan
// listadas aparte en `columnasExcluidas` con el motivo.
analisisDatasetRouter.get('/analisis-datos/:sesionId/correlacion', async (req, res) => {
  const analistaId = req.analistaAutenticado!.id;

  try {
    const matriz = await container.calcularMatrizCorrelacionGenericoUseCase.ejecutar(analistaId, req.params.sesionId);
    res.json(matriz);
  } catch (error) {
    if (error instanceof SesionAnalisisNoEncontradaError) {
      res.status(404).json({ error: error.message });
      return;
    }
    res.status(400).json({ error: error instanceof Error ? error.message : 'Error desconocido' });
  }
});

