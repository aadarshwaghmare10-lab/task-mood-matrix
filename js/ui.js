/**
 * ui.js - DOM Manipulations, Rendering & Event Handlers
 * Task & Mood Matrix Application
 */

import { store } from './store.js';

// Emoji map for mood badges
const MOOD_EMOJIS = {
  focused: '🎯 Focused',
  productive: '🚀 Productive',
  calm: '🌊 Calm',
  energized: '⚡ Energized',
  stressed: '🌩️ Stressed'
};

export class UI {
  constructor() {
    this.searchQuery = '';
    this.editingTaskId = null;
    this.activeDetailTask = null;

    // Cache DOM Elements
    this.body = document.body;
    this.statCompleted = document.getElementById('stat-completed');
    this.statScore = document.getElementById('stat-score');
    this.statMood = document.getElementById('stat-mood');
    this.searchInput = document.getElementById('search-input');
    this.moodButtons = document.querySelectorAll('.mood-btn');

    this.lists = {
      q1: document.getElementById('list-q1'),
      q2: document.getElementById('list-q2'),
      q3: document.getElementById('list-q3'),
      q4: document.getElementById('list-q4')
    };

    // Modal elements for edit/create
    this.modal = document.getElementById('task-modal');
    this.modalTitle = document.getElementById('modal-title');
    this.taskForm = document.getElementById('task-form');
    this.taskIdInput = document.getElementById('task-id');
    this.taskTitleInput = document.getElementById('task-title-input');
    this.taskDescInput = document.getElementById('task-desc-input');
    this.taskQuadrantInput = document.getElementById('task-quadrant-input');
    this.taskMoodInput = document.getElementById('task-mood-input');

    this.btnOpenModal = document.getElementById('btn-open-modal');
    this.btnCloseModal = document.getElementById('btn-close-modal');
    this.btnCancelModal = document.getElementById('btn-cancel-modal');
    this.btnClearCompleted = document.getElementById('btn-clear-completed');

    // Detail Modal elements
    this.detailModal = document.getElementById('task-detail-modal');
    this.detailQuadrant = document.getElementById('detail-quadrant');
    this.detailMood = document.getElementById('detail-mood');
    this.detailStatus = document.getElementById('detail-status');
    this.detailTitle = document.getElementById('detail-title');
    this.detailDesc = document.getElementById('detail-desc');
    this.detailDate = document.getElementById('detail-date');
    this.btnCloseDetail = document.getElementById('btn-close-detail');
    this.btnEditDetail = document.getElementById('btn-edit-detail');
    this.btnDoneDetail = document.getElementById('btn-done-detail');
  }

  init() {
    this.setMoodTheme(store.currentMood);
    this.bindEvents();
    this.render();
  }

