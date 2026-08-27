import { TipoAccesoValue } from '../../src/domain/value-objects/TipoAcceso';

describe('TipoAccesoValue', () => {
  test.each([
    ['Remoto', 'Remoto'],
    ['Sí', 'Remoto'],
    ['si', 'Remoto'],
    ['yes', 'Remoto'],
    ['true', 'Remoto'],
    ['Local', 'Local'],
    ['No', 'Local'],
    ['false', 'Local']
  ])('vocabulario original: %s -> %s', (valor, esperado) => {
    expect(new TipoAccesoValue(valor).valor).toBe(esperado);
  });

  // Vocabulario CVSS real (2026-07-18, dataset de Kaggle CVE+CISA+EPSS):
  // "attack_vector" mapea de nombre a "Acceso Remoto", pero sus valores son
  // los de CVSS (NETWORK/ADJACENT_NETWORK/LOCAL/PHYSICAL), no Sí/No.
  test.each([
    ['NETWORK', 'Remoto'],
    ['network', 'Remoto'],
    ['ADJACENT_NETWORK', 'Remoto'],
    ['LOCAL', 'Local'],
    ['local', 'Local'],
    ['PHYSICAL', 'Local']
  ])('vocabulario CVSS (attack_vector): %s -> %s', (valor, esperado) => {
    expect(new TipoAccesoValue(valor).valor).toBe(esperado);
  });

  test('un valor no reconocido en ningún vocabulario sigue rechazándose', () => {
    expect(() => new TipoAccesoValue('desconocido')).toThrow('Tipo de acceso inválido: desconocido');
  });
});
