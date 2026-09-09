import {
  VARIABLES_NUMERICAS_VULNERABILIDAD,
  VARIABLES_CATEGORICAS_VULNERABILIDAD,
  esVariableNumericaValida,
  esVariableCategoricaValida,
  obtenerValorNumerico,
  obtenerValorCategorico,
  obtenerSeveridadPorDefecto
} from '../../../../src/domain/services/classification/VariablesVulnerabilidad';
import { Vulnerabilidad } from '../../../../src/domain/entities/Vulnerabilidad';
import { IdentificadorCVE } from '../../../../src/domain/shared/value-objects/IdentificadorCVE';
import { CvssScore } from '../../../../src/domain/shared/value-objects/CvssScore';
import { TipoAccesoValue } from '../../../../src/domain/shared/value-objects/TipoAcceso';
import { EstadoRemediacionValue } from '../../../../src/domain/shared/value-objects/EstadoRemediacion';

function vulnerabilidadDePrueba(overrides: {
  cvss?: number;
  diasParaParche?: number;
  tipoAcceso?: string;
  estadoRemediacion?: EstadoRemediacionValue;
} = {}): Vulnerabilidad {
  return new Vulnerabilidad(
    '1',
    new IdentificadorCVE('CVE-2021-44228'),
    new CvssScore(overrides.cvss ?? 9.8),
    'Apache Log4j',
    new TipoAccesoValue(overrides.tipoAcceso ?? 'Sí'),
    overrides.diasParaParche,
    'Apache Log4j',
    'Code Injection',
    overrides.estadoRemediacion
  );
}

describe('VariablesVulnerabilidad — M-04 (retoma), Modo A', () => {
  describe('esVariableNumericaValida / esVariableCategoricaValida', () => {
    test.each(VARIABLES_NUMERICAS_VULNERABILIDAD)('"%s" es una variable numérica válida', (variable) => {
      expect(esVariableNumericaValida(variable)).toBe(true);
    });

    test.each(VARIABLES_CATEGORICAS_VULNERABILIDAD)('"%s" es una variable categórica válida', (variable) => {
      expect(esVariableCategoricaValida(variable)).toBe(true);
    });

    test('una variable inventada no es válida en ninguno de los dos conjuntos', () => {
      expect(esVariableNumericaValida('noExiste')).toBe(false);
      expect(esVariableCategoricaValida('noExiste')).toBe(false);
    });

    test('una variable categórica no cuenta como numérica y viceversa', () => {
      expect(esVariableNumericaValida('tipoAcceso')).toBe(false);
      expect(esVariableCategoricaValida('cvssScore')).toBe(false);
    });
  });

  describe('obtenerValorNumerico', () => {
    test('cvssScore devuelve el valor numérico del CvssScore', () => {
      const vulnerabilidad = vulnerabilidadDePrueba({ cvss: 7.5 });
      expect(obtenerValorNumerico(vulnerabilidad, 'cvssScore')).toBe(7.5);
    });

    test('diasParaParche devuelve el número tal cual cuando está presente', () => {
      const vulnerabilidad = vulnerabilidadDePrueba({ diasParaParche: 42 });
      expect(obtenerValorNumerico(vulnerabilidad, 'diasParaParche')).toBe(42);
    });

    test('diasParaParche devuelve undefined cuando no está presente (nunca 0 ni null)', () => {
      const vulnerabilidad = vulnerabilidadDePrueba();
      expect(obtenerValorNumerico(vulnerabilidad, 'diasParaParche')).toBeUndefined();
    });
  });

  describe('obtenerValorCategorico', () => {
    test('tipoAcceso devuelve "Remoto"/"Local" tal cual el value object', () => {
      expect(obtenerValorCategorico(vulnerabilidadDePrueba({ tipoAcceso: 'Sí' }), 'tipoAcceso')).toBe('Remoto');
      expect(obtenerValorCategorico(vulnerabilidadDePrueba({ tipoAcceso: 'No' }), 'tipoAcceso')).toBe('Local');
    });

    test('tipoAcceso ausente en la entidad usa "Local" como default (mismo criterio que la ficha, Sprint 17)', () => {
      const sinTipoAcceso = new Vulnerabilidad('1', new IdentificadorCVE('CVE-2021-44228'), new CvssScore(9.8), 'Apache Log4j');
      expect(obtenerValorCategorico(sinTipoAcceso, 'tipoAcceso')).toBe('Local');
    });

    test('estadoRemediacion devuelve el valor del value object (default "Pendiente")', () => {
      expect(obtenerValorCategorico(vulnerabilidadDePrueba(), 'estadoRemediacion')).toBe('Pendiente');
    });

    test('severidad se recalcula en memoria a partir de cvssScore (no es un campo propio de la entidad)', () => {
      const critica = vulnerabilidadDePrueba({ cvss: 9.8 });
      const baja = vulnerabilidadDePrueba({ cvss: 1.0 });

      expect(obtenerValorCategorico(critica, 'severidad')).toBe('Crítica');
      expect(obtenerValorCategorico(baja, 'severidad')).toBe('Baja');
    });
  });

  describe('obtenerSeveridadPorDefecto', () => {
    // Mismos umbrales que ClasificadorDeRiesgo (RF-69) — fuente única, no se
    // reimplementan acá. Un caso por cada uno de los 4 niveles.
    test.each([
      [9.5, 'Crítica'],
      [7.5, 'Alta'],
      [5.0, 'Media'],
      [2.0, 'Baja']
    ])('CVSS %s -> severidad "%s"', (cvss, etiquetaEsperada) => {
      expect(obtenerSeveridadPorDefecto(new CvssScore(cvss as number))).toBe(etiquetaEsperada);
    });
  });
});
