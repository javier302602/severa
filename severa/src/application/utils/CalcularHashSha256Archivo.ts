import { createHash } from 'crypto';
import { createReadStream } from 'fs';

// RF-135: por streaming, no fs.readFileSync — el proyecto ya documentó en
// vivo (ver comentarios de LectorDatasetGenerico.ts/docker-compose.yml,
// mem_limit) que leer un archivo de decenas/cientos de MB completo en
// memoria de una sola vez es un riesgo real medido, no teórico. Hashear por
// chunks evita sumar una segunda copia completa del archivo en heap además
// de la que ya arma el lector al parsear.
export function calcularHashSha256Archivo(rutaArchivo: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    const stream = createReadStream(rutaArchivo);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}
