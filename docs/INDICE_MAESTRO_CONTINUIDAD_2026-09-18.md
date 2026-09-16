# Índice maestro de continuidad — Grupo Poliplast

**Corte:** 18/09/2026  
**Dueño:** Felipe Cnokaert  
**Continuidad principal:** Claude / Claude Code  
**Objetivo:** encontrar el estado correcto sin reconstruir conversaciones históricas.

## 1. Empezar siempre acá

1. Leer `docs/HANDOFF_CODEX_A_CLAUDE_2026-09-18.md` en `poli-crm`.
2. Leer `docs/REPORTE_CODEX_PARA_CLAUDE_2026-09-15.md` para el último corte verificable del CRM.
3. Para el cotizador, cambiar a la rama `codex/cotizador-v2-price-explanations` y leer:
   - `docs/CIERRE_COTIZADOR_2026-09-18.md`
   - `docs/PANORAMA_Y_PROXIMA_ETAPA_2026-09-16.md`
   - `docs/ADR-003-COTIZACIONES-COMPARTIDAS.md`
   - `docs/PROPUESTA_REGLAS_COMERCIALES.md`
   - `DESIGN.md`
4. Para método y operación comercial, leer `docs/SISTEMA_COMERCIAL_GRUPO_POLIPLAST.md` y `docs/MANUAL_USO_CRM_POLIPLAST.md`.
5. Consultar Trello `VENTAS — Grupo Poliplast` para prioridades vigentes. Los chats no son fuente oficial.

## 2. Mapa de fuentes

| Pregunta | Fuente autoritativa |
|---|---|
| ¿Qué trabajo está pendiente y quién lo hace? | Trello `VENTAS — Grupo Poliplast` |
| ¿Qué pasó con un cliente, contacto o venta? | CRM Poliplast |
| ¿Cuál es el método comercial? | `SISTEMA_COMERCIAL_GRUPO_POLIPLAST.md` |
| ¿Cómo se usa el CRM? | `MANUAL_USO_CRM_POLIPLAST.md` |
| ¿Cuál es el catálogo comercial vigente? | Catálogo Maestro v12 en Drive |
| ¿Cuál es el estado técnico del CRM? | GitHub `felicnokaert/poli-crm` + handoff |
| ¿Cuál es el estado técnico del cotizador? | GitHub `felicnokaert/poliplast-cotizador`, rama de handoff |
| ¿Dónde viven informes, fuentes y materiales? | Google Drive Grupo Poliplast |
| ¿Dónde vive la prospección nueva? | `03_PROSPECCION/Investigacion_por_familia/` en Drive |
| ¿Dónde se guarda el código? | GitHub; nunca en un chat ni solo en Drive |

## 3. Repositorios y puntos de continuidad

| Sistema | Repositorio / ubicación | Rama y corte | Estado |
|---|---|---|---|
| CRM | `felicnokaert/poli-crm` | `main`, `e619a67` | Publicado; handoff técnico completo |
| Cotizador | `felicnokaert/poliplast-cotizador` | `codex/cotizador-v2-price-explanations`, `91e0928` | Transferido; QA comercial real pendiente |
| Inventario liviano | `OneDrive/Desktop/Poliplast/Inventario/poliplast-conteo-stock` | sin repositorio Git confirmado | Prototipo local; no declararlo sistema productivo ni perderlo |
| eca-sistema / Otto | repositorio histórico independiente | verificar estado antes de actuar | No mezclar con el CRM ni con el cotizador actual |

## 4. Estado ejecutivo

### CRM

- Suite verificada: 451/451 pruebas; build limpio en el corte documentado.
- Índice de madurez: 81,2% en la décima auditoría; no equivale a adopción operativa.
- WhatsApp General: en uso; evitar cambios sin regresión concreta.
- Penosil y Juan: diferidos por decisión de Felipe.
- Mercado Libre OAuth: retirado del CRM al no haberse usado.
- Trello: único tablero maestro; no reconstruir un Kanban paralelo.

### Cotizador

