import express from 'express';
import { container } from '../../../config/container';

export const informeRouter = express.Router();

const CONTENT_TYPE_POR_FORMATO: Record<'pdf' | 'docx', string> = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
};

informeRouter.get('/informes/completo', async (req, res) => {
  const formato = req.query.formato;

  if (formato !== 'pdf' && formato !== 'docx') {
    res.status(400).json({ error: 'Parámetro "formato" inválido. Valores permitidos: pdf, docx.' });
    return;
  }

  const buffer = await container.generarInformeUseCase.ejecutar(formato, req.analistaAutenticado!.id);
  res.setHeader('Content-Type', CONTENT_TYPE_POR_FORMATO[formato]);
  res.send(buffer);
});

informeRouter.get('/informes/resumen-ejecutivo', async (req, res) => {
  const buffer = await container.generarResumenEjecutivoUseCase.ejecutar(req.analistaAutenticado!.id);
  res.setHeader('Content-Type', CONTENT_TYPE_POR_FORMATO.pdf);
  res.send(buffer);
});

// RF-83: programa la generación periódica de informes. Llamar dos veces
// reemplaza la programación anterior (ver NodeCronProgramadorDeTareas) en vez
// de acumular tareas en paralelo.
informeRouter.post('/informes/programar', async (req, res) => {
  const { frecuencia } = req.body;

  if (frecuencia !== 'semanal' && frecuencia !== 'mensual') {
    res.status(400).json({ error: 'Parámetro "frecuencia" inválido. Valores permitidos: semanal, mensual.' });
    return;
  }

  await container.programarInformePeriodicoUseCase.ejecutar(frecuencia, req.analistaAutenticado!.id);
  res.status(202).json({ mensaje: `Informe periódico (${frecuencia}) programado correctamente` });
});
