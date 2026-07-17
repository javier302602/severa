import { BcryptHasher } from '../../src/infrastructure/adapters/out/seguridad/BcryptHasher';

describe('BcryptHasher', () => {
  test('generarHash produce un valor distinto al texto plano', async () => {
    const hasher = new BcryptHasher();
    const hash = await hasher.generarHash('mi-contrasena-segura');

    expect(hash).not.toBe('mi-contrasena-segura');
    expect(hash.length).toBeGreaterThan(0);
  });

  test('comparar devuelve true con la contraseña correcta', async () => {
    const hasher = new BcryptHasher();
    const hash = await hasher.generarHash('mi-contrasena-segura');

    await expect(hasher.comparar('mi-contrasena-segura', hash)).resolves.toBe(true);
  });

  test('comparar devuelve false con una contraseña incorrecta', async () => {
    const hasher = new BcryptHasher();
    const hash = await hasher.generarHash('mi-contrasena-segura');

    await expect(hasher.comparar('otra-cosa', hash)).resolves.toBe(false);
  });
});
