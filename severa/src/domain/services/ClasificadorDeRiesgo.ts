import { CvssScore } from '../value-objects/CvssScore';
import { NivelDeRiesgoValue } from '../value-objects/NivelDeRiesgo';

// RF-69: fuente única de la clasificación de riesgo por CVSS Score. Cualquier
// otro módulo que necesite agrupar/etiquetar por severidad (gráficos,
// persistencia, priorización) debe llamar a esta función en vez de
// reimplementar los umbrales.
export function clasificar(cvssScore: CvssScore): NivelDeRiesgoValue {
  return NivelDeRiesgoValue.desde(cvssScore);
}
