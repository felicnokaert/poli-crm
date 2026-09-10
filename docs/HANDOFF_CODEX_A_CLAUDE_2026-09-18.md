# Transferencia integral Codex -> Claude

**Fecha límite:** 18/09/2026  
**Responsable de cierre:** Codex  
**Responsable de continuidad:** Claude / Cowork  
**Dueño del sistema:** Felipe Cnokaert  
**Estado:** vivo; se actualiza con cada entrega hasta el cierre.

## 1. Objetivo de la transferencia

Permitir que Claude continúe el Sistema Comercial Grupo Poliplast y coordine el mantenimiento del CRM sin depender de la memoria de los chats de Codex. La transferencia no incluye secretos, tokens ni contraseñas.

## 2. Fuentes y gobierno

- **CRM / código:** repositorio `felicnokaert/poli-crm`, producción `https://poli-crm.vercel.app`.
- **Método comercial:** `docs/SISTEMA_COMERCIAL_GRUPO_POLIPLAST.md`.
- **Arquitectura del copiloto:** `docs/COPILOTO_COMERCIAL_ARQUITECTURA.md`.
- **Identidad de clientes:** `docs/IDENTIDAD_UNICA_CLIENTE_SPEC.md`.
- **Trabajo y responsables:** Trello `VENTAS — Grupo Poliplast`.
- **Publicación para el equipo:** Drive Grupo Poliplast, `00_CONTROL` y `05_REPORTES`.
- **Clientes y conversaciones:** CRM. No se duplican como tarjetas de Trello.

## 3. Estado técnico por módulo

| Módulo | Estado | Evidencia | Pendiente |
|---|---|---|---|
| Empresas | Operativo; rendimiento corregido | `adaa155`, prueba con 2.001 clientes | QA en producción |
| Identidad única | Base utilizable | `c84cdcb`: varias personas/teléfonos y contacto principal | no comercial por persona; fusión diferida |
| Posibles duplicados | Solo lectura | `2b31da0` | acciones y fusión/deshacer diferidas por Felipe |
| Academia comercial | Contenedor y conocimiento estructurado operativos | `1e7c8f9`, `c0b9688`: 12 etapas, 13 objeciones, 10 playbooks y E-C-E-R-A | validar contenido con casos reales de Cohorte 1 |
| Ayuda contextual | v1 construida y publicada | `caa680f`: recomendación por empresa según etapa, familia, perfil, objeción y venta cruzada; 175 tests | QA visual/funcional en producción y triage rápido |
| Triage comercial | v1 construida y publicada | `b105b2a`: seis variables 0-2, puntaje 0-12 y prellenado conservador; 179 tests | probar con 10 casos reales de Cohorte 1 y ajustar significado de Exposición/Ticket si corresponde |
| Persistencia del workspace | Defecto de conciliación corregido | `1147b9b`: conserva tablero, metas, unidades de negocio y perfil al mezclar estado local/remoto; 180 tests | QA de recarga con sesión real |
| Eliminaciones persistentes | Corregido y publicado | `b6c97d9`: tombstones sincronizados impiden que versiones remotas viejas resuciten clientes, tareas vinculadas, oportunidades, ventas, metas, tablero y unidades; 181 tests | QA de eliminar/recargar con sesión real |
| WhatsApp General | No modificar sin regresión específica | pruebas automatizadas | seguimiento operativo |
| WhatsApp Penosil | Meta oficial; puente retirado | documentación y pruebas del webhook | coexistencia/validación real según estado vigente |
| Mercado Libre | Integración oficial de lectura construida para POLIPLAST y FOAM | endpoints OAuth/sync + tests | autorización real y validación de paridad |
| Ventas y comisiones | Implementado parcialmente | parser, objetivos y pruebas | validación con datos reales/multi-comercial |

## 4. Estado funcional que Claude debe conocer

- Una empresa puede tener varias personas y teléfonos, pero una sola temperatura y etapa comercial.
- Canal, conversación e interés por unidad se conservan separados; la identidad comercial no se duplica.
- Las coincidencias de nombres no fusionan clientes automáticamente.
- Ninguna sugerencia del copiloto envía mensajes por sí sola.
- Precios, stock, rendimiento y compatibilidad siempre requieren fuente verificable.
- Las tareas se crean solo ante compromisos, urgencia, cotización pendiente, recompra probable o seguimiento expresamente acordado.

## 5. Sprint final Codex: 10 al 18 de septiembre

| Prioridad | Entrega | Definición de terminado |
|---|---|---|
| P0 | Estabilidad e identidad | Empresas responde; persistencia e identidad pasan QA sin alterar General |
| P0 | Conocimiento comercial estructurado | Objeciones, playbooks, etapas y E-C-E-R-A existen como datos testeables con fuente/estado |
| P0 | Ayuda contextual v1 | Empresa o conversación muestra preguntas y criterio relevante sin IA paga |
| P0 | Transferencia a Claude | Handoff completo, Drive sincronizado y ensayo de continuidad aprobado |
| P1 | Mercado Libre | OAuth y primera sincronización real cuando ML habilite la cuenta |
| P1 | Cohorte 1 | Resultados y objeciones reales incorporados por Felipe/Claude |
| P2 | Duplicados | Fusión/deshacer y descarte de sugerencias, diferido por Felipe |

## 6. Cronograma de cierre

- **10-11/09:** Academia unificada, conocimiento comercial, ayuda contextual y triage rápido v1 completados (`1e7c8f9`, `c0b9688`, `caa680f`, `b105b2a`; 179 tests y build verde).
- **12-13/09:** ayuda contextual y clasificación/triage rápido sobre casos reales.
- **14-15/09:** QA de persistencia, historial, tareas, identidad y canales; Mercado Libre si está habilitado.
- **16/09:** documentación y Drive sincronizados; inventario final de automatizaciones y fuentes.
- **17/09:** ensayo: Claude recibe este documento y explica cómo continuar sin contexto adicional.
- **18/09:** correcciones del ensayo, commit final y entrega.

## 7. Checklist de continuidad

- [ ] Estado de cada módulo verificado en producción.
- [ ] Tests y build final documentados.
- [ ] Migraciones de Supabase enumeradas y explicadas.
- [ ] Variables necesarias enumeradas sin copiar valores secretos.
- [ ] Automatizaciones activas/pausadas y computadora propietaria documentadas.
- [ ] Trello actualizado sin tarjetas duplicadas.
- [ ] Manual, arquitectura, spec y handoff publicados en Drive.
- [ ] Pendientes ordenados por impacto y riesgo.
- [ ] Claude puede explicar el próximo cambio, cómo probarlo y qué no debe tocar.
- [ ] Felipe valida que puede encontrar la información sin abrir este chat.

## 8. Regla de cierre

Codex no se considera transferido porque exista documentación. Se considera transferido cuando Claude puede reconstruir el estado real, proponer el siguiente paso correcto y distinguir con precisión qué está operativo, qué está probado solo localmente y qué sigue bloqueado.
