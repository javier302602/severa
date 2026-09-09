import { FiltroVulnerabilidad } from '../../../../src/domain/shared/value-objects/FiltroVulnerabilidad';
import { FiltroVacioError } from '../../../../src/domain/errors/FiltroVacioError';
import { CvssFueraDeRangoError } from '../../../../src/domain/errors/CvssFueraDeRangoError';
import { VariableDeConsultaInvalidaError } from '../../../../src/domain/errors/VariableDeConsultaInvalidaError';

describe('FiltroVulnerabilidad', () => {
  test('lanza FiltroVacioError cuando no se especifica ningún criterio', () => {
    expect(() => new FiltroVulnerabilidad({})).toThrow(FiltroVacioError);
  });

  test('lanza FiltroVacioError cuando los únicos criterios presentes son cadenas vacías', () => {
    expect(() => new FiltroVulnerabilidad({ severidad: '', componente: '' })).toThrow(FiltroVacioError);
  });

  test('NO lanza FiltroVacioError cuando cvssMin es 0 (valor límite falsy pero válido)', () => {
    expect(() => new FiltroVulnerabilidad({ cvssMin: 0 })).not.toThrow();
    const filtro = new FiltroVulnerabilidad({ cvssMin: 0 });
    expect(filtro.cvssMin).toBe(0);
  });

  test('construye correctamente combinando varios criterios válidos', () => {
    const filtro = new FiltroVulnerabilidad({
      cvssMin: 9.0,
      severidad: 'Crítica',
      componente: 'Apache Log4j'
    });

    expect(filtro.cvssMin).toBe(9.0);
    expect(filtro.severidad).toBe('Crítica');
    expect(filtro.componente).toBe('Apache Log4j');
    expect(filtro.cve).toBeUndefined();
  });

  test('reutiliza la validación de IdentificadorCVE: rechaza un CVE con formato inválido', () => {
    expect(() => new FiltroVulnerabilidad({ cve: 'no-es-un-cve' })).toThrow();
  });

  test('reutiliza la validación de CvssScore: rechaza cvssMax fuera de rango (0-10)', () => {
    expect(() => new FiltroVulnerabilidad({ cvssMax: 11 })).toThrow(CvssFueraDeRangoError);
  });

  // M-11 (retoma, RF-86): variableComponente generaliza `componente` a
  // cualquier variable categórica ABIERTA (M-08: tipoVulnerabilidad |
  // software) — reutiliza VariableCategoricaAbiertaVulnerabilidad/
  // esVariableCategoricaAbiertaValida tal cual, sin tocar ComparacionPorCategoriasGenerico.ts.
  describe('variableComponente (RF-86)', () => {
    test('RETROCOMPATIBILIDAD: sin variableComponente, se resuelve a "software" (comportamiento de siempre)', () => {
      const filtro = new FiltroVulnerabilidad({ componente: 'Apache Log4j' });
      expect(filtro.variableComponente).toBe('software');
    });

    // Forma EXACTA de un favorito guardado antes de esta retoma: la clave
    // `variableComponente` ni siquiera existe en el objeto (no `undefined`
    // explícito, directamente ausente) — mismo caso que un JSONB viejo
    // deserializado desde `filtros_favoritos`.
    test('favorito guardado con la forma vieja (sin la clave variableComponente) se comporta igual que antes', () => {
      const criteriosViejos = JSON.parse('{"componente":"OpenSSL"}');
      const filtro = new FiltroVulnerabilidad(criteriosViejos);

      expect(filtro.componente).toBe('OpenSSL');
      expect(filtro.variableComponente).toBe('software');
    });

    test('con variableComponente="tipoVulnerabilidad" explícito, se resuelve tal cual', () => {
      const filtro = new FiltroVulnerabilidad({ componente: 'RCE', variableComponente: 'tipoVulnerabilidad' });
      expect(filtro.variableComponente).toBe('tipoVulnerabilidad');
    });

    test('variableComponente inválida CON componente presente tira VariableDeConsultaInvalidaError', () => {
      expect(() => new FiltroVulnerabilidad({ componente: 'Apache', variableComponente: 'noExiste' })).toThrow(
        VariableDeConsultaInvalidaError
      );
    });

    test('variableComponente inválida SIN componente presente se ignora (no valida, no tira)', () => {
      // Hay otro criterio presente (severidad) para no disparar FiltroVacioError
      // — lo que se prueba acá es que variableComponente sola, sin componente,
      // nunca se valida ni se refleja en el resultado.
      const filtro = new FiltroVulnerabilidad({ severidad: 'Alta', variableComponente: 'noExiste' });
      expect(filtro.variableComponente).toBeUndefined();
    });

    test('variableComponente NO cuenta como criterio independiente: sola (sin componente ni nada más) sigue tirando FiltroVacioError', () => {
      expect(() => new FiltroVulnerabilidad({ variableComponente: 'software' })).toThrow(FiltroVacioError);
    });
  });
});
