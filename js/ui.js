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
    this.draggedTaskId = null;

    // Cache DOM Elements
    this.body = document.body;
    this.statCompleted = document.getElementById('stat-completed');
    this.statScore = document.getElementById('stat-score');
    this.statMood = document.getElementById('stat-mood');
    this.searchInput = document.getElementById('search-input');
    this.moodButtons = document.querySelectorAll('.mood-btn');
    this.toastContainer = document.getElementById('toast-container');

    this.lists = {
      q1: document.getElementById('list-q1'),
      q2: document.getElementById('list-q2'),
      q3: document.getElementById('list-q3'),
      q4: document.getElementById('list-q4')
    };

    this.counts = {
      q1: document.getElementById('count-q1'),
      q2: document.getElementById('count-q2'),
      q3: document.getElementById('count-q3'),
      q4: document.getElementById('count-q4')
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
    this.setMoodTheme(store.currentMood, false);
    this.bindEvents();
    this.initDragAndDrop();
    this.render();
  }

  /* Toast Notification System */
  showToast(message, type = 'info', actionLabel = null, actionFn = null) {
    if (!this.toastContainer) return;

    const iconMap = {
      success: '✅',
      warning: '⚠️',
      info: '✨'
    };

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;

    const messageDiv = document.createElement('div');
    messageDiv.className = 'toast-message';
    messageDiv.innerHTML = `<span>${iconMap[type] || '✨'}</span> <span>${this.escapeHTML(message)}</span>`;
    toast.appendChild(messageDiv);

    if (actionLabel && typeof actionFn === 'function') {
      const actionBtn = document.createElement('button');
      actionBtn.className = 'toast-action-btn';
      actionBtn.textContent = actionLabel;
      actionBtn.addEventListener('click', () => {
        actionFn();
        this.dismissToast(toast);
      });
      toast.appendChild(actionBtn);
    }

    this.toastContainer.appendChild(toast);

    setTimeout(() => {
      this.dismissToast(toast);
    }, 3600);
  }

  dismissToast(toast) {
    if (!toast || !toast.parentNode) return;
    toast.classList.add('toast-hiding');
    setTimeout(() => {
      if (toast.parentNode) {
        toast.parentNode.removeChild(toast);
      }
    }, 300);
  }

  /* Drag & Drop Task Moving Across Quadrants */
  initDragAndDrop() {
    // Event delegation on task lists for dragstart / dragend
    Object.values(this.lists).forEach(listEl => {
      if (!listEl) return;

      listEl.addEventListener('dragstart', (e) => {
        const card = e.target.closest('.task-card');
        if (card) {
          this.draggedTaskId = card.id;
          card.classList.add('dragging');
          e.dataTransfer.effectAllowed = 'move';
          e.dataTransfer.setData('text/plain', card.id);
        }
      });

      listEl.addEventListener('dragend', (e) => {
        const card = e.target.closest('.task-card');
        if (card) {
          card.classList.remove('dragging');
        }
        this.draggedTaskId = null;
        document.querySelectorAll('.quadrant').forEach(el => el.classList.remove('drag-over'));
      });
    });

    // Drop target handlers on each quadrant card container
    document.querySelectorAll('.quadrant').forEach(quadrantEl => {
      quadrantEl.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        quadrantEl.classList.add('drag-over');
      });

      quadrantEl.addEventListener('dragleave', (e) => {
        if (!quadrantEl.contains(e.relatedTarget)) {
          quadrantEl.classList.remove('drag-over');
        }
      });

      quadrantEl.addEventListener('drop', (e) => {
        e.preventDefault();
        quadrantEl.classList.remove('drag-over');

        const listEl = quadrantEl.querySelector('.task-list');
        const targetQuadrant = listEl ? listEl.getAttribute('data-quadrant') : null;
        const taskId = e.dataTransfer.getData('text/plain') || this.draggedTaskId;

        if (taskId && targetQuadrant) {
          const updatedTask = store.updateTaskQuadrant(taskId, targetQuadrant);
          if (updatedTask) {
            this.render();
            const quadNames = {
              q1: 'Q1 • Do First',
              q2: 'Q2 • Schedule',
              q3: 'Q3 • Delegate',
              q4: 'Q4 • Eliminate'
            };
            this.showToast(`Task moved to ${quadNames[targetQuadrant]}`, 'success');
          }
        }
      });
    });
  }

  bindEvents() {
    // Mood Selection Buttons
    this.moodButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const mood = btn.getAttribute('data-mood');
        store.setMood(mood);
        this.setMoodTheme(mood, true);
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
      const clearedTasks = store.clearCompleted();
      this.render();
      if (clearedTasks && clearedTasks.length > 0) {
        this.showToast(`Cleared ${clearedTasks.length} completed task(s)`, 'warning', 'Undo', () => {
          clearedTasks.forEach(t => store.restoreTask(t));
          this.render();
          this.showToast('Restored completed tasks!', 'success');
        });
      } else {
        this.showToast('No completed tasks to clear.', 'info');
      }
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
          e.stopPropagation();
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

    // Global click listener for task card actions (delegation with stopPropagation)
    document.addEventListener('click', (e) => {
      const checkbox = e.target.closest('.task-checkbox');
      if (checkbox) {
        e.stopPropagation();
        const id = checkbox.getAttribute('data-id');
        this.handleTaskToggle(id);
        return;
      }

      const deleteBtn = e.target.closest('.task-action-btn.delete');
      if (deleteBtn) {
        e.stopPropagation();
        const id = deleteBtn.getAttribute('data-id');
        const deletedTask = store.deleteTask(id);
        this.render();
        if (deletedTask) {
          this.showToast(`Deleted "${deletedTask.title}"`, 'warning', 'Undo', () => {
            store.restoreTask(deletedTask);
            this.render();
            this.showToast('Task restored!', 'success');
          });
        }
        return;
      }

      const editBtn = e.target.closest('.task-action-btn.edit');
      if (editBtn) {
        e.stopPropagation();
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

    if (task.completed) {
      this.showToast('Task marked complete! 🎉', 'success');
    } else {
      this.showToast('Task marked in progress ⚡', 'info');
    }
  }

  setMoodTheme(mood, notify = false) {
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

    if (notify) {
      this.showToast(`Workspace state: ${MOOD_EMOJIS[mood]}`, 'info');
    }
  }

  updateStats() {
    const { total, completed, score } = store.getStats();
    this.statCompleted.textContent = `${completed} / ${total}`;
    this.statScore.textContent = `${score}%`;
  }

  getRelativeTime(timestamp) {
    if (!timestamp) return '';
    const now = Date.now();
    const diffMs = now - timestamp;
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHour = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHour / 24);

    if (diffSec < 60) return 'Just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    if (diffHour < 24) return `${diffHour}h ago`;
    if (diffDay === 1) return 'Yesterday';
    if (diffDay < 7) return `${diffDay}d ago`;
    return new Date(timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
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

    // Render each quadrant list and update task counters
    Object.keys(quadrants).forEach(quadKey => {
      const listEl = this.lists[quadKey];
      const countEl = this.counts[quadKey];
      const quadTasks = quadrants[quadKey];

      if (countEl) {
        countEl.textContent = String(quadTasks.length);
      }

      if (quadTasks.length === 0) {
        const emptyMsg = this.searchQuery
          ? `No tasks matching "${this.escapeHTML(this.searchQuery)}"`
          : `No tasks in this section.`;
        listEl.innerHTML = `
          <div class="empty-state">
            <span>${emptyMsg}</span>
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
    const timeAgo = this.getRelativeTime(task.createdAt);

    return `
      <div class="${cardClasses}" id="${task.id}" tabindex="0" role="button" draggable="true" aria-label="View details for ${this.escapeHTML(task.title)}">
        <div class="task-header-row">
          <div class="task-checkbox" data-id="${task.id}" title="Toggle complete" tabindex="0" role="checkbox" aria-checked="${task.completed}"></div>
          <div class="task-content">
            <div class="task-title">${this.escapeHTML(task.title)}</div>
            ${task.description ? `<div class="task-desc">${this.escapeHTML(task.description)}</div>` : ''}
          </div>
        </div>
        <div class="task-footer-row">
          <div class="task-meta-right">
            <span class="task-energy-badge">${moodTag}</span>
            ${timeAgo ? `<span class="task-time">🕒 ${timeAgo}</span>` : ''}
          </div>
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
      this.showToast('Task updated successfully! ✨', 'info');
    } else {
      const newTask = store.addTask({ title, description, quadrant, mood });
      newTaskId = newTask ? newTask.id : null;
      this.showToast('New task created! 🎉', 'success');
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
