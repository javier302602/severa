import type { Request, Response } from 'express';
import { ArchivoGenerado, FORMATOS_DE_INFORME, FormatoDeInforme, OpcionesDeInforme, esFormatoDeInforme } from '../../../../../application/ports/out/reportes/GeneradorDeInformes';

// Compartido por las dos rutas de informe completo (vulnerabilidades y
// dataset genérico): mismos parámetros de consulta, misma forma de responder.

export type SolicitudDeInforme = { formato: FormatoDeInforme; opciones: OpcionesDeInforme };

// Lee ?formato=...&adjuntarGraficos=true|false. Devuelve el mensaje de error
// (para un 400) en vez de tirar: un parámetro mal escrito es un error del
// cliente, y un valor desconocido se rechaza en vez de ignorarse — pedir
// "adjuntarGraficos=si" y recibir el informe sin gráficos, sin aviso, es peor
// que un 400 que dice qué valores se aceptan.
export function leerSolicitudDeInforme(req: Request): SolicitudDeInforme | { error: string } {
  const { formato, adjuntarGraficos } = req.query;

  if (!esFormatoDeInforme(formato)) {
    return { error: `Parámetro "formato" inválido. Valores permitidos: ${FORMATOS_DE_INFORME.join(', ')}.` };
  }
  if (adjuntarGraficos !== undefined && adjuntarGraficos !== 'true' && adjuntarGraficos !== 'false') {
    return { error: 'Parámetro "adjuntarGraficos" inválido. Valores permitidos: true, false.' };
  }

  return { formato, opciones: { adjuntarGraficos: adjuntarGraficos === 'true' } };
}

// nombreBase: fijo y ASCII, lo elige el controller — nunca sale de un dato
// del usuario, así que no hay nada que escapar en la cabecera.
// "attachment": el archivo se descarga, no se abre en el origen de la API.
// Importa sobre todo para el HTML (RF-132): es contenido armado con datos del
// usuario, y aunque todo el texto va escapado, no tiene por qué renderizarse
// con las credenciales de la API a mano.
export function enviarArchivoGenerado(res: Response, archivo: ArchivoGenerado, nombreBase: string): void {
  res.setHeader('Content-Type', archivo.tipoMime);
  res.setHeader('Content-Disposition', `attachment; filename="${nombreBase}.${archivo.extension}"`);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.send(archivo.contenido);
}
