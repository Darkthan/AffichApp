async function fetchJSON(url) {
  const res = await fetch(url);
  if (!res.ok) {throw new Error(`HTTP ${res.status}`);}
  return res.json();
}

function el(tag, attrs = {}, ...children) {
  const e = document.createElement(tag);
  Object.entries(attrs).forEach(([k, v]) => {
    if (k === 'class') {e.className = v;}
    else {e.setAttribute(k, v);}
  });
  children.flat().forEach((c) => e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c));
  return e;
}

function getRandomColorClass() {
  const colors = ['bg-color-1', 'bg-color-2', 'bg-color-3', 'bg-color-4'];
  return colors[Math.floor(Math.random() * colors.length)];
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
            { class: `card-item ${getRandomColorClass()}` },
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
  loadAll();
  setInterval(loadAll, 15000); // rafraîchit toutes les 15s
  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(adjustScaleToViewport, 100);
  });
});

async function loadCalls() {
  try {
    const items = await fetchJSON('/public/calls');
    const container = document.getElementById('calls-list');
    container.innerHTML = '';
    if (!items.length) {
      container.appendChild(el('div', { class: 'muted' }, 'Aucun appel en cours.'));
    } else {
      items.forEach((x) => {
        container.appendChild(
          el(
            'div',
            { class: `card-item ${getRandomColorClass()}` },
            el('div', { class: 'name' }, x.name),
            el('div', { class: 'location' }, `📍 ${x.location}`),
            el('div', { class: 'timestamp' }, `Depuis: ${formatDate(x.createdAt)}`)
          )
        );
      });
    }
  } catch (e) { console.error(e); }
}

async function loadAll() {
  await Promise.all([loadAvailable(), loadCalls()]);
  // Ajuste l'échelle pour tenir dans la hauteur de l'écran
  adjustScaleToViewport();
}

function adjustScaleToViewport() {
  const container = document.querySelector('.screen');
  if (!container) {return;}
  // Reset any previous transform before measuring
  container.style.transform = '';
  container.style.width = '';
  container.style.transformOrigin = 'top left';
  const fullHeight = document.documentElement.scrollHeight;
  const viewport = window.innerHeight || document.documentElement.clientHeight;
  const scale = Math.min(1, viewport / (fullHeight || 1));
  if (scale < 1) {
    container.style.transform = `scale(${scale})`;
    // Expand width to compensate for scaling to avoid horizontal clipping
    container.style.width = `${100 / scale}%`;
  }
}

// Gérer l'erreur de chargement du logo (masquer si inexistant)
const logo = document.getElementById('logo');
if (logo) {
  logo.addEventListener('error', () => {
    logo.style.display = 'none';
  });
}
