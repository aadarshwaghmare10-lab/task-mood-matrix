/**
 * app.js - Main Application Entry Point
 * Task & Mood Matrix Application
 */

import { UI } from './ui.js';

document.addEventListener('DOMContentLoaded', () => {
  const ui = new UI();
  ui.init();
  console.log('✨ Task & Mood Matrix initialized successfully!');
});
