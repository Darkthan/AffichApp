browser.browserAction.onClicked.addListener(async tab => {
  if (!tab.id) return;
  try {
    await browser.tabs.executeScript(tab.id, {file: 'core.js'});
    await browser.tabs.executeScript(tab.id, {file: 'names.js'});
    await browser.tabs.executeScript(tab.id, {file: 'content.js'});
  } catch (error) {
    console.error('Impossible d’ouvrir le sélecteur de badges :', error);
    await browser.browserAction.setBadgeText({tabId: tab.id, text: '!'});
    await browser.browserAction.setTitle({tabId: tab.id, title: 'Ouvrez la page Activation_badge puis réessayez.'});
  }
});

browser.runtime.onMessage.addListener((message, sender) => {
  const options = sender.url === browser.runtime.getURL('options.html') && !sender.tab;
  let badgePage = false;
  try { badgePage = !!sender.tab && /^\/Activation_badge\/?$/i.test(new URL(sender.url).pathname); } catch (_) { /* Invalid sender. */ }
  // Options tabs can have a tab ID in Firefox; match the exact extension URL.
  const settingsPage = options || sender.url === browser.runtime.getURL('options.html');
  if ((!settingsPage && !badgePage) || !message || typeof message.type !== 'string') { return undefined; }
  const tasks = {
    AFFICH_STATUS: () => AffichApp.status(),
    AFFICH_SETTINGS: () => browser.runtime.openOptionsPage(),
    AFFICH_CARDS: () => AffichApp.cards(message.filters),
    AFFICH_TYPES: () => AffichApp.types(),
    AFFICH_SYNC_NAMES: () => AffichApp.syncNames(message.people),
    AFFICH_UPDATE: () => {
      if (typeof message.server !== 'string' || !message.server) { throw new Error('Récupérez de nouveau les cartes avant de modifier leur statut.'); }
      return AffichApp.updateStatus(message.ids, message.status, message.server);
    },
  };
  if (settingsPage) {
    Object.assign(tasks, {
      AFFICH_CONFIGURE: () => AffichApp.configure(message.server),
      AFFICH_CONNECT: () => AffichApp.connect(),
      AFFICH_DISCONNECT: () => AffichApp.disconnect(),
      AFFICH_ADD_NAME: () => AffichApp.addName(message.name, message.cardType),
      AFFICH_NAME_SETTINGS: () => AffichApp.nameSettings(message.enabled, message.mixedCategory),
    });
  }
  if (!tasks[message.type]) { return undefined; }
  return Promise.resolve().then(tasks[message.type]).then(data => ({ ok: true, data }), error => ({ ok: false, error: error.message }));
});
