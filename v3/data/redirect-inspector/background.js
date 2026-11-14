/* Redirect Inspector — self-contained context-menu integration.

   The heavy lifting (webRequest listeners, list UI) lives in index.html/js,
   which runs only while its window is open. This file only creates the
   context-menu item and opens that window. */

'use strict';

(() => {
  const ID = 'redirect-inspector';
  const ACTION_ID = 'redirect-inspector-action';
  const TITLE = 'Track redirects in this tab';
  const PAGE = 'data/redirect-inspector/index.html';
  const WIDTH = 640;
  const HEIGHT = 720;

  // Recreated every time the project rebuilds its context menus, because
  // contextmenu.js calls chrome.contextMenus.removeAll().
  const build = (options = {}) => {
    const page = options.page !== false;
    const action = options.action !== false;

    chrome.contextMenus.create({
      id: ID,
      title: TITLE,
      contexts: ['page'],
      documentUrlPatterns: ['*://*/*'],
      visible: page
    }, () => {
      // duplicate ids (e.g. rebuilds) are harmless
      void chrome.runtime.lastError;
    });

    // The action context has no page URL, so it needs its own item without
    // documentUrlPatterns.
    chrome.contextMenus.create({
      id: ACTION_ID,
      title: TITLE,
      contexts: ['action'],
      visible: action
    }, () => {
      void chrome.runtime.lastError;
    });
  };

  // the options page can hide either entry without rebuilding the whole menu
  chrome.storage.onChanged.addListener(ps => {
    if (ps['contextmenu-redirect-inspector']) {
      chrome.contextMenus.update(ID, {
        visible: ps['contextmenu-redirect-inspector'].newValue !== false
      }, () => void chrome.runtime.lastError);
    }
    if (ps['contextmenu-redirect-inspector-action']) {
      chrome.contextMenus.update(ACTION_ID, {
        visible: ps['contextmenu-redirect-inspector-action'].newValue !== false
      }, () => void chrome.runtime.lastError);
    }
  });

  const inspectorUrl = tabId => chrome.runtime.getURL(PAGE) + '?tabId=' + tabId;

  const focusExisting = async tab => {
    try {
      const windows = await chrome.windows.getAll({populate: true});
      const wanted = inspectorUrl(tab.id);
      for (const win of windows) {
        for (const t of win.tabs || []) {
          if (t.url === wanted || (t.url && t.url.startsWith(wanted + '&'))) {
            await chrome.windows.update(win.id, {focused: true});
            return true;
          }
        }
      }
    }
    catch (e) {
      // fall through and open a new window
    }
    return false;
  };

  // center the popup over the browser window that owns the tracked tab
  const position = async tab => {
    try {
      const win = await chrome.windows.get(tab.windowId);
      if (Number.isFinite(win.left) && Number.isFinite(win.top) &&
          Number.isFinite(win.width) && Number.isFinite(win.height)) {
        return {
          left: Math.round(win.left + Math.max(0, (win.width - WIDTH) / 2)),
          top: Math.round(win.top + Math.max(0, (win.height - HEIGHT) / 2))
        };
      }
    }
    catch (e) {
      // window may have closed, or the browser does not expose bounds
    }
    return {};
  };

  const show = async tab => {
    if (await focusExisting(tab)) {
      return;
    }
    const props = {
      url: inspectorUrl(tab.id),
      type: 'popup',
      width: WIDTH,
      height: HEIGHT
    };
    Object.assign(props, await position(tab));
    // A split incognito instance must stay in its own profile.
    if (tab.incognito) {
      props.incognito = true;
    }
    try {
      await chrome.windows.create(props);
    }
    catch (e) {
      // incognito flag rejected (e.g. Firefox) — retry without it
      delete props.incognito;
      await chrome.windows.create(props);
    }
  };

  const open = async tab => {
    if (!tab || typeof tab.id !== 'number' || tab.id < 0) {
      return;
    }
    // permissions.request() must be called synchronously with the context-menu
    // click gesture, before the first await. webRequest has no warning, so
    // Chrome and Firefox grant it without a dialog.
    let request;
    try {
      request = chrome.permissions.request({permissions: ['webRequest']});
    }
    catch (e) {
      // The inspector window offers its own Enable button as a fallback.
    }
    try {
      await request;
    }
    catch (e) {
      // same fallback
    }
    try {
      await show(tab);
    }
    catch (e) {
      console.warn('[redirect-inspector]', e);
    }
  };

  self.redirectInspector = {build, open};
})();
