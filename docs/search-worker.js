// A worker evaluates user expressions so a long-running match can be interrupted.
self.onmessage = ({ data: { pattern, flags, records, collection } }) => {
  try {
    if (pattern.length > 512) throw new Error('Use a pattern of 512 characters or fewer.');
    const expression = new RegExp(pattern, flags);
    const results = [];
    for (let i = 0; i < records.length; i++) {
      const row = records[i];
      if (collection && !row.collections.includes(collection)) continue;
      const values = [row.name];
      if (typeof row.domain === 'string') values.push(row.domain);
      if (values.some(value => {
        expression.lastIndex = 0;
        return expression.test(value);
      })) results.push(i);
    }
    self.postMessage({ results });
  } catch (error) {
    self.postMessage({ error: error.message });
  }
};
self.postMessage({ ready: true });
