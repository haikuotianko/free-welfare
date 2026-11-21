import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import { router } from './router';
import './style.css';

const savedTheme = localStorage.getItem('fw-theme');
const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches;
if (savedTheme === 'dark' || (!savedTheme && prefersDark)) {
  document.documentElement.classList.add('dark');
}

createApp(App).use(createPinia()).use(router).mount('#app');
