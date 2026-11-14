/* global toast, validateRegex */

{
  const WEEK = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const END_OF_DAY = 23 * 60 + 59;
  let reverseMode = false;

  const getMessage = (name, fallback, substitutions) => chrome.i18n.getMessage(name, substitutions) || fallback;

  const toMinutes = value => {
    const [hours, minutes] = value.split(':').map(Number);
    return hours * 60 + minutes;
  };
  const toTime = minutes => {
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    return String(hours).padStart(2, '0') + ':' + String(rest).padStart(2, '0');
  };
  const mergeIntervals = intervals => {
    const merged = [];
    for (const [start, end] of intervals.slice().sort((a, b) => a[0] - b[0])) {
      if (merged.length === 0 || start > merged[merged.length - 1][1]) {
        merged.push([start, end]);
      }
      else {
        merged[merged.length - 1][1] = Math.max(merged[merged.length - 1][1], end);
      }
    }
    return merged;
  };

  const formatDays = days => {
    const ordered = WEEK.filter(day => days.includes(day));
    const groups = [];
    let start = -1;
    let previous = -1;

    for (const day of ordered) {
      const index = WEEK.indexOf(day);
      if (start === -1) {
        start = previous = index;
      }
      else if (index === previous + 1) {
        previous = index;
      }
      else {
        groups.push(start === previous ? WEEK[start] : WEEK[start] + '–' + WEEK[previous]);
        start = previous = index;
      }
    }
    if (start !== -1) {
      groups.push(start === previous ? WEEK[start] : WEEK[start] + '–' + WEEK[previous]);
    }
    return groups.join(', ');
  };

  // Build the day-level explanation shown under the day selector.
  const noteLines = () => {
    const selected = WEEK.filter(day => {
      const checkbox = document.querySelector(`#schedule-form .schedule-days input[data-id="${day}"]`);
      return checkbox && checkbox.checked;
    });

    if (selected.length === 0) {
      return [getMessage('options_schedule_note_no_days', 'Select at least one day.')];
    }

    const allDay = allDaySelected();
    const selectedText = formatDays(selected);
    const unselected = WEEK.filter(day => selected.includes(day) === false);
    const lines = [];
    const hasTimes = start.value && end.value;

    if (reverseMode) {
      if (allDay) {
        if (selected.length === WEEK.length) {
          lines.push(getMessage('options_schedule_note_allow_day_all',
            'Every day is covered. Sites are allowed all day.'));
        }
        else {
          lines.push(getMessage('options_schedule_note_allow_day',
            'On ' + selectedText + ': sites are allowed all day.', [selectedText]));
        }
      }
      else if (!hasTimes) {
        lines.push(getMessage('options_schedule_note_no_times', 'Select a start and end time to see the effect on those days.'));
      }
      else if (selected.length === WEEK.length) {
        lines.push(getMessage('options_schedule_note_allow_window_all',
          'Every day is covered. Sites are allowed ' + start.value + '–' + end.value + '.',
          [start.value, end.value]));
      }
      else {
        lines.push(getMessage('options_schedule_note_allow_window',
          'On ' + selectedText + ': sites are allowed ' + start.value + '–' + end.value + '.',
          [selectedText, start.value, end.value]));
      }
    }
    else if (allDay) {
      if (selected.length === WEEK.length) {
        lines.push(getMessage('options_schedule_note_all_allow', 'Every day is covered. Blocking is paused all day.'));
      }
      else {
        lines.push(getMessage('options_schedule_note_allow',
          'On ' + selectedText + ': blocking is paused all day.', [selectedText]));
      }
    }
    else if (!hasTimes) {
      lines.push(getMessage('options_schedule_note_no_times', 'Select a start and end time to see the effect on those days.'));
    }
    else if (selected.length === WEEK.length) {
      lines.push(getMessage('options_schedule_note_all_block',
        'Every day is covered. Blocking is active ' + start.value + '–' + end.value + '; sites are unblocked outside this window.',
        [start.value, end.value]));
    }
    else {
      lines.push(getMessage('options_schedule_note_block',
        'On ' + selectedText + ': blocking is active ' + start.value + '–' + end.value + '; sites are unblocked outside this window.',
        [selectedText, start.value, end.value]));
    }

    if (unselected.length) {
      const unselectedText = formatDays(unselected);
      lines.push(reverseMode
        ? getMessage('options_schedule_note_unselected_reverse',
          'Not covered by this entry: ' + unselectedText + '. Those days stay blocked by default in reverse mode.',
          [unselectedText])
        : getMessage('options_schedule_note_unselected',
          'Not covered by this entry: ' + unselectedText + '. Those days stay blocked all day unless another entry covers them.',
          [unselectedText]));
    }

    if (rule.value.trim()) {
      lines.push(reverseMode
        ? getMessage('options_schedule_note_rule_reverse', 'Only sites matching the rule are allowed during this entry.')
        : getMessage('options_schedule_note_rule', 'This entry applies only to sites matching the rule.'));
    }

    return lines;
  };

  // Convert a stored schedule (allowed periods) into editable entries.
  const deriveEntries = (rule, schedule) => {
    if (!schedule) {
      return [];
    }

    let times = schedule.times;
    if (!times) { // old format: single allowed period for a list of days
      const allowed = [];
      if (schedule.time && schedule.time.start && schedule.time.end) {
        allowed.push({start: schedule.time.start, end: schedule.time.end});
      }
      times = {};
      for (const day of schedule.days || []) {
        times[day] = allowed;
      }
    }
    if (!times) {
      return [];
    }

    const groups = new Map();

    for (const [day, periods] of Object.entries(times)) {
      if (!Array.isArray(periods)) {
        continue;
      }
      const list = periods.filter(p => p && p.start && p.end)
        .map(p => [toMinutes(p.start), toMinutes(p.end)]);
      if (list.length === 0) {
        continue;
      }

      const allowed = mergeIntervals(list);
      if (allowed.length === 1 && allowed[0][0] === 0 && allowed[0][1] >= END_OF_DAY) {
        if (groups.has('all-day') === false) {
          groups.set('all-day', {rule, allDay: true, days: new Set()});
        }
        groups.get('all-day').days.add(day);
        continue;
      }

      if (reverseMode) {
        for (const [start, end] of allowed) {
          const key = toTime(start) + '-' + toTime(end);
          if (groups.has(key) === false) {
            groups.set(key, {
              rule,
              allDay: false,
              start: toTime(start),
              end: toTime(end),
              days: new Set()
            });
          }
          groups.get(key).days.add(day);
        }
        continue;
      }

      const blocks = [];
      let cursor = 0;
      for (const [start, end] of allowed) {
        if (cursor < start) {
          blocks.push([cursor, start]);
        }
        cursor = Math.max(cursor, end);
      }
      if (cursor < END_OF_DAY) {
        blocks.push([cursor, END_OF_DAY]);
      }

      for (const [start, end] of blocks) {
        const key = toTime(start) + '-' + toTime(end);
        if (groups.has(key) === false) {
          groups.set(key, {
            rule,
            allDay: false,
            start: toTime(start),
            end: toTime(end),
            days: new Set()
          });
        }
        groups.get(key).days.add(day);
      }
    }

    return [...groups.values()].map(group => {
      const days = [...group.days].sort((a, b) => WEEK.indexOf(a) - WEEK.indexOf(b));
      if (group.allDay) {
        return {rule, days, allDay: true};
      }
      return {
        rule,
        days,
        allDay: false,
        start: group.start,
        end: group.end
      };
    });
  };

  // Convert editable entries back into the allowed periods the core expects.
  const buildTimes = entries => {
    const days = new Map();

    for (const entry of entries) {
      for (const day of entry.days) {
        let info = days.get(day);
        if (info === undefined) {
          info = {allDay: false, blocks: []};
          days.set(day, info);
        }
        if (entry.allDay) {
          info.allDay = true;
        }
        else {
          info.blocks.push([toMinutes(entry.start), toMinutes(entry.end)]);
        }
      }
    }

    const times = {};
    for (const [day, info] of days) {
      if (reverseMode) {
        const intervals = info.allDay ? [[0, END_OF_DAY]] : mergeIntervals(info.blocks);
        if (intervals.length) {
          times[day] = intervals.map(([start, end]) => ({
            start: toTime(start),
            end: toTime(end)
          }));
        }
        continue;
      }

      const periods = [];
      if (info.allDay) {
        periods.push({start: '00:00', end: '23:59'});
      }
      else {
        const merged = mergeIntervals(info.blocks);
        let cursor = 0;
        for (const [start, end] of merged) {
          if (cursor < start) {
            periods.push({start: toTime(cursor), end: toTime(start)});
          }
          cursor = Math.max(cursor, end);
        }
        if (cursor < END_OF_DAY) {
          periods.push({start: toTime(cursor), end: '23:59'});
        }
      }
      if (periods.length) {
        times[day] = periods;
      }
    }

    return times;
  };

  const form = document.getElementById('schedule-form');
  const start = form.querySelector('[name="start"]');
  const end = form.querySelector('[name="end"]');
  const rule = form.querySelector('[name="rule"]');
  const submit = document.getElementById('schedule-submit');
  const cancel = document.getElementById('schedule-cancel');
  const list = document.getElementById('schedule-list');
  const empty = document.getElementById('schedule-empty');
  const template = document.getElementById('schedule-entry-template');
  const intro = document.getElementById('schedule-intro');
  const blockLabel = document.getElementById('schedule-mode-block-label');
  const allDayLabel = document.getElementById('schedule-mode-all-day-label');

  const entries = [];
  let editing = -1;

  const allDaySelected = () => form.querySelector('[name="mode"]:checked').value === 'all-day';
  const syncMode = () => {
    const allDay = allDaySelected();
    start.disabled = allDay;
    end.disabled = allDay;
  };
  const updateModeLabels = () => {
    if (reverseMode) {
      intro.textContent = getMessage('options_schedule_intro_reverse',
        'Reverse mode blocks everything except allowed sites. A schedule entry allows matching sites during the selected periods. Days without an entry stay blocked by default.');
      blockLabel.textContent = getMessage('options_schedule_mode_allow', 'Allow between');
      allDayLabel.textContent = getMessage('options_schedule_mode_all_day_reverse', 'Allow all day');
    }
    else {
      intro.textContent = getMessage('options_schedule_intro',
        'A Block entry blocks the selected hours. An Allow entry pauses blocking. Days without an entry stay blocked all day.');
      blockLabel.textContent = getMessage('options_schedule_mode_block', 'Block between');
      allDayLabel.textContent = getMessage('options_schedule_mode_all_day', 'Allow all day (blocking is paused)');
    }
  };
  const updateNote = () => {
    document.getElementById('schedule-days-note').textContent = noteLines().join('\n');
  };

  form.querySelectorAll('[name="mode"]').forEach(radio => radio.addEventListener('change', syncMode));

  const reset = () => {
    editing = -1;
    form.querySelector('[name="mode"][value="block"]').checked = true;
    start.value = '';
    end.value = '';
    rule.value = '';
    submit.value = getMessage('options_schedule_add', 'Add');
    cancel.hidden = true;
    syncMode();
    updateNote();
  };

  const render = () => {
    list.textContent = '';
    empty.hidden = entries.length > 0;

    const allSites = getMessage('options_schedule_all_sites', 'All sites');
    const block = getMessage('options_schedule_type_block', 'Block');
    const allow = getMessage('options_schedule_type_allow', 'Allow');
    const allDayNormal = getMessage('options_schedule_all_day_row', 'Blocking paused all day');
    const allDayReverse = getMessage('options_schedule_all_day_allow_row', 'All day');
    const editLabel = getMessage('options_schedule_edit', 'Edit');
    const removeLabel = getMessage('options_schedule_remove', 'Remove');

    for (const [index, entry] of entries.entries()) {
      const node = document.importNode(template.content, true);
      node.querySelector('li').dataset.index = index;
      const isAllow = reverseMode || entry.allDay;
      const type = node.querySelector('[data-id="type"]');
      type.textContent = isAllow ? allow : block;
      type.dataset.type = isAllow ? 'allow' : 'block';
      node.querySelector('[data-id="rule"]').textContent = entry.rule || allSites;
      node.querySelector('[data-id="days"]').textContent = formatDays(entry.days);
      node.querySelector('[data-id="time"]').textContent = entry.allDay
        ? (reverseMode ? allDayReverse : allDayNormal)
        : entry.start + ' – ' + entry.end;
      node.querySelector('[data-cmd="edit"]').value = editLabel;
      node.querySelector('[data-cmd="remove"]').value = removeLabel;
      list.appendChild(node);
    }

    empty.textContent = reverseMode
      ? getMessage('options_schedule_empty_reverse', 'No schedule entries. Reverse mode blocks everything except allowed sites.')
      : getMessage('options_schedule_empty', 'No schedule entries yet. Blocking stays active all the time.');
    updateNote();
  };

  const readForm = () => {
    const days = [...form.querySelectorAll('.schedule-days input:checked')].map(e => e.dataset.id);
    if (days.length === 0) {
      toast(getMessage('options_schedule_days_required', 'Select at least one day.'), 3000, 'error');
      return null;
    }

    const allDay = allDaySelected();
    if (allDay === false) {
      if (!start.value || !end.value) {
        toast(getMessage('options_schedule_times_required', 'Enter both a start and an end time.'), 3000, 'error');
        return null;
      }
      if (toMinutes(start.value) >= toMinutes(end.value)) {
        toast(getMessage('options_schedule_invalid_range', 'The start time must be before the end time.'), 3000, 'error');
        return null;
      }
    }

    const value = rule.value.trim();
    if (value) {
      const error = validateRegex(value);
      if (error) {
        toast(error.message, 3000, 'error');
        return null;
      }
    }

    if (allDay) {
      return {rule: value, days, allDay: true};
    }
    return {
      rule: value,
      days,
      allDay: false,
      start: start.value,
      end: end.value
    };
  };

  const editEntry = index => {
    const entry = entries[index];
    editing = index;
    form.querySelector(`[name="mode"][value="${entry.allDay ? 'all-day' : 'block'}"]`).checked = true;
    start.value = entry.start || '';
    end.value = entry.end || '';
    rule.value = entry.rule || '';
    for (const checkbox of form.querySelectorAll('.schedule-days input')) {
      checkbox.checked = entry.days.includes(checkbox.dataset.id);
    }
    submit.value = getMessage('options_schedule_update', 'Update');
    cancel.hidden = false;
    syncMode();
    updateNote();
    form.scrollIntoView({block: 'nearest'});
    (entry.allDay ? rule : start).focus();
  };

  form.addEventListener('input', updateNote);
  form.addEventListener('change', updateNote);

  form.addEventListener('submit', e => {
    e.preventDefault();
    const entry = readForm();
    if (entry === null) {
      return;
    }
    const summary = noteLines().join(' ');
    if (editing === -1) {
      entries.push(entry);
    }
    else {
      entries[editing] = entry;
    }
    render();
    reset();
    if (summary) {
      toast(summary, 5000);
    }
    document.dispatchEvent(new Event('change'));
  });

  cancel.addEventListener('click', reset);

  list.addEventListener('click', e => {
    const button = e.target.closest('[data-cmd]');
    if (button === null) {
      return;
    }
    const index = Number(button.closest('li').dataset.index);
    const cmd = button.dataset.cmd;

    if (cmd === 'edit') {
      editEntry(index);
    }
    else if (cmd === 'remove') {
      if (editing === index) {
        reset();
      }
      entries.splice(index, 1);
      if (editing > index) {
        editing -= 1;
      }
      render();
      document.dispatchEvent(new Event('change'));
    }
  });

  const apply = (schedule, schedules = {}) => {
    entries.length = 0;
    entries.push(...deriveEntries('', schedule));
    for (const [name, value] of Object.entries(schedules || {})) {
      entries.push(...deriveEntries(name, value));
    }
    // global entries first, then rule-based entries
    entries.sort((a, b) => {
      if (a.rule !== b.rule) {
        return a.rule ? (b.rule ? a.rule.localeCompare(b.rule) : 1) : -1;
      }
      const day = WEEK.indexOf(a.days[0]) - WEEK.indexOf(b.days[0]);
      return day || (a.start || '').localeCompare(b.start || '');
    });
    updateModeLabels();
    reset();
    render();
  };

  const load = (schedule, schedules = {}, reverse = false) => {
    reverseMode = reverse;
    apply(schedule, schedules);
  };

  const setReverse = reverse => {
    if (reverse === reverseMode) {
      return;
    }
    const data = toStorage(); // computed with the old mode
    reverseMode = reverse;
    apply(data.schedule, data.schedules);
  };

  const toStorage = () => {
    const rules = new Map();
    const global = [];

    for (const entry of entries) {
      if (entry.rule) {
        if (rules.has(entry.rule) === false) {
          rules.set(entry.rule, []);
        }
        rules.get(entry.rule).push(entry);
      }
      else {
        global.push(entry);
      }
    }

    const schedule = {times: buildTimes(global)};
    const schedules = {};
    for (const [name, values] of rules) {
      schedules[name] = {times: buildTimes(values)};
    }

    return {schedule, schedules};
  };

  window.scheduleList = {load, setReverse, toStorage};
}
