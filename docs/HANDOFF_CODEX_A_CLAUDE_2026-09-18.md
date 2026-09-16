# Handoff técnico definitivo: Codex → Claude Code

**Corte:** 16/09/2026

**Fecha objetivo de transferencia:** 18/09/2026

**Dueño funcional:** Felipe Cnokaert

**Continuidad técnica:** Claude Code

**Estado:** transferencia lista; reemplaza las tablas históricas contradictorias del handoff anterior.
**Seguridad:** no contiene secretos, tokens, contraseñas ni valores de service role.

## 1. Uso y decisiones cerradas

Este archivo es la entrada única para continuar el CRM y el cotizador sin memoria de chats. Antes de modificar código: identificar el repo/rama de la sección 2, leer las fuentes normativas, preservar cambios ajenos y no reinterpretar decisiones cerradas como preguntas.

Etiquetas: **Operativo** = desplegado/utilizable; **Experimental** = construido pero sin validación operativa suficiente; **Diferido** = decisión consciente de no continuar ahora; **Histórico** = persiste en código/datos pero ya no es conducta vigente.

Decisiones cerradas:

1. El cotizador es una aplicación separada del CRM, con despliegue propio y Supabase compartido.
2. Trello `VENTAS — Grupo Poliplast` es el tablero único de prioridades. El CRM conserva tareas comerciales de clientes.
3. WhatsApp General está en uso. Penosil y Juan están diferidos y no deben declararse operativos.
4. OAuth de Mercado Libre fue retirado del CRM por falta de uso real; sus migraciones son históricas.
5. No se fusionan productos/clientes ambiguos automáticamente.
6. El cotizador trabaja en USD y muestra equivalencia final en ARS.
7. El documento fiscal/comercial se generará en Contabilium; el cotizador prioriza WhatsApp. La impresión del navegador se conserva para listas de precios.
8. Stock no bloquea cotizaciones hasta integrar una fuente confiable por SKU.
9. **Fase 6 está definida y cerrada:** Catálogo/Compras — costos, precios y rentabilidad. Fuente: Anexo A de `SISTEMA_COMERCIAL_GRUPO_POLIPLAST.md`. No es fase de ventas ni pregunta pendiente.

## 2. Repositorios, ramas y despliegues

### CRM

| Campo | Valor |
| --- | --- |
| GitHub | `https://github.com/felicnokaert/poli-crm` |
| Local | `C:\Users\felip\OneDrive\Desktop\Poliplast\poliplast-sales-copilot` |
| Rama canónica | `main` |
| Último commit funcional | `b0a343fd203c8b241d2b7ee509ebb712c6754c30` (`b0a343f`) |
| Commit del handoff | `397f867` (`main`; contiene este documento y el reporte del 15/09) |
| Producción | `https://poli-crm.vercel.app/` |
| Stack | React + Vite + Supabase + funciones Vercel |

### Cotizador

| Campo | Valor |
| --- | --- |
| GitHub | `https://github.com/felicnokaert/poliplast-cotizador` |
| Worktree de cierre | `C:\Users\felip\.codex\worktrees\5c02\poliplast-cotizador` |
| Rama más reciente | `codex/cotizador-v2-price-explanations` |
| Último commit funcional/documental previo | `b4210961214d8d9f2e15a6125a66ff5cabdd1e25` (`b421096`) |
| Commit puntero del handoff | `91e0928` en `codex/cotizador-v2-price-explanations` |
| `origin/master` al corte | `bbe3ffd` |
| Producción | `https://poliplast-cotizador.vercel.app/` |
| Proyecto Vercel | `poliplast-cotizador` |
| Stack | React 19 + TypeScript + Vite + Supabase |

Continuar desde la rama remota más reciente:

```bash
git fetch origin
git switch codex/cotizador-v2-price-explanations
git pull --ff-only
```

No usar sin actualizar `C:\Users\felip\OneDrive\Desktop\Poliplast\poliplast-cotizador`: su `master` local estaba 35 commits detrás del remoto.

## 3. Fuentes normativas

CRM/sistema comercial:

