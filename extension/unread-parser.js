(function installUnreadParser(scope) {
  function clean(value) {
    return String(value || '')
      .replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, '')
      .trim();
  }

  function previewFromValues({ name = '', texts = [], titles = [] } = {}) {
    const contact = clean(name);
    const cleanTexts = texts.map(clean);
    const cleanTitles = titles.slice(1).map(clean);
    const candidates = [...cleanTexts, ...cleanTitles]
      .filter((text) => text
        && text !== contact
        && !/^\d{1,2}:\d{2}$/.test(text)
        && !/^\d+$/.test(text)
        && !/mensajes?\s+no\s+le[ií]dos?/i.test(text)
        && !/^(tú|tu|you):/i.test(text));
    if (candidates.length) return candidates.at(-1);
    const audioDuration = cleanTitles.find((text) => /^\d{1,2}:\d{2}$/.test(text));
    return audioDuration ? `[audio · ${audioDuration}]` : '';
  }

  scope.PoliplastUnreadParser = { clean, previewFromValues };
})(globalThis);
