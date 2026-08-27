import express from 'express';
import { container } from '../../../config/container';

export const graficoRouter = express.Router();

graficoRouter.get('/:tipo', async (req, res) => {
  const tipo = req.params.tipo as
    | 'histogramaCvss'
    | 'histogramaCvssAgrupado'
    | 'barrasSeveridad'
    | 'pastelSeveridad'
    | 'boxplotCvss'
    | 'dispersionCvssDias'
    | 'cvssPorAcceso'
    | 'histogramaDiasParche'
    | 'topSoftware'
    | 'topTipos';
  const formatoParam = typeof req.query.formato === 'string' ? req.query.formato : 'svg';
  const formato = formatoParam === 'json' || formatoParam === 'png' || formatoParam === 'pdf' ? formatoParam : 'svg';
  const limite = req.query.limite ? Number(req.query.limite) : undefined;

  try {
    const resultado = await container.generarGraficoUseCase.ejecutar(tipo, req.analistaAutenticado!.id, { limite, formato });

    // RF-61: la conversión real a PNG/PDF no está implementada (ver
    // SvgGraficosAdapter.generarSvgPendiente) — el Content-Type SIEMPRE
    // refleja lo que de verdad se envía (svg), nunca lo que se pidió, para no
    // prometer un formato que no se entrega. Cuando el cliente pidió png/pdf,
    // se avisa explícitamente por header en vez de dejar que lo descubra
    // comparando el Content-Type con su propio query param.
    if (formato === 'png' || formato === 'pdf') {
      res.set('X-Formato-Real', 'svg');
    }
    // Mejora "interpretación en prosa en Gráficos": formato 'svg' (el que
    // de verdad usa la página web) ya no manda el SVG crudo como body —
    // GenerarGrafico.ts lo envuelve en { svg, interpretacion }, así que el
    // body pasa a ser JSON. 'json' ya era un objeto (passthrough
    // {tipo, datos}); png/pdf siguen siendo el SVG de aviso tal cual.
    res.type(formato === 'png' || formato === 'pdf' ? 'image/svg+xml' : 'application/json');
    res.send(resultado);
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : 'Error desconocido' });
  }
});
