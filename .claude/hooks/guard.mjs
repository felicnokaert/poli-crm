// Hook de Claude Code (antes de cada comando): frena lo peligroso.
// - "deny": se bloquea siempre (borrar el proyecto, la compu o la carpeta personal).
// - "ask": Claude tiene que pedirle el OK a Felipe en pantalla (forzar subida, descartar cambios,
//   borrar en la base).
// Lee el pedido de Claude Code por stdin (JSON) y responde por stdout.
let raw = '';
process.stdin.on('data', (chunk) => { raw += chunk; });
process.stdin.on('end', () => {
  let input = {};
  try { input = JSON.parse(raw || '{}'); } catch { process.exit(0); }
  const tool = String(input.tool_name || '');
  const args = input.tool_input || {};
  const text = String(args.command || args.query || '');
  const verdict = check(tool, text);
  if (!verdict) process.exit(0);
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: verdict.decision, permissionDecisionReason: verdict.reason },
  }));
});

export function check(tool, text) {
  if (/supabase__execute_sql$/i.test(tool)) {
    if (/\b(delete\s+from|truncate|drop\s+(table|schema|function|policy|view)|alter\s+table\s+\S+\s+drop)\b/i.test(text)) {
      return { decision: 'ask', reason: 'Borra datos o partes de la base real. Necesita el OK de Felipe.' };
    }
    return null;
  }
  if (!/^(Bash|PowerShell)$/.test(tool)) return null;
  const rmAll = /\brm\s+-[a-z]*r[a-z]*f?[a-z]*\s+(["']?)(\/|~|\.|\.\.|\$HOME|C:[\\/]?|[^\s"']*poliplast-sales-copilot)\1(\s|$|;|&)/i;
  const psAll = /\bRemove-Item\b[^;|]*-Recurse[^;|]*\s(["']?)(C:\\?|~|\.|\.\.|\$HOME|\$env:USERPROFILE|[^\s"']*poliplast-sales-copilot)\1(\s|$|;)/i;
  if (rmAll.test(text) || psAll.test(text)) {
    return { decision: 'deny', reason: 'Bloqueado: borraría el proyecto entero, la compu o la carpeta personal.' };
  }
  if (/\bgit\b[^;&|]*\bpush\b[^;&|]*(\s--force(-with-lease)?\b|\s-f\b|\s\+\S)/.test(text)) {
    return { decision: 'ask', reason: 'Forzar la subida pisa lo que hay en GitHub. Necesita el OK de Felipe.' };
  }
  if (/\bgit\b[^;&|]*\b(reset\s+--hard|clean\s+-[a-z]*f|push\b[^;&|]*\s--delete\b|branch\s+-D\s+(main|master)\b)/.test(text)) {
    return { decision: 'ask', reason: 'Descarta cambios o borra ramas sin vuelta atrás. Necesita el OK de Felipe.' };
  }
  return null;
}
