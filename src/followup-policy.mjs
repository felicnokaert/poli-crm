export function shouldCreateFollowup({ nextAction, nextDate } = {}) {
  return Boolean(String(nextAction || "").trim() && String(nextDate || "").trim());
}
