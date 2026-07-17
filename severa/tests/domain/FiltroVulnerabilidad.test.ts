import { FiltroVulnerabilidad } from '../../src/domain/value-objects/FiltroVulnerabilidad';
import { FiltroVacioError } from '../../src/domain/errors/FiltroVacioError';
import { CvssFueraDeRangoError } from '../../src/domain/errors/CvssFueraDeRangoError';

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
});
