(() => {
  'use strict';

  const page = location.pathname.replace(/\/?(?:index\.html)?$/, '');
  const isGuide = /(?:^|\/)integrations\/[^/]+$/.test(page);
  const isReference = /(?:^|\/)references\/[^/]+$/.test(page);
  const article = isReference ? document.querySelector('article.reading') : null;
  const searchRoot = article || (isGuide ? document.querySelector('main#main') : null);
  if (!searchRoot) return;

  const scriptUrl = document.currentScript?.src || new URL('article-find.js', location.href).href;
  const workerUrl = new URL('search-worker.js', scriptUrl);
  const storageKey = 'integration-atlas:article-find:v1:' + location.pathname;
  const maxPatternLength = 512;
  const maxNodes = 20000;
  const maxTextLength = 2_000_000;
  const workerTimeout = 1200;

  const panel = document.createElement('section');
  panel.className = 'article-find';
  panel.setAttribute('aria-labelledby', 'article-find-title');
  const title = document.createElement('h2');
  title.id = 'article-find-title';
  title.textContent = 'Find in this article';
  const form = document.createElement('form');
  form.setAttribute('role', 'search');
  const label = document.createElement('label');
  label.className = 'article-find-query-label';
  label.htmlFor = 'article-find-query';
  label.textContent = 'Search this page';
  const input = document.createElement('input');
  input.id = 'article-find-query';
  input.type = 'search';
  input.autocomplete = 'off';
  input.maxLength = maxPatternLength;
  input.setAttribute('aria-describedby', 'article-find-help article-find-status');
  input.placeholder = 'Find words or a phrase';
  const regexLabel = document.createElement('label');
  regexLabel.className = 'article-find-regex-label';
  const regex = document.createElement('input');
  regex.type = 'checkbox';
  regex.id = 'article-find-regex';
  regexLabel.append(regex, ' Regular expression');
  const help = document.createElement('p');
  help.id = 'article-find-help';
  help.className = 'article-find-help';
  help.textContent = 'Press Enter for the next match or Shift+Enter for the previous match. Regular expressions are limited to 512 characters.';
  const actions = document.createElement('div');
  actions.className = 'article-find-actions';
  const previous = document.createElement('button');
  previous.type = 'button'; previous.textContent = 'Previous';
  const next = document.createElement('button');
  next.type = 'button'; next.textContent = 'Next';
  const status = document.createElement('p');
  status.id = 'article-find-status';
  status.className = 'article-find-status';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  status.setAttribute('aria-atomic', 'true');
  actions.append(previous, next);
  form.append(label, input, regexLabel, help, actions, status);
  panel.append(title, form);
  if (article) article.before(panel);
  else if (searchRoot.querySelector('nav')) searchRoot.querySelector('nav').after(panel);
  else searchRoot.prepend(panel);

  let matches = [];
  let current = -1;
  let activeWorker = null;
  let timeoutHandle = 0;
  let debounceHandle = 0;
  let requestSerial = 0;
  let contentCapped = false;

  function readState() {
    try {
      const state = JSON.parse(sessionStorage.getItem(storageKey) || 'null');
      if (state && typeof state.query === 'string') {
        input.value = state.query.slice(0, maxPatternLength);
        regex.checked = state.regex === true;
      }
    } catch { /* Storage can be disabled; the search still works for this visit. */ }
  }
  function saveState() {
    try { sessionStorage.setItem(storageKey, JSON.stringify({ query: input.value, regex: regex.checked })); }
    catch { /* Per-page state remains in the controls for this visit. */ }
  }
  function clearHighlights() {
    searchRoot.querySelectorAll('mark.article-find-hit').forEach(mark => mark.replaceWith(document.createTextNode(mark.textContent)));
  }
  function setStatus(message) { status.textContent = message; }
  function updateButtons() {
    const disabled = matches.length < 2;
    previous.disabled = disabled;
    next.disabled = disabled;
  }
  function discardWorker() {
    if (timeoutHandle) clearTimeout(timeoutHandle);
    timeoutHandle = 0;
    if (activeWorker) activeWorker.terminate();
    activeWorker = null;
  }
  function collectTextNodes() {
    const nodes = [];
    let total = 0;
    contentCapped = false;
    const walker = document.createTreeWalker(searchRoot, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const parent = node.parentElement;
        if (!parent || !node.nodeValue.trim() || parent.closest('.article-find,script,style,noscript,template,button,input,textarea,select,mark')) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    while (walker.nextNode()) {
      const node = walker.currentNode;
      const text = node.nodeValue;
      if (nodes.length >= maxNodes || total + text.length > maxTextLength) {
        contentCapped = true;
        break;
      }
      nodes.push({ node, text });
      total += text.length;
    }
    return nodes;
  }
  function showMatches(records, indices) {
    matches = [];
    for (const index of indices) {
      const record = records[index];
      if (!record?.node.isConnected) continue;
      const mark = document.createElement('mark');
      mark.className = 'article-find-hit';
      mark.textContent = record.text;
      record.node.replaceWith(mark);
      matches.push(mark);
    }
    current = -1;
    updateButtons();
    const capNote = contentCapped ? ' Search is limited to the first 2 MB of article text.' : '';
    if (matches.length) setStatus(`${matches.length} matching passages. Press Enter to move through them.${capNote}`);
    else setStatus(`No matches found.${capNote}`);
  }
  function runSearch() {
    discardWorker();
    clearHighlights();
    matches = []; current = -1; updateButtons();
    const query = input.value.trim();
    saveState();
    if (!query) { setStatus('Enter a word or phrase to search this article.'); return; }
    if (regex.checked && query.length > maxPatternLength) { setStatus(`Regular expressions can contain at most ${maxPatternLength} characters.`); return; }

    const records = collectTextNodes();
    if (!records.length) { setStatus('No searchable article text was found.'); return; }
    const pattern = regex.checked ? query : query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const serial = ++requestSerial;
    let worker;
    try { worker = new Worker(workerUrl); }
    catch { setStatus('Article search could not start in this browser.'); return; }
    activeWorker = worker;
    worker.onmessage = ({ data }) => {
      if (serial !== requestSerial || worker !== activeWorker) return;
      if (data.ready) return;
      discardWorker();
      if (data.error) { setStatus(`Search expression error: ${data.error} Correct the expression and try again.`); return; }
      showMatches(records, data.results || []);
    };
    worker.onerror = () => {
      if (serial !== requestSerial) return;
      discardWorker();
      setStatus('Article search stopped unexpectedly. Edit the search and try again.');
    };
    timeoutHandle = setTimeout(() => {
      if (serial !== requestSerial || worker !== activeWorker) return;
      discardWorker();
      setStatus('Search took too long and was stopped. Simplify the expression or switch off regular expressions, then try again.');
    }, workerTimeout);
    worker.postMessage({ pattern, flags: 'i', records: records.map(record => ({ name: record.text, domain: '' })) });
  }
  function navigate(direction) {
    if (!matches.length) return;
    current = (current + direction + matches.length) % matches.length;
    for (let details = matches[current].parentElement?.closest('details'); details; details = details.parentElement?.closest('details')) details.open = true;
    const reducedMotion = document.documentElement.hasAttribute('data-reader-reduced-motion') || matchMedia('(prefers-reduced-motion: reduce)').matches;
    matches[current].scrollIntoView({ block: 'center', behavior: reducedMotion ? 'auto' : 'smooth' });
    setStatus(`${current + 1} of ${matches.length} matching passages.`);
  }

  form.addEventListener('submit', event => { event.preventDefault(); runSearch(); });
  input.addEventListener('input', () => {
    clearTimeout(debounceHandle);
    debounceHandle = setTimeout(runSearch, 180);
  });
  input.addEventListener('keydown', event => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    if (matches.length) navigate(event.shiftKey ? -1 : 1);
    else runSearch();
  });
  regex.addEventListener('change', runSearch);
  previous.addEventListener('click', () => navigate(-1));
  next.addEventListener('click', () => navigate(1));
  window.addEventListener('pagehide', discardWorker, { once: true });
  readState();
  if (input.value) runSearch();
  else setStatus('Enter a word or phrase to search this article.');
})();
