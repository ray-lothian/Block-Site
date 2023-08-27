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

