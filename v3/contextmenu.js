/* global translate, notify, storage, sha256, userAction, isFF, once */

const periods = () => chrome.storage.local.get({
  'pause-periods': [5, 10, 15, 30, 60, 360, 1440]
}, prefs => {
  chrome.contextMenus.create({
    title: translate('bg_msg_5'),
    id: 'pause',
    contexts: ['action'],
    visible: prefs['contextmenu-pause']
  }, () => chrome.runtime.lastError);


  const read = mm => {
    const minutes = mm % 60;
    const hours = Math.floor(mm / 60);

    const s = [];
    if (hours) {
      s.push(
        hours + ' ' +
        translate(read.plural.select(hours) === 'one' ? 'bg_msg_25' : 'bg_msg_26')
      );
    }
    if (minutes) {
      s.push(
        minutes + ' ' +
        translate(read.plural.select(hours) === 'one' ? 'bg_msg_23' : 'bg_msg_24')
      );
    }

    return s.join(' ');
  };
  read.plural = new Intl.PluralRules(navigator.language);

  if (prefs['pause-periods'].length === 0) {
    prefs['pause-periods'].push(5, 10, 15, 30, 60, 360, 1440);
  }

  for (const period of prefs['pause-periods']) {
    chrome.contextMenus.create({
      title: read(period),
      id: 'pause-' + period,
      contexts: ['action'],
      parentId: 'pause'
    }, () => chrome.runtime.lastError);
  }
});
chrome.storage.onChanged.addListener(ps => {
  if (ps['pause-periods']) {
    Promise.all(
      ps['pause-periods'].oldValue.map(s => new Promise(resolve => chrome.contextMenus.remove('pause-' + s, resolve)))
    ).then(periods);
  }
});

once(() => chrome.storage.local.get({
  'contextmenu-pause': true,
  'contextmenu-resume': true,
  'contextmenu-frame': true,
  'contextmenu-top': true
}, prefs => {
  periods();

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

const resume = () => {
  chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: [999]
  });
  chrome.action.setIcon({
    path: {
      '16': '/data/icons/16.png',
      '32': '/data/icons/32.png'
    }
  });
  chrome.action.setTitle({
    title: translate('bg_msg_28')
  });
};

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === 'options') {
    chrome.runtime.openOptionsPage();
  }
  else if (info.menuItemId.startsWith('pause-')) {
    const resolve = async () => {
      try {
        const when = Date.now() + Number(info.menuItemId.replace('pause-', '')) * 60 * 1000;
        chrome.alarms.create('release.pause', {
          when
        });
        await chrome.declarativeNetRequest.updateDynamicRules({
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
        });
        chrome.action.setIcon({
          path: {
            '16': '/data/icons/paused/16.png',
            '32': '/data/icons/paused/32.png'
          }
        });
        chrome.action.setTitle({
          title: translate('bg_msg_27')
        });
      }
      catch (e) {
        console.warn(e);
        notify(`Cannot apply the pausing rule:

Error: ${e.message}`);
      }
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
    resume();
  }
  else if (info.menuItemId === 'top' || info.menuItemId === 'frame') {
    userAction(tab.id, info.menuItemId === 'top' ? info.pageUrl : info.frameUrl, info.frameId);
  }
});

chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === 'release.pause') {
    resume();
  }
});
