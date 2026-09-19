// Surface failed module loading rather than leaving an unresponsive, empty dashboard.
const host = document.getElementById('main');
let slow;
function show(message) {
  let box = document.getElementById('startup-notice');
  if (!box) {
    box = document.createElement('div'); box.id = 'startup-notice'; box.setAttribute('role', 'alert');
    const text = document.createElement('span');
    const retry = document.createElement('button'); retry.type = 'button'; retry.textContent = '重新加载';
    retry.addEventListener('click', () => location.reload()); box.append(text, retry); host.prepend(box);
  }
  box.firstElementChild.textContent = message;
}
try {
  slow = setTimeout(() => show('应用文件加载较慢，记录未被删除。请检查网络后重新加载。'), 15000);
  await import('./app.js?v=2.2.1');
  clearTimeout(slow); document.getElementById('startup-notice')?.remove();
  document.documentElement.dataset.appReady = 'true';
} catch (error) {
  clearTimeout(slow); console.error('Activity Log startup failed', error);
  show('应用文件未能完整加载，暂时无法使用。你的共享记录和本机草稿没有被清除。');
}
