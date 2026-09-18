/* Presentation only: this file never reads or writes activities, attachments or drafts. */
(() => {
  const root = document.documentElement;
  const read = key => { try { return localStorage.getItem('activity-log:' + key); } catch { return null; } };
  root.dataset.ui = read('ui') === 'workspace' ? 'workspace' : 'classic';
  if (read('theme') === 'dark') root.dataset.theme = 'dark';
  document.addEventListener('DOMContentLoaded', () => {
    const button = document.getElementById('ui-toggle');
    const status = document.getElementById('appearance-status');
    function reflect() {
      const classic = root.dataset.ui === 'classic';
      button.setAttribute('aria-pressed', String(!classic));
      button.setAttribute('aria-label', classic ? '切换到工作台界面' : '切换到经典玻璃界面');
      button.title = (classic ? '当前：经典玻璃 · 切换到工作台' : '当前：工作台 · 切换到经典玻璃') + '（共用同一份数据）';
    }
    reflect();
    button.addEventListener('click', () => {
      root.dataset.ui = root.dataset.ui === 'classic' ? 'workspace' : 'classic';
      try { localStorage.setItem('activity-log:ui', root.dataset.ui); } catch { /* Appearance persistence is optional. */ }
      reflect();
      status.textContent = (root.dataset.ui === 'classic' ? '已切换至经典玻璃界面' : '已切换至工作台界面') + '；活动、附件、草稿和筛选保持不变。';
      window.dispatchEvent(new CustomEvent('activity-ui-change', { detail: { ui: root.dataset.ui } }));
    });
  }, { once: true });
})();
