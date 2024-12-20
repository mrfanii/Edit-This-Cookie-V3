import { startData } from '/js/data.js';
async function start() {
  const { data, preferences } = await startData();
  if (preferences.showDevToolsPanel) chrome.devtools.panels.create('EditThisCookie', 'img/icon_32x32.png', 'devtools/panel.html');
}
window.addEventListener('load', start);
