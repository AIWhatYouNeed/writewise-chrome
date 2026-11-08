import { DEFAULTS } from './core.js';
const status = document.querySelector('#status');
let tab;
let hostname;
document.querySelector('#options').addEventListener('click', () => chrome.runtime.openOptionsPage());
document.querySelector('#studio').addEventListener('click', () => chrome.tabs.create({ url: chrome.runtime.getURL('studio.html') }));
document.querySelector('#open').addEventListener('click', async () => {
  try {
    if (!tab?.id) throw new Error('未找到网页。');
    await chrome.tabs.sendMessage(tab.id, { type: 'OPEN_PANEL' }, { frameId: 0 });
    window.close();
  } catch { status.textContent = '请刷新普通网页后重试。Chrome 内部页、商店、PDF 等可用独立写作台。'; }
});
document.querySelector('#pause').addEventListener('change', async event => {
  if (!hostname) return;
  try {
    const settings = { ...DEFAULTS, ...(await chrome.storage.local.get('settings')).settings };
    const sites = new Set(settings.disabledSites);
    if (event.target.checked) sites.add(hostname); else sites.delete(hostname);
    await chrome.storage.local.set({ settings: { ...settings, disabledSites: [...sites] } });
    await chrome.runtime.sendMessage({ type: 'SETTINGS_CHANGED' });
    status.textContent = event.target.checked ? '已暂停当前网站。' : '当前网站已启用。';
  } catch { status.textContent = '保存失败，请重试。'; }
});
async function initialize() {
  const settings = { ...DEFAULTS, ...(await chrome.storage.local.get('settings')).settings };
  document.querySelector('#connection').textContent = settings.apiKey && settings.model ? `已配置模型 · ${settings.model}` : '还差一步：设置 API Key 和模型 ID';
  [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  try {
    const url = new URL(tab.url);
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error();
    hostname = url.hostname;
    document.querySelector('#site').textContent = hostname;
    document.querySelector('#pause').checked = settings.disabledSites.includes(hostname);
  } catch { document.querySelector('#pause').disabled = true; }
}
initialize().catch(() => { status.textContent = '读取设置失败，请重新打开插件。'; });