- `docs/SISTEMA_COMERCIAL_GRUPO_POLIPLAST.md`: proceso y Anexo A de Fase 6.
- `docs/MANUAL_USO_CRM_POLIPLAST.md`.
- `docs/COPILOTO_COMERCIAL_ARQUITECTURA.md`.
- `docs/IDENTIDAD_UNICA_CLIENTE_SPEC.md`.
- `docs/BASE_CONOCIMIENTO_TECNICA_SPEC.md`.
- `docs/REPORTE_CODEX_PARA_CLAUDE_2026-09-15.md`.

Cotizador:

- En el repo CRM: `docs/COTIZADOR_COMERCIAL_SPEC.md` y ADR de aplicación separada/datos compartidos.
- En el repo cotizador: `DESIGN.md`, `docs/CIERRE_COTIZADOR_2026-09-18.md`, `docs/ADR-003-COTIZACIONES-COMPARTIDAS.md`, `docs/PROPUESTA_REGLAS_COMERCIALES.md` y `docs/PANORAMA_Y_PROXIMA_ETAPA_2026-09-16.md`.

Fuentes operativas:

- CRM: empresas, contactos, conversaciones y tareas.
- Cotizador + Supabase: cotizaciones, snapshots, precios y reglas.
- Trello: prioridades/responsables.
- Drive: `00_CONTROL`, `05_REPORTES`, `03_PROSPECCION/Investigacion_por_familia/`.
- App `https://poliplast-conteo-stock.netlify.app/`: futura fuente de inventario por SKU.
- Contabilium: emisión administrativa/fiscal futura.

## 4. Arquitectura

```text
Usuarios corporativos
 ├─ CRM (poli-crm.vercel.app)
 │   ├─ empresas, contactos, conversaciones, tareas y pipeline
 │   ├─ Academia, triage y ayuda contextual
 │   └─ funciones Vercel / WhatsApp / cron / backups
 ├─ Cotizador (poliplast-cotizador.vercel.app)
 │   ├─ historial y workspace
 │   ├─ catálogo, listas y reglas comerciales
 │   └─ vista previa / preparación de WhatsApp
 └─ Supabase `nghwmtccpovrdtzvllwe` (`poli crm`)
     ├─ Auth y RLS por usuario/rol
     ├─ catálogo, variantes, costos y precios
     ├─ reglas/políticas y cotizaciones con snapshots
     └─ documentos técnicos y backups
```

Principios: anon key en frontend, nunca service role; autorización mediante Auth+RLS; snapshots históricos inmutables; reglas versionadas/superseded; no duplicar clientes ni catálogo entre aplicaciones.

## 5. Estado del CRM

### Operativo

- Empresas con varias personas/teléfonos, contacto principal y clasificación por persona.
- Pipeline/Cuentas activas, historial, tareas, ventas/comisiones y persistencia.
- Etapas canónicas separadas de Ganado/Perdido/Pausado.
- Academia: 12 etapas, 13 objeciones, 10 playbooks y E-C-E-R-A.
- Triage y ayuda contextual sin envío automático.
- WhatsApp General protegido de cambios sin regresión concreta.
- Cron `/api/cron-daily-maintenance` a las 06:00 UTC, autenticado con `CRON_SECRET`.
- Backup en Supabase Storage y alerta si el cron supera el umbral de antigüedad.
- Rework visual: tokens base, Dashboard y Pipeline/Cuentas activas.

### Experimental

- Triage/ayuda contextual con casos reales.
- Ventas/comisiones multi-comercial con datos reales.
- Base técnica: gobierno e infraestructura; sincronización completa con Drive no cerrada.
- Adopción por equipo no medida. El 81,2% es madurez técnica, no adopción.

### Diferido

- WhatsApp Penosil: coexistencia física + mensaje entrante real.
- WhatsApp Juan: acceso, canal y uso real.
- Fusión/deshacer masivo de duplicados reales.

### Histórico/retirado

- OAuth de Mercado Libre dentro del CRM.
- Kanban interno como fuente de prioridades.

### UI pendiente

- Ventas, Tareas, Base técnica, Cartera y Academia. No desplazar QA operativo por este rework salvo prioridad expresa.

## 6. Estado del cotizador

### Operativo