- Aplicación separada del CRM, con Supabase compartido y responsabilidades delimitadas.
- Reglas comerciales, precios, packs y auditoría documentados en su rama de handoff.
- Próximo paso: QA controlado con 2–3 familias y segundo usuario; corregir solo defectos reproducibles.
- No fusionar la aplicación con el CRM. La integración futura es mínima y por enlaces/datos explícitos.

### Catálogo, precios e inventario

- Fase 6: **Catálogo/Compras — costos, precios y rentabilidad**.
- Catálogo Maestro v12 es la fuente vigente.
- Nunca inventar precios, equivalencias, packs, compatibilidades ni homologaciones de SKU.
- Las 249 variantes ambiguas requieren decisión explícita: AGRUPAR, MANTENER SEPARADO, DESACTIVAR o REVISAR.
- Stock por depósito e integración con Contabilium quedan posteriores al QA del cotizador.

### Prospección

- Terminadas: CARROZADOS/PRFV, QUIMICA, PENOSIL y PLANCHAS PUR.
- Pendientes informadas: PURMAC, BALDES, PISOS y POLIUREA.
- El Excel maestro es la fuente estructurada; los PDF son informes de lectura.
- Antes de incorporar candidatos, cruzar contra la Base Comercial para evitar duplicados.

### Shopify, Mercado Libre, Marketplace y contenido

- Shopify y Mercado Libre se gestionan mediante tareas/auditorías separadas; no volver a meterlas dentro del CRM.
- Riesgo abierto: caída aproximada de 85% en checkout/conversión Shopify, todavía sin resolución ni dueño confirmado.
- Marketplace mantiene su propia continuidad y evidencia por URLs; no declarar publicaciones completas sin verificación.
- Contenido Penosil y Catálogo WhatsApp están pausados en esta instalación de Codex.

## 5. Automatizaciones

### Codex en esta computadora — verificado

Las cuatro automatizaciones locales encontradas están **PAUSADAS**:

- `Catálogo WhatsApp completo`
- `Contenido diario Penosil`
- `Marketplace — catálogo completo hasta 18/09`
- `Shopify — auditoría y aprendizaje (Mié/Vie)`

No reactivarlas ni duplicarlas sin revisar primero si existe una tarea equivalente en Claude u otra computadora.

### Claude / otras computadoras

La topología es multi-computadora y no se sincroniza automáticamente. El estado descrito por memoria o por un chat se considera informado, no verificado, hasta revisar la pantalla de tareas de esa computadora. Guardar el prompt vigente antes de actualizar una tarea.

## 6. Qué puede hacer Claude después del 18/09

- Continuar QA y correcciones reproducibles del CRM/cotizador.
- Completar prospección y consolidar el Excel maestro.
- Mantener manuales, auditorías y Trello sin duplicar fuentes.
- Trabajar en ramas propias, ejecutar lint/tests/build y pedir aprobación antes de producción.

Claude no debe, sin aprobación de Felipe:

- modificar precios, stock, publicaciones o productos reales;
- fusionar variantes/clientes ambiguos;
- reactivar automatizaciones;
- aplicar migraciones no auditadas;
- mezclar CRM, cotizador e inventario en una sola aplicación;
- copiar secretos en documentos o chats.

## 7. Pendientes que no bloquean la salida de Codex

- QA del cotizador con segundo usuario.
- Validación del CRM por todo el equipo.
- 249 variantes ambiguas y políticas incompletas por familia.
- CRM–cotizador, inventario, fichas técnicas y Contabilium.
- Métricas reales de adopción, aceptación y conversión.
- Resolver y asignar responsable al riesgo de checkout de Shopify.

## 8. Prueba de continuidad

La transferencia se considera aprobada cuando Claude, usando solamente este índice y sus enlaces, puede:

1. identificar repositorio, rama y commit de CRM y cotizador;
2. distinguir operativo, probado, diferido e histórico;
3. ejecutar las verificaciones técnicas sin pedir secretos por chat;
4. proponer el siguiente cambio seguro sin abrir un módulo nuevo;
5. explicar qué requiere aprobación de Felipe.

