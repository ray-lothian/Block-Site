/* global translate, notify, storage, sha256, userAction, isFF, once */

const buildContext = () => chrome.storage.local.get({
  'contextmenu-pause': true,
  'contextmenu-resume': true,
  'contextmenu-frame': true,
  'contextmenu-top': true,
  'pause-periods': [5, 10, 15, 30, 60, 360, 1440, -1]
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

  chrome.contextMenus.update('pause', {
    enabled: prefs['pause-periods'].length !== 0
  });

  for (const period of prefs['pause-periods']) {
    chrome.contextMenus.create({
      title: period === -1 ? translate('options_manual_pause') : read(period),
      id: period === -1 ? 'pause-NaN' : 'pause-' + period,
      contexts: ['action'],
      parentId: 'pause'
    }, () => chrome.runtime.lastError);
  }

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
});

once(buildContext);

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
  if (ps['pause-periods']) {
    chrome.contextMenus.removeAll(buildContext);
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
        if (info.menuItemId !== 'pause-NaN') {
          const when = Date.now() + Number(info.menuItemId.replace('pause-', '')) * 60 * 1000;
          chrome.alarms.create('release.pause', {
            when
          });
        }
        const condition = {
          'resourceTypes': ['main_frame', 'sub_frame']
        };
        if (isFF) {
          condition.regexFilter = '.*';
        }
        await chrome.declarativeNetRequest.updateDynamicRules({
          removeRuleIds: [999],
          addRules: [{
            'id': 999,
            'priority': 5,
            'action': {
              'type': 'allow'
            },
            condition
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
