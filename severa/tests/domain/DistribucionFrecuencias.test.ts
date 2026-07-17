import {
  generarTablaAgrupada,
  generarTablaSinAgrupar
} from '../../src/domain/services/DistribucionFrecuencias';

describe('DistribucionFrecuencias', () => {
  const scores = [0.0, 1.9, 2.1, 2.3, 3.7, 4.0, 4.3, 5.9, 6.0, 7.8, 8.5, 9.1, 9.9];

  test('genera tabla agrupada en intervalos definidos', () => {
    const tabla = generarTablaAgrupada(scores);
    expect(tabla[0]).toMatchObject({
      intervalo: '[0-2)',
      limiteInferior: 0,
      limiteSuperior: 2,
      marcaDeClase: 1,
      frecuenciaAbsoluta: 2,
      frecuenciaRelativa: 2 / scores.length,
      frecuenciaRelativaPorcentaje: (2 / scores.length) * 100,
      frecuenciaAcumulada: 2
    });
    expect(tabla[4]).toMatchObject({
      intervalo: '[8-10)',
      frecuenciaAbsoluta: 3,
      frecuenciaAcumulada: scores.length
    });
  });

  test('genera tabla sin agrupar con frecuencias exactas', () => {
    const tabla = generarTablaSinAgrupar(scores);
    expect(tabla).toContainEqual({ valor: 0.0, frecuencia: 1 });
    expect(tabla).toContainEqual({ valor: 9.9, frecuencia: 1 });
  });
});
