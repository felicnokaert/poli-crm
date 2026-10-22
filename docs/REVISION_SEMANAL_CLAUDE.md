# Revisión semanal del CRM (para una sesión programada de Claude Code)

Pedido de Felipe (22/10): "que todo el tiempo el sistema aprenda de sí mismo y tengamos agentes identificando
fallas o cómo actuar para mejorar el CRM". Se corre los lunes (tarea programada de Claude Code, cuando la
empresa tenga el plan Max) o a mano cuando Felipe diga "hacé la revisión semanal".

**Regla:** la revisión solo LEE y PROPONE. No publica, no borra, no cambia datos de la base ni de Vercel.
Los arreglos van en una rama aparte (`revision/AAAA-MM-DD`) y Felipe decide si se suben.

## Qué mirar (en este orden)

1. **Asistente: lo que no sirvió y lo que no sabía.** Supabase `assistant_feedback`
   (`vote = -1 and resolved_at is null`; `source = 'ia-sin-dato'` son las que la IA misma no sabía).
   Agrupar por tema/producto. Para cada grupo: ¿falta un dato (cargar ficha / enseñar respuesta),
   el buscador no lo encontró (palabras, sinónimos en `understand()` de src/assistant-answer.mjs) o la IA
   respondió mal teniendo el dato (prompt en lib/assistant-ai.mjs)?
2. **Errores de la app.** Más → Datos → Errores (lib/error-log.mjs, `listClientErrors`) y
   errores de Vercel (`get_runtime_errors`; el plan gratis guarda ~1 hora: mirar lo que haya).
3. **Datos que se rompen.** Sincronizaciones: `ml_accounts.last_refresh_at`, `contabilium_sync`
   (que avance), `ml_account_metrics` (una fila por cuenta por día). Publicaciones activas sin SKU,
   clips sin revisar (`clips_count is null`) en POLIPLAST y FOAM (COMARG no se sigue).
4. **Lo que el equipo usa y lo que no.** Si hay datos de uso, qué pantallas nadie abre.

## Qué entregar

- Un informe corto en español (para Felipe, no programador): **qué falló, por qué y qué propongo**,
  ordenado por impacto. Sin inventar: si un dato no se pudo leer, decirlo.
- Respuestas para enseñarle al asistente **solo si salen de datos reales** (Mercado Libre repetido 3+
  veces, fichas validadas). Las de producto que no estén en ningún lado: preguntarle a Felipe/Juan.
- Arreglos de código en la rama `revision/AAAA-MM-DD`, con tests y build en verde. No mergear a `main`
  sin el OK de Felipe.

## Prompt para la tarea programada

```
Hacé la revisión semanal del CRM siguiendo docs/REVISION_SEMANAL_CLAUDE.md al pie de la letra.
Solo leé y proponé: nada de publicar, borrar ni cambiar datos. Respondé en español, corto, para Felipe.
```
