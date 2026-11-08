import { DEFAULTS, ACTIONS, endpointUrl, permissionOrigin, modelsUrl, parseModels, buildMessages, parseResult, publicSettings, statusError, validateRequest } from './core.js';
import { readTextStream } from './stream.js';

const ready = chrome.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' });
const active = new Map();
const resultCache = new Map();
let modelCatalog = null;
let taskMutation = Promise.resolve();

async function sourceIdentity(config) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify([config.endpoint, config.apiKey])));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

async function taskPreferences(config = null) {
  config ||= await settings();
  const source = await sourceIdentity(config);
  const saved = (await chrome.storage.local.get('taskPreferences')).taskPreferences;
  return { source, defaultModel: config.model, models: saved?.source === source ? saved.models || {} : {}, timings: saved?.source === source ? saved.timings || {} : {} };
}

function mutateTasks(operation) {
  const next = taskMutation.then(operation);
  taskMutation = next.catch(() => {});
  return next;
}

async function recordTiming(config, action, model, apiMs, firstTextMs) {
  await mutateTasks(async () => {
    const current = await settings();
    if (await sourceIdentity(current) !== await sourceIdentity(config)) return;
    const preferences = await taskPreferences(current);
    const key = `${action}:${model}`;
    const old = preferences.timings[key];
    preferences.timings[key] = { firstTextMs: old ? Math.round(old.firstTextMs * .6 + firstTextMs * .4) : firstTextMs, apiMs, count: (old?.count || 0) + 1 };
    const keys = Object.keys(preferences.timings);
    while (keys.length > 100) delete preferences.timings[keys.shift()];
    await chrome.storage.local.set({ taskPreferences: preferences });
  });
}

async function taskModels(action, refresh = false) {
  if (!Object.hasOwn(ACTIONS, action)) throw new Error('不支持的任务。');
  const config = await settings();
  const preferences = await taskPreferences(config);
  let warning = '';
  if (refresh || modelCatalog?.source !== preferences.source || Date.now() - modelCatalog.at > 5 * 60 * 1000) {
    try { modelCatalog = { source: preferences.source, at: Date.now(), ids: await discoverModels(config) }; }
    catch (error) { warning = error.message; }
  }
  const ids = [...new Set([config.model, ...Object.values(preferences.models), ...(modelCatalog?.source === preferences.source ? modelCatalog.ids : [])])].filter(Boolean);
  const timings = Object.fromEntries(ids.flatMap(id => preferences.timings[`${action}:${id}`] ? [[id, preferences.timings[`${action}:${id}`]]] : []));
  return { ids, model: preferences.models[action] || config.model, defaultModel: config.model, timings, warning };
}

async function settings() {
  await ready;
  return { ...DEFAULTS, ...(await chrome.storage.local.get('settings')).settings };
}

chrome.runtime.onInstalled.addListener(async details => {
  await ready;
  if (details.reason === 'update' && ['1.0.0', '1.1.0'].includes(details.previousVersion)) {
    await chrome.storage.local.set({ settings: { ...await settings(), automatic: true } });
  }
  await chrome.contextMenus.removeAll();
  chrome.contextMenus.create({ id: 'writewise-check', title: '用 WriteWise 检查选中文字', contexts: ['selection'], documentUrlPatterns: ['http://*/*', 'https://*/*'] });
  chrome.contextMenus.create({ id: 'writewise-translate', title: '用 WriteWise 翻译选中文字', contexts: ['selection'], documentUrlPatterns: ['http://*/*', 'https://*/*'] });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'writewise-check' && tab?.id) chrome.tabs.sendMessage(tab.id, { type: 'OPEN_SELECTION' }, { frameId: info.frameId || 0 }).catch(() => {});
  if (info.menuItemId === 'writewise-translate' && tab?.id) chrome.tabs.sendMessage(tab.id, { type: 'TRANSLATE_SELECTION' }, { frameId: info.frameId || 0 }).catch(() => {});
});

chrome.commands.onCommand.addListener(async command => {
  if (command !== 'check-writing') return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id) chrome.tabs.sendMessage(tab.id, { type: 'CHECK_FOCUSED' }).catch(() => {});
});

