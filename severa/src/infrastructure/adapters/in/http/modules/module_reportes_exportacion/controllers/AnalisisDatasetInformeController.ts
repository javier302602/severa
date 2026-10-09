import express from 'express';
import { container } from '../../../../../../config/container';
import { enviarArchivoGenerado, leerSolicitudDeInforme } from '../../../shared/enviarArchivoGenerado';
import { SesionAnalisisNoEncontradaError } from '../../../../../../../domain/errors/SesionAnalisisNoEncontradaError';

// Mejora 4 (Análisis de Datos General) — Fase 5. RF-14 (Vertical Slicing,
// sección IV/V del doc de arquitectura): extraído de AnalisisDatasetController.ts
// (module_medidas_tendencia_dispersion) — generación de informes = M-10
// (Reportes y Exportación Universal). Mismo comportamiento, mismo endpoint,
// solo cambia el archivo.
export const analisisDatasetInformeRouter = express.Router();

// Informe completo del dataset de la sesión (mismo criterio IDOR, mismos
// parámetros de consulta y mismos formatos que /informes/completo del módulo
// de vulnerabilidades — ver InformeController.ts).
analisisDatasetInformeRouter.get('/analisis-datos/:sesionId/informe', async (req, res) => {
  const solicitud = leerSolicitudDeInforme(req);
  if ('error' in solicitud) {
    res.status(400).json({ error: solicitud.error });
    return;
  }

  const analistaId = req.analistaAutenticado!.id;

  try {
    const archivo = await container.generarInformeDatasetUseCase.ejecutar(analistaId, req.params.sesionId, solicitud.formato, solicitud.opciones);
    enviarArchivoGenerado(res, archivo, 'informe-analisis-datos');
  } catch (error) {
    if (error instanceof SesionAnalisisNoEncontradaError) {
      res.status(404).json({ error: error.message });
      return;
    }
    res.status(400).json({ error: error instanceof Error ? error.message : 'Error desconocido' });
  }
});
