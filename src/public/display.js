async function fetchJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

function el(tag, attrs = {}, ...children) {
  const e = document.createElement(tag);
  Object.entries(attrs).forEach(([k, v]) => {
    if (k === 'class') e.className = v;
    else e.setAttribute(k, v);
  });
  children.flat().forEach((c) => e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c));
  return e;
}

function formatDate(iso) {
  try {
    const d = new Date(iso);
    return d.toLocaleString();
  } catch { return iso; }
}

async function loadAvailable() {
  try {
    const items = await fetchJSON('/public/available-requests');
    const container = document.getElementById('available-list');
    container.innerHTML = '';
    if (!items.length) {
      container.appendChild(el('div', { class: 'muted' }, 'Aucune carte disponible pour le moment.'));
    } else {
      items.forEach((x) => {
        container.appendChild(
          el(
            'div',
            { class: 'card-item' },
            el('div', { class: 'name' }, x.applicantName),
            el('div', { class: 'muted' }, `Type: ${x.cardTypeLabel}`),
            el('div', { class: 'timestamp' }, `Depuis: ${formatDate(x.availableSince)}`)
          )
        );
      });
    }
    document.getElementById('last-refresh').textContent = 'Dernière mise à jour: ' + new Date().toLocaleTimeString();
  } catch (e) {
    console.error(e);
  }
}

window.addEventListener('DOMContentLoaded', () => {
  loadAvailable();
  setInterval(loadAvailable, 15000); // rafraîchit toutes les 15s
});
