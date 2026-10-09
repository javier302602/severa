import express from 'express';
import { container } from '../../../../../../config/container';
import { EscalaVigente } from '../../../../../../../application/ports/in/module_priorizacion_clasificacion/EscalaDeClasificacionUseCases';
import { EscalaDeClasificacion } from '../../../../../../../domain/shared/value-objects/EscalaDeClasificacion';
import { EscalaDeClasificacionInvalidaError } from '../../../../../../../domain/errors/EscalaDeClasificacionInvalidaError';

// RF-28 / RF-69 (M-04, M-09), "Modo B": la escala de clasificación del
// analista del token. Nunca se lee ni se cambia la de otro: no hay ningún id
// de analista en la ruta ni en el cuerpo.
//   GET    /escala-clasificacion   la vigente (la personalizada o la de CVSS)
//   PUT    /escala-clasificacion   { moderado, alto, critico } — dónde empieza cada nivel
//   DELETE /escala-clasificacion   vuelve a la escala CVSS
export const escalaDeClasificacionRouter = express.Router();

// Lo que necesita la pantalla: los cortes, los cuatro rangos, el texto con
// que se nombra la escala y los cortes de CVSS (para "Volver a la escala CVSS").
export function aRespuestaDeEscala({ escala, personalizada }: EscalaVigente) {
  return {
    personalizada,
    cortes: { ...escala.cortes },
    rangos: escala.rangos,
    descripcion: escala.describir(),
    cortesCvss: { ...EscalaDeClasificacion.CVSS.cortes }
  };
}

escalaDeClasificacionRouter.get('/escala-clasificacion', async (req, res) => {
  res.json(aRespuestaDeEscala(await container.obtenerEscalaDeClasificacionUseCase.ejecutar(req.analistaAutenticado!.id)));
});

escalaDeClasificacionRouter.put('/escala-clasificacion', async (req, res) => {
  const { moderado, alto, critico } = (req.body ?? {}) as Record<string, unknown>;
  if (typeof moderado !== 'number' || typeof alto !== 'number' || typeof critico !== 'number') {
    res.status(400).json({ error: 'Indicá con números desde qué valor empieza cada nivel: "moderado", "alto" y "critico".' });
    return;
  }

  try {
    const resultado = await container.guardarEscalaDeClasificacionUseCase.ejecutar(req.analistaAutenticado!.id, { moderado, alto, critico });
    res.json(aRespuestaDeEscala(resultado));
  } catch (error) {
    if (error instanceof EscalaDeClasificacionInvalidaError) {
      res.status(400).json({ error: error.message });
      return;
    }
    throw error;
  }
});

escalaDeClasificacionRouter.delete('/escala-clasificacion', async (req, res) => {
  res.json(aRespuestaDeEscala(await container.restablecerEscalaDeClasificacionUseCase.ejecutar(req.analistaAutenticado!.id)));
});
