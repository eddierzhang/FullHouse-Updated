const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const api = async (path, options = {}) => {
  const response = await fetch(path, { ...options, headers: { 'Content-Type': 'application/json', ...options.headers } });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Request failed');
  return result;
};
const money = value => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value);
const toast = (title, subtitle = 'Your agents are handling the next steps.') => {
  const el = $('#toast');
  $('strong', el).textContent = title; $('small', el).textContent = subtitle;
  el.classList.add('show'); clearTimeout(window.toastTimer);
  window.toastTimer = setTimeout(() => el.classList.remove('show'), 2800);
};

const loadDashboard = async () => {
  try {
    const data = await api('/api/dashboard');
    $('#forecastValue').textContent = money(data.restaurant.metrics.projectedProfit);
    const toggle = $('#optimizeToggle');
    toggle.classList.toggle('active', data.restaurant.optimizationEnabled);
    toggle.setAttribute('aria-checked', String(data.restaurant.optimizationEnabled));
    data.recommendations.filter(item => item.status === 'approved').forEach(item => {
      const row = $(`[data-recommendation-id="${item.id}"]`);
      if (!row) return;
      row.classList.add('completed');
      const button = $('.approve-button', row); button.textContent = 'Approved ✓'; button.disabled = true;
    });
  } catch { toast('Running in preview mode', 'Start the backend to save tasks and approvals.'); }
};

$$('.agent-card').forEach(card => card.addEventListener('click', () => {
  $$('.agent-card').forEach(item => item.classList.remove('active-agent'));
  card.classList.add('active-agent');
  toast(`${$('h3', card).textContent} selected`, 'Dashboard context updated for this specialist.');
}));

$$('.approve-button:not(.drawer-approve)').forEach(button => button.addEventListener('click', async event => {
  const row = event.currentTarget.closest('.task-row');
  const original = event.currentTarget.textContent;
  event.currentTarget.textContent = 'Approving…'; event.currentTarget.disabled = true;
  try {
    await api(`/api/recommendations/${row.dataset.recommendationId}/approve`, { method: 'POST' });
    event.currentTarget.textContent = 'Approved ✓'; row.classList.add('completed'); toast('Action approved');
  } catch (error) {
    event.currentTarget.textContent = original; event.currentTarget.disabled = false;
    toast('Could not approve action', error.message);
  }
}));

const drawer = $('#drawer');
const drawerOverlay = $('#drawerOverlay');
let drawerRecommendationId = null;
const closeDrawer = () => { drawer.classList.remove('open'); drawerOverlay.classList.remove('open'); drawer.setAttribute('aria-hidden', 'true'); };
$$('.details-button').forEach(button => button.addEventListener('click', event => {
  const task = event.currentTarget.closest('.task-row'); drawerRecommendationId = task.dataset.recommendationId;
  $('#drawerTitle').textContent = $('h4', task).textContent; $('#drawerDescription').textContent = $('p', task).textContent;
  drawer.classList.add('open'); drawerOverlay.classList.add('open'); drawer.setAttribute('aria-hidden', 'false');
}));
$('#drawerClose').addEventListener('click', closeDrawer);
drawerOverlay.addEventListener('click', closeDrawer);
$('.drawer-approve').addEventListener('click', async () => {
  try {
    await api(`/api/recommendations/${drawerRecommendationId}/approve`, { method: 'POST' });
    const row = $(`[data-recommendation-id="${drawerRecommendationId}"]`); row?.classList.add('completed');
    if (row) { const button = $('.approve-button', row); button.textContent = 'Approved ✓'; button.disabled = true; }
    closeDrawer(); toast('Recommendation approved');
  } catch (error) { toast('Could not approve recommendation', error.message); }
});

$$('.tab').forEach(tab => tab.addEventListener('click', () => {
  $$('.tab').forEach(item => item.classList.remove('active')); tab.classList.add('active');
  $$('.task-row').forEach(row => row.style.display = tab.dataset.filter === 'all' || row.dataset.priority === 'urgent' ? 'grid' : 'none');
}));

$('#optimizeToggle').addEventListener('click', async event => {
  const button = event.currentTarget; const enabled = !button.classList.contains('active');
  try {
    const restaurant = await api('/api/settings/optimization', { method: 'PATCH', body: JSON.stringify({ enabled }) });
    button.classList.toggle('active', enabled); button.setAttribute('aria-checked', String(enabled));
    $('#forecastValue').textContent = money(restaurant.metrics.projectedProfit);
    toast(enabled ? 'Profit optimization enabled' : 'Profit optimization paused');
  } catch (error) { toast('Could not update optimization', error.message); }
});

$('#scenarioButton').addEventListener('click', async event => {
  const button = event.currentTarget; button.textContent = 'Running scenario…'; button.disabled = true;
  try {
    const scenario = await api('/api/profit/scenario', { method: 'POST' });
    button.innerHTML = `Scenario ready: +${money(scenario.uplift)} <span>→</span>`;
    $('#forecastValue').textContent = money(scenario.projectedProfit);
    toast('Scenario complete', `Recommended changes could add ${money(scenario.uplift)}.`);
  } catch (error) { button.innerHTML = 'Run profit scenario <span>→</span>'; toast('Scenario failed', error.message); }
  finally { button.disabled = false; }
});

const modalOverlay = $('#modalOverlay');
const closeModal = () => modalOverlay.classList.remove('open');
$('#newTaskButton').addEventListener('click', () => modalOverlay.classList.add('open'));
$('#modalClose').addEventListener('click', closeModal); $('#cancelTask').addEventListener('click', closeModal);
modalOverlay.addEventListener('click', event => { if (event.target === modalOverlay) closeModal(); });
$('#taskForm').addEventListener('submit', async event => {
  event.preventDefault(); const form = event.currentTarget; const submit = $('button[type="submit"]', form);
  submit.disabled = true; submit.textContent = 'Creating…';
  try {
    await api('/api/tasks', { method: 'POST', body: JSON.stringify(Object.fromEntries(new FormData(form))) });
    closeModal(); form.reset(); toast('Task created', 'The assigned agent has started working.');
  } catch (error) { toast('Could not create task', error.message); }
  finally { submit.disabled = false; submit.textContent = 'Create task'; }
});

$('.menu-toggle').addEventListener('click', () => $('.sidebar').classList.toggle('open'));
$('#manageAgents').addEventListener('click', async () => {
  try { const agents = await api('/api/agents'); toast(`${agents.filter(agent => agent.status === 'online').length} agents online`, 'All restaurant specialists are connected.'); }
  catch (error) { toast('Agent status unavailable', error.message); }
});

loadDashboard();
