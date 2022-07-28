/* global fs */

document.getElementById('clean-schedules').onclick = () => fs.clean(true);

{
  const start = document.querySelector('#schedule-helper [name="start"]');
  const end = document.querySelector('#schedule-helper [name="end"]');

  document.getElementById('schedule-helper').onsubmit = e => {
    e.preventDefault();

    fs.clean(true);
    const days = [...document.querySelectorAll('#schedule-helper :checked')].map(e => e.dataset.id);

    if (days.length) {
      const periods = [];

      if (start.value !== '00:00') {
        periods.push({
          start: '00:00',
          end: start.value
        });
      }
      if (end.value !== '23:59') {
        periods.push({
          start: end.value,
          end: '23:59'
        });
      }

      const times = days.reduce((p, c) => {
        p[c] = periods;
        return p;
      }, {});

      fs({times});
    }
  };

  start.oninput = () => {
    if (
      start.valueAsDate && isFinite(start.valueAsDate) &&
      end.valueAsDate && isFinite(end.valueAsDate)
    ) {
      if (start.valueAsDate.getTime() >= end.valueAsDate.getTime()) {
        start.setCustomValidity('Must be smaller than end');
        start.reportValidity();
      }
      else {
        start.setCustomValidity('');
      }
      end.setCustomValidity('');
    }
  };
  end.oninput = () => {
    if (
      start.valueAsDate && isFinite(start.valueAsDate) &&
      end.valueAsDate && isFinite(end.valueAsDate)
    ) {
      if (start.valueAsDate.getTime() >= end.valueAsDate.getTime()) {
        end.setCustomValidity('Must be bigger than end');
        end.reportValidity();
      }
      else {
        end.setCustomValidity('');
      }
      start.setCustomValidity('');
    }
  };
}

document.getElementById('schedule-helper').onchange = e => {
  e.stopPropagation();
};
