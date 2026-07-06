// eslint-disable-next-line no-unused-vars
const notify = async message => {
  const prefs = await chrome.storage.local.get({
    notification: true
  });

  if (prefs.notification) {
    const id = await chrome.notifications.create(null, {
      type: 'basic',
      iconUrl: '/data/icons/48.png',
      title: chrome.runtime.getManifest().name,
      message
    });
    setTimeout(chrome.notifications.clear, 5000, id);
  }
  else {
    console.info('[notification]', message);
  }
};

// eslint-disable-next-line no-unused-vars
const translate = id => chrome.i18n.getMessage(id) || id;

/* prompt */
chrome.runtime.onConnect.addListener(port => {
  port.onDisconnect.addListener(() => {
    const o = prompt.instances[port.sender.tab.windowId];
    if (o) {
      o.resolve('');
      chrome.windows.remove(port.sender.tab.windowId).catch(() => {});
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
      }).catch(() => {});
    }
  });
});
const prompt = (message, value = '', hidden = true, command = '', extra = {}) => {
  return new Promise((resolve, reject) => {
    const args = new URLSearchParams('');
    args.set('message', message);
    args.set('value', value);
    args.set('hidden', hidden);
    args.set('command', command);
    args.set('extra', JSON.stringify(extra));

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
