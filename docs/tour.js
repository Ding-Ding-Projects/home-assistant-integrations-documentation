(() => {
  'use strict';
  const root = new URL('.', document.currentScript.src);
  const accessOpen = document.querySelector('#access-open');
  const tourOpen = document.querySelector('#tour-open');
  if (!tourOpen || !accessOpen) return;

  const tourKey = 'integration-atlas:guided-visit:v1';
  const accessKey = 'integration-atlas:access:v1';
  let writable = true;
  function read(key) {
    try { return JSON.parse(localStorage.getItem(key)); } catch { return null; }
  }
  function save(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); }
    catch { writable = false; }
  }
  const navigation = new URL(location.href);
  const transient = navigation.searchParams.get('atlas-tour-step');
  const record = transient && /^[1-4]$/.test(transient) ? {
    mode: 'active', step: Number(transient),
    query: navigation.searchParams.get('atlas-tour-query'),
    domain: navigation.searchParams.get('atlas-tour-domain'),
  } : read(tourKey);
  if (transient) {
    for (const key of ['atlas-tour-step', 'atlas-tour-query', 'atlas-tour-domain']) navigation.searchParams.delete(key);
    history.replaceState(history.state, '', navigation);
  }
  const tour = {
    mode: ['invited', 'active', 'paused', 'done'].includes(record?.mode) ? record.mode : 'new',
    step: [1, 2, 3, 4].includes(record?.step) ? record.step : 1,
    query: typeof record?.query === 'string' ? record.query.slice(0, 128) : 'Hue',
    domain: /^[a-z0-9_]+$/.test(record?.domain ?? '') ? record.domain : '',
  };
  const storedAccess = read(accessKey);
  const access = Object.fromEntries(['keyboard', 'focus', 'contrast', 'spacing'].map(key => [key, storedAccess?.[key] === true]));
  function applyAccess() {
    for (const [key, value] of Object.entries(access)) {
      document.documentElement.toggleAttribute('data-atlas-' + key, value);
    }
  }
  applyAccess();

  const text = (en, yue) => {
    const language = document.querySelector('#reader-language')?.value;
    return language === 'both' ? en + ' · ' + yue : language === 'yue' ? yue : en;
  };
  function node(tag, content) {
    const el = document.createElement(tag);
    if (content) el.textContent = content;
    return el;
  }
  function button(content, fn) {
    const el = node('button', content);
    el.type = 'button';
    el.addEventListener('click', fn);
    return el;
  }

  const accessDialog = node('dialog');
  accessDialog.className = 'atlas-access-dialog';
  accessDialog.setAttribute('aria-labelledby', 'atlas-access-title');
  document.body.append(accessDialog);
  const shortcuts = [
    ['F', 'Focus search', '移到搜尋欄'],
    ['G', 'Open the guided tour', '開啟導覽'],
    ['A', 'Open accessibility tools', '開啟無障礙工具'],
  ];
  const options = [
    ['keyboard', 'Keyboard shortcuts', '鍵盤快捷鍵'],
    ['focus', 'Stronger focus outlines', '加強焦點外框'],
    ['contrast', 'High contrast', '高對比度'],
    ['spacing', 'Wider text and control spacing', '增加文字同控制項間距'],
  ];
  function accessContents() {
    const title = node('h2', text('Accessibility tools', '無障礙工具'));
    title.id = 'atlas-access-title';
    const fields = node('div');
    const note = node('p');
    note.setAttribute('role', 'status');
    for (const [key, en, yue] of options) {
      const label = node('label');
      const toggle = node('input');
      toggle.type = 'checkbox';
      toggle.checked = access[key];
      toggle.addEventListener('change', () => {
        access[key] = toggle.checked;
        applyAccess();
        save(accessKey, access);
        note.textContent = writable ? text('Saved on this device.', '已儲存喺呢部裝置。') :
          text('Applied to this page. Browser storage is unavailable.', '已套用喺呢頁。瀏覽器儲存功能用唔到。');
      });
      label.append(toggle, text(en, yue));
      fields.append(label);
    }
    const commands = node('ul');
    for (const [key, en, yue] of shortcuts) {
      const li = node('li');
      li.append(node('kbd', 'Alt + Shift + ' + key), ' ', text(en, yue));
      commands.append(li);
    }
    accessDialog.replaceChildren(title, fields, commands, note, button(text('Close', '關閉'), () => accessDialog.close()));
  }
  function showAccess() {
    if (accessDialog.open) return;
    accessContents();
    accessDialog.showModal();
  }
  accessOpen.addEventListener('click', showAccess);
  accessOpen.setAttribute('aria-haspopup', 'dialog');

  const rail = node('aside');
  rail.className = 'atlas-tour';
  rail.hidden = true;
  rail.setAttribute('aria-labelledby', 'atlas-tour-title');
  document.querySelector('header').after(rail);
  let returnFocus = tourOpen;
  function hide(mode) {
    tour.mode = mode;
    save(tourKey, tour);
    rail.hidden = true;
    returnFocus.focus({ preventScroll: true });
  }
  function advance(step) {
    tour.mode = 'active';
    tour.step = step;
    save(tourKey, tour);
  }
  function directoryUrl() {
    const url = new URL('directory.html', root);
    url.searchParams.set('q', tour.query);
    return url;
  }
  function guideUrl(area) {
    return new URL(area + '/' + tour.domain + '/', root);
  }
  function onPage(url) {
    return location.pathname.replace(/index\.html$/, '') === url.pathname.replace(/index\.html$/, '');
  }
  function carry(url) {
    if (!writable) {
      url.searchParams.set('atlas-tour-step', String(tour.step));
      url.searchParams.set('atlas-tour-query', tour.query);
      url.searchParams.set('atlas-tour-domain', tour.domain);
    }
    return url;
  }
  function go(url, step) {
    advance(step);
    carry(url);
    if (location.href === url.href) render(true);
    else location.assign(url);
  }
  function start() {
    if (tour.mode === 'done' || tour.mode === 'new' || tour.mode === 'invited') {
      tour.step = 1; tour.query = 'Hue'; tour.domain = '';
    }
    advance(tour.step);
    render(true);
  }

  function render(focus = false) {
    if (tour.mode !== 'active') return;
    rail.hidden = false;
    const title = node('h2');
    title.id = 'atlas-tour-title';
    title.tabIndex = -1;
    const step = node('small', text('Guided tour', '網站導覽') + ' · ' + tour.step + '/4');
    const description = node('p');
    const actions = node('div');
    actions.className = 'atlas-tour-actions';
    const add = (en, yue, fn) => actions.append(button(text(en, yue), fn));
    if (tour.step === 1) {
      title.textContent = text('Find an integration', '搵一個整合');
      description.textContent = text('Choose a device or service. This opens the directory with your search applied.', '輸入裝置或服務名，打開已篩選嘅整合目錄。');
      const form = node('form');
      const label = node('label', text('Name or domain', '名稱或網域'));
      const field = node('input');
      field.type = 'search';
      field.value = tour.query;
      field.maxLength = 128;
      label.append(field);
      const submit = node('button', text('Search directory', '搜尋目錄'));
      submit.type = 'submit';
      form.append(label, submit);
      form.addEventListener('submit', event => {
        event.preventDefault();
        tour.query = field.value.trim();
        go(directoryUrl(), 2);
      });
      actions.append(form);
    } else if (tour.step === 2) {
      title.textContent = text('Choose a matching integration', '揀一個符合條件嘅整合');
      description.textContent = text('Change the search or collection in the directory. Open any matching result to continue.', '喺目錄改搜尋字眼或分類，然後打開任何符合條件嘅結果。');
      if (onPage(directoryUrl())) {
        add('Focus directory filters', '移到目錄篩選器', () => document.querySelector('#search')?.focus());
        add('Open first match', '打開第一個結果', () => {
          const link = document.querySelector('#entries li:not([hidden]) a');
          if (link) link.click();
          else {
            description.textContent = text('No matches. Change the name or collection and try again.', '冇結果。試下改名稱或分類。');
            document.querySelector('#search')?.focus();
          }
        });
      } else add('Return to results', '返去搜尋結果', () => go(directoryUrl(), 2));
    } else if (tour.step === 3 && tour.domain) {
      title.textContent = text('Explore the integration story', '了解呢個整合');
      description.textContent = text('The overview introduces the integration. Its guide contains the setup details and your checklist.', '概覽介紹整合嘅用途。指南入面有設定詳情同核對清單。');
      if (onPage(guideUrl('discover'))) add('Open setup guide', '打開設定指南', () => go(guideUrl('integrations'), 4));
      else add('Return to the overview', '返去概覽', () => go(guideUrl('discover'), 3));
    } else if (tour.domain) {
      title.textContent = text('Track your setup progress', '記錄設定進度');
      description.textContent = text('Jump to the checklist and mark a step you have completed. Your choices stay in this browser.', '跳到核對清單，剔選已完成嘅步驟。進度會儲存喺呢個瀏覽器。');
      if (onPage(guideUrl('integrations'))) {
        const check = document.querySelector('[data-save]');
        if (check) add('Go to checklist', '移到核對清單', () => check.focus());
        add('Finish tour', '完成導覽', () => hide('done'));
      } else add('Return to the guide', '返去指南', () => go(guideUrl('integrations'), 4));
    } else {
      advance(1); render(focus); return;
    }
    if (tour.step > 1) add('Back', '上一步', () => {
      const previous = tour.step - 1;
      if (previous === 3) go(guideUrl('discover'), previous);
      else if (previous === 2) go(directoryUrl(), previous);
      else { advance(1); render(true); }
    });
    add('Pause tour', '暫停導覽', () => hide('paused'));
    rail.replaceChildren(step, title, description, actions);
    if (focus) title.focus();
  }

  document.addEventListener('click', event => {
    if (tour.mode !== 'active' || event.defaultPrevented || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || event.button !== 0) return;
    const link = event.target.closest?.('a[href]');
    if (!link) return;
    const target = new URL(link.href);
    if (tour.step === 2 && link.closest('#entries')) {
      const domain = link.querySelector('code')?.textContent;
      if (!domain || !/^[a-z0-9_]+$/.test(domain)) return;
      tour.domain = domain;
      if (onPage(directoryUrl())) tour.query = document.querySelector('#search').value.slice(0,128);
      advance(3);
      if (!writable) link.href = carry(target).href;
    } else if (tour.step === 3 && tour.domain && target.origin === root.origin &&
      target.pathname === guideUrl('integrations').pathname) {
      advance(4);
      if (!writable) link.href = carry(target).href;
    }
  });
  tourOpen.addEventListener('click', () => { returnFocus = tourOpen; start(); });
  document.addEventListener('keydown', event => {
    if (!access.keyboard || !event.altKey || !event.shiftKey || event.metaKey || event.ctrlKey ||
        event.repeat || event.isComposing || document.querySelector('dialog[open]')) return;
    const key = event.code;
    if (!['KeyF','KeyG','KeyA'].includes(key)) return;
    event.preventDefault();
    if (key === 'KeyF') (document.querySelector('#search') || document.querySelector('.global-search input'))?.focus();
    if (key === 'KeyG') { returnFocus = document.activeElement; start(); }
    if (key === 'KeyA') showAccess();
  });
  if (tour.mode === 'new') {
    tour.mode = 'invited'; save(tourKey, tour);
    const title = node('h2', text('First visit?', '第一次到訪？'));
    title.id = 'atlas-tour-title';
    const actions = node('div');
    actions.className = 'atlas-tour-actions';
    actions.append(button(text('Take a guided tour', '開始網站導覽'), start),
      button(text('Dismiss', '略過'), () => hide('invited')));
    rail.append(title, node('p', text('Find a device, open its guide and save a setup step.', '搵裝置、打開指南，再儲存設定進度。')), actions);
    rail.hidden = false;
  } else {
    if (transient) save(tourKey, tour);
    render();
  }
  window.addEventListener('pageshow', event => {
    if (!event.persisted) return;
    const saved = read(tourKey);
    if (saved && ['active', 'paused', 'invited', 'done'].includes(saved.mode)) {
      tour.mode = saved.mode;
      tour.step = [1, 2, 3, 4].includes(saved.step) ? saved.step : 1;
      tour.domain = /^[a-z0-9_]+$/.test(saved.domain || '') ? saved.domain : '';
      tour.query = typeof saved.query === 'string' ? saved.query.slice(0, 128) : 'Hue';
      if (tour.mode === 'active') render();
      else rail.hidden = true;
    }
    const preferences = read(accessKey);
    if (preferences) {
      for (const key of Object.keys(access)) access[key] = preferences[key] === true;
      applyAccess();
    }
  });
})();
