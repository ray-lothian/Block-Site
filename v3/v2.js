chrome.action = chrome.action || chrome.browserAction;

chrome.scripting = chrome.scripting || {
  executeScript({target, files, func, args = []}) {
    const props = {};

    if (files) {
      props.file = files[0];
    }
    if (func) {
      const s = btoa(JSON.stringify(args));
      props.code = '(' + func.toString() + `)(...JSON.parse(atob('${s}')))`;
    }
    if (target.allFrames) {
      props.allFrames = true;
      props.matchAboutBlank = true;
    }

    return new Promise((resolve, reject) => chrome.tabs.executeScript(target.tabId, props, r => {
      const lastError = chrome.runtime.lastError;
      if (lastError) {
        reject(lastError);
      }
      else {
        resolve(r.map(result => ({result})));
      }
    }));
  }
};

chrome.contextMenus.create = new Proxy(chrome.contextMenus.create, {
  apply(target, self, [properties]) {
    properties.contexts = properties.contexts.map(s => s === 'action' ? 'browser_action' : s);
    Reflect.apply(target, self, [properties]);
  }
});

chrome.windows.getCurrent = new Proxy(chrome.windows.getCurrent, {
  apply(target, self, args) {
    return new Promise(resolve => {
      if (args.length === 0) {
        args.push(resolve);
      }
      Reflect.apply(target, self, args);
    });
  }
});

chrome.tabs.query = new Proxy(chrome.tabs.query, {
  apply(target, self, args) {
    return new Promise(resolve => {
      args.push(resolve);
      Reflect.apply(target, self, args);
    });
  }
});

chrome.declarativeNetRequest.getDynamicRules = new Proxy(chrome.declarativeNetRequest.getDynamicRules, {
  apply(target, self, args) {
    return new Promise(resolve => {
      args.push(resolve);
      Reflect.apply(target, self, args);
    });
  }
});
chrome.alarms.getAll = new Proxy(chrome.alarms.getAll, {
  apply(target, self, args) {
    return new Promise(resolve => {
      args.push(resolve);
      Reflect.apply(target, self, args);
    });
  }
});
