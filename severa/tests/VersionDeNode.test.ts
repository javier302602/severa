import fs from 'fs';
import path from 'path';

// La versión de Node del proyecto se declara en un solo valor (.nvmrc) y el
// resto tiene que coincidir con él: los "engines" de los dos package.json y
// las imágenes del Dockerfile. Antes no había ningún "engines" y las
// diferencias entre runtimes no se veían (TextDecoder('windows-1252') se
// comporta distinto en Node 22.22.0 que en Node 26).
const raiz = path.join(__dirname, '..');
const leer = (archivo: string) => fs.readFileSync(path.join(raiz, archivo), 'utf8');

describe('Versión de Node del proyecto', () => {
  const version = leer('.nvmrc').trim();

  test('.nvmrc declara una versión mayor', () => {
    expect(version).toMatch(/^\d+$/);
  });

  test.each(['package.json', 'frontend/package.json'])('"engines.node" de %s coincide con .nvmrc', (archivo) => {
    expect(JSON.parse(leer(archivo)).engines?.node).toBe(`${version}.x`);
  });

  test('todas las imágenes de Node del Dockerfile usan la misma versión mayor', () => {
    const imagenes = [...leer('Dockerfile').matchAll(/^FROM node:(\S+)/gm)].map((m) => m[1]);
    expect(imagenes.length).toBeGreaterThan(0);
    for (const imagen of imagenes) expect(imagen.split(/[.-]/)[0]).toBe(version);
  });
});
