for (const field of document.querySelectorAll('[data-save]')) {
  const key = 'integration-atlas:' + field.dataset.save;
  try { field.checked = localStorage.getItem(key) === '1'; } catch {}
  field.addEventListener('change', () => {
    try { localStorage.setItem(key, field.checked ? '1' : '0'); } catch {}
  });
}
