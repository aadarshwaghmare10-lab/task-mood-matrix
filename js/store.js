/**
 * store.js - State Management & LocalStorage Persistence
 * Task & Mood Matrix Application
 */

const STORAGE_KEY = 'antigravity_task_mood_matrix_v1';
const MOOD_KEY = 'antigravity_current_mood_v1';

// Initial Sample Data for first load
const INITIAL_TASKS = [
  {
    id: 'task-1',
    title: 'Submit Q3 Project Architecture Proposal',
    description: 'Finalize core design doc and present technical roadmap to team.',
    quadrant: 'q1',
    mood: 'focused',
    completed: false,
    createdAt: Date.now() - 3600000 * 5
  },
  {
    id: 'task-2',
    title: 'Learn Antigravity CLI & Pair Programming',
    description: 'Explore file operations, terminal commands, and automated verification.',
    quadrant: 'q2',
    mood: 'productive',
    completed: true,
    createdAt: Date.now() - 3600000 * 24
  },
  {
    id: 'task-3',
    title: 'Refactor UI Components Design System',
    description: 'Implement dark glassmorphism styling and ambient color themes.',
    quadrant: 'q2',
    mood: 'focused',
    completed: false,
    createdAt: Date.now() - 3600000 * 12
  },
  {
    id: 'task-4',
    title: 'Filter routine project notifications',
    description: 'Clear inbox status updates and delegate secondary tickets.',
    quadrant: 'q3',
    mood: 'calm',
    completed: false,
    createdAt: Date.now() - 3600000 * 2
  },
  {
    id: 'task-5',
    title: 'Clean up local test scratch files',
    description: 'Archive old logs and temporary test scripts.',
    quadrant: 'q4',
    mood: 'energized',
    completed: false,
    createdAt: Date.now() - 3600000 * 1
  }
];

class Store {
  constructor() {
    this.tasks = this.loadTasks();
    this.currentMood = this.loadMood();
  }

  loadTasks() {
    try {
      const data = localStorage.getItem(STORAGE_KEY);
      return data ? JSON.parse(data) : INITIAL_TASKS;
    } catch (e) {
      console.warn('Failed to load from LocalStorage, using defaults:', e);
      return INITIAL_TASKS;
    }
  }

  saveTasks() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.tasks));
    } catch (e) {
      console.error('Failed to save to LocalStorage:', e);
    }
  }

  loadMood() {
    return localStorage.getItem(MOOD_KEY) || 'focused';
  }

  setMood(mood) {
    this.currentMood = mood;
    try {
      localStorage.setItem(MOOD_KEY, mood);
    } catch (e) {
      console.error('Failed to save mood:', e);
    }
  }

  getTasks() {
    return this.tasks;
  }

  getTaskById(id) {
    return this.tasks.find(t => t.id === id);
  }

  addTask(taskData) {
    const newTask = {
      id: 'task-' + Date.now() + '-' + Math.random().toString(36).substr(2, 4),
      title: taskData.title.trim(),
      description: taskData.description ? taskData.description.trim() : '',
      quadrant: taskData.quadrant,
      mood: taskData.mood || 'focused',
      completed: false,
      createdAt: Date.now()
    };
    this.tasks.unshift(newTask);
    this.saveTasks();
    return newTask;
  }

  updateTask(id, updatedData) {
    const taskIndex = this.tasks.findIndex(t => t.id === id);
    if (taskIndex !== -1) {
      this.tasks[taskIndex] = {
        ...this.tasks[taskIndex],
        title: updatedData.title.trim(),
        description: updatedData.description ? updatedData.description.trim() : '',
        quadrant: updatedData.quadrant,
        mood: updatedData.mood || this.tasks[taskIndex].mood
      };
      this.saveTasks();
      return this.tasks[taskIndex];
    }
    return null;
  }

  toggleTaskComplete(id) {
    const task = this.getTaskById(id);
    if (task) {
      task.completed = !task.completed;
      this.saveTasks();
    }
    return task;
  }

  deleteTask(id) {
    this.tasks = this.tasks.filter(t => t.id !== id);
    this.saveTasks();
  }

  clearCompleted() {
    this.tasks = this.tasks.filter(t => !t.completed);
    this.saveTasks();
  }

  getStats() {
    const total = this.tasks.length;
    const completed = this.tasks.filter(t => t.completed).length;
    const score = total > 0 ? Math.round((completed / total) * 100) : 0;
    return { total, completed, score };
  }
}

export const store = new Store();
