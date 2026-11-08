import { DEFAULTS, endpointUrl, permissionOrigin } from './core.js';

const form = document.querySelector('#settings');
const status = document.querySelector('#status');
const fields = ['endpoint', 'apiKey', 'model', 'language', 'explanationLanguage', 'tone', 'audience', 'styleGuide'];
const modelStatus = document.querySelector('#modelStatus');
const modelSelect = document.querySelector('#modelSelect');
const modelSearch = document.querySelector('#modelSearch');
const discoverButton = document.querySelector('#discover');
let discovered = [];
let discoveryVersion = 0;
let discoveryTimer;
const presets = {
  openai: ['https://api.openai.com/v1', ''], deepseek: ['https://api.deepseek.com/v1', 'deepseek-chat'],
  qwen: ['https://dashscope.aliyuncs.com/compatible-mode/v1', 'qwen-plus'], ollama: ['http://localhost:11434/v1', '']
};

function report(message, error = false) {
  status.textContent = message;
  status.classList.toggle('error', error);
}

function modelReport(message, error = false) {
  modelStatus.textContent = message;
  modelStatus.classList.toggle('error', error);
}

function renderModels() {
  const current = document.querySelector('#model').value.trim();
  const query = modelSearch.value.trim().toLowerCase();
  modelSelect.replaceChildren(new Option('请选择模型…', ''));
  discovered.filter(id => id.toLowerCase().includes(query)).forEach(id => modelSelect.add(new Option(id, id)));
  modelSelect.value = [...modelSelect.options].some(option => option.value === current) ? current : '';
  modelSelect.disabled = discovered.length === 0;
}

function credentialsChanged() {
  discoveryVersion++;
  clearTimeout(discoveryTimer);
  discovered = [];
  modelSearch.value = '';
  modelSearch.classList.add('hidden');
  renderModels();
  discoverButton.disabled = false;
  modelReport('地址或 Key 已变化，正在准备重新获取；新域名请点击获取并授权。');
  discoveryTimer = setTimeout(() => discoverModels(false), 700);
}

async function discoverModels(interactive) {
  clearTimeout(discoveryTimer);
  const version = ++discoveryVersion;
  const endpoint = document.querySelector('#endpoint').value.trim();
  const apiKey = document.querySelector('#apiKey').value.trim();
  if (!endpoint || !apiKey) { modelReport('请先填写 API 地址和 API Key。'); return; }
  discoverButton.disabled = true;
  try {
    const origins = [permissionOrigin(endpoint)];
    const granted = interactive ? await chrome.permissions.request({ origins }) : await chrome.permissions.contains({ origins });
    if (version !== discoveryVersion) return;
    if (!granted) { modelReport('请点击「获取 / 刷新模型」，允许 Chrome 访问此 API 地址。'); return; }
    modelReport('正在获取当前 Key 可见的模型…');
    const response = await chrome.runtime.sendMessage({ type: 'DISCOVER_MODELS', endpoint, apiKey });
    if (version !== discoveryVersion) return;
    if (!response?.ok) throw new Error(response?.error || '获取模型失败，可手动填写模型 ID。');
    discovered = response.data;
    modelSearch.classList.toggle('hidden', discovered.length === 0);
    renderModels();
    const current = document.querySelector('#model').value.trim();
    const note = current && !discovered.includes(current) ? ' 当前模型不在列表中，已保留手动配置。' : '';
    modelReport(discovered.length ? `已获取 ${discovered.length} 个模型，请从列表中选择。${note}` : '服务商返回空列表，可手动填写模型 ID。');
  } catch (error) {
    if (version !== discoveryVersion) return;
    discovered = [];
    renderModels();
    modelSearch.classList.add('hidden');
    modelReport(error.message, true);
  } finally { if (version === discoveryVersion) discoverButton.disabled = false; }
}

discoverButton.addEventListener('click', () => discoverModels(true));
modelSearch.addEventListener('input', renderModels);
modelSelect.addEventListener('change', () => {
  if (modelSelect.value) document.querySelector('#model').value = modelSelect.value;
});
document.querySelector('#model').addEventListener('input', renderModels);
for (const id of ['endpoint', 'apiKey']) document.getElementById(id).addEventListener('input', credentialsChanged);

async function load() {
  const settings = { ...DEFAULTS, ...(await chrome.storage.local.get('settings')).settings };
  fields.forEach(key => { document.getElementById(key).value = settings[key]; });
  document.querySelector('#automatic').checked = settings.automatic;
  document.querySelector('#disabledSites').value = settings.disabledSites.join('\n');
  if (settings.apiKey) discoverModels(false);
}

document.querySelector('#provider').addEventListener('change', event => {
  const preset = presets[event.target.value];
  if (!preset) return;
  document.querySelector('#endpoint').value = preset[0];
  document.querySelector('#model').value = preset[1];
  if (event.target.value === 'ollama' && !document.querySelector('#apiKey').value) document.querySelector('#apiKey').value = 'ollama';
  credentialsChanged();
});
document.querySelector('#reveal').addEventListener('click', () => {
  const input = document.querySelector('#apiKey');
  input.type = input.type === 'password' ? 'text' : 'password';
});

form.addEventListener('submit', async event => {
  event.preventDefault();
  const button = document.querySelector('#save');
  button.disabled = true;
  try {
    const values = Object.fromEntries(fields.map(key => [key, document.getElementById(key).value.trim()]));
    endpointUrl(values.endpoint);
    const disabledSites = document.querySelector('#disabledSites').value.split(/\n/).map(site => site.trim().toLowerCase()).filter(Boolean);
    if (disabledSites.some(site => !/^(?:[a-z0-9-]+\.)*[a-z0-9-]+$/.test(site))) throw new Error('暂停列表请只填主机名，每行一个，不含协议、端口和路径。');
    const granted = await chrome.permissions.request({ origins: [permissionOrigin(values.endpoint)] });
    if (!granted) throw new Error('API 域名访问未获授权，设置未保存。');
    await chrome.storage.local.set({ settings: { ...DEFAULTS, ...values, automatic: document.querySelector('#automatic').checked, disabledSites: [...new Set(disabledSites)] } });
    await chrome.runtime.sendMessage({ type: 'SETTINGS_CHANGED' });
    report('设置已保存。回到网页正常输入，停顿后会自动画线；悬停问题文字即可查看并应用修改。');
  } catch (error) { report(error.message, true); }
  finally { button.disabled = false; }
});

document.querySelector('#test').addEventListener('click', async event => {
  event.target.disabled = true;
  report('正在测试已保存的配置，会产生少量 API 用量…');
  try {
    const response = await chrome.runtime.sendMessage({ type: 'WRITE', action: 'check', text: 'She go to school every day.' });
    if (!response?.ok) throw new Error(response?.error || '连接失败。');
    report(`连接成功，返回：${response.data.correctedText}`);
  } catch (error) { report(error.message, true); }
  finally { event.target.disabled = false; }
});

document.querySelector('#forget').addEventListener('click', async () => {
  const saved = { ...DEFAULTS, ...(await chrome.storage.local.get('settings')).settings, apiKey: '', automatic: false };
  await chrome.storage.local.set({ settings: saved });
  document.querySelector('#apiKey').value = '';
  document.querySelector('#automatic').checked = false;
  credentialsChanged();
  await chrome.runtime.sendMessage({ type: 'SETTINGS_CHANGED' });
  report('已清除本机保存的 Key，并关闭自动检查。');
});
load().catch(error => report(error.message, true));