  bindEvents() {
    // Mood Selection Buttons
    this.moodButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const mood = btn.getAttribute('data-mood');
        store.setMood(mood);
        this.setMoodTheme(mood);
        this.updateStats();
      });
    });

    // Search input
    this.searchInput.addEventListener('input', (e) => {
      this.searchQuery = e.target.value.toLowerCase().trim();
      this.render();
    });

    // Modal Triggers
    this.btnOpenModal.addEventListener('click', () => this.openModal());
    this.btnCloseModal.addEventListener('click', () => this.closeModal());
    this.btnCancelModal.addEventListener('click', () => this.closeModal());

    // Detail Modal Triggers
    if (this.btnCloseDetail) {
      this.btnCloseDetail.addEventListener('click', () => this.closeDetailModal());
    }
    if (this.btnDoneDetail) {
      this.btnDoneDetail.addEventListener('click', () => this.closeDetailModal());
    }
    if (this.btnEditDetail) {
      this.btnEditDetail.addEventListener('click', () => {
        const taskToEdit = this.activeDetailTask;
        this.closeDetailModal();
        if (taskToEdit) {
          this.openModal(taskToEdit);
        }
      });
    }

    // Task Form Submit
    this.taskForm.addEventListener('submit', (e) => {
      e.preventDefault();
      this.handleFormSubmit();
    });

    // Clear Completed Tasks
    this.btnClearCompleted.addEventListener('click', () => {
      store.clearCompleted();
      this.render();
    });

    // Backdrop click listener to close modals when clicking overlay background
    document.addEventListener('click', (e) => {
      if (e.target === this.modal) {
        this.closeModal();
      }
      if (e.target === this.detailModal) {
        this.closeDetailModal();
      }
    });

    // Global Keyboard Listeners (Escape to close, Enter/Space on focused elements)
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.closeModal();
        this.closeDetailModal();
      }

      if ((e.key === 'Enter' || e.key === ' ') && document.activeElement) {
        const focusedCheckbox = document.activeElement.closest('.task-checkbox');
        if (focusedCheckbox) {
          e.preventDefault();
          const id = focusedCheckbox.getAttribute('data-id');
          this.handleTaskToggle(id);
          return;
        }

        const focusedCard = document.activeElement.closest('.task-card');
        if (focusedCard && !e.target.closest('.task-action-btn') && !e.target.closest('.task-checkbox')) {
          e.preventDefault();
          const task = store.getTaskById(focusedCard.id);
          if (task) {
            this.openDetailModal(task);
          }
        }
      }
    });

    // Global click listener for task card actions (delegation)
    document.addEventListener('click', (e) => {
      const checkbox = e.target.closest('.task-checkbox');
      if (checkbox) {
        const id = checkbox.getAttribute('data-id');
        this.handleTaskToggle(id);
        return;
      }

      const deleteBtn = e.target.closest('.task-action-btn.delete');
      if (deleteBtn) {
        const id = deleteBtn.getAttribute('data-id');
        store.deleteTask(id);
        this.render();
        return;
      }

      const editBtn = e.target.closest('.task-action-btn.edit');
      if (editBtn) {
        const id = editBtn.getAttribute('data-id');
        const task = store.getTaskById(id);
        if (task) {
          this.openModal(task);
        }
        return;
      }

      const taskCard = e.target.closest('.task-card');
      if (taskCard) {
        const task = store.getTaskById(taskCard.id);
        if (task) {
          this.openDetailModal(task);
        }
      }
    });
  }

  handleTaskToggle(id) {
    const task = store.toggleTaskComplete(id);
    if (!task) return;

    const cardEl = document.getElementById(id);
    if (cardEl) {
      cardEl.classList.toggle('completed', task.completed);
      const cb = cardEl.querySelector('.task-checkbox');
      if (cb) {
        cb.setAttribute('aria-checked', String(task.completed));
      }
      this.updateStats();
    } else {
      this.render();
    }
  }

  setMoodTheme(mood) {
    this.body.setAttribute('data-mood', mood);
    
    // Update active state on mood selector buttons
    this.moodButtons.forEach(btn => {
      if (btn.getAttribute('data-mood') === mood) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });

    if (this.statMood) {
      this.statMood.textContent = MOOD_EMOJIS[mood] || mood;
    }
  }

  updateStats() {
    const { total, completed, score } = store.getStats();
    this.statCompleted.textContent = `${completed} / ${total}`;
    this.statScore.textContent = `${score}%`;
  }

  render(newTaskId = null) {
    this.updateStats();

    const tasks = store.getTasks();
    const quadrants = { q1: [], q2: [], q3: [], q4: [] };

    // Filter and group by quadrant
    tasks.forEach(task => {
      if (this.searchQuery) {
        const titleMatch = task.title.toLowerCase().includes(this.searchQuery);
        const descMatch = task.description && task.description.toLowerCase().includes(this.searchQuery);
        if (!titleMatch && !descMatch) return;
      }

      if (quadrants[task.quadrant]) {
        quadrants[task.quadrant].push(task);
      }
    });

    // Render each quadrant list
    Object.keys(quadrants).forEach(quadKey => {
      const listEl = this.lists[quadKey];
      const quadTasks = quadrants[quadKey];

      if (quadTasks.length === 0) {
        listEl.innerHTML = `
          <div class="empty-state">
            <span>No tasks found in this section.</span>
          </div>
        `;
      } else {
        listEl.innerHTML = quadTasks.map(task => this.createTaskCardHTML(task, task.id === newTaskId)).join('');
      }
    });
  }

  createTaskCardHTML(task, isNew = false) {
    const moodTag = MOOD_EMOJIS[task.mood] || task.mood;
    const cardClasses = `task-card ${task.completed ? 'completed' : ''} ${isNew ? 'newly-created' : ''}`.trim();

    return `
      <div class="${cardClasses}" id="${task.id}" tabindex="0" role="button" aria-label="View details for ${this.escapeHTML(task.title)}">
        <div class="task-header-row">
          <div class="task-checkbox" data-id="${task.id}" title="Toggle complete" tabindex="0" role="checkbox" aria-checked="${task.completed}"></div>
          <div class="task-content">
            <div class="task-title">${this.escapeHTML(task.title)}</div>
            ${task.description ? `<div class="task-desc">${this.escapeHTML(task.description)}</div>` : ''}
          </div>
        </div>
        <div class="task-footer-row">
          <span class="task-energy-badge">${moodTag}</span>
          <div class="task-actions">
            <button class="task-action-btn edit" data-id="${task.id}" title="Edit Task" aria-label="Edit task">✏️</button>
            <button class="task-action-btn delete" data-id="${task.id}" title="Delete Task" aria-label="Delete task">🗑️</button>
          </div>
        </div>
      </div>
    `;
  }

  openDetailModal(task) {
    if (!task) return;
    this.activeDetailTask = task;

    const quadrantLabels = {
      q1: 'Q1 • Do First',
      q2: 'Q2 • Schedule',
      q3: 'Q3 • Delegate',
      q4: 'Q4 • Eliminate'
    };

    if (this.detailQuadrant) {
      this.detailQuadrant.textContent = quadrantLabels[task.quadrant] || task.quadrant.toUpperCase();
    }

    if (this.detailMood) {
      this.detailMood.textContent = MOOD_EMOJIS[task.mood] || task.mood;
    }

    if (this.detailStatus) {
      this.detailStatus.textContent = task.completed ? '✓ Completed' : '⚡ In Progress';
      this.detailStatus.className = `status-badge ${task.completed ? 'completed' : ''}`;
    }

    if (this.detailTitle) {
      this.detailTitle.textContent = task.title;
    }

    if (this.detailDesc) {
      if (task.description) {
        this.detailDesc.textContent = task.description;
        this.detailDesc.style.display = 'block';
      } else {
        this.detailDesc.style.display = 'none';
      }
    }

    if (this.detailDate) {
      const createdDate = task.createdAt ? new Date(task.createdAt).toLocaleString(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short'
      }) : 'Not available';
      this.detailDate.textContent = createdDate;
    }

    if (this.detailModal) {
      this.detailModal.setAttribute('aria-hidden', 'false');
    }
    if (this.btnDoneDetail) {
      setTimeout(() => this.btnDoneDetail.focus(), 100);
    }
  }

  closeDetailModal() {
    if (this.detailModal) {
      this.detailModal.setAttribute('aria-hidden', 'true');
    }
    this.activeDetailTask = null;
  }

  openModal(taskToEdit = null) {
    if (taskToEdit) {
      this.editingTaskId = taskToEdit.id;
      this.modalTitle.textContent = 'Edit Task';
      this.taskIdInput.value = taskToEdit.id;
      this.taskTitleInput.value = taskToEdit.title;
      this.taskDescInput.value = taskToEdit.description || '';
      this.taskQuadrantInput.value = taskToEdit.quadrant;
      this.taskMoodInput.value = taskToEdit.mood || 'focused';
    } else {
      this.editingTaskId = null;
      this.modalTitle.textContent = 'Create New Task';
      this.taskForm.reset();
      this.taskIdInput.value = '';
    }

    this.modal.setAttribute('aria-hidden', 'false');
    setTimeout(() => this.taskTitleInput.focus(), 100);
  }

  closeModal() {
    this.modal.setAttribute('aria-hidden', 'true');
    this.taskForm.reset();
    this.editingTaskId = null;
  }

  handleFormSubmit() {
    const title = this.taskTitleInput.value.trim();
    const description = this.taskDescInput.value.trim();
    const quadrant = this.taskQuadrantInput.value;
    const mood = this.taskMoodInput.value;

    if (!title) return;

    let newTaskId = null;

    if (this.editingTaskId) {
      store.updateTask(this.editingTaskId, { title, description, quadrant, mood });
    } else {
      const newTask = store.addTask({ title, description, quadrant, mood });
      newTaskId = newTask ? newTask.id : null;
    }

    this.closeModal();
    this.render(newTaskId);
  }

  escapeHTML(str) {
    return str.replace(/[&<>'"]/g, 
      tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
    );
  }
}
