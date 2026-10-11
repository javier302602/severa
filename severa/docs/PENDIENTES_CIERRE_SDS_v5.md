# Pendientes del cierre SDS v5.0

Lista de trabajo de la rama `claude/cierre-sds-v5`. Lo que está acá ya se
detectó y todavía no se resolvió; cada entrada dice en qué paso del plan se
atiende. Al cerrar una, se borra de este archivo y el commit que la resuelve
lo dice.

## Paso 2 — Escala de clasificación (tanda f)

- **Una consulta del ranking con plazos de prueba gasta para siempre la alerta
  de plazo vencido.** Encontrado por Angel el 2026-10-10. `GenerarRankingUrgencia`
  emite alertas de plazo vencido (RF-76) con los plazos que llegan por
  parámetro en la petición, y esas alertas quedan en `alertas_emitidas`: una
  consulta con plazos cortos marca como avisadas vulnerabilidades que todavía
  no vencieron, y cuando vence el plazo real ya no se avisa. Cuando los plazos
  queden guardados (tanda f), solo la configuración guardada emite alertas; un
  plazo pasado por parámetro, si se conserva, es solo de consulta y no emite ni
  registra nada.

## Paso 4 — Trazabilidad (RF que existen en el backend pero no en la interfaz)

- **RF-139 / RF-69 / RF-70 en el camino genérico.** El criterio de
  clasificación se puede guardar (`PATCH /analisis-datos/:datasetId/criterio-clasificacion`)
  pero nada clasifica ni ordena los registros de un dataset genérico con él
  (`ClasificadorDeRiesgoGenerico` no tiene consumidores) y el frontend no
  permite fijarlo. Hoy solo se puede fijar por la API; una plantilla (RF-12)
  lo aplica si lo trae.
- **RF-114, RF-116, RF-117, RF-118.** Existe `GET /analisis-datos/:sesionId/calidad`
  (umbral de filas incompletas, duplicados por columnas clave, rango válido,
  formatos inconsistentes) pero el frontend no lo llama.

- **RF-99 (umbral de alerta "crítica") no tiene pantalla.** Es configurable
  por analista en el backend (migración 015, `ConfigurarUmbralCritico`) pero
  el frontend no lo ofrece. En el Paso 2 la alerta pasa a usar el corte de
  Crítico de la escala cuando el analista no fijó un umbral propio.

- **La pantalla de Priorización no explica el orden dentro de cada nivel.**
  Dentro de un nivel el ranking pondera 70 % CVSS y 30 % días para parche
  (RF-73, z-scores dentro del nivel), así que un 8.6 puede quedar por encima de
  un 8.9 y parece un error. La pantalla tiene que decirlo.

## Paso 5 — RNF

- **`POST /auth/login` sin cuerpo devuelve el mensaje crudo de la base.**
  Encontrado el 2026-10-09. Con el cuerpo vacío, `IniciarSesionConAuditoria`
  intenta auditar el intento fallido con `usuario = undefined`; el INSERT en
  `registros_auditoria` viola el NOT NULL de `usuario` y el manejador global
  responde 400 con `null value in column "usuario" of relation "registros_auditoria"
  violates not-null constraint`. Debería responder 400 con un mensaje para la
  persona ("Debe indicar correo y contraseña") sin llegar a la auditoría, y
  la auditoría de un intento fallido no debería romperse por un correo ausente.
  Reproducir: `curl -X POST http://localhost:3000/auth/login`.
- **`/auth/register` exige que el cliente mande el `id`** y devuelve el
  mensaje crudo de la base cuando falla una restricción.
- **Los informes muestran nombres de tipo crudos y sin tilde**
  ("numerica", "categorica").
- **El análisis univariado no cuenta los marcadores "NA"** ni como válidos
  ni como faltantes cuando una columna se fuerza a numérica.
- **No existe forma de eliminar un dataset genérico** (solo se va al
  eliminar la cuenta).
- **Al cerrar sesión no se vacía la caché de consultas del frontend**
  (dos personas en el mismo navegador). Incluye ahora la lista de plantillas
  (`['plantillas-analisis']`).

- ~~**Un CSV con tildes se lee como latin-1 en la importación de archivo.**~~
  Resuelto el 2026-10-10 en su propio commit (lectura de CSV, antes de la
  tanda e): `LecturaDeTextoDelimitado` decide codificación, separador y regla
  numérica por columna para los dos lectores (también en streaming). En el
  camino se encontró y corrigió lo mismo en el nombre del archivo subido
  (multer lo decodificaba como latin-1).

## Entorno de pruebas

- **`ExportadorExcelAgrupado.test.ts` supera su tiempo límite si la suite
  del backend corre al mismo tiempo que la del frontend** (78 s contra 26 s
  en serie). En serie pasa. Las verificaciones se corren una después de la
  otra.
