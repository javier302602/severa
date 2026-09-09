import fs from 'fs';
import path from 'path';
import { MAPEO_PLANTILLA_UNIVERSAL_RF130 } from '../../../../src/domain/services/reportes/MapeoPlantillaUniversalRF130';

// Este test es el "rastro auditable" pedido para RF-130: no alcanza con que
// el mapeo sea un comentario suelto — si alguien renombra una sección citada
// en `cubiertaPor` sin actualizar el mapeo, este test debe romper. Se leen
// como texto plano (sin exportar constantes nuevas desde ahí, para no
// ampliar el cambio de esta ronda) los DOS archivos donde puede vivir hoy el
// contenido real de una sección RF-130: GeneradorInformePDF.ts (CVSS/RF-82,
// código vivo sin tocar) e InformeUniversalRF130.ts (genérico, desde el
// cutover de RF-130 Pasada 2-C — ver Paso 2). Cada cita de `cubiertaPor` se
// verifica contra el contenido COMBINADO de ambos, no contra uno solo fijo:
// una cita CVSS solo existe en el primero, una cita genérica solo en el
// segundo, y concatenarlos evita tener que rastrear cita por cita en cuál de
// los dos vive cada una.
const RUTA_GENERADOR_PDF = path.join(
  __dirname,
  '../../../../src/infrastructure/adapters/out/reportes/GeneradorInformePDF.ts'
);
const RUTA_INFORME_UNIVERSAL = path.join(
  __dirname,
  '../../../../src/infrastructure/adapters/out/reportes/InformeUniversalRF130.ts'
);
const CONTENIDO_GENERADOR_PDF = fs.readFileSync(RUTA_GENERADOR_PDF, 'utf-8');
const CONTENIDO_INFORME_UNIVERSAL = fs.readFileSync(RUTA_INFORME_UNIVERSAL, 'utf-8');
const CONTENIDO_COMBINADO = `${CONTENIDO_GENERADOR_PDF}\n${CONTENIDO_INFORME_UNIVERSAL}`;

describe('MapeoPlantillaUniversalRF130', () => {
  test('tiene exactamente 20 entradas, numeradas 1-20 sin huecos ni repetidos', () => {
    expect(MAPEO_PLANTILLA_UNIVERSAL_RF130).toHaveLength(20);
    const numeros = MAPEO_PLANTILLA_UNIVERSAL_RF130.map((entrada) => entrada.numero).sort((a, b) => a - b);
    expect(numeros).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
  });

  test('ninguna entrada tiene nombreRF130 vacío', () => {
    MAPEO_PLANTILLA_UNIVERSAL_RF130.forEach((entrada) => {
      expect(entrada.nombreRF130.trim().length).toBeGreaterThan(0);
    });
  });

  test.each(
    MAPEO_PLANTILLA_UNIVERSAL_RF130.filter((entrada) => entrada.estado !== 'no-existe' && entrada.estado !== 'bloqueada-por-M16')
  )('sección $numero ($nombreRF130): cada título citado en cubiertaPor existe literalmente en GeneradorInformePDF.ts o InformeUniversalRF130.ts', (entrada) => {
    expect(entrada.cubiertaPor.length).toBeGreaterThan(0);
    entrada.cubiertaPor.forEach((titulo) => {
      expect(CONTENIDO_COMBINADO).toContain(titulo);
    });
  });

  test('las secciones "no-existe" y "bloqueada-por-M16" no citan ningún título (no hay nada que verificar contra el código)', () => {
    MAPEO_PLANTILLA_UNIVERSAL_RF130.filter(
      (entrada) => entrada.estado === 'no-existe' || entrada.estado === 'bloqueada-por-M16'
    ).forEach((entrada) => {
      expect(entrada.cubiertaPor).toEqual([]);
    });
  });

  test('predicción (15) y evaluación de modelos (16) están bloqueadas por M-16, con nota explicando por qué', () => {
    const prediccion = MAPEO_PLANTILLA_UNIVERSAL_RF130.find((entrada) => entrada.numero === 15);
    const evaluacionModelos = MAPEO_PLANTILLA_UNIVERSAL_RF130.find((entrada) => entrada.numero === 16);

    expect(prediccion?.estado).toBe('bloqueada-por-M16');
    expect(prediccion?.nota).toBeTruthy();
    expect(evaluacionModelos?.estado).toBe('bloqueada-por-M16');
    expect(evaluacionModelos?.nota).toBeTruthy();
  });

  test('toda entrada con estado "parcial" o "no-existe" o "bloqueada-por-M16" trae una nota explicando la limitación', () => {
    MAPEO_PLANTILLA_UNIVERSAL_RF130.filter((entrada) => entrada.estado !== 'cubierta').forEach((entrada) => {
      expect(entrada.nota?.trim()).toBeTruthy();
    });
  });
});