- Auth corporativo en Supabase compartido.
- Historial como inicio y creación de nueva cotización.
- Numeración secuencial desde `0001`.
- Guardado compartido de cabecera/renglones con snapshot; respaldo local.
- Búsqueda desde tres caracteres o SKU.
- Catálogo y administración de familia, subfamilia, precio unitario USD y activo/inactivo.
- Cotización en USD y total equivalente ARS; TC automático o manual.
- Forma de pago, cheque con plazo, descuento, estado y observaciones.
- Vista previa y preparación de WhatsApp.
- Selector/alta no destructiva de teléfonos del cliente.
- Listas minorista/mayorista imprimibles; mayorista solo con productos elegibles.
- Administración protegida para Felipe/Juan mediante autorización de base.
- Políticas versionables, buscables y desactivables.
- Logos/co-branding por familia con Grupo Poliplast principal.

### Reglas vigentes

- Todo precio comercial en USD; ARS solo equivalencia final.
- Penosil mayorista: USD 1.800 netos / USD 2.178 final; mezcla productos/cajas elegibles.
- Tramos por SKU o familia con mínimo, máximo opcional, neto, IVA y final.
- SKU gana sobre familia; entre reglas compatibles se usa el umbral aplicable más específico/alto.
- Sin regla intermedia se usa precio unitario/lista; no se inventan condiciones.
- Baldes admiten tramos 1–111, 112–224 y 225+, solo con valores confirmados.
- Kits de marketplace se desactivan cuando el cotizador vende por unidad; no borrar sin revisión.

### Catálogo pendiente

- 53 variantes `ACTIVE=FALSO` ocultas.
- 466 filas agrupables de alta confianza en 95 grupos.
- 249 filas ambiguas; requieren decisión humana.
- Archivo: `C:\Users\felip\OneDrive\Desktop\Poliplast\04_Informes\Revision_variantes_cotizador_2026-09-15.xlsx`.
- Decisiones: `AGRUPAR`, `MANTENER SEPARADO`, `DESACTIVAR`, `REVISAR`.
- Prioridad: Penosil, Resinplast, Baldes, Poliuretanos, Purmac/Repuestos.

### Experimental/pendiente

- QA completo por Felipe y segundo usuario.
- Stock por SKU/depósito.
- Fichas técnicas y venta complementaria desde CRM.
- Traspaso a Contabilium.
- Métricas de aceptación/rechazo/conversión.

Último corte: `npm run lint` aprobado; 15 archivos y 113/113 tests; build aprobado. Advertencia no bloqueante: bundle JS >500 kB.

## 7. Variables — nombres, nunca valores

CRM frontend:

```text
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
```

CRM servidor/Vercel:

```text
SUPABASE_URL
SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
CRON_SECRET
CRON_STALE_HOURS
WHATSAPP_VERIFY_TOKEN
WHATSAPP_BRIDGE_TOKEN
WHATSAPP_GENERAL_PHONE_ID
WHATSAPP_PENOSIL_PHONE_ID
WHATSAPP_JUAN_PHONE_ID
META_APP_ID
META_APP_SECRET
META_CONFIG_ID
META_SYSTEM_USER_TOKEN
COPILOT_SIMULATOR_TOKEN
```

Las `MELI_*` pueden aparecer en `.env.example`/historial, pero ML está retirado. No recrearlas sin decisión explícita.

Cotizador frontend:

```text
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
```

El cotizador nunca recibe `SUPABASE_SERVICE_ROLE_KEY`. Los valores reales viven en Vercel/Supabase o archivos ignorados.

## 8. Migraciones Supabase

Repo CRM:

```text
20260828120719_initial_schema.sql
20260829010746_acceso_corporativo.sql
20260829103831_espacio_compartido.sql
20260904052554_workspace_states_per_user_isolation.sql
20260904163344_whatsapp_events_channel_rls.sql
20260904165259_remove_penosil_from_felipe_channels.sql
20260907153133_mercadolibre.sql
20260910204355_base_tecnica_technical_documents.sql
20260910204437_base_tecnica_harden_function_execute.sql
20260910215628_catalogo_cotizador_inventario.sql
20260910231541_add_extracted_text_to_technical_documents.sql
20260911115355_add_technical_documents_storage_bucket.sql
20260911141754_add_technical_documents_delete_policy.sql
20260912024500_shared_quotes.sql
20260912035103_commercial_rules.sql
20260912113000_product_document_links.sql
20260912123000_catalog_cost_import_rpc.sql
20260912133000_catalog_price_import_rpc.sql
20260914190000_add_backups_storage_bucket.sql
```

