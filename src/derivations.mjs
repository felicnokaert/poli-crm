// Derivaciones del asistente de WhatsApp: qué ve cada persona.
const plain = (value) => String(value || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

export function derivationsFor(items = [], { firstName = "", isAdmin = false, done = [] } = {}) {
  const me = plain(firstName);
  const finished = new Set(done || []);
  return (items || [])
    .filter((item) => item?.id && !finished.has(item.id))
    .filter((item) => isAdmin || (me && plain(item.to).includes(me)))
    .sort((a, b) => String(b.at).localeCompare(String(a.at)));
}
