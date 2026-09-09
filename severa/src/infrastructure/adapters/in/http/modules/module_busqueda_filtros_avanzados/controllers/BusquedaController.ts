import express from 'express';
import { container } from '../../../../../../config/container';
import { FiltroVulnerabilidad, CriteriosFiltroVulnerabilidad } from '../../../../../../../domain/shared/value-objects/FiltroVulnerabilidad';
import { EstadoRemediacion } from '../../../../../../../domain/shared/value-objects/EstadoRemediacion';

// M-11 (RF-84 a RF-90): rutas literales /vulnerabilidades/buscar y
// /vulnerabilidades/buscar/exportar, montadas ANTES de vulnerabilidadRouter en
// server.ts. vulnerabilidadRouter expone GET /vulnerabilidades/:cve, que
// interpretaría "buscar" como un CVE si se registrara primero — el orden de
// montaje importa aquí para que Express resuelva "buscar" antes del catch-all.
export const busquedaRouter = express.Router();

function parseCriterios(input: Record<string, unknown>): CriteriosFiltroVulnerabilidad {
  const criterios: CriteriosFiltroVulnerabilidad = {};

  // RF-84 (M-11, retoma): cerrado sin cambios funcionales — este criterio
  // `cve` (comparación exacta, mismo índice que GET /vulnerabilidades/:cve)
  // ya es el segundo camino válido de "búsqueda rápida por identificador",
  // junto al endpoint de M-04 (ver ConsultarVulnerabilidadPorCVE.ts). No hay
  // nada que generalizar acá: `cve` sigue siendo el único identificador real.
  if (typeof input.cve === 'string' && input.cve !== '') {
    criterios.cve = input.cve;
  }
  if (input.cvssMin !== undefined && input.cvssMin !== '') {
    criterios.cvssMin = Number(input.cvssMin);
  }
  if (input.cvssMax !== undefined && input.cvssMax !== '') {
    criterios.cvssMax = Number(input.cvssMax);
  }
  if (typeof input.severidad === 'string' && input.severidad !== '') {
    criterios.severidad = input.severidad;
  }
  if (typeof input.fechaDesde === 'string' && input.fechaDesde !== '') {
    criterios.fechaDesde = new Date(input.fechaDesde);
  }
  if (typeof input.fechaHasta === 'string' && input.fechaHasta !== '') {
    criterios.fechaHasta = new Date(input.fechaHasta);
  }
  if (typeof input.componente === 'string' && input.componente !== '') {
    criterios.componente = input.componente;
  }
  // RF-86 (M-11, retoma): string crudo, sin validar acá — FiltroVulnerabilidad
  // (constructor) es quien valida contra VariableCategoricaAbiertaVulnerabilidad
  // (M-08) y aplica el default 'software' si no viene. Un valor inválido cae
  // en VariableDeConsultaInvalidaError, capturado por el catch de esta misma
  // ruta (sin try/catch nuevo).
  if (typeof input.variableComponente === 'string' && input.variableComponente !== '') {
    criterios.variableComponente = input.variableComponente;
  }
  if (typeof input.estadoRemediacion === 'string' && input.estadoRemediacion !== '') {
    criterios.estadoRemediacion = input.estadoRemediacion as EstadoRemediacion;
  }

  return criterios;
}

// Paginación (2026-07-19): sin esto, un filtro amplio (ej. severidad=Alta)
// sobre un catálogo grande devolvía y renderizaba decenas de miles de filas
// de una sola vez. "pagina" es opcional para no romper a nadie que ya
// consuma esta ruta sin esos query params (recibe la primera página).
const TAMANO_PAGINA_DEFECTO = 200;
const TAMANO_PAGINA_MAXIMO = 500;

function parsePaginacion(input: Record<string, unknown>): { limite: number; offset: number } {
  const pagina = Math.max(1, Number(input.pagina) || 1);
  const limite = Math.min(TAMANO_PAGINA_MAXIMO, Math.max(1, Number(input.limite) || TAMANO_PAGINA_DEFECTO));
  return { limite, offset: (pagina - 1) * limite };
}