Repo cotizador:

```text
20260913_commercial_policies_and_quote_numbers.sql
20260914115130_shared_quote_history.sql
20260914140719_shared_commercial_client_phones.sql
20260914143405_quote_payment_terms.sql
20260914170526_grant_juan_admin_catalog_management.sql
20260914170907_harden_admin_authorization_function.sql
20260914171141_inline_catalog_price_editor.sql
20260914172521_convert_commercial_rules_to_usd.sql
20260914174607_reset_wholesale_rules_and_add_ranges.sql
20260914175018_optimize_wholesale_policy_rls.sql
```

Continuidad: verificar remoto antes de aplicar; migración nueva en archivo nuevo; no reescribir aplicadas; usar flujo versionado; revisar `SECURITY DEFINER`, `search_path`, grants y RLS; no confundir la migración ML histórica con integración vigente.

## 9. Desarrollo y despliegue

CRM:

```bash
npm install
npm run dev
npm test
npm run build
npm run smoke:supabase  # solo con entorno autorizado
```

Cotizador:

```bash
npm install
npm run dev
npm run lint
npm test
npm run build
```

Procedimiento: rama propia; revisar `git diff`; nunca incluir secretos; tests/build; PR a rama canónica; merge con aprobación de Felipe si afecta producción/datos; Vercel autodespliega; verificar solo el recorrido modificado. No desplegar manualmente si Git integration ya lo hace y no cambiar variables de Vercel sin necesidad documentada.

## 10. Automatizaciones y externos

- Cron CRM diario: operativo; requiere `CRON_SECRET`.
- Tareas ML/Shopify viven fuera de estos repos y pueden correr en otra computadora.
- Las dos computadoras de Felipe no sincronizan tareas ni todas las carpetas locales.
- ML: auditoría externa de lectura; no modificar publicaciones automáticamente.
- Shopify: tarea externa autorizada para SEO antiguo; confirmar estado en esa tarea.
- Contabilium: integración futura; credenciales nunca en Git.

## 11. Riesgos y dueño

| Riesgo | Dueño |
| --- | --- |
| 249 variantes ambiguas | Felipe |
| Precios/reglas incompletos | Felipe + administración |
| QA del cotizador con dos usuarios | Felipe/equipo |
| Rework visual CRM restante | Claude Code cuando Felipe priorice |
| Adopción no medida | Felipe/equipo |
| Stock no integrado | Inventario + técnico |
| Contabilium no integrado | Técnico + Felipe |
| Caída reportada de 85% en checkout/conversión Shopify | **Sin dueño asignado** |
| Divergencia entre computadoras | Felipe / gobierno de información |
| Bundle cotizador >500 kB | Claude Code; deuda menor |

## 12. Próximo paso técnico recomendado

No abrir integración nueva. Ejecutar un ciclo de QA operativo: Felipe crea una cotización controlada con 2–3 familias; otro usuario la encuentra/reabre; se comparan regla, USD, IVA, ARS y forma de pago; se revisan teléfonos/vista previa sin enviar; cada diferencia se registra con SKU, cantidad, esperado y obtenido. Claude Code corrige solo defectos reproducibles y ejecuta lint/tests/build. Luego se procesa el Excel de variantes por familia. CRM–cotizador, stock y Contabilium vienen después.

## 13. No alcanzó a cerrarse

- QA autenticado completo del cotizador; Codex no usó credenciales de Felipe.
- Validación del CRM por todo el equipo.
- 249 variantes ambiguas y reglas/precios de todas las familias.
- Unión CRM–cotizador.
- Stock por depósito y fichas/recomendaciones integradas.
- Traspaso a Contabilium.
- Investigación/resolución de la caída Shopify.
- Medición real de adopción y conversión.

## 14. Continuidad exitosa

Claude Code debe poder localizar ambos repos/ramas, explicar estados, configurar entornos con nombres de variables, ejecutar pruebas/build/despliegue, distinguir reglas confirmadas de supuestos, mantener Fase 6 como Catálogo/Compras y proponer QA operativo como próximo paso sin abrir módulos nuevos.
