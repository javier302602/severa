import express from 'express';
import { container } from '../../../../../../config/container';
import { SesionAnalisisNoEncontradaError } from '../../../../../../../domain/errors/SesionAnalisisNoEncontradaError';

// Mejora 4 (Análisis de Datos General) — Fase 5. RF-14 (Vertical Slicing,
// sección IV/V del doc de arquitectura): extraído de AnalisisDatasetController.ts
// (module_medidas_tendencia_dispersion) — generación de informes = M-10
// (Reportes y Exportación Universal). Mismo comportamiento, mismo endpoint,
// solo cambia el archivo.
export const analisisDatasetInformeRouter = express.Router();

const CONTENT_TYPE_INFORME_POR_FORMATO: Record<'pdf' | 'docx', string> = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
};

// Informe completo del dataset de la sesión (mismo criterio IDOR, mismo
// formato de query param que /informes/completo del módulo de
// vulnerabilidades — ver InformeController.ts).
analisisDatasetInformeRouter.get('/analisis-datos/:sesionId/informe', async (req, res) => {
  const formato = req.query.formato;
  if (formato !== 'pdf' && formato !== 'docx') {
    res.status(400).json({ error: 'Parámetro "formato" inválido. Valores permitidos: pdf, docx.' });
    return;
  }

  const analistaId = req.analistaAutenticado!.id;

  try {
    const buffer = await container.generarInformeDatasetUseCase.ejecutar(analistaId, req.params.sesionId, formato);
    res.setHeader('Content-Type', CONTENT_TYPE_INFORME_POR_FORMATO[formato]);
    res.send(buffer);
  } catch (error) {
    if (error instanceof SesionAnalisisNoEncontradaError) {
      res.status(404).json({ error: error.message });
      return;
    }
    res.status(400).json({ error: error instanceof Error ? error.message : 'Error desconocido' });
  }
});
