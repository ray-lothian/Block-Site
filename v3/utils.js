function getRelativeTime(date) {
  const now = new Date();
  const timeDifferenceInSeconds = Math.floor((now - date) / 1000); // Convert to seconds
  const timeDifferenceInMinutes = Math.floor(timeDifferenceInSeconds / 60);
  const timeDifferenceInHours = Math.floor(timeDifferenceInMinutes / 60);
  const timeDifferenceInDays = Math.floor(timeDifferenceInHours / 24);
  const timeDifferenceInMonths = Math.floor(timeDifferenceInDays / 30);
  const timeDifferenceInYears = Math.floor(timeDifferenceInMonths / 12);

  const rtf = new Intl.RelativeTimeFormat(navigator.locale, {numeric: 'auto'});

  if (timeDifferenceInSeconds < 60) {
    return rtf.format(-timeDifferenceInSeconds, 'second');
  }
  else if (timeDifferenceInMinutes < 60) {
    return rtf.format(-timeDifferenceInMinutes, 'minute');
  }
  else if (timeDifferenceInHours < 24) {
    return rtf.format(-timeDifferenceInHours, 'hour');
  }
  else if (timeDifferenceInDays < 30) {
    return rtf.format(-timeDifferenceInDays, 'day');
  }
  else if (timeDifferenceInMonths < 12) {
    return rtf.format(-timeDifferenceInMonths, 'month');
  }
  else {
    return rtf.format(-timeDifferenceInYears, 'year');
  }
}

// human-readable "X hour(s) Y minute(s)" for a whole number of minutes,
// localized with the same plural strings the pause menu uses
// eslint-disable-next-line no-unused-vars
function humanDuration(minutes) {
  const plural = new Intl.PluralRules(navigator.language);
  const m = minutes % 60;
  const h = Math.floor(minutes / 60);
  const parts = [];
  if (h) {
    parts.push(h + ' ' + chrome.i18n.getMessage(plural.select(h) === 'one' ? 'bg_msg_25' : 'bg_msg_26'));
  }
  if (m) {
    parts.push(m + ' ' + chrome.i18n.getMessage(plural.select(m) === 'one' ? 'bg_msg_23' : 'bg_msg_24'));
  }
  return parts.join(' ') || String(minutes);
}
