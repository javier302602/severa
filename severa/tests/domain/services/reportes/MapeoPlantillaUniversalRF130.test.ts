import fs from 'fs';
import path from 'path';
import { MAPEO_PLANTILLA_UNIVERSAL_RF130 } from '../../../../src/domain/services/reportes/MapeoPlantillaUniversalRF130';

// Este test es el "rastro auditable" pedido para RF-130: no alcanza con que
// el mapeo sea un comentario suelto — si alguien renombra un título de
// sección en GeneradorInformePDF.ts sin actualizar el mapeo, este test debe
// romper. Se lee el generador como texto plano (sin exportar constantes
// nuevas desde ahí, para no ampliar el cambio de esta ronda) y se verifica
// que cada título citado en `cubiertaPor` existe literalmente.
const RUTA_GENERADOR_PDF = path.join(
  __dirname,
  '../../../../src/infrastructure/adapters/out/reportes/GeneradorInformePDF.ts'
);
const CONTENIDO_GENERADOR_PDF = fs.readFileSync(RUTA_GENERADOR_PDF, 'utf-8');

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
  )('sección $numero ($nombreRF130): cada título citado en cubiertaPor existe literalmente en GeneradorInformePDF.ts', (entrada) => {
    expect(entrada.cubiertaPor.length).toBeGreaterThan(0);
    entrada.cubiertaPor.forEach((titulo) => {
      expect(CONTENIDO_GENERADOR_PDF).toContain(titulo);
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
