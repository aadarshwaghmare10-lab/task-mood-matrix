/**
 * nova.js - NOVA AI Productivity Assistant
 * Floating chat interface for Task & Mood Matrix
 */

import { store } from './store.js';

export class NovaAssistant {
  constructor() {
    this.isOpen = false;
    this.ui = null;

    // Cache DOM Elements
    this.toggleBtn = document.getElementById('btn-nova-toggle');
    this.modal = document.getElementById('nova-modal');
    this.closeBtn = document.getElementById('btn-nova-close');
    this.form = document.getElementById('nova-form');
    this.input = document.getElementById('nova-input');
    this.sendBtn = document.getElementById('btn-nova-send');
    this.messagesContainer = document.getElementById('nova-messages');
  }

  init(ui = null) {
    this.ui = ui;
    if (!this.toggleBtn || !this.modal) return;
    this.bindEvents();
  }

  getNovaContext() {
    return store.getNovaContext();
  }

  bindEvents() {
    // Toggle button click
    this.toggleBtn.addEventListener('click', () => this.toggle());

    // Close button click
    if (this.closeBtn) {
      this.closeBtn.addEventListener('click', () => this.close());
    }

    // Overlay backdrop click
    this.modal.addEventListener('click', (e) => {
      if (e.target === this.modal) {
        this.close();
      }
    });

    // Form submit
    if (this.form) {
      this.form.addEventListener('submit', (e) => {
        e.preventDefault();
        this.handleSend();
      });
    }

    // Textarea Keydown (Enter to send, Shift+Enter for newline)
    if (this.input) {
      this.input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          this.handleSend();
        }
      });

      // Auto-resize textarea height dynamically
      this.input.addEventListener('input', () => {
        this.input.style.height = 'auto';
        this.input.style.height = Math.min(this.input.scrollHeight, 120) + 'px';
      });
    }

    // Global Escape key handling
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isOpen) {
        this.close();
      }
    });
  }

  toggle() {
    if (this.isOpen) {
      this.close();
    } else {
      this.open();
    }
  }

  open() {
    this.isOpen = true;
    this.modal.setAttribute('aria-hidden', 'false');
    this.toggleBtn.setAttribute('aria-expanded', 'true');

    // Focus input on open
    setTimeout(() => {
      if (this.input) {
        this.input.focus();
      }
    }, 100);
  }

  close() {
    this.isOpen = false;
    this.modal.setAttribute('aria-hidden', 'true');
    this.toggleBtn.setAttribute('aria-expanded', 'false');

    // Return focus to toggle button
    if (this.toggleBtn) {
      this.toggleBtn.focus();
    }
  }

  async handleSend() {
    if (!this.input) return;
    const text = this.input.value.trim();
    if (!text) return;

    // Append user message
    this.appendMessage(text, 'user');

    // Clear input & reset height
    this.input.value = '';
    this.input.style.height = 'auto';

    // Show typing indicator
    const typingMsg = this.appendTypingIndicator();

    try {
      const context = this.getNovaContext();
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          message: text,
          context: context
        })
      });

      const data = await response.json();

      // Remove typing indicator
      this.removeTypingIndicator(typingMsg);

      if (data && data.reply) {
        const assistantBubble = this.appendMessage(data.reply, 'assistant');

        // Render proposed action confirmation cards if present
        if (data.proposedActions && Array.isArray(data.proposedActions) && data.proposedActions.length > 0) {
          data.proposedActions.forEach(action => {
            this.renderActionCard(action, assistantBubble);
          });
        }
      } else {
        this.appendMessage("I received your message, but I couldn't generate proposed actions right now.", 'assistant');
      }
    } catch (err) {
      console.error("NOVA API request error:", err);
      this.removeTypingIndicator(typingMsg);
      this.appendMessage("I encountered an issue communicating with my AI server. Please make sure the local server is running.", 'assistant');
    }
  }

  appendMessage(text, sender) {
    if (!this.messagesContainer) return null;

    const msgDiv = document.createElement('div');
    msgDiv.className = `nova-msg nova-msg-${sender}`;

    if (sender === 'assistant') {
      msgDiv.innerHTML = `
        <div class="nova-msg-avatar">🤖</div>
        <div class="nova-msg-bubble">${this.escapeHTML(text).replace(/\n/g, '<br>')}</div>
      `;
    } else {
      msgDiv.innerHTML = `
        <div class="nova-msg-bubble">${this.escapeHTML(text).replace(/\n/g, '<br>')}</div>
      `;
    }

    this.messagesContainer.appendChild(msgDiv);
    this.scrollToBottom();
    return msgDiv;
  }

  appendTypingIndicator() {
    if (!this.messagesContainer) return null;
    const msgDiv = document.createElement('div');
    msgDiv.className = 'nova-msg nova-msg-assistant nova-typing-msg';
    msgDiv.innerHTML = `
      <div class="nova-msg-avatar">🤖</div>
      <div class="nova-msg-bubble"><em>NOVA is thinking...</em></div>
    `;
    this.messagesContainer.appendChild(msgDiv);
    this.scrollToBottom();
    return msgDiv;
  }

  removeTypingIndicator(typingEl) {
    if (typingEl && typingEl.parentNode) {
      typingEl.parentNode.removeChild(typingEl);
    }
  }

  renderActionCard(action, parentMsgEl) {
    if (!parentMsgEl) return;
    const bubbleEl = parentMsgEl.querySelector('.nova-msg-bubble');
    if (!bubbleEl) return;

    const quadLabels = {
      q1: 'Q1 • Do First',
      q2: 'Q2 • Schedule',
      q3: 'Q3 • Delegate',
      q4: 'Q4 • Eliminate'
    };

    const card = document.createElement('div');
    const isDelete = action.type === 'DELETE_TASK';
    card.className = `nova-action-card ${isDelete ? 'delete-action' : ''}`;

    let headerIcon = '➕';
    let headerTitle = 'Proposed Action: Create Task';
    let detailsHTML = '';

    const data = action.data || {};

    switch (action.type) {
      case 'CREATE_TASK':
        headerIcon = '➕';
        headerTitle = 'Proposed Action: Create Task';
        detailsHTML = `
          <div><strong>Task Title:</strong> ${this.escapeHTML(data.title || 'Untitled')}</div>
          <div><strong>Quadrant:</strong> ${quadLabels[data.quadrant] || 'Q2 • Schedule'}</div>
          ${data.description ? `<div><strong>Notes:</strong> ${this.escapeHTML(data.description)}</div>` : ''}
        `;
        break;

      case 'UPDATE_TASK':
        headerIcon = '✏️';
        headerTitle = 'Proposed Action: Update Task';
        detailsHTML = `
          <div><strong>Target Task:</strong> ${this.escapeHTML(data.title || 'Selected task')}</div>
          <div><strong>New Quadrant:</strong> ${quadLabels[data.quadrant] || data.quadrant}</div>
        `;
        break;

      case 'MOVE_TASK':
        headerIcon = '🔀';
        headerTitle = 'Proposed Action: Move Task';
        detailsHTML = `
          <div><strong>Task:</strong> ${this.escapeHTML(data.title || 'Selected task')}</div>
          <div><strong>Target Quadrant:</strong> ${quadLabels[data.quadrant] || data.quadrant}</div>
        `;
        break;

      case 'TOGGLE_TASK':
        headerIcon = '☑️';
        headerTitle = 'Proposed Action: Toggle Completion';
        detailsHTML = `
          <div><strong>Task:</strong> ${this.escapeHTML(data.title || 'Selected task')}</div>
          <div><strong>Action:</strong> Toggle completion status</div>
        `;
        break;

      case 'DELETE_TASK':
        headerIcon = '🗑️';
        headerTitle = 'Proposed Action: Delete Task';
        detailsHTML = `
          <div><strong>Warning:</strong> Delete task "${this.escapeHTML(data.title || 'Selected task')}"</div>
          <div><strong>Quadrant:</strong> ${quadLabels[data.quadrant] || 'Matrix'}</div>
        `;
        break;
    }

    card.innerHTML = `
      <div class="nova-action-header">
        <span>${headerIcon}</span> <span>${headerTitle}</span>
      </div>
      <div class="nova-action-details">
        ${detailsHTML}
      </div>
      <div class="nova-action-controls">
        <button class="nova-confirm-btn">✅ Confirm Action</button>
        <button class="nova-cancel-btn">❌ Cancel</button>
      </div>
    `;

    bubbleEl.appendChild(card);
    this.scrollToBottom();

    // Bind Confirm button
    const confirmBtn = card.querySelector('.nova-confirm-btn');
    const cancelBtn = card.querySelector('.nova-cancel-btn');
    const controlsDiv = card.querySelector('.nova-action-controls');

    if (confirmBtn) {
      confirmBtn.addEventListener('click', () => {
        this.executeConfirmedAction(action);
        controlsDiv.innerHTML = `<span class="nova-action-status executed">✓ Action Executed</span>`;
        if (this.ui && typeof this.ui.showToast === 'function') {
          this.ui.showToast(`AI Action executed successfully!`, 'success');
        }
      });
    }

    if (cancelBtn) {
      cancelBtn.addEventListener('click', () => {
        controlsDiv.innerHTML = `<span class="nova-action-status cancelled">✕ Action Cancelled</span>`;
        if (this.ui && typeof this.ui.showToast === 'function') {
          this.ui.showToast(`AI Action cancelled`, 'info');
        }
      });
    }
  }

  executeConfirmedAction(action) {
    const data = action.data || {};
    switch (action.type) {
      case 'CREATE_TASK':
        store.addTask({
          title: data.title,
          description: data.description || '',
          quadrant: data.quadrant || 'q2',
          mood: data.mood || store.currentMood
        });
        break;

      case 'UPDATE_TASK':
        if (data.id) {
          store.updateTask(data.id, data);
        }
        break;

      case 'MOVE_TASK':
        if (data.id && data.quadrant) {
          store.updateTaskQuadrant(data.id, data.quadrant);
        }
        break;

      case 'TOGGLE_TASK':
        if (data.id) {
          store.toggleTaskComplete(data.id);
        }
        break;

      case 'DELETE_TASK':
        if (data.id) {
          store.deleteTask(data.id);
        }
        break;
    }

    // Trigger matrix UI re-render
    if (this.ui && typeof this.ui.render === 'function') {
      this.ui.render();
    }
  }

  scrollToBottom() {
    if (this.messagesContainer) {
      this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
    }
  }

  escapeHTML(str) {
    return str.replace(/[&<>'"]/g, 
      tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
    );
  }
}
