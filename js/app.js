/**
 * app.js - Main Application Entry Point
 * Task & Mood Matrix Application
 */

import { UI } from './ui.js';
import { NovaAssistant } from './nova.js';

document.addEventListener('DOMContentLoaded', () => {
  const ui = new UI();
  ui.init();

  const nova = new NovaAssistant();
  nova.init(ui);

  console.log('✨ Task & Mood Matrix with NOVA initialized successfully!');
});
