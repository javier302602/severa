import express from 'express';
import { container } from '../../../../../../config/container';

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
  // RF-51/52/53/56/57 (M-07, retoma): strings crudos, sin validar acá — cada
  // `case` del switch en GenerarGrafico.ts sabe qué taxonomía de variable
  // espera (numérica o categórica) y valida/castea ahí (VariableDeConsultaInvalidaError
  // si no es válida, capturado por el catch de abajo, ya existente). El
  // controller no necesita conocer esa taxonomía.
  const variable = typeof req.query.variable === 'string' ? req.query.variable : undefined;
  const variableAgrupacion = typeof req.query.variableAgrupacion === 'string' ? req.query.variableAgrupacion : undefined;
  const variableValor = typeof req.query.variableValor === 'string' ? req.query.variableValor : undefined;

  try {
    const resultado = await container.generarGraficoUseCase.ejecutar(tipo, req.analistaAutenticado!.id, {
      limite,
      formato,
      variable,
      variableAgrupacion,
      variableValor
    });

    // RF-61: png y pdf son descargas — el cuerpo es el archivo binario, con
    // su tipo real y un nombre de archivo (el tipo de gráfico ya pasó por el
    // switch del caso de uso, así que acá es una de las 10 claves fijas).
    if (formato === 'png' || formato === 'pdf') {
      res.setHeader('Content-Type', formato === 'png' ? 'image/png' : 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${tipo}.${formato}"`);
      res.send(resultado);
      return;
    }
    // Mejora "interpretación en prosa en Gráficos": formato 'svg' (el que
    // usa la página web) no manda el SVG crudo como body — GenerarGrafico.ts
    // lo envuelve en { svg, interpretacion }, así que el body es JSON. 'json'
    // ya era un objeto (passthrough {tipo, datos}).
    res.json(resultado);
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : 'Error desconocido' });
  }
});
