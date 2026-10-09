import { EvaluarSerieDeTiempoGenerico } from '../../../src/application/usecases/module_deteccion_variables/EvaluarSerieDeTiempoGenerico';
import { SesionAnalisisStoreEnMemoria } from '../../../src/infrastructure/adapters/out/dataset/SesionAnalisisStoreEnMemoria';
import { SesionAnalisisNoEncontradaError } from '../../../src/domain/errors/SesionAnalisisNoEncontradaError';

// RF-108 (M-14, Ronda 2). La lógica está probada en
// tests/domain/services/variable-detection/SerieDeTiempoGenerico.test.ts; acá
// se prueba lo que agrega el caso de uso: de dónde saca los datos.
const FECHAS = Array.from({ length: 10 }, (_, i) => `2024-03-${String(i + 1).padStart(2, '0')}`);
const FILAS = FECHAS.map((fecha, i) => ({ fecha, ventas: 10 + i }));

describe('EvaluarSerieDeTiempoGenerico — RF-108', () => {
  test('evalúa el dataset de la sesión', async () => {
    const store = new SesionAnalisisStoreEnMemoria();
    const sesionId = store.crear('analista-A', { columnas: ['fecha', 'ventas'], filas: FILAS });

    const evaluacion = await new EvaluarSerieDeTiempoGenerico(store).ejecutar('analista-A', sesionId);

    expect(evaluacion).toMatchObject({ esViableComoSerieDeTiempo: true, columnaSugerida: 'fecha', variablesNumericas: ['ventas'] });
    expect(evaluacion.columnasTemporales[0]).toMatchObject({ frecuencia: 'diaria', viabilidad: 'directa' });
  });

  test('RF-111: respeta los tipos que el analista corrigió en esa sesión', async () => {
    const store = new SesionAnalisisStoreEnMemoria();
    const sesionId = store.crear('analista-A', { columnas: ['fecha', 'ventas'], filas: FILAS, tiposCorregidos: { fecha: 'categorica_nominal' } });

    const evaluacion = await new EvaluarSerieDeTiempoGenerico(store).ejecutar('analista-A', sesionId);

    expect(evaluacion.esViableComoSerieDeTiempo).toBe(false);
    expect(evaluacion.columnasTemporales).toEqual([]);
  });

  test('una sesión que no existe, o de otro analista, no se evalúa', async () => {
    const store = new SesionAnalisisStoreEnMemoria();
    const sesionId = store.crear('analista-A', { columnas: ['fecha', 'ventas'], filas: FILAS });
    const usecase = new EvaluarSerieDeTiempoGenerico(store);

    await expect(usecase.ejecutar('analista-A', 'no-existe')).rejects.toThrow(SesionAnalisisNoEncontradaError);
    await expect(usecase.ejecutar('analista-B', sesionId)).rejects.toThrow(SesionAnalisisNoEncontradaError);
  });
});
