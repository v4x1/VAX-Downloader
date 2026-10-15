'use strict';

// Set theme and direction before stylesheets paint to avoid a dark/light or LTR/RTL flash.
(() => {
  const root = document.documentElement;
  let savedTheme = null;
  let savedLanguage = null;
  try {
    savedTheme = window.localStorage.getItem('vax-theme');
    savedLanguage = window.localStorage.getItem('vax-language');
  } catch {
    // Storage may be unavailable in private browsing; system preferences still apply.
  }

  const systemDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? true;
  root.dataset.theme = savedTheme === 'light' || savedTheme === 'dark'
    ? savedTheme
    : (systemDark ? 'dark' : 'light');
  root.lang = savedLanguage === 'ar' ? 'ar' : 'en';
  root.dir = root.lang === 'ar' ? 'rtl' : 'ltr';
})();
