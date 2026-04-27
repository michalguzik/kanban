let state = { projects: [], tasks: [] };
let currentProject = "all";
let currentFilter = "all";
let editingTaskId = null;
let selectedColor = "#ff6b6b";
let dragTaskId = null;

// ── Safe fetch: checks Content-Type before parsing JSON ──
async function safeFetch(url, options = {}) {
  let res;
  try {
    res = await fetch(url, options);
  } catch (networkErr) {
    showToast("Brak połączenia z serwerem", "error");
    throw networkErr;
  }
  const ct = res.headers.get("content-type") || "";
  if (!ct.includes("application/json")) {
    const text = await res.text();
    const msg = `Serwer zwrócił nieoczekiwaną odpowiedź (HTTP ${res.status})`;
    showToast(msg, "error");
    console.error(msg, text);
    throw new Error(msg);
  }
  const data = await res.json();
  if (!res.ok) {
    const msg = data.error || `HTTP ${res.status}`;
    showToast("Błąd: " + msg, "error");
    throw new Error(msg);
  }
  return data;
}

function showToast(msg, type = "info") {
  const existing = document.getElementById("toast");
  if (existing) existing.remove();
  const el = document.createElement("div");
  el.id = "toast";
  el.textContent = msg;
  el.style.cssText = `
    position:fixed;bottom:24px;right:24px;z-index:9999;
    padding:12px 20px;border-radius:10px;font-size:13px;
    font-family:'DM Mono',monospace;max-width:320px;
    background:${type === "error" ? "#ff5a8a22" : "#e8ff5a22"};
    color:${type === "error" ? "#ff7aaa" : "#e8ff5a"};
    border:1px solid ${type === "error" ? "#ff5a8a55" : "#e8ff5a55"};
  `;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 4000);
}

async function fetchData() {
  try {
    state = await safeFetch("/api/data");
    render();
  } catch (_) { /* toast already shown */ }
}

function getProjectColor(projectId) {
  const p = state.projects.find(p => p.id === projectId);
  return p ? p.color : "#888";
}

function getProjectName(projectId) {
  const p = state.projects.find(p => p.id === projectId);
  return p ? p.name : "Unknown";
}

function filteredTasks() {
  return state.tasks.filter(t => {
    const projectMatch = currentProject === "all" || t.project_id === currentProject;
    const priorityMatch = currentFilter === "all" || t.priority === currentFilter;
    return projectMatch && priorityMatch;
  });
}

function formatDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function render() {
  renderSidebar();
  renderBoard();
  renderStats();
}

function renderSidebar() {
  const list = document.getElementById("project-list");
  const allItem = `
    <div class="project-item-all ${currentProject === "all" ? "active" : ""}" onclick="selectProject('all')">
      <span style="font-size:14px">◈</span>
      <span>All Projects</span>
    </div>`;
  const items = state.projects.map(p => `
    <div class="project-item ${currentProject === p.id ? "active" : ""}" onclick="selectProject('${p.id}')">
      <div class="project-dot" style="background:${p.color}"></div>
      <span class="project-name">${p.name}</span>
      <button class="project-delete" onclick="deleteProject(event,'${p.id}')">✕</button>
    </div>`).join("");
  list.innerHTML = allItem + items;

  document.getElementById("current-project-name").textContent =
    currentProject === "all" ? "All Projects" : getProjectName(currentProject);
}

function renderBoard() {
  const tasks = filteredTasks();
  const statuses = ["todo", "in_progress", "done"];

  statuses.forEach(status => {
    const col = tasks.filter(t => t.status === status);
    const list = document.getElementById("list-" + status);
    document.getElementById("count-" + status).textContent = col.length;

    if (col.length === 0) {
      list.innerHTML = `<div class="empty-col">
        <span class="empty-col-icon">${status === 'todo' ? '📋' : status === 'in_progress' ? '⚡' : '✅'}</span>
        No tasks here
      </div>`;
    } else {
      list.innerHTML = col.map(task => taskCard(task)).join("");
    }
  });

  const total = tasks.length;
  document.getElementById("task-count").textContent = total ? `${total} task${total !== 1 ? "s" : ""}` : "";

  setupDragAndDrop();
}

