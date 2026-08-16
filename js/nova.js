/**
 * nova.js - NOVA AI Productivity Assistant (Phase 4 Production Polish)
 * Floating chat interface for Task & Mood Matrix
 */

import { store } from './store.js';

export class NovaAssistant {
  constructor() {
    this.isOpen = false;
    this.ui = null;
    this.chatHistory = [];
    this.lastFailedMessage = null;

    // Cache DOM Elements
    this.toggleBtn = document.getElementById('btn-nova-toggle');
    this.modal = document.getElementById('nova-modal');
    this.closeBtn = document.getElementById('btn-nova-close');
    this.form = document.getElementById('nova-form');
    this.input = document.getElementById('nova-input');
    this.sendBtn = document.getElementById('btn-nova-send');
    this.messagesContainer = document.getElementById('nova-messages');
    this.chipsContainer = document.getElementById('nova-chips');
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

    // Quick Suggestion Chips click listener
    if (this.chipsContainer) {
      this.chipsContainer.addEventListener('click', (e) => {
        const chip = e.target.closest('.nova-chip');
        if (!chip) return;

        const action = chip.dataset.action;
        const prompt = chip.dataset.prompt;

        if (action === 'clear') {
          this.clearChat();
        } else if (prompt) {
          if (this.input) {
            this.input.value = prompt;
            this.handleSend(null, true);
          }
        }
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

  clearChat() {
    if (!this.messagesContainer) return;
    this.messagesContainer.innerHTML = `
      <div class="nova-msg nova-msg-assistant">
        <div class="nova-msg-avatar">🤖</div>
        <div class="nova-msg-bubble">Hi! I'm NOVA 👋<br>Your productivity assistant.<br><br>Tell me what you need to get done, and I'll help you organize it.</div>
      </div>
    `;
    this.chatHistory = [];
    this.lastFailedMessage = null;
    if (this.ui && typeof this.ui.showToast === 'function') {
      this.ui.showToast('Chat history cleared', 'info');
    }
  }

  async handleSend(retryText = null, isQuickChip = false) {
    if (!this.input) return;
    const text = retryText || this.input.value.trim();
    if (!text) return;

    // Append user message to UI & history
    if (!retryText) {
      this.appendMessage(text, 'user');
      this.chatHistory.push({ role: 'user', content: text });
    }

    // Limit history to last 10 messages
    if (this.chatHistory.length > 10) {
      this.chatHistory = this.chatHistory.slice(-10);
    }

    // Clear input & disable controls while processing
    this.input.value = '';
    this.input.style.height = 'auto';
    this.setInputState(false);

    // Show animated typing indicator
    const typingMsg = this.appendTypingIndicator();

    try {
      const context = this.getNovaContext();
      const historyPayload = isQuickChip ? [] : this.chatHistory;

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          message: text,
          context: context,
          history: historyPayload
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP error ${response.status}`);
      }

      const data = await response.json();

      // Remove typing indicator
      this.removeTypingIndicator(typingMsg);
      this.setInputState(true);

      if (data && data.reply) {
        const assistantBubble = this.appendMessage(data.reply, 'assistant');
        this.chatHistory.push({ role: 'model', content: data.reply });
        this.lastFailedMessage = null;

        // Render proposed action confirmation cards (Single or Batch)
        if (data.proposedActions && Array.isArray(data.proposedActions) && data.proposedActions.length > 0) {
          if (data.proposedActions.length === 1) {
            this.renderActionCard(data.proposedActions[0], assistantBubble);
          } else {
            this.renderBatchActionCard(data.proposedActions, assistantBubble);
          }
        }
      } else {
        this.appendMessage("I received your message, but I couldn't generate recommendations right now.", 'assistant');
      }
    } catch (err) {
      console.error("NOVA API request error:", err);
      this.removeTypingIndicator(typingMsg);
      this.setInputState(true);
      this.lastFailedMessage = text;
      this.appendErrorCard("I encountered a network issue communicating with the AI backend.", text);
    }
  }

  setInputState(enabled) {
    if (this.input) this.input.disabled = !enabled;
    if (this.sendBtn) this.sendBtn.disabled = !enabled;
    if (enabled && this.input) {
      this.input.focus();
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

  appendErrorCard(errorText, failedMsgText) {
    if (!this.messagesContainer) return;

    const msgDiv = document.createElement('div');
    msgDiv.className = 'nova-msg nova-msg-assistant';
    msgDiv.innerHTML = `
      <div class="nova-msg-avatar">⚠️</div>
      <div class="nova-msg-bubble">
        <div>${this.escapeHTML(errorText)}</div>
        <div class="nova-error-card">
          <span>Make sure the local PowerShell server (<code>server.ps1</code>) is running at <code>http://localhost:8080</code>.</span>
          <button class="nova-retry-btn">🔄 Retry Message</button>
        </div>
      </div>
    `;

    this.messagesContainer.appendChild(msgDiv);
    this.scrollToBottom();

    const retryBtn = msgDiv.querySelector('.nova-retry-btn');
    if (retryBtn) {
      retryBtn.addEventListener('click', () => {
        msgDiv.remove();
        this.handleSend(failedMsgText);
      });
    }
  }

  appendTypingIndicator() {
    if (!this.messagesContainer) return null;
    const msgDiv = document.createElement('div');
    msgDiv.className = 'nova-msg nova-msg-assistant nova-typing-msg';
    msgDiv.innerHTML = `
      <div class="nova-msg-avatar">🤖</div>
      <div class="nova-msg-bubble">
        <div class="nova-typing-dots">
          <span></span><span></span><span></span>
        </div>
      </div>
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
    if (!parentMsgEl) return null;
    const bubbleEl = parentMsgEl.querySelector('.nova-msg-bubble');
    if (!bubbleEl) return null;

    const quadLabels = {
      q1: 'Q1 • Do First',
      q2: 'Q2 • Schedule',
      q3: 'Q3 • Delegate',
      q4: 'Q4 • Eliminate'
    };

    const card = document.createElement('div');
    const isDelete = action.type === 'DELETE_TASK';
    card.className = `nova-action-card ${isDelete ? 'delete-action' : ''}`;
    card.dataset.executed = 'false';

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
          <div><strong>Target Task:</strong> ${this.escapeHTML(data.oldTitle || data.title || 'Selected task')}</div>
          <div class="nova-diff-container">
            ${data.oldTitle && data.title && data.oldTitle !== data.title ? `
              <div class="nova-diff-row">
                <span><strong>Title:</strong></span>
                <span class="nova-diff-old">${this.escapeHTML(data.oldTitle)}</span>
                <span class="nova-diff-arrow">➔</span>
                <span class="nova-diff-new">${this.escapeHTML(data.title)}</span>
              </div>` : `<div><strong>New Title:</strong> ${this.escapeHTML(data.title)}</div>`}
            ${data.oldQuadrant && data.quadrant && data.oldQuadrant !== data.quadrant ? `
              <div class="nova-diff-row">
                <span><strong>Quadrant:</strong></span>
                <span class="nova-diff-old">${quadLabels[data.oldQuadrant] || data.oldQuadrant}</span>
                <span class="nova-diff-arrow">➔</span>
                <span class="nova-diff-new">${quadLabels[data.quadrant] || data.quadrant}</span>
              </div>` : ''}
          </div>
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

    // Bind Confirm & Cancel buttons with double-click prevention
    const confirmBtn = card.querySelector('.nova-confirm-btn');
    const cancelBtn = card.querySelector('.nova-cancel-btn');
    const controlsDiv = card.querySelector('.nova-action-controls');

    if (confirmBtn) {
      confirmBtn.addEventListener('click', () => {
        if (card.dataset.executed === 'true') return;
        card.dataset.executed = 'true';
        confirmBtn.disabled = true;
        cancelBtn.disabled = true;

        const success = this.executeConfirmedAction(action);
        if (success) {
          controlsDiv.innerHTML = `<span class="nova-action-status executed">✓ Action Executed</span>`;
          if (this.ui && typeof this.ui.showToast === 'function') {
            this.ui.showToast(`AI Action executed successfully!`, 'success');
          }
        } else {
          controlsDiv.innerHTML = `<span class="nova-action-status cancelled">⚠ Task Not Found</span>`;
          if (this.ui && typeof this.ui.showToast === 'function') {
            this.ui.showToast(`Target task no longer exists in matrix`, 'error');
          }
        }
      });
    }

    if (cancelBtn) {
      cancelBtn.addEventListener('click', () => {
        if (card.dataset.executed === 'true') return;
        card.dataset.executed = 'true';
        confirmBtn.disabled = true;
        cancelBtn.disabled = true;

        controlsDiv.innerHTML = `<span class="nova-action-status cancelled">✕ Action Cancelled</span>`;
        if (this.ui && typeof this.ui.showToast === 'function') {
          this.ui.showToast(`AI Action cancelled`, 'info');
        }
      });
    }

    return { card, controlsDiv, confirmBtn, cancelBtn };
  }

  renderBatchActionCard(actionsList, parentMsgEl) {
    if (!parentMsgEl || !actionsList || actionsList.length === 0) return;
    const bubbleEl = parentMsgEl.querySelector('.nova-msg-bubble');
    if (!bubbleEl) return;

    const batchContainer = document.createElement('div');
    batchContainer.className = 'nova-batch-card';

    batchContainer.innerHTML = `
      <div class="nova-batch-header">
        <span>📦 Proposed Batch Actions (${actionsList.length} items)</span>
      </div>
      <div class="nova-batch-items"></div>
      <button class="nova-confirm-all-btn">✅ Confirm All ${actionsList.length} Actions</button>
    `;

    bubbleEl.appendChild(batchContainer);

    const itemsContainer = batchContainer.querySelector('.nova-batch-items');
    const confirmAllBtn = batchContainer.querySelector('.nova-confirm-all-btn');

    const cardExecutors = [];

    // Render individual action cards inside batch items container
    actionsList.forEach(action => {
      const mockMsgParent = document.createElement('div');
      mockMsgParent.className = 'nova-msg-bubble';
      itemsContainer.appendChild(mockMsgParent);

      const cardObj = this.renderActionCard(action, { querySelector: () => mockMsgParent });
      if (cardObj) {
        cardExecutors.push({
          action: action,
          cardObj: cardObj
        });
      }
    });

    if (confirmAllBtn) {
      confirmAllBtn.addEventListener('click', () => {
        let count = 0;
        cardExecutors.forEach(item => {
          if (item.cardObj.card && item.cardObj.card.dataset.executed !== 'true') {
            item.cardObj.card.dataset.executed = 'true';
            if (item.cardObj.confirmBtn) item.cardObj.confirmBtn.disabled = true;
            if (item.cardObj.cancelBtn) item.cardObj.cancelBtn.disabled = true;

            const success = this.executeConfirmedAction(item.action);
            if (success) {
              item.cardObj.controlsDiv.innerHTML = `<span class="nova-action-status executed">✓ Action Executed</span>`;
              count++;
            } else {
              item.cardObj.controlsDiv.innerHTML = `<span class="nova-action-status cancelled">⚠ Task Not Found</span>`;
            }
          }
        });

        confirmAllBtn.disabled = true;
        confirmAllBtn.style.display = 'none';

        if (this.ui && typeof this.ui.showToast === 'function') {
          this.ui.showToast(`Executed ${count} batch AI action(s)!`, 'success');
        }
      });
    }

    this.scrollToBottom();
  }

  executeConfirmedAction(action) {
    const data = action.data || {};

    // Validate target task existence for task modification actions
    if (['UPDATE_TASK', 'MOVE_TASK', 'TOGGLE_TASK', 'DELETE_TASK'].includes(action.type)) {
      if (data.id) {
        const existing = store.getTaskById(data.id);
        if (!existing) {
          console.warn(`Task ${data.id} no longer exists in store`);
          return false;
        }
      }
    }

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

    // Trigger live matrix UI re-render
    if (this.ui && typeof this.ui.render === 'function') {
      this.ui.render();
    }

    return true;
  }

  scrollToBottom() {
    if (this.messagesContainer) {
      this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
    }
  }

  escapeHTML(str) {
    if (typeof str !== 'string') return '';
    return str.replace(/[&<>'"]/g, 
      tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
    );
  }
}
