import { CvssScore } from '../../shared/value-objects/CvssScore';
import { NivelDeRiesgoValue } from '../../shared/value-objects/NivelDeRiesgo';
import { EscalaDeClasificacion } from '../../shared/value-objects/EscalaDeClasificacion';

// RF-69: fuente única de la clasificación de riesgo por CVSS Score. Cualquier
// otro módulo que necesite agrupar/etiquetar por severidad (gráficos,
// persistencia, priorización) debe llamar a esta función en vez de
// reimplementar los umbrales. RF-28/RF-69 (Modo B): con la escala del
// analista; sin escala, la de CVSS.
export function clasificar(cvssScore: CvssScore, escala: EscalaDeClasificacion = EscalaDeClasificacion.CVSS): NivelDeRiesgoValue {
  return NivelDeRiesgoValue.desde(cvssScore, escala);
}
