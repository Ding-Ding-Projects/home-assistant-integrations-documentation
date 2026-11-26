(() => {
  const scriptUrl = document.currentScript.src;
  const workerUrl = new URL('search-worker.js', scriptUrl);
  const params = new URLSearchParams(location.search);
  function element(tag, text, className) {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (className) node.className = className;
    return node;
  }

  const pieces = [
    ['Start of text', '^'], ['End of text', '$'], ['Digit', '\\d'],
    ['Letter or digit', '\\w'], ['Whitespace', '\\s'], ['Any character', '.'],
    ['Either expression', '|'], ['One or more', '+'], ['Zero or more', '*'],
    ['Optional', '?'], ['Group selection', '(?:…)'], ['Escape selection', 'literal']
  ];

  function workbench(input, initialFlags, onChange) {
    const box = element('div', undefined, 'regex-workbench');
    const tokenLabel = element('label', 'Build a pattern');
    const tokens = element('select');
    for (const [name, value] of pieces) tokens.add(new Option(name, value));
    tokenLabel.append(tokens);
    const insert = element('button', 'Insert');
    insert.type = 'button';
    insert.addEventListener('click', () => {
      const start = input.selectionStart ?? input.value.length;
      const end = input.selectionEnd ?? start;
      const selected = input.value.slice(start, end);
      let replacement = tokens.value;
      if (replacement === 'literal') {
        replacement = selected.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      } else if (replacement.includes('…')) {
        replacement = '(?:' + selected + ')';
      }
      input.setRangeText(replacement, start, end, 'end');
      if (tokens.value.includes('…') && !selected) input.setSelectionRange(start + 3, start + 3);
      input.focus();
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    const flagsLabel = element('label', 'Flags');
    const flags = element('input');
    flags.type = 'text';
    flags.value = initialFlags;
    flags.spellcheck = false;
    flags.autocomplete = 'off';
    flags.setAttribute('aria-label', 'Regular expression flags');
    flags.addEventListener('input', onChange);
    flagsLabel.append(flags);
    const help = element('small', 'Search each name and domain separately. Flags include i for case-insensitive matching and u for Unicode.');
    box.append(tokenLabel, insert, flagsLabel, help);
    return { box, flags };
  }

  const header = document.querySelector('.global-search');
  if (header) {
    const open = element('button', 'Regex', 'regex-button');
    open.type = 'button';
    open.setAttribute('aria-haspopup', 'dialog');
    open.setAttribute('aria-label', 'Open regular expression search');
    header.append(open);
    const dialog = element('dialog', undefined, 'regex-dialog');
    const title = element('h2', 'Search by pattern');
    title.id = 'global-regex-title';
    dialog.setAttribute('aria-labelledby', title.id);
    const form = element('form');
    form.action = header.action;
    const label = element('label', 'Regular expression');
    const pattern = element('input');
    pattern.type = 'text';
    pattern.name = 'q';
    pattern.maxLength = 512;
    pattern.autocomplete = 'off';
    pattern.spellcheck = false;
    label.append(pattern);
    const mode = element('input');
    mode.type = 'hidden';
    mode.name = 'mode';
    mode.value = 'regex';
    const builder = workbench(pattern, 'i', () => {});
    builder.flags.name = 'flags';
    const submit = element('button', 'Search directory');
    submit.type = 'submit';
    const close = element('button', 'Cancel');
    close.type = 'button';
    close.addEventListener('click', () => dialog.close());
    form.append(label, builder.box, mode, submit, close);
    dialog.append(title, form);
    document.body.append(dialog);
    open.addEventListener('click', () => {
      pattern.value = header.elements.q.value;
      builder.flags.value = new URLSearchParams(location.search).get('flags') ?? 'i';
      dialog.showModal();
      pattern.focus();
    });
    dialog.addEventListener('close', () => open.focus());
    header.elements.q.value = params.get('q') || '';
  }

  const input = document.querySelector('#search');
  if (!input) return;
  const collection = document.querySelector('#collection');
  const status = document.querySelector('#matches');
  const rows = Array.from(document.querySelectorAll('#entries li'));
  const records = rows.map(row => ({
    name: row.querySelector('b').textContent,
    domain: row.querySelector('code').textContent,
    collections: row.dataset.origin.split(' ')
  }));
  const filters = input.closest('.filters');
  const regexLabel = element('label', undefined, 'regex-mode');
  const regex = element('input');
  regex.type = 'checkbox';
  regexLabel.append(regex, 'Regex');
  const builder = workbench(input, 'i', refresh);
  filters.append(regexLabel);
  filters.after(builder.box);
  filters.hidden = false;
  let worker;
  let timer;
  let version = 0;

  function cancel() {
    clearTimeout(timer);
    worker?.terminate();
    worker = undefined;
  }

  function render(indices, message) {
    const visible = new Set(indices);
    rows.forEach((row, i) => { row.hidden = !visible.has(i); });
    status.textContent = message || (indices.length
      ? indices.length.toLocaleString() + ' matching integration' + (indices.length === 1 ? '' : 's')
      : 'No matches. Try a different search or collection.');
  }

  function refresh(updateUrl = true) {
    cancel();
    const ticket = ++version;
    const value = input.value;
    builder.box.hidden = !regex.checked;
    input.setAttribute('aria-invalid', 'false');
    if (updateUrl) {
      const url = new URL(location.href);
      for (const [name, val] of [['q', value], ['mode', regex.checked ? 'regex' : ''], ['collection', collection.value]]) {
        if (val) url.searchParams.set(name, val);
        else url.searchParams.delete(name);
      }
      if (regex.checked) url.searchParams.set('flags', builder.flags.value);
      else url.searchParams.delete('flags');
      history.replaceState(history.state, '', url);
    }
    if (!regex.checked) {
      const term = value.trim().toLocaleLowerCase();
      const results = [];
      records.forEach((record, i) => {
        if (collection.value && !record.collections.includes(collection.value)) return;
        if ([record.name, record.domain].some(text => text.toLocaleLowerCase().includes(term))) results.push(i);
      });
      render(results);
      return;
    }

    function fail(message) {
      if (ticket !== version) return;
      cancel();
      input.setAttribute('aria-invalid', 'true');
      render([], message);
    }
    if (value.length > 512) return fail('Use a pattern of 512 characters or fewer.');
    render([], 'Searching…');
    timer = setTimeout(() => {
      try {
        worker = new Worker(workerUrl);
        timer = setTimeout(() => fail('Search could not start. Try again or turn off Regex.'), 4000);
        worker.onerror = () => fail('Regular expression search is unavailable. Turn off Regex to search by text.');
        worker.onmessage = ({ data }) => {
          if (ticket !== version) return;
          if (data.ready) {
            clearTimeout(timer);
            timer = setTimeout(() => fail('Search took too long. Simplify the pattern and try again.'), 350);
            worker.postMessage({ pattern: value, flags: builder.flags.value, records, collection: collection.value });
          } else if (data.error) {
            fail(data.error);
          } else {
            cancel();
            render(data.results);
          }
        };
      } catch {
        fail('Regular expression search is unavailable. Turn off Regex to search by text.');
      }
    }, 120);
  }

  function restore() {
    const query = new URLSearchParams(location.search);
    input.value = query.get('q') || '';
    collection.value = query.get('collection') || '';
    if (collection.selectedIndex < 0) collection.selectedIndex = 0;
    regex.checked = query.get('mode') === 'regex';
    builder.flags.value = query.get('flags') ?? 'i';
    refresh(false);
  }
  window.addEventListener('popstate', restore);
  input.addEventListener('input', refresh);
  collection.addEventListener('change', refresh);
  regex.addEventListener('change', () => { refresh(); input.focus(); });
  input.addEventListener('keydown', event => {
    if (event.key === 'ArrowDown') {
      const first = rows.find(row => !row.hidden);
      if (first) { event.preventDefault(); first.querySelector('a').focus(); }
    }
  });
  restore();
})();