busquedaRouter.get('/vulnerabilidades/buscar', async (req, res) => {
  try {
    const query = req.query as Record<string, unknown>;
    const filtro = new FiltroVulnerabilidad(parseCriterios(query));
    const resultados = await container.buscarConFiltrosUseCase.ejecutar(filtro, req.analistaAutenticado!.id, parsePaginacion(query));

    res.json(
      resultados.map((item) => ({
        cve: item.cve.valor,
        cvssScore: item.cvssScore.valor,
        software: item.descripcion,
        estadoRemediacion: item.estadoRemediacion.valor,
        fechaCarga: item.fechaCarga
      }))
    );
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : 'Error desconocido' });
  }
});

// Bug real reportado: la descarga era CSV plano — ahora es un .xlsx real
// agrupado por severidad, con color y celdas fusionadas por bloque (mismo
// exportador que /dataset/exportar, ver ExportadorExcelAgrupado.ts).
busquedaRouter.get('/vulnerabilidades/buscar/exportar', async (req, res) => {
  try {
    const filtro = new FiltroVulnerabilidad(parseCriterios(req.query as Record<string, unknown>));
    const buffer = await container.exportarBusquedaFiltradaUseCase.ejecutar(filtro, req.analistaAutenticado!.id);

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buffer);
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : 'Error desconocido' });
  }
});

// Antes confiaba en analistaId del body/query sin verificar nada — cualquiera
// podía guardar o listar filtros favoritos "a nombre de" cualquier otro
// analista con solo conocer/adivinar su id (hueco reportado en M-11). Ahora
// el analistaId SIEMPRE sale de req.analistaAutenticado.id (JWT verificado),
// nunca de lo que mande el cliente — es imposible acceder a favoritos ajenos.
busquedaRouter.post('/filtros-favoritos', async (req, res) => {
  const { nombre, criterios } = req.body;
  const analistaId = req.analistaAutenticado!.id;

  try {
    // Valida los criterios (incluida la regla de "al menos uno presente") antes
    // de guardarlos, para no persistir un filtro favorito inservible.
    new FiltroVulnerabilidad(criterios ?? {});

    const filtroFavorito = await container.guardarFiltroFavoritoUseCase.ejecutar({ analistaId, nombre, criterios });
    res.status(201).json({
      id: filtroFavorito.id,
      analistaId: filtroFavorito.analistaId,
      nombre: filtroFavorito.nombre,
      criterios: filtroFavorito.criterios,
      fechaCreacion: filtroFavorito.fechaCreacion
    });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : 'Error desconocido' });
  }
});

busquedaRouter.get('/filtros-favoritos', async (req, res) => {
  const analistaId = req.analistaAutenticado!.id;

  const favoritos = await container.listarFiltrosFavoritosUseCase.ejecutar(analistaId);
  res.json(
    favoritos.map((favorito) => ({
      id: favorito.id,
      analistaId: favorito.analistaId,
      nombre: favorito.nombre,
      criterios: favorito.criterios,
      fechaCreacion: favorito.fechaCreacion
    }))
  );
});

// RF-89: mismo criterio IDOR que el resto del módulo — analistaId SIEMPRE del
// token, nunca de la URL/body. 404 tanto si el id no existe como si es de
// otro analista (mismo mensaje, no distingue el motivo — no revela
// existencia ajena), 204 sin cuerpo si se borró: es un recurso único por id,
// no hay nada que resumir (mismo patrón que DELETE /analistas/me).
busquedaRouter.delete('/filtros-favoritos/:id', async (req, res) => {
  const analistaId = req.analistaAutenticado!.id;

  const eliminado = await container.eliminarFiltroFavoritoUseCase.ejecutar(req.params.id, analistaId);
  if (!eliminado) {
    res.status(404).json({ error: 'Filtro favorito no encontrado' });
    return;
  }

  res.status(204).send();
});
