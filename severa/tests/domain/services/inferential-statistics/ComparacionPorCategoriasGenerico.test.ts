import {
  compararPorCategorias,
  compararPorCategoriasCruzadas,
  resolverVariableAgrupacion,
  esVariableCategoricaAbiertaValida
} from '../../../../src/domain/services/inferential-statistics/ComparacionPorCategoriasGenerico';
import { Vulnerabilidad } from '../../../../src/domain/entities/Vulnerabilidad';
import { IdentificadorCVE } from '../../../../src/domain/shared/value-objects/IdentificadorCVE';
import { CvssScore } from '../../../../src/domain/shared/value-objects/CvssScore';
import { TipoAccesoValue } from '../../../../src/domain/shared/value-objects/TipoAcceso';
import { VariableDeConsultaInvalidaError } from '../../../../src/domain/errors/VariableDeConsultaInvalidaError';

function v(
  id: string,
  cvss: number,
  tipoAcceso: string,
  software: string,
  tipoVulnerabilidad: string,
  diasParaParche?: number,
  estadoRemediacion?: 'Pendiente' | 'EnProceso' | 'Remediada'
): Vulnerabilidad {
  const base = new Vulnerabilidad(
    id,
    new IdentificadorCVE(`CVE-2024-${id.padStart(5, '0')}`),
    new CvssScore(cvss),
    software,
    new TipoAccesoValue(tipoAcceso),
    diasParaParche,
    software,
    tipoVulnerabilidad
  );
  if (estadoRemediacion === undefined || estadoRemediacion === 'Pendiente') return base;
  if (estadoRemediacion === 'EnProceso') return base.transicionarEstado('EnProceso');
  return base.transicionarEstado('EnProceso').transicionarEstado('Remediada');
}