function taskCard(task) {
  const color = getProjectColor(task.project_id);
  const pName = getProjectName(task.project_id);
  const showProject = currentProject === "all";
  return `
    <div class="task-card" draggable="true" data-id="${task.id}" id="card-${task.id}">
      <div class="task-card-top">
        ${showProject ? `<span class="task-project-tag" style="background:${color}22;color:${color}">${pName}</span>` : '<span></span>'}
        <div class="task-actions">
          <button class="task-action-btn" onclick="openEditTask('${task.id}')">✎</button>
          <button class="task-action-btn del" onclick="deleteTask('${task.id}')">✕</button>
        </div>
      </div>
      <div class="task-title">${task.title}</div>
      ${task.description ? `<div class="task-desc">${task.description}</div>` : ""}
      <div class="task-footer">
        <span class="priority-badge priority-${task.priority}">${task.priority}</span>
        <span class="task-date">${formatDate(task.created)}</span>
      </div>
    </div>`;
}

function renderStats() {
  const stats = document.getElementById("stats");
  const total = state.tasks.length;
  const done = state.tasks.filter(t => t.status === "done").length;
  const inprog = state.tasks.filter(t => t.status === "in_progress").length;
  stats.innerHTML = `
    <div class="stat-row"><span>Total tasks</span><span class="stat-val">${total}</span></div>
    <div class="stat-row"><span>In progress</span><span class="stat-val">${inprog}</span></div>
    <div class="stat-row"><span>Completed</span><span class="stat-val">${done}</span></div>
    <div class="stat-row"><span>Projects</span><span class="stat-val">${state.projects.length}</span></div>
  `;
}

function selectProject(id) {
  currentProject = id;
  render();
}