async function write(request, sender, progress = null, attachController = () => {}) {
  const task = validateRequest(request);
  const config = await settings();
  const preferences = await taskPreferences(config);
  config.model = preferences.models[task.action] || config.model;
  if (!config.apiKey || !config.model) throw new Error('请先点击插件图标 → 设置，填写 API Key 和模型 ID。');
  if (sender.tab) {
    const hostname = new URL(sender.url).hostname;
    if (config.disabledSites.includes(hostname)) throw new Error('此网站已暂停 WriteWise，请从插件弹窗中重新启用。');
  }
  const endpoint = endpointUrl(config.endpoint);
  if (!await chrome.permissions.contains({ origins: [permissionOrigin(config.endpoint)] })) throw new Error('尚未授权 API 地址，请在设置中重新保存并允许访问。');
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify({ task, config })));
  const cacheKey = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
  const cached = resultCache.get(cacheKey);
  if (cached && Date.now() - cached.at < 5 * 60 * 1000) return { ...cached.result, model: config.model, cached: true, apiMs: 0, firstTextMs: 0 };
  if (cached) resultCache.delete(cacheKey);
  const lane = task.automatic ? 'automatic' : ['translate', 'ask'].includes(task.action) ? 'selection' : 'manual';
  const identity = `${sender.tab ? `tab:${sender.tab.id}:${sender.frameId}` : `extension:${sender.url}`}:${lane}`;
  if (active.has(identity)) {
    if (['translate', 'ask'].includes(task.action)) active.get(identity).abort();
    else throw new Error('已有请求正在处理，请等待完成。');
  }
  const controller = new AbortController();
  attachController(controller);
  active.set(identity, controller);
  const timeout = setTimeout(() => controller.abort(), 45000);
  const started = performance.now();
  let firstTextMs = null;
  try {
    const translation = ['translate', 'ask'].includes(task.action);
    const send = stream => fetch(endpoint, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.apiKey}` },
      credentials: 'omit', redirect: 'error', referrerPolicy: 'no-referrer', signal: controller.signal,
      body: JSON.stringify({ model: config.model, messages: buildMessages(task, config), stream })
    });
    let response = await send(translation);
    if (translation && [400, 422, 501].includes(response.status)) {
      await response.body?.cancel();
      response = await send(false);
    }
    if (!response.ok) throw new Error(statusError(response.status));
    let parsed;
    if (translation && response.headers.get('content-type')?.includes('text/event-stream')) {
      let lastProgress = 0;
      const correctedText = await readTextStream(response, text => {
        firstTextMs ??= Math.round(performance.now() - started);
        if (progress && performance.now() - lastProgress > 45) {
          lastProgress = performance.now();
          progress({ text, firstTextMs, model: config.model });
        }
      });
      parsed = { correctedText, summary: '翻译完成。', issues: [] };
    } else {
      const payload = await response.json();
      if (payload.choices?.[0]?.finish_reason === 'length') throw new Error('模型输出被截断，请缩短文字或调整服务商输出限制。');
      const content = payload.choices?.[0]?.message?.content;
      if (translation) {
        if (typeof content !== 'string' || !content.trim() || content.length > 48000) throw new Error('模型没有返回有效的译文。');
        parsed = { correctedText: content, summary: '翻译完成。', issues: [] };
      } else parsed = parseResult(content, task.text, task.action);
    }
    const apiMs = Math.round(performance.now() - started);
    firstTextMs ??= apiMs;
    const data = { ...parsed, apiMs, firstTextMs, model: config.model, cached: false };
    await recordTiming(config, task.action, config.model, apiMs, firstTextMs);
    resultCache.set(cacheKey, { at: Date.now(), result: parsed });
    while (resultCache.size > 30) resultCache.delete(resultCache.keys().next().value);
    return data;
  } catch (error) {
    if (error.name === 'AbortError') throw new Error('请求超过 45 秒，请稍后重试或更换更快的模型。');
    if (error instanceof TypeError) throw new Error('无法连接 API，请检查网络、API 地址、证书，以及服务商是否允许浏览器扩展访问。');
    throw error;
  } finally {
    clearTimeout(timeout);
    if (active.get(identity) === controller) active.delete(identity);
  }
}

async function discoverModels(message) {
  if (typeof message.endpoint !== 'string' || typeof message.apiKey !== 'string' || !message.apiKey.trim()) throw new Error('请先填写 API 地址和 API Key。');
  const endpoint = modelsUrl(message.endpoint);
  if (!await chrome.permissions.contains({ origins: [permissionOrigin(message.endpoint)] })) throw new Error('请点击「获取 / 刷新模型」，授权访问 API 地址。');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(endpoint, {
      method: 'GET', headers: { Authorization: `Bearer ${message.apiKey.trim()}` },
      credentials: 'omit', redirect: 'error', referrerPolicy: 'no-referrer', signal: controller.signal
    });
    if (response.status === 404 || response.status === 405) throw new Error('此服务商未提供 /models 接口，可手动填写模型 ID。');
    if (!response.ok) throw new Error(statusError(response.status));
    let payload;
    try { payload = await response.json(); }
    catch { throw new Error('模型列表不是有效 JSON，可手动填写模型 ID。'); }
    return parseModels(payload);
  } catch (error) {
    if (error.name === 'AbortError') throw new Error('获取模型超过 15 秒，请重试或手动填写模型 ID。');
    if (error instanceof TypeError) throw new Error('无法连接模型列表接口，请检查 API 地址与网络，或手动填写模型 ID。');
    throw error;
  } finally { clearTimeout(timeout); }
}

chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (sender.id !== chrome.runtime.id) return false;
  const operation = async () => {
    if (message.type === 'GET_PUBLIC_SETTINGS') return publicSettings(await settings());
    if (message.type === 'OPEN_OPTIONS') { await chrome.runtime.openOptionsPage(); return true; }
    if (message.type === 'WRITE') return write(message, sender);
    if (message.type === 'GET_TASK_PREFERENCES') {
      const preferences = await taskPreferences();
      return { defaultModel: preferences.defaultModel, models: preferences.models };
    }
    if (message.type === 'GET_TASK_MODELS') return taskModels(message.action, message.refresh === true);
    if (message.type === 'SET_TASK_MODEL') return mutateTasks(async () => {
      if (!Object.hasOwn(ACTIONS, message.action) || typeof message.model !== 'string' || message.model.length > 200) throw new Error('无效的任务或模型。');
      const config = await settings();
      const preferences = await taskPreferences(config);
      const allowed = [config.model, ...Object.values(preferences.models), ...(modelCatalog?.source === preferences.source ? modelCatalog.ids : [])];
      if (message.model && !allowed.includes(message.model)) throw new Error('请先刷新模型列表，再选择当前 API 的模型。');
      if (message.model) preferences.models[message.action] = message.model;
      else delete preferences.models[message.action];
      await chrome.storage.local.set({ taskPreferences: preferences });
      const tabs = await chrome.tabs.query({});
      await Promise.allSettled(tabs.filter(tab => tab.id).map(tab => chrome.tabs.sendMessage(tab.id, { type: 'TASK_MODEL_CHANGED', action: message.action })));
      return { model: preferences.models[message.action] || config.model };
    });
    if (message.type === 'DISCOVER_MODELS' && sender.url?.startsWith(chrome.runtime.getURL(''))) return discoverModels(message);
    if (message.type === 'SETTINGS_CHANGED' && sender.url?.startsWith(chrome.runtime.getURL(''))) {
      resultCache.clear();
      modelCatalog = null;
      const config = publicSettings(await settings());
      const tabs = await chrome.tabs.query({});
      await Promise.allSettled(tabs.filter(tab => tab.id).map(tab => chrome.tabs.sendMessage(tab.id, { type: 'CONFIG_CHANGED', config })));
      return true;
    }
    throw new Error('不支持的操作。');
  };
  operation().then(data => respond({ ok: true, data })).catch(error => respond({ ok: false, error: error.message || '操作失败，请重试。' }));
  return true;
});

chrome.runtime.onConnect.addListener(port => {
  if (port.name !== 'writewise-translation' || port.sender?.id !== chrome.runtime.id) return;
  let controller;
  let disconnected = false;
  let started = false;
  const post = message => { if (!disconnected) { try { port.postMessage(message); } catch {} } };
  port.onDisconnect.addListener(() => { disconnected = true; controller?.abort(); });
  port.onMessage.addListener(message => {
    if (started || message.type !== 'TRANSLATE') return;
    started = true;
    write({ ...message, action: message.action === 'ask' ? 'ask' : 'translate' }, port.sender, data => post({ type: 'PROGRESS', data }), value => {
      controller = value;
      if (disconnected) value.abort();
    }).then(data => post({ type: 'DONE', data })).catch(error => post({ type: 'ERROR', error: error.message }));
  });
});
