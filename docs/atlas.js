const search = document.querySelector('#search');
if (search) {
  const collection = document.querySelector('#collection');
  const entries = Array.from(document.querySelectorAll('#entries li'));
  function filter() {
    const term = search.value.trim().toLocaleLowerCase();
    let count = 0;
    for (const entry of entries) {
      entry.hidden = !entry.textContent.toLocaleLowerCase().includes(term) ||
        (collection.value && !entry.dataset.origin.split(' ').includes(collection.value));
      if (!entry.hidden) count++;
    }
    document.querySelector('#matches').textContent = count ? count.toLocaleString() + ' matching integrations' : 'No matches. Try a different name or collection.';
  }
  document.querySelector('.filters').hidden = false;
  search.addEventListener('input', filter);
  collection.addEventListener('change', filter);
  filter();
}
for (const field of document.querySelectorAll('[data-save]')) {
  const key = 'integration-atlas:' + field.dataset.save;
  try { field.checked = localStorage.getItem(key) === '1'; } catch {}
  field.addEventListener('change', () => {
    try { localStorage.setItem(key, field.checked ? '1' : '0'); } catch {}
  });
}
if (search) {
  search.value = new URLSearchParams(location.search).get('q') || '';
  search.dispatchEvent(new Event('input'));
}