// ── DRAG & DROP ──
function setupDragAndDrop() {
  document.querySelectorAll(".task-card").forEach(card => {
    card.addEventListener("dragstart", e => {
      dragTaskId = card.dataset.id;
      card.classList.add("dragging");
      e.dataTransfer.effectAllowed = "move";
    });
    card.addEventListener("dragend", () => {
      card.classList.remove("dragging");
      dragTaskId = null;
    });
  });

  document.querySelectorAll(".task-list").forEach(list => {
    list.addEventListener("dragover", e => {
      e.preventDefault();
      list.classList.add("drag-over");
    });
    list.addEventListener("dragleave", () => list.classList.remove("drag-over"));
    list.addEventListener("drop", async e => {
      e.preventDefault();
      list.classList.remove("drag-over");
      if (!dragTaskId) return;
      const newStatus = list.dataset.status;
      const currentStatus = state.tasks.find(t => t.id === dragTaskId)?.status;
      if (currentStatus === newStatus) return;
      try {
        await safeFetch(`/api/tasks/${dragTaskId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: newStatus })
        });
        await fetchData();
      } catch (_) { /* toast already shown */ }
    });
  });
}

// ── TASK MODAL ──
function openNewTask() {
  editingTaskId = null;
  document.getElementById("modal-title").textContent = "New Task";
  document.getElementById("task-title").value = "";
  document.getElementById("task-desc").value = "";
  document.getElementById("task-priority").value = "medium";
  document.getElementById("task-status").value = "todo";
  populateProjectSelect();
  document.getElementById("modal-overlay").classList.add("open");
  document.getElementById("task-title").focus();
}

function openEditTask(id) {
  const task = state.tasks.find(t => t.id === id);
  if (!task) return;
  editingTaskId = id;
  document.getElementById("modal-title").textContent = "Edit Task";
  document.getElementById("task-title").value = task.title;
  document.getElementById("task-desc").value = task.description;
  document.getElementById("task-priority").value = task.priority;
  document.getElementById("task-status").value = task.status;
  populateProjectSelect(task.project_id);
  document.getElementById("modal-overlay").classList.add("open");
}

function populateProjectSelect(selected) {
  const sel = document.getElementById("task-project");
  sel.innerHTML = state.projects.map(p =>
    `<option value="${p.id}" ${p.id === (selected || currentProject) ? "selected" : ""}>${p.name}</option>`
  ).join("");
}

function closeModal() {
  document.getElementById("modal-overlay").classList.remove("open");
  editingTaskId = null;
}

async function saveTask() {
  const title = document.getElementById("task-title").value.trim();
  if (!title) { document.getElementById("task-title").focus(); return; }

  const body = {
    title,
    description: document.getElementById("task-desc").value.trim(),
    project_id: document.getElementById("task-project").value,
    priority: document.getElementById("task-priority").value,
    status: document.getElementById("task-status").value
  };

  try {
    if (editingTaskId) {
      await safeFetch(`/api/tasks/${editingTaskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
    } else {
      const task = await safeFetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      state.tasks.push(task);
    }
    closeModal();
    await fetchData();
  } catch (_) { /* toast already shown */ }
}

async function deleteTask(id) {
  try {
    await safeFetch(`/api/tasks/${id}`, { method: "DELETE" });
    state.tasks = state.tasks.filter(t => t.id !== id);
    renderBoard();
    renderStats();
  } catch (_) { /* toast already shown */ }
}

// ── PROJECT MODAL ──
function openProjectModal() {
  document.getElementById("project-name").value = "";
  selectedColor = "#ff6b6b";
  document.querySelectorAll(".color-swatch").forEach(s => {
    s.classList.toggle("active", s.dataset.color === selectedColor);
  });
  document.getElementById("project-modal-overlay").classList.add("open");
  document.getElementById("project-name").focus();
}

function closeProjectModal() {
  document.getElementById("project-modal-overlay").classList.remove("open");
}

async function saveProject() {
  const name = document.getElementById("project-name").value.trim();
  if (!name) return;
  try {
    const project = await safeFetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, color: selectedColor })
    });
    state.projects.push(project);
    closeProjectModal();
    render();
  } catch (_) { /* toast already shown */ }
}

async function deleteProject(e, id) {
  e.stopPropagation();
  if (!confirm("Delete this project and all its tasks?")) return;
  try {
    await safeFetch(`/api/projects/${id}`, { method: "DELETE" });
    state.projects = state.projects.filter(p => p.id !== id);
    state.tasks = state.tasks.filter(t => t.project_id !== id);
    if (currentProject === id) currentProject = "all";
    render();
  } catch (_) { /* toast already shown */ }
}

// ── EVENTS ──
document.getElementById("new-task-btn").addEventListener("click", openNewTask);
document.getElementById("modal-close").addEventListener("click", closeModal);
document.getElementById("modal-cancel").addEventListener("click", closeModal);
document.getElementById("modal-save").addEventListener("click", saveTask);
document.getElementById("modal-overlay").addEventListener("click", e => { if (e.target === e.currentTarget) closeModal(); });

document.getElementById("add-project-btn").addEventListener("click", openProjectModal);
document.getElementById("project-modal-close").addEventListener("click", closeProjectModal);
document.getElementById("project-modal-cancel").addEventListener("click", closeProjectModal);
document.getElementById("project-modal-save").addEventListener("click", saveProject);
document.getElementById("project-modal-overlay").addEventListener("click", e => { if (e.target === e.currentTarget) closeProjectModal(); });

document.getElementById("color-picker").addEventListener("click", e => {
  const swatch = e.target.closest(".color-swatch");
  if (!swatch) return;
  selectedColor = swatch.dataset.color;
  document.querySelectorAll(".color-swatch").forEach(s => s.classList.toggle("active", s === swatch));
});

document.querySelectorAll(".filter-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    currentFilter = btn.dataset.priority;
    document.querySelectorAll(".filter-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    renderBoard();
  });
});

document.addEventListener("keydown", e => {
  if (e.key === "Escape") { closeModal(); closeProjectModal(); }
});

fetchData();