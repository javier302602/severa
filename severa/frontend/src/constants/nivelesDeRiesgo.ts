import type { NivelDeRiesgo } from '../api/priorizacionService';

// RF-28 / RF-69: los cuatro niveles de riesgo, con el vocabulario unificado.
// Qué rango de CVSS le toca a cada uno lo decide la escala del analista
// (Perfil → Escala de niveles de riesgo), no esta lista.
export const NIVELES_DE_RIESGO: readonly NivelDeRiesgo[] = ['Bajo', 'Moderado', 'Alto', 'Crítico'];

// Los nombres que se usaron antes de unificar el vocabulario (Baja, Media,
// Alta, Crítica). Los filtros favoritos guardados con ellos se muestran con
// el nombre nuevo.
const SINONIMOS: Record<string, NivelDeRiesgo> = {
  bajo: 'Bajo',
  baja: 'Bajo',
  moderado: 'Moderado',
  moderada: 'Moderado',
  media: 'Moderado',
  medio: 'Moderado',
  alto: 'Alto',
  alta: 'Alto',
  critico: 'Crítico',
  critica: 'Crítico'
};

export function nivelDeRiesgoDesdeTexto(texto: string): NivelDeRiesgo | null {
  const clave = texto
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
  return SINONIMOS[clave] ?? null;
}
