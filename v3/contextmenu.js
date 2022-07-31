/* global translate, notify, storage, sha256, userAction, isFF, once */

once(() => chrome.storage.local.get({
  'contextmenu-pause': true,
  'contextmenu-resume': true,
  'contextmenu-frame': true,
  'contextmenu-top': true
}, prefs => {
  const root = chrome.contextMenus.create({
    title: translate('bg_msg_5'),
    id: 'pause',
    contexts: ['action'],
    visible: prefs['contextmenu-pause']
  }, () => chrome.runtime.lastError);
  chrome.contextMenus.create({
    title: translate('bg_msg_7'),
    id: 'pause-10',
    contexts: ['action'],
    parentId: root
  }, () => chrome.runtime.lastError);
  chrome.contextMenus.create({
    title: translate('bg_msg_8'),
    id: 'pause-30',
    contexts: ['action'],
    parentId: root
  }, () => chrome.runtime.lastError);
  chrome.contextMenus.create({
    title: translate('bg_msg_9'),
    id: 'pause-60',
    contexts: ['action'],
    parentId: root
  }, () => chrome.runtime.lastError);
  chrome.contextMenus.create({
    title: translate('bg_msg_10'),
    id: 'pause-360',
    contexts: ['action'],
    parentId: root
  }, () => chrome.runtime.lastError);
  chrome.contextMenus.create({
    title: translate('bg_msg_11'),
    id: 'pause-1440',
    contexts: ['action'],
    parentId: root
  }, () => chrome.runtime.lastError);
  chrome.contextMenus.create({
    title: translate('bg_msg_6'),
    id: 'resume',
    contexts: ['action'],
    visible: prefs['contextmenu-resume']
  }, () => chrome.runtime.lastError);
  if (isFF) {
    chrome.contextMenus.create({
      title: translate('bg_msg_22'),
      id: 'options',
      contexts: ['action']
    }, () => chrome.runtime.lastError);
  }
  chrome.contextMenus.create({
    title: translate('bg_msg_19'),
    id: 'top',
    contexts: ['page'],
    visible: prefs['contextmenu-top']
  }, () => chrome.runtime.lastError);
  chrome.contextMenus.create({
    title: translate('bg_msg_18'),
    id: 'frame',
    contexts: ['frame'],
    visible: prefs['contextmenu-frame']
  }, () => chrome.runtime.lastError);
}));

chrome.storage.onChanged.addListener(ps => {
  if (ps['contextmenu-pause']) {
    chrome.contextMenus.update('pause', {
      visible: ps['contextmenu-pause'].newValue
    });
  }
  if (ps['contextmenu-resume']) {
    chrome.contextMenus.update('resume', {
      visible: ps['contextmenu-resume'].newValue
    });
  }
  if (ps['contextmenu-frame']) {
    chrome.contextMenus.update('frame', {
      visible: ps['contextmenu-frame'].newValue
    });
  }
  if (ps['contextmenu-top']) {
    chrome.contextMenus.update('top', {
      visible: ps['contextmenu-top'].newValue
    });
  }
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === 'options') {
    chrome.runtime.openOptionsPage();
  }
  else if (info.menuItemId.startsWith('pause-')) {
    const resolve = () => {
      const when = Date.now() + Number(info.menuItemId.replace('pause-', '')) * 60 * 1000;
      chrome.alarms.create('release.pause', {
        when
      });
      chrome.declarativeNetRequest.updateDynamicRules({
        removeRuleIds: [999],
        addRules: [{
          'id': 999,
          'priority': 3,
          'action': {
            'type': 'allow'
          },
          'condition': {
            'resourceTypes': ['main_frame', 'sub_frame']
          }
        }]
      }).catch(e => notify(`Cannot apply the pausing rule:

  Error: ${e.message}`));
    };

    const prefs = await storage({
      'sha256': '', // sha256 hash code of the user password
      'password': '' // deprecated
    });

    if (prefs.password || prefs.sha256) {
      prompt(translate('bg_msg_12')).then(password => {
        if (password) {
          sha256.validate({password}, resolve, msg => notify(msg || translate('bg_msg_2')));
        }
      });
    }
    else {
      resolve();
    }
  }
  else if (info.menuItemId === 'resume') {
    chrome.alarms.clear('release.pause');
    chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: [999]
    });
    notify(translate('bg_msg_16'));
  }
  else if (info.menuItemId === 'top' || info.menuItemId === 'frame') {
    userAction(tab.id, info.menuItemId === 'top' ? info.pageUrl : info.frameUrl, info.frameId);
  }
});

chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === 'release.pause') {
    chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: [999]
    });
    notify(translate('bg_msg_16'));
  }
});
