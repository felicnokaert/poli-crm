# Auditoría de madurez del producto — 12/09/2026

**Autor:** Claude Sonnet 5, a pedido de Felipe. Diagnóstico de solo lectura, sin cambios de código.
**Objetivo:** medir en qué estado está cada frente del CRM (1-100) para priorizar qué llevar a más del 90% antes de cerrar el producto.

Corrección a la premisa inicial de este pedido: no hay Supabase Edge Functions ni IA activa hoy — el server-side liviano vive en funciones serverless de Vercel (`api/*.js`), y `src/ai-provider.mjs` fuerza explícitamente `'none'` (fase 1, sin cuenta de IA conectada, decisión explícita de Felipe). El estado tampoco es "un blob por usuario": es **una única fila compartida** en `workspace_states` (`workspace_key='grupo-poliplast'`) para todo el equipo.

## Tabla de madurez por frente

| # | Frente | % | Evidencia clave |
|---|--------|---|------------------|
| 1 | UX | 58 | `src/App.jsx` (7110 líneas) concentra toda la UI; flujo de guardado con lógica anti-tareas-fantasma (`shouldCreateFollowup`) está bien pensado, pero `docs/QA_OPERATIVO_CRM_2026-09-10.md` documenta dead-ends reales recién corregidos y `IDENTIDAD_UNICA_CLIENTE_SPEC.md` reconoce acciones faltantes ("No son duplicados"/"Postergar"). |
| 2 | UI | 42 | Sin design system (solo `src/styles.css`, ~370 líneas). Loading states casi inexistentes (1 sola ocurrencia de "Cargando…", 0 skeletons/spinners). Accesibilidad parcial: 24 `aria-*` pero solo 2 `alt=` y 0 `role=` en 7110 líneas. |
| 3 | Automatización | 35 | Solo automatización real: webhook de WhatsApp con verificación HMAC + motor de reglas determinístico (`src/suggestion-rules.mjs`). Cero IA generativa activa, cero cron jobs (`vercel.json` sin sección `crons`). Todo lo "inteligente" es manual con asistencia de reglas. |
| 4 | Practicidad diaria | 65 | Bandeja de WhatsApp con Supabase Realtime, `DayMode`/`useDayPlan` con 5 señales (vencidas, hoy, hot leads, cotizaciones frías, repurchase radar), tareas con CRUD y marcado de vencidas. Falla: cero notificaciones push/email fuera de sesión. |
| 5 | Backend | 55 | 22+ tablas con RLS habilitado y policies vía función. Migraciones SQL viven como archivos sueltos en `docs/`, no versionadas con el CLI de Supabase; sin índices explícitos sobre el JSON de `workspace_states`, que crece con 1056+ clientes en una sola fila. |
| 6 | Frontend | 28 | El más débil con evidencia dura: `App.jsx` con 7110 líneas, 96 `useState`, 2 hooks custom, 5 `useMemo`, **0 `useCallback`**, sin virtualización de listas para una cartera de 1056+ clientes. |
| 7 | Datos | 72 | El más fuerte: hallazgo crítico documentado (fusión automática y silenciosa de duplicados en `consolidateDuplicateClients`), remediado con una cadena verificable de commits y tests (incluido test de performance sobre 2001 clientes). |
| 8 | Testing | 60 | 268/268 tests pasan (45 archivos). Cobertura fuerte en lógica pura. Pero 0% sobre componentes `.jsx` y `src/workspace.mjs` (el módulo de fusión de clientes) sin test propio dedicado hasta hoy. |
| 9 | Documentación | 75 | 27 archivos en `docs/`, con actividad reciente y verificada contra el código real (incluida la ausencia de IA). Debilidad: migraciones SQL no versionadas formalmente. |
| 10 | Seguridad | 70 | `SERVICE_ROLE_KEY` nunca en `src/`, webhook con HMAC, OAuth de MercadoLibre con `state` firmado, headers CSP/X-Frame-Options completos, RLS en 22+ tablas. Falta un documento de auditoría de seguridad dedicado. |

## Promedio global

- Promedio simple (10 frentes): **~53%**
- Promedio ponderado (pesando algo más Datos/Testing/Seguridad/Practicidad diaria): **~55%**

Etapa: **MVP funcional con fundamentos sólidos en datos/seguridad/testing, pero con deuda estructural seria en frontend y automatización real.** No es un producto recién empezado, pero no está cerca del 90% en ningún frente todavía.

## Los 5 gaps que más suben el promedio si se resuelven

1. **`App.jsx` de 7110 líneas sin virtualización ni memoización (Frontend, 28%).** Cuello de botella que también frena UX y Automatización. Dividir en componentes + `react-window` para listas grandes es la inversión de mayor apalancamiento.
2. **Cero cobertura de tests sobre componentes UI y sobre `workspace.mjs` (Testing, 60%).** Justo el módulo que causó el incidente más grave del proyecto no tenía test dedicado (corregido el 12/09, ver `test/client-merge.test.mjs`). Cerrar esto en el resto de la app da red de seguridad para el refactor del punto 1.
3. **Automatización real casi nula (35%).** Decisión explícita de no conectar IA en fase 1, pero es el frente con más techo: clasificación asistida + al menos un cron real de recordatorios subiría esto y Practicidad diaria a la vez.
4. **Estados de loading/error/empty casi ausentes (UI, 42%).** Barato de arreglar, sube UI y UX en simultáneo.
5. **Migraciones SQL no versionadas con el CLI de Supabase (Backend/Documentación).** Bajo esfuerzo, alto impacto en confiabilidad — además destraba agregar índices sobre `workspace_states` con confianza.

## Nota sobre confiabilidad

La evidencia cuantitativa (líneas de código, resultados de tests, nombres de commits, contenido SQL) fue verificada leyendo el repo directamente, no inferida. Los porcentajes son la síntesis editorial sobre esa evidencia.
