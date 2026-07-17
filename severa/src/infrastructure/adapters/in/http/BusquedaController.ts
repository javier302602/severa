import express from 'express';
import { container } from '../../../config/container';
import { FiltroVulnerabilidad, CriteriosFiltroVulnerabilidad } from '../../../../domain/value-objects/FiltroVulnerabilidad';
import { EstadoRemediacion } from '../../../../domain/value-objects/EstadoRemediacion';

// M-11 (RF-84 a RF-90): rutas literales /vulnerabilidades/buscar y
// /vulnerabilidades/buscar/exportar, montadas ANTES de vulnerabilidadRouter en
// server.ts. vulnerabilidadRouter expone GET /vulnerabilidades/:cve, que
// interpretaría "buscar" como un CVE si se registrara primero — el orden de
// montaje importa aquí para que Express resuelva "buscar" antes del catch-all.
export const busquedaRouter = express.Router();

function parseCriterios(input: Record<string, unknown>): CriteriosFiltroVulnerabilidad {
  const criterios: CriteriosFiltroVulnerabilidad = {};

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
  if (typeof input.estadoRemediacion === 'string' && input.estadoRemediacion !== '') {
    criterios.estadoRemediacion = input.estadoRemediacion as EstadoRemediacion;
  }

  return criterios;
}

busquedaRouter.get('/vulnerabilidades/buscar', async (req, res) => {
  try {
    const filtro = new FiltroVulnerabilidad(parseCriterios(req.query as Record<string, unknown>));
    const resultados = await container.buscarConFiltrosUseCase.ejecutar(filtro);

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

busquedaRouter.get('/vulnerabilidades/buscar/exportar', async (req, res) => {
  try {
    const filtro = new FiltroVulnerabilidad(parseCriterios(req.query as Record<string, unknown>));
    const csv = await container.exportarBusquedaFiltradaUseCase.ejecutar(filtro);

    res.setHeader('Content-Type', 'text/csv');
    res.send(csv);
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
