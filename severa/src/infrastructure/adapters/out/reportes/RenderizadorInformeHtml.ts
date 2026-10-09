import { BloqueDeInforme, FragmentoDeTexto } from './BloquesDeInforme';

// RF-132: el informe como una página HTML autocontenida — un solo archivo,
// con los estilos en un <style> y los gráficos como SVG en línea. No pide
// nada a la red (ni fuentes, ni hojas de estilo, ni imágenes): se puede
// abrir desde un pendrive, adjuntar a un correo o publicar tal cual.
//
// Es un renderer de bloques (ver BloquesDeInforme.ts): no decide contenido,
// así que dice lo mismo que el Word por construcción.

// TODO el texto que llega en un bloque puede venir del dataset del usuario
// (nombres de columna, valores de celda, nombre del analista), así que se
// escapa siempre, sin excepciones: un archivo de datos con una columna
// llamada "<script>..." no debe poder ejecutar nada cuando alguien abre el
// informe exportado. Las comillas también, porque el texto se usa dentro de
// atributos (aria-label, id).
export function escaparHtml(valor: string): string {
  return valor
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function fragmentosAHtml(fragmentos: FragmentoDeTexto[]): string {
  return fragmentos
    .map((fragmento) => {
      let html = escaparHtml(fragmento.texto);
      if (fragmento.cursiva) html = `<em>${html}</em>`;
      if (fragmento.negrita) html = `<strong>${html}</strong>`;
      return html;
    })
    .join('');
}

// Las figuras son SVG generados por SvgDibujoDeGraficos.ts, que ya escapa el
// texto que dibuja; acá solo se le agrega al elemento raíz lo que necesita
// para comportarse como imagen dentro de una página: un nombre accesible y
// un ancho máximo (el SVG trae viewBox pero no tamaño propio).
function svgEnLinea(svg: string, tituloFigura: string, ancho: number): string {
  return svg.replace('<svg ', `<svg role="img" aria-label="${escaparHtml(tituloFigura)}" style="max-width:${ancho * 1.4}px" `);
}

function tablaAHtml(encabezados: string[], filas: string[][]): string {
  const cabecera = encabezados.map((celda) => `<th scope="col">${escaparHtml(celda)}</th>`).join('');
  const cuerpo = filas.map((fila) => `<tr>${fila.map((celda) => `<td>${escaparHtml(celda)}</td>`).join('')}</tr>`).join('\n');
  return `<div class="tabla"><table>\n<thead><tr>${cabecera}</tr></thead>\n<tbody>\n${cuerpo}\n</tbody>\n</table></div>`;
}

const ESTILOS = `
:root { color-scheme: light; }
* { box-sizing: border-box; }
body { margin: 0; background: #f1f5f9; color: #1e293b; font-family: Georgia, "Times New Roman", Times, serif; font-size: 17px; line-height: 1.6; }
main { max-width: 52rem; margin: 0 auto; padding: 3rem 2.5rem 4rem; background: #ffffff; min-height: 100vh; }
h1 { font-size: 1.9rem; line-height: 1.25; text-align: center; margin: 1rem 0 0.75rem; color: #0f172a; }
.subtitulo-portada { text-align: center; font-weight: bold; font-size: 1.1rem; color: #334155; margin: 0 0 0.5rem; }
.portada p { text-align: center; color: #64748b; margin: 0.15rem 0; }
h2 { font-size: 1.35rem; line-height: 1.3; margin: 2.75rem 0 0.75rem; padding-bottom: 0.3rem; border-bottom: 2px solid #1d4ed8; color: #0f172a; }
h3 { font-size: 1.08rem; margin: 1.75rem 0 0.5rem; color: #1e3a8a; }
p { margin: 0 0 0.9rem; }
ul { margin: 0 0 0.9rem; padding-left: 1.4rem; }
li { margin-bottom: 0.45rem; }
nav { margin: 2.5rem 0 1rem; padding: 1.25rem 1.5rem; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; }
nav h2 { margin: 0 0 0.6rem; padding: 0; border: 0; font-size: 1.1rem; }
nav ol { margin: 0; padding: 0; list-style: none; columns: 2; column-gap: 2rem; }
nav li { margin: 0 0 0.25rem; break-inside: avoid; }
a { color: #1d4ed8; text-decoration: none; }
a:hover, a:focus { text-decoration: underline; }
.tabla { overflow-x: auto; margin: 0 0 1.25rem; }
table { border-collapse: collapse; width: 100%; font-family: system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif; font-size: 0.82rem; line-height: 1.4; }
th, td { border: 1px solid #94a3b8; padding: 0.35rem 0.55rem; text-align: left; vertical-align: top; }
th { background: #e2e8f0; }
tbody tr:nth-child(even) { background: #f8fafc; }
figure { margin: 1.25rem 0 0.4rem; text-align: center; }
figure svg { width: 100%; height: auto; border: 1px solid #e2e8f0; }
.epigrafe { text-align: center; font-style: italic; font-size: 0.85rem; color: #475569; margin: 0 0 1.1rem; }
@media (max-width: 40rem) { main { padding: 1.5rem 1rem 3rem; } nav ol { columns: 1; } body { font-size: 16px; } }
@media print {
  body { background: #ffffff; font-size: 11pt; }
  main { max-width: none; padding: 0; }
  nav { break-after: page; }
  h2, h3 { break-after: avoid; }
  figure, tr { break-inside: avoid; }
  .tabla { overflow: visible; }
  a { color: inherit; }
}
`;

// Ancla estable para cada sección de primer nivel: el índice enlaza a ellas.
function idDeSeccion(posicion: number): string {
  return `seccion-${posicion + 1}`;
}

export function renderizarInformeHtml(bloques: BloqueDeInforme[]): string {
  const tituloDocumento = bloques.find((bloque): bloque is Extract<BloqueDeInforme, { tipo: 'titulo' }> => bloque.tipo === 'titulo')?.texto ?? 'Informe SIADE';
  const secciones = bloques.filter(
    (bloque): bloque is Extract<BloqueDeInforme, { tipo: 'encabezado' }> => bloque.tipo === 'encabezado' && bloque.nivel === 1
  );

  const cuerpo: string[] = [];
  let listaAbierta = false;
  // Todo lo que está antes del índice es la portada (título, para quién se
  // generó, fecha): se envuelve para poder centrarlo sin afectar al resto.
  let enPortada = bloques.some((bloque) => bloque.tipo === 'indice');
  if (enPortada) cuerpo.push('<header class="portada">');
  let seccionesVistas = 0;

  const cerrarLista = () => {
    if (listaAbierta) {
      cuerpo.push('</ul>');
      listaAbierta = false;
    }
  };

  for (const bloque of bloques) {
    if (bloque.tipo !== 'vineta') cerrarLista();

    switch (bloque.tipo) {
      case 'titulo':
        cuerpo.push(`<h1>${escaparHtml(bloque.texto)}</h1>`);
        break;
      case 'subtituloDePortada':
        cuerpo.push(`<p class="subtitulo-portada">${escaparHtml(bloque.texto)}</p>`);
        break;
      case 'indice':
        if (enPortada) {
          cuerpo.push('</header>');
          enPortada = false;
        }
        cuerpo.push(
          '<nav aria-label="Índice">\n<h2>Índice</h2>\n<ol>\n' +
            secciones.map((seccion, posicion) => `<li><a href="#${idDeSeccion(posicion)}">${escaparHtml(seccion.texto)}</a></li>`).join('\n') +
            '\n</ol>\n</nav>'
        );
        break;
      case 'encabezado':
        if (bloque.nivel === 1) {
          cuerpo.push(`<h2 id="${idDeSeccion(seccionesVistas)}">${escaparHtml(bloque.texto)}</h2>`);
          seccionesVistas += 1;
        } else {
          cuerpo.push(`<h3>${escaparHtml(bloque.texto)}</h3>`);
        }
        break;
      case 'parrafo':
        cuerpo.push(`<p>${fragmentosAHtml(bloque.fragmentos)}</p>`);
        break;
      case 'vineta':
        if (!listaAbierta) {
          cuerpo.push('<ul>');
          listaAbierta = true;
        }
        cuerpo.push(`<li>${escaparHtml(bloque.texto)}</li>`);
        break;
      case 'tabla':
        cuerpo.push(tablaAHtml(bloque.encabezados, bloque.filas));
        break;
      case 'figura':
        cuerpo.push(`<figure>${svgEnLinea(bloque.svg, bloque.titulo, bloque.ancho)}</figure>`);
        break;
      case 'epigrafe':
        cuerpo.push(`<p class="epigrafe">${escaparHtml(bloque.texto)}</p>`);
        break;
      default: {
        const exhaustivo: never = bloque;
        throw new Error(`Bloque de informe no manejado: ${JSON.stringify(exhaustivo)}`);
      }
    }
  }
  cerrarLista();
  if (enPortada) cuerpo.push('</header>');

  return (
    '<!DOCTYPE html>\n<html lang="es">\n<head>\n<meta charset="utf-8">\n' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">\n' +
    '<meta name="generator" content="SIADE">\n' +
    `<title>${escaparHtml(tituloDocumento)}</title>\n<style>${ESTILOS}</style>\n</head>\n<body>\n<main>\n` +
    cuerpo.join('\n') +
    '\n</main>\n</body>\n</html>\n'
  );
}
