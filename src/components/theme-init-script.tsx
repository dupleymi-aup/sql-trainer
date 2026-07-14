const THEME_KEY = 'theme';
const DARK_QUERY = '(prefers-color-scheme: dark)';

const scriptContent = `
  (function() {
    try {
      var t = localStorage.getItem('${THEME_KEY}');
      if (!t) { t = 'system'; }
      var r = t === 'system'
        ? (window.matchMedia('${DARK_QUERY}').matches ? 'dark' : 'light')
        : t;
      if (r === 'dark') { document.documentElement.classList.add('dark'); }
      else { document.documentElement.classList.remove('dark'); }
      document.documentElement.style.colorScheme = r;
    } catch(e) {}
  })();
`;

export default function ThemeInitScript() {
  return <script id="theme-init" dangerouslySetInnerHTML={{ __html: scriptContent }} />;
}
