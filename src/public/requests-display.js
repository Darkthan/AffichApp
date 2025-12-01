function el(tag, attrs = {}, ...children) {
  const e = document.createElement(tag);
  Object.entries(attrs).forEach(([k, v]) => {
    if (k === 'class') {e.className = v;}
    else {e.setAttribute(k, v);}
  });
  children.flat().forEach((c) => e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c));
  return e;
}

function getStatusClass(status) {
  const statusMap = {
    'demande': 'status-pending',
    'disponible': 'status-available',
    'appelee': 'status-called',
    'livree': 'status-delivered'
  };
  return statusMap[status] || 'status-pending';
}

function getStatusLabel(status) {
  const labels = {
    'demande': 'En attente',
    'disponible': 'Disponible',
    'appelee': 'Appelée',
    'livree': 'Livrée'
  };
  return labels[status] || status;
}

function formatDate(iso) {
  try {
    const d = new Date(iso);
    return d.toLocaleString();
  } catch { return iso; }
}

function createRequestCard(request) {
  const children = [
    el('div', { class: 'name' }, request.applicantName),
    el('div', { class: 'card-type' }, `Type: ${request.cardTypeLabel || request.cardType}`)
  ];

  if (request.email) {
    children.push(el('div', { class: 'muted' }, `📧 ${request.email}`));
  }

  if (request.details) {
    children.push(el('div', { class: 'details' }, request.details));
  }

  children.push(
    el('div', { class: 'status-badge' }, getStatusLabel(request.status)),
    el('div', { class: 'timestamp' }, `Créée: ${formatDate(request.createdAt)}`)
  );

  if (request.availableSince) {
    children.push(el('div', { class: 'timestamp' }, `Disponible: ${formatDate(request.availableSince)}`));
  }

  return el('div', { class: `card-item ${getStatusClass(request.status)}` }, ...children);
}

async function loadRequests() {
  try {
    // Use public endpoint - no authentication required
    const res = await fetch('/public/all-requests');
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    const requests = await res.json();

    // Group by status
    const byStatus = {
      demande: [],
      disponible: [],
      appelee: [],
      livree: []
    };

    requests.forEach(req => {
      if (byStatus[req.status]) {
        byStatus[req.status].push(req);
      }
    });

    // Sort each group by creation date (newest first)
    Object.keys(byStatus).forEach(status => {
      byStatus[status].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    });

    // Render each section
    renderSection('pending-list', byStatus.demande);
    renderSection('available-list', byStatus.disponible);
    renderSection('called-list', byStatus.appelee);
    renderSection('delivered-list', byStatus.livree);

    document.getElementById('last-refresh').textContent = 'Dernière mise à jour: ' + new Date().toLocaleTimeString();
  } catch (e) {
    console.error('Error loading requests:', e);
    // Show error message in UI
    document.getElementById('last-refresh').textContent = 'Erreur de chargement des données';
  }
}

function renderSection(containerId, items) {
  const container = document.getElementById(containerId);
  container.innerHTML = '';

  if (!items.length) {
    container.appendChild(el('div', { class: 'muted' }, 'Aucune demande dans cette catégorie.'));
  } else {
    items.forEach(req => {
      container.appendChild(createRequestCard(req));
    });
  }
}

window.addEventListener('DOMContentLoaded', () => {
  loadRequests();
  setInterval(loadRequests, 15000); // Rafraîchit toutes les 15s

  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(adjustScaleToViewport, 100);
  });
});

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