describe('ComparacionPorCategoriasGenerico — M-08 (retoma, RF-62/63/64/65/67)', () => {
  describe('esVariableCategoricaAbiertaValida / resolverVariableAgrupacion', () => {
    test.each(['tipoVulnerabilidad', 'software'])('"%s" es una variable categórica abierta válida', (variable) => {
      expect(esVariableCategoricaAbiertaValida(variable)).toBe(true);
    });

    test('resolverVariableAgrupacion reconoce una variable cerrada (M-04/M-07)', () => {
      expect(resolverVariableAgrupacion('tipoAcceso')).toEqual({ tipo: 'cerrada', variable: 'tipoAcceso' });
      expect(resolverVariableAgrupacion('estadoRemediacion')).toEqual({ tipo: 'cerrada', variable: 'estadoRemediacion' });
      expect(resolverVariableAgrupacion('severidad')).toEqual({ tipo: 'cerrada', variable: 'severidad' });
    });

    test('resolverVariableAgrupacion reconoce una variable abierta', () => {
      expect(resolverVariableAgrupacion('software')).toEqual({ tipo: 'abierta', variable: 'software' });
      expect(resolverVariableAgrupacion('tipoVulnerabilidad')).toEqual({ tipo: 'abierta', variable: 'tipoVulnerabilidad' });
    });

    test('una variable inexistente tira VariableDeConsultaInvalidaError', () => {
      expect(() => resolverVariableAgrupacion('noExiste')).toThrow(VariableDeConsultaInvalidaError);
    });
  });

  describe('compararPorCategorias (RF-62/63/64/67)', () => {
    const dataset = [
      v('1', 9.5, 'Sí', 'Apache Log4j', 'Log4Shell'),
      v('2', 8.5, 'Sí', 'Apache Log4j', 'RCE'),
      v('3', 2.0, 'No', 'Nginx', 'DoS')
    ];

    test('variable cerrada (tipoAcceso): siembra las 2 categorías conocidas, incluida una sin datos', () => {
      const soloRemoto = [dataset[0], dataset[1]];
      const resultado = compararPorCategorias(soloRemoto, { tipo: 'cerrada', variable: 'tipoAcceso' });

      expect(resultado).toEqual([
        { categoria: 'Remoto', media: 9, desviacionEstandar: expect.any(Number), cantidad: 2 },
        { categoria: 'Local', media: null, desviacionEstandar: null, cantidad: 0 }
      ]);
    });

    test('variable cerrada (estadoRemediacion): siembra las 3 categorías, todas en Pendiente por defecto', () => {
      const resultado = compararPorCategorias(dataset, { tipo: 'cerrada', variable: 'estadoRemediacion' });

      expect(resultado).toEqual([
        { categoria: 'Pendiente', media: expect.any(Number), desviacionEstandar: expect.any(Number), cantidad: 3 },
        { categoria: 'EnProceso', media: null, desviacionEstandar: null, cantidad: 0 },
        { categoria: 'Remediada', media: null, desviacionEstandar: null, cantidad: 0 }
      ]);
    });

    test('variable abierta (software): descubre los valores reales, sin inventar categorías vacías', () => {
      const resultado = compararPorCategorias(dataset, { tipo: 'abierta', variable: 'software' });

      expect(resultado).toEqual([
        { categoria: 'Apache Log4j', media: 9, desviacionEstandar: expect.any(Number), cantidad: 2 },
        { categoria: 'Nginx', media: 2, desviacionEstandar: null, cantidad: 1 }
      ]);
    });

    test('variable abierta (tipoVulnerabilidad): un valor por vulnerabilidad, 3 categorías reales', () => {
      const resultado = compararPorCategorias(dataset, { tipo: 'abierta', variable: 'tipoVulnerabilidad' });

      expect(resultado.map((r) => r.categoria).sort()).toEqual(['DoS', 'Log4Shell', 'RCE']);
      expect(resultado.every((r) => r.cantidad === 1)).toBe(true);
    });

    test('cantidad cuenta REGISTROS, no valores numéricos válidos (diasParaParche ausente no descarta la fila)', () => {
      const conYSinDias = [
        v('1', 9.0, 'Sí', 'A', 'X', 5),
        v('2', 8.0, 'Sí', 'A', 'X', undefined)
      ];
      const resultado = compararPorCategorias(conYSinDias, { tipo: 'cerrada', variable: 'tipoAcceso' }, 'diasParaParche');

      const remoto = resultado.find((r) => r.categoria === 'Remoto')!;
      expect(remoto.cantidad).toBe(2); // 2 registros, aunque solo 1 tenga diasParaParche
      expect(remoto.media).toBe(5); // media solo sobre el valor válido
      expect(remoto.desviacionEstandar).toBeNull(); // 1 solo valor válido -> sd no calculable
    });

    test('variableValor por defecto es cvssScore', () => {
      const resultado = compararPorCategorias([dataset[2]], { tipo: 'cerrada', variable: 'tipoAcceso' });
      expect(resultado.find((r) => r.categoria === 'Local')?.media).toBe(2.0);
    });
  });

  describe('compararPorCategoriasCruzadas (RF-65)', () => {
    const dataset = [
      v('1', 9.5, 'Sí', 'Apache Log4j', 'Log4Shell', undefined, 'Pendiente'),
      v('2', 8.5, 'Sí', 'OpenSSL', 'RCE', undefined, 'EnProceso'),
      v('3', 2.0, 'No', 'Nginx', 'DoS', undefined, 'Pendiente')
    ];

    test('cerrada x cerrada (tipoAcceso x estadoRemediacion): solo celdas observadas', () => {
      const resultado = compararPorCategoriasCruzadas(
        dataset,
        { tipo: 'cerrada', variable: 'tipoAcceso' },
        { tipo: 'cerrada', variable: 'estadoRemediacion' }
      );

      // 3 celdas observadas de las 6 posibles (2x3) — nunca un cartesiano completo.
      expect(resultado).toHaveLength(3);
      expect(resultado).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ categoriaA: 'Remoto', categoriaB: 'Pendiente', cantidad: 1 }),
          expect.objectContaining({ categoriaA: 'Remoto', categoriaB: 'EnProceso', cantidad: 1 }),
          expect.objectContaining({ categoriaA: 'Local', categoriaB: 'Pendiente', cantidad: 1 })
        ])
      );
    });

    test('cerrada x abierta (tipoAcceso x software)', () => {
      const resultado = compararPorCategoriasCruzadas(
        dataset,
        { tipo: 'cerrada', variable: 'tipoAcceso' },
        { tipo: 'abierta', variable: 'software' }
      );

      expect(resultado).toHaveLength(3);
      expect(resultado.some((c) => c.categoriaA === 'Remoto' && c.categoriaB === 'Apache Log4j')).toBe(true);
    });

    test('abierta x abierta (tipoVulnerabilidad x software): sin explotar en un cartesiano', () => {
      const resultado = compararPorCategoriasCruzadas(
        dataset,
        { tipo: 'abierta', variable: 'tipoVulnerabilidad' },
        { tipo: 'abierta', variable: 'software' }
      );

      // Exactamente 3 combinaciones reales (una por vulnerabilidad, todas distintas) — no 3x3=9.
      expect(resultado).toHaveLength(3);
    });

    test('dos vulnerabilidades en la MISMA celda se agrupan juntas (media/cantidad sobre ambas)', () => {
      const dosEnLaMismaCelda = [
        v('1', 8.0, 'Sí', 'A', 'X', undefined, 'Pendiente'),
        v('2', 10.0, 'Sí', 'B', 'Y', undefined, 'Pendiente')
      ];

      const resultado = compararPorCategoriasCruzadas(
        dosEnLaMismaCelda,
        { tipo: 'cerrada', variable: 'tipoAcceso' },
        { tipo: 'cerrada', variable: 'estadoRemediacion' }
      );

      expect(resultado).toHaveLength(1);
      expect(resultado[0]).toEqual({
        categoriaA: 'Remoto',
        categoriaB: 'Pendiente',
        media: 9.0,
        desviacionEstandar: expect.any(Number),
        cantidad: 2
      });
    });

    test('cruzar una variable contra sí misma tira VariableDeConsultaInvalidaError', () => {
      expect(() =>
        compararPorCategoriasCruzadas(dataset, { tipo: 'cerrada', variable: 'tipoAcceso' }, { tipo: 'cerrada', variable: 'tipoAcceso' })
      ).toThrow(VariableDeConsultaInvalidaError);
    });

    test('la misma variable ABIERTA contra sí misma también se rechaza', () => {
      expect(() =>
        compararPorCategoriasCruzadas(dataset, { tipo: 'abierta', variable: 'software' }, { tipo: 'abierta', variable: 'software' })
      ).toThrow(VariableDeConsultaInvalidaError);
    });

    test('celda con un solo registro: media real, desviaciónEstandar null (necesita al menos 2 valores)', () => {
      const resultado = compararPorCategoriasCruzadas(
        dataset,
        { tipo: 'cerrada', variable: 'tipoAcceso' },
        { tipo: 'cerrada', variable: 'estadoRemediacion' }
      );

      const celda = resultado.find((c) => c.categoriaA === 'Local' && c.categoriaB === 'Pendiente')!;
      expect(celda.media).toBe(2.0);
      expect(celda.desviacionEstandar).toBeNull();
      expect(celda.cantidad).toBe(1);
    });
  });
});
