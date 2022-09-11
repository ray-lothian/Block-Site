// eslint-disable-next-line no-unused-vars
const isFF = /Firefox/.test(navigator.userAgent);

// eslint-disable-next-line no-unused-vars
const notify = message => chrome.notifications.create(null, {
  type: 'basic',
  iconUrl: '/data/icons/48.png',
  title: chrome.runtime.getManifest().name,
  message
});

// eslint-disable-next-line no-unused-vars
const translate = id => chrome.i18n.getMessage(id) || id;

// eslint-disable-next-line no-unused-vars
const storage = prefs => new Promise(resolve => chrome.storage.local.get(prefs, resolve));

/* prompt */
chrome.runtime.onConnect.addListener(port => {
  port.onDisconnect.addListener(() => {
    const o = prompt.instances[port.sender.tab.windowId];
    if (o) {
      o.resolve('');
      chrome.windows.remove(port.sender.tab.windowId);
      delete prompt.instances[port.sender.tab.windowId];
    }
  });
  port.onMessage.addListener(request => {
    if (request.method === 'prompt-resolved') {
      const o = prompt.instances[port.sender.tab.windowId];
      if (o) {
        o.resolve(request.password);
        delete prompt.instances[port.sender.tab.windowId];
      }
    }
    else if (request.method === 'bring-to-front') {
      chrome.windows.update(port.sender.tab.windowId, {
        focused: true
      });
    }
  });
});
const prompt = (message, value = '', hidden = true, command = '') => {
  return new Promise((resolve, reject) => {
    const args = new URLSearchParams('');
    args.set('message', message);
    args.set('value', value);
    args.set('hidden', hidden);
    args.set('command', command);

    chrome.windows.getCurrent(win => {
      chrome.windows.create({
        url: 'data/prompt/index.html?' + args.toString(),
        type: 'popup',
        width: 600,
        height: 200, // test on Windows
        left: win.left + Math.round((win.width - 600) / 2),
        top: win.top + Math.round((win.height - 180) / 2)
      }, w => {
        prompt.instances[w.id] = {resolve, reject};
      });
    });
  });
};
prompt.instances = {};

/* once */
const once = (c, prop = {
  startup: true,
  installed: true
}) => {
  if (isFF) {
    once.cache.add(c);
  }
  else {
    if (prop.startup) {
      chrome.runtime.onStartup.addListener(c);
    }
    if (prop.installed) {
      chrome.runtime.onInstalled.addListener(c);
    }
  }
};
once.cache = new Set();

if (isFF) {
  document.addEventListener('DOMContentLoaded', () => {
    for (const c of once.cache) {
      try {
        c();
      }
      catch (e) {
        console.warn(e);
      }
    }
  });
}
