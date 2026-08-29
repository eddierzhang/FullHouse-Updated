const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const toast = (title, subtitle = 'Your agents are handling the next steps.') => {
  const el = $('#toast');
  $('strong', el).textContent = title;
  $('small', el).textContent = subtitle;
  el.classList.add('show');
  clearTimeout(window.toastTimer);
  window.toastTimer = setTimeout(() => el.classList.remove('show'), 2800);
};

$$('.agent-card').forEach(card => card.addEventListener('click', () => {
  $$('.agent-card').forEach(c => c.classList.remove('active-agent'));
  card.classList.add('active-agent');
  toast(`${$('h3', card).textContent} selected`, 'Dashboard context updated for this specialist.');
}));

$$('.approve-button:not(.drawer-approve)').forEach(button => button.addEventListener('click', event => {
  const row = event.currentTarget.closest('.task-row');
  event.currentTarget.textContent = 'Approved ✓';
  event.currentTarget.disabled = true;
  row.classList.add('completed');
  toast('Action approved');
}));

const drawer = $('#drawer');
const drawerOverlay = $('#drawerOverlay');
const closeDrawer = () => { drawer.classList.remove('open'); drawerOverlay.classList.remove('open'); drawer.setAttribute('aria-hidden', 'true'); };
$$('.details-button').forEach(button => button.addEventListener('click', event => {
  const task = event.currentTarget.closest('.task-row');
  $('#drawerTitle').textContent = $('h4', task).textContent;
  $('#drawerDescription').textContent = $('p', task).textContent;
  drawer.classList.add('open'); drawerOverlay.classList.add('open'); drawer.setAttribute('aria-hidden', 'false');
}));
$('#drawerClose').addEventListener('click', closeDrawer);
drawerOverlay.addEventListener('click', closeDrawer);
$('.drawer-approve').addEventListener('click', () => { closeDrawer(); toast('Recommendation approved'); });

$$('.tab').forEach(tab => tab.addEventListener('click', () => {
  $$('.tab').forEach(t => t.classList.remove('active')); tab.classList.add('active');
  $$('.task-row').forEach(row => row.style.display = tab.dataset.filter === 'all' || row.dataset.priority === 'urgent' ? 'grid' : 'none');
}));

$('#optimizeToggle').addEventListener('click', event => {
  const enabled = event.currentTarget.classList.toggle('active');
  event.currentTarget.setAttribute('aria-checked', String(enabled));
  $('#forecastValue').textContent = enabled ? '$2,340' : '$2,160';
  toast(enabled ? 'Profit optimization enabled' : 'Profit optimization paused', enabled ? 'Cross-agent recommendations are active.' : 'Forecast now excludes agent optimizations.');
});

$('#scenarioButton').addEventListener('click', event => {
  event.currentTarget.textContent = 'Running scenario…';
  setTimeout(() => { event.currentTarget.innerHTML = 'Scenario ready: +$265 <span>→</span>'; $('#forecastValue').textContent = '$2,425'; toast('Scenario complete', 'Menu mix and vendor changes could add $265.'); }, 900);
});

const modalOverlay = $('#modalOverlay');
const closeModal = () => modalOverlay.classList.remove('open');
$('#newTaskButton').addEventListener('click', () => modalOverlay.classList.add('open'));
$('#modalClose').addEventListener('click', closeModal);
$('#cancelTask').addEventListener('click', closeModal);
modalOverlay.addEventListener('click', event => { if (event.target === modalOverlay) closeModal(); });
$('#taskForm').addEventListener('submit', event => { event.preventDefault(); closeModal(); event.currentTarget.reset(); toast('Task created', 'The assigned agent has started working.'); });

$('.menu-toggle').addEventListener('click', () => $('.sidebar').classList.toggle('open'));
$('#manageAgents').addEventListener('click', () => toast('All four agents are online', 'Agent configuration will connect to your backend.'));
