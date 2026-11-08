(() => {
  if (globalThis.__writewiseLoaded) return;
  globalThis.__writewiseLoaded = true;
  let config = { configured: false, automatic: false, disabledSites: [] };
  let editor = null;
  let snapshot = null;
  let result = null;
  let undo = null;
  let busy = false;
  let revision = 0;
  let autoTimer;
  let applying = false;
  let composing = false;
  let badgePlacement = null;
  let badgePointer = null;
  let badgeSuppressClick = false;
  const lastChecks = new WeakMap();
  const host = document.createElement('div');
  host.id = 'writewise-assistant';
  host.style.cssText = 'all:initial;position:fixed;inset:0;z-index:2147483647;pointer-events:none;';
  const shadow = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = `
    :host{color-scheme:light dark}*{box-sizing:border-box}button,select,textarea{font:inherit}button{cursor:pointer;color:inherit}button:disabled{opacity:.5;cursor:wait}button:focus-visible,textarea:focus-visible,select:focus-visible{outline:2px solid #159b72;outline-offset:2px}
    .ww{--paper:#fff;--ink:#203c31;--muted:#748378;--line:#e4ebe6;--soft:#f3f7f4;--green:#147b59;--red:#a93939;font:13px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC",sans-serif;color:var(--ink)}
    .badge{pointer-events:auto;position:fixed;display:none;align-items:center;justify-content:center;gap:4px;min-width:32px;height:32px;border:2px solid white;border-radius:20px;background:#147b59;color:white;box-shadow:0 2px 10px #183e3333;font-weight:750;padding:0 8px;user-select:none}.badge span{font-size:10px}.panel{pointer-events:auto;position:fixed;right:20px;bottom:20px;width:min(388px,calc(100vw - 24px));max-height:calc(100vh - 32px);overflow:auto;background:var(--paper);border:1px solid var(--line);border-radius:17px;box-shadow:0 12px 60px #15392d30;text-align:left}.hidden{display:none!important}.header{padding:17px 18px 13px;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid var(--line)}.logo{display:flex;gap:9px;align-items:center;font-size:16px;font-weight:750}.mark{background:#147b59;color:white;border-radius:9px;padding:2px 8px}.header small{display:block;color:var(--muted);font-size:10px;letter-spacing:.6px;font-weight:400}.icon{border:0;background:transparent;font-size:19px;line-height:1;padding:6px;color:var(--muted)}.body{padding:15px 18px 18px}.toolbar{display:flex;gap:6px;flex-wrap:wrap;margin:0 0 12px}.tool,.button{border:1px solid var(--line);border-radius:8px;background:var(--paper);padding:7px 10px;font-size:12px}.tool:hover,.button:hover{border-color:var(--green);background:var(--soft)}.tool.active{background:var(--soft);color:var(--green);border-color:var(--green)}.status{font-size:12px;color:var(--muted);white-space:pre-wrap;margin:10px 0;overflow-wrap:anywhere}.error{color:var(--red)}.issue{padding:12px 0;border-bottom:1px solid var(--line)}.meta{display:flex;align-items:center;justify-content:space-between;font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.5px}.change{font-size:13px;overflow-wrap:anywhere;margin:7px 0}.old{color:var(--red);text-decoration:line-through;background:#a939390c}.new{color:var(--green);background:#147b5910}.reason{color:var(--muted);font-size:12px;margin:5px 0 10px}.issue-actions{display:flex;gap:6px}.issue-actions button{padding:4px 9px}.preview{white-space:pre-wrap;overflow-wrap:anywhere;max-height:200px;overflow:auto;background:var(--soft);border-radius:9px;padding:12px;margin:12px 0;font-size:13px}.preview:empty{display:none}.footer{display:flex;gap:7px;flex-wrap:wrap;margin-top:13px}.primary{background:var(--green);border-color:var(--green);color:var(--paper)}.primary:hover{background:var(--green);color:var(--paper);filter:brightness(.93)}.note{font-size:10px;color:var(--muted);margin-top:14px;line-height:1.7}.instruction{width:100%;border:1px solid var(--line);border-radius:8px;background:var(--paper);color:var(--ink);padding:8px 10px;min-height:60px;resize:vertical;margin-bottom:7px;font-size:12px}.count{border:1px solid var(--line);padding:1px 6px;border-radius:10px;color:var(--green)}
    @media(prefers-color-scheme:dark){.ww{--paper:#192820;--ink:#e7f0e9;--muted:#a0b4a5;--line:#354b3c;--soft:#243a2b;--green:#81dbad;--red:#ffadad}.badge{border-color:#334f3e}.primary{color:#163323}}
  `;
  shadow.append(style);
  const badgeStyle = document.createElement('style');
  badgeStyle.textContent = '.badge{touch-action:none;cursor:grab}.badge:active{cursor:grabbing}';
  shadow.append(badgeStyle);
  const ui = document.createElement('div');
  ui.className = 'ww';
  ui.innerHTML = `<button class="badge" title="WriteWise · 检查写作" aria-label="打开 WriteWise 写作助手">W<span></span></button>
    <section class="panel hidden" aria-label="WriteWise 写作助手" role="dialog">
      <div class="header"><div class="logo"><span class="mark">W</span><div>WriteWise<small>A LITTLE HELP. ALL YOUR VOICE.</small></div></div><div><button class="icon settings" title="设置" aria-label="打开设置">⚙</button><button class="icon close" title="关闭" aria-label="关闭面板">×</button></div></div>
      <div class="body"><div class="toolbar"></div><textarea class="instruction" maxlength="2000" placeholder="补充要求（可选），例如：语气更友好" aria-label="补充写作要求"></textarea><button class="button primary run">检查当前文字</button><div class="status" role="status" aria-live="polite">点击检查，文字会发送给你配置的 AI 服务。</div><div class="issues"></div><div class="preview hidden"></div><div class="footer hidden"><button class="button primary apply">应用全文</button><button class="button copy">复制结果</button><button class="button undo hidden">撤销</button></div><div class="note">只发送当前输入框 / 选中文字。替换前会核对原文，避免覆盖你新输入的内容。</div></div>
    </section>`;
  shadow.append(ui);
  document.documentElement.append(host);
  const $ = selector => shadow.querySelector(selector);
  const badge = $('.badge');
  const panel = $('.panel');
  const panelModelSlot = document.createElement('div');
  $('.toolbar').after(panelModelSlot);
  const panelModels = new globalThis.WriteWiseModelPicker({ container: panelModelSlot, action: 'check' });
  const inline = new globalThis.WriteWiseInline({ shadow, container: ui, read, rangeFor, accept: acceptIssue, dismiss: dismissIssue });
  const selectionTools = new globalThis.WriteWiseSelection({ shadow, container: ui, host,
    enabled: () => !paused(), read, findEditor,
    capture: element => { focusEditor(element); return capture(true); },
    rectsFor: selected => {
      inline.prepareMirror(selected.element, selected.full);
      return Array.from(inline.mirrorRange(selected.element, selected.start, selected.end).getClientRects());
    },
    apply: (selected, text) => {
      if (!selected.element?.isConnected || read(selected.element) !== selected.full) return false;
      focusEditor(selected.element);
      snapshot = selected;
      if (!replace(selected.start, selected.end, text)) return false;
      invalidate();
      return true;
    }
  });
  const actions = [['check', '语法检查'], ['rewrite', '润色'], ['concise', '精简'], ['tone', '调整语气'], ['translate', '翻译']];
  let action = 'check';
  for (const [value, label] of actions) {
    const button = document.createElement('button');
    button.className = `tool${value === action ? ' active' : ''}`;
    button.textContent = label;
    button.dataset.action = value;
    button.addEventListener('click', () => {
      action = value;
      panelModels.setAction(value);
      shadow.querySelectorAll('.tool').forEach(tool => tool.classList.toggle('active', tool === button));
      $('.run').textContent = label;
    });
    $('.toolbar').append(button);
  }

  function paused() { return config.disabledSites.includes(location.hostname); }

  function isEditor(element) {
    if (!(element instanceof HTMLElement) || element.closest('[data-writewise-ignore], [data-sensitive], [data-private], [aria-hidden="true"]')) return false;
    if (element instanceof HTMLTextAreaElement || element instanceof HTMLInputElement) {
      const sensitive = /password|cc-|credit|one-time|transaction|current-password|new-password/i.test(element.autocomplete || '');
      return !sensitive && !element.disabled && !element.readOnly && (element instanceof HTMLTextAreaElement || ['text', 'search', 'url', 'email', ''].includes(element.type));
    }
    return element.isContentEditable && element.getAttribute('contenteditable') !== 'false';
  }

  function findEditor(target) {
    if (!(target instanceof Element)) return null;
    const candidate = target.closest('textarea,input,[contenteditable]');
    if (!candidate || !isEditor(candidate)) return null;
    if (candidate.isContentEditable) {
      let root = candidate;
      while (root.parentElement?.isContentEditable) root = root.parentElement;
      return root;
    }
    return candidate;
  }

  function richMap(element) {
    let text = '';
    const segments = [];
    const blocks = new Set(['DIV', 'P', 'LI', 'BLOCKQUOTE', 'PRE', 'H1', 'H2', 'H3', 'H4']);
    function visit(node) {
      if (node.nodeType === Node.TEXT_NODE) {
        segments.push({ node, start: text.length, end: text.length + node.data.length });
        text += node.data;
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        if (['SCRIPT', 'STYLE'].includes(node.tagName) || node.getAttribute('contenteditable') === 'false') return;
        if (node.tagName === 'BR') { text += '\n'; return; }
        const block = node !== element && blocks.has(node.tagName);
        if (block && text && !text.endsWith('\n')) text += '\n';
        for (const child of node.childNodes) visit(child);
        if (block && !text.endsWith('\n')) text += '\n';
      }
    }
    visit(element);
    return { text, segments };
  }

  function read(element) {
    return element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement ? element.value : richMap(element).text;
  }

  function rangeFor(element, start, end) {
    const { segments } = richMap(element);
    if (start === end) {
      const segment = segments.find(item => start > item.start && start <= item.end) || segments.find(item => start === item.start);
      if (!segment) return null;
      const range = document.createRange();
      range.setStart(segment.node, start - segment.start);
      range.collapse(true);
      return range;
    }
    const first = segments.find(segment => start >= segment.start && start < segment.end);
    const last = [...segments].reverse().find(segment => end > segment.start && end <= segment.end);
    if (!first || !last) return null;
    const range = document.createRange();
    range.setStart(first.node, start - first.start);
    range.setEnd(last.node, end - last.start);
    return range;
  }

  function position() {
    if (!editor?.isConnected || paused()) { badge.style.display = 'none'; return; }
    const box = editor.getBoundingClientRect();
    if (box.width < 35 || box.height < 20) { badge.style.display = 'none'; return; }
    if (!badgePlacement && (box.bottom < 0 || box.top > innerHeight)) { badge.style.display = 'none'; return; }
    badge.style.display = 'flex';
    const badgeBox = badge.getBoundingClientRect();
    const width = badgeBox.width || 44;
    const height = badgeBox.height || 32;
    const left = badgePlacement?.left ?? box.right - width - 6;
    const top = badgePlacement?.top ?? box.bottom - height - 5;
    badge.style.left = `${Math.max(4, Math.min(innerWidth - width - 4, left))}px`;
    badge.style.top = `${Math.max(4, Math.min(innerHeight - height - 4, top))}px`;
  }

  function report(message, error = false) {
    $('.status').textContent = message;
    $('.status').classList.toggle('error', error);
  }

  function invalidate() {
    inline.clear();
    revision++;
    result = null;
    snapshot = null;
    $('.issues').replaceChildren();
    $('.preview').classList.add('hidden');
    $('.footer').classList.add('hidden');
    badge.querySelector('span').textContent = '';
  }

  function focusEditor(element) {
    if (element !== editor) {
      invalidate();
      undo = null;
      editor = element;
      badgePlacement = null;
      report('点击检查，文字会发送给你配置的 AI 服务。');
    }
    position();
    scheduleCheck(element);
  }

  function richSelection(element) {
    const selection = window.getSelection();
    if (!selection?.rangeCount || selection.isCollapsed || !element.contains(selection.anchorNode) || !element.contains(selection.focusNode)) return null;
    const range = selection.getRangeAt(0);
    const { text: full, segments } = richMap(element);
    function offset(node, nodeOffset) {
      const segment = segments.find(item => item.node === node);
      if (segment) return segment.start + nodeOffset;
      if (node.nodeType !== Node.ELEMENT_NODE) return null;
      const child = node.childNodes[nodeOffset];
      if (child) {
        const following = segments.find(item => child === item.node || child.contains?.(item.node));
        if (following) return following.start;
      }
      const contained = segments.filter(item => node.contains(item.node));
      return contained.length ? contained.at(-1).end : node === element ? full.length : null;
    }
    const start = offset(range.startContainer, range.startOffset);
    const end = offset(range.endContainer, range.endOffset);
    return start !== null && end !== null && start < end ? { element, full, text: full.slice(start, end), start, end } : null;
  }

  function capture(selectionOnly = false) {
    if (editor?.isConnected && isEditor(editor)) {
      const full = read(editor);
      if (editor instanceof HTMLInputElement || editor instanceof HTMLTextAreaElement) {
        const start = editor.selectionStart;
        const end = editor.selectionEnd;
        if (start !== null && end !== null && start < end) return { element: editor, full, text: full.slice(start, end), start, end };
      } else {
        const selected = richSelection(editor);
        if (selected) return selected;
      }
      if (!selectionOnly) return { element: editor, full, text: full, start: 0, end: full.length };
    }
    const text = window.getSelection()?.toString() || '';
    return text ? { element: null, full: text, text, start: 0, end: text.length } : null;
  }

  function show() {
    if (paused()) return;
    panel.classList.remove('hidden');
    if (!config.configured) report('先打开设置，填写 API Key、模型 ID 和 API 地址。');
  }

  async function run(automatic = false, providedSnapshot = null) {
    if (busy || paused()) return;
    const captured = providedSnapshot || capture();
    if (!captured?.text.trim()) { show(); report('请先点击输入框并输入文字，或选中文字后使用右键菜单。', true); return; }
    if (captured.text.length > 16000) { if (!automatic) { show(); report('单次最多 16,000 个字符，请选中较短的段落。', true); } return; }
    if (!config.configured) { if (!automatic) { show(); report('请先在设置中填写 API Key 和模型 ID。', true); } return; }
    if (!automatic) show();
    const token = ++revision;
    snapshot = captured;
    inline.clear();
    busy = true;
    $('.run').disabled = true;
    $('.apply').disabled = true;
    $('.issues').replaceChildren();
    $('.footer').classList.add('hidden');
    $('.preview').classList.add('hidden');
    badge.querySelector('span').textContent = '…';
    report('正在分析文字…');
    try {
      const response = await chrome.runtime.sendMessage({ type: 'WRITE', action: automatic ? 'check' : action, automatic, text: captured.text, instruction: automatic ? '' : $('.instruction').value });
      if (revision !== token) return;
      if (!response?.ok) throw new Error(response?.error || '扩展连接失败，请刷新网页。');
      if (captured.element && (!captured.element.isConnected || read(captured.element) !== captured.full)) throw new Error('原文已变化，请重新检查。');
      result = response.data;
      render();
      report(`${$('.status').textContent}\n${result.cached ? '已复用近期结果' : `API 用时 ${(result.apiMs / 1000).toFixed(1)} 秒`}${automatic && captured.text.length < captured.full.length ? ' · 已检查光标附近内容；全文可手动检查' : ''}`);
    } catch (error) {
      if (revision !== token) return;
      result = null;
      report(error.message, true);
      badge.querySelector('span').textContent = '!';
    } finally {
      busy = false;
      $('.run').disabled = false;
      $('.apply').disabled = false;
      if (editor?.isConnected && read(editor) !== captured.full && config.automatic) scheduleCheck(editor);
    }
  }

  function render() {
    $('.issues').replaceChildren();
    const changed = result.correctedText !== snapshot.text;
    report(result.summary);
    badge.querySelector('span').textContent = result.issues.length ? String(result.issues.length) : changed ? '•' : '✓';
    for (const issue of result.issues) {
      const card = document.createElement('div');
      card.className = 'issue';
      const meta = document.createElement('div');
      meta.className = 'meta';
      meta.textContent = ({ grammar: '语法', spelling: '拼写', punctuation: '标点', clarity: '清晰度', tone: '语气' })[issue.category] || '表达建议';
      const change = document.createElement('div');
      change.className = 'change';
      const old = document.createElement('span');
      old.className = 'old'; old.textContent = issue.original;
      const replacement = document.createElement('span');
      replacement.className = 'new'; replacement.textContent = issue.replacement || '（删除）';
      change.append(old, document.createTextNode(' → '), replacement);
      const reason = document.createElement('div');
      reason.className = 'reason'; reason.textContent = issue.explanation;
      const buttons = document.createElement('div'); buttons.className = 'issue-actions';
      const accept = document.createElement('button'); accept.className = 'button'; accept.textContent = '接受';
      accept.disabled = !snapshot.element;
      accept.addEventListener('click', () => acceptIssue(issue));
      const dismiss = document.createElement('button'); dismiss.className = 'button'; dismiss.textContent = '忽略';
      dismiss.addEventListener('click', () => dismissIssue(issue));
      buttons.append(accept, dismiss);
      card.append(meta, change, reason, buttons);
      $('.issues').append(card);
    }
    $('.preview').textContent = result.correctedText;
    $('.preview').classList.toggle('hidden', !changed);
    $('.footer').classList.remove('hidden');
    $('.copy').classList.remove('hidden');
    $('.apply').classList.toggle('hidden', !snapshot.element || !changed);
    const rich = snapshot.element?.isContentEditable && snapshot.element.querySelector('*');
    $('.apply').textContent = rich ? '替换所选范围（纯文本）' : '应用修改';
    $('.undo').classList.toggle('hidden', !undo);
    if (rich && changed) report(`${result.summary}\n提示：全文替换会将目标范围转为纯文本。保留格式可逐条接受，或复制后自行粘贴。`);
    inline.render(snapshot, result.issues);
  }

  function acceptIssue(issue) {
    if (!snapshot || !result || !result.issues.includes(issue)) return false;
    const offset = snapshot.text.indexOf(issue.original);
    if (offset < 0) { report('建议已失效，请重新检查。', true); return false; }
    const nextText = snapshot.text.slice(0, offset) + issue.replacement + snapshot.text.slice(offset + issue.original.length);
    const finalText = result.correctedText;
    const remaining = result.issues.filter(item => item !== issue && !item.original.includes(issue.original) && !issue.original.includes(item.original));
    if (!replace(snapshot.start + offset, snapshot.start + offset + issue.original.length, issue.replacement)) return false;
    snapshot = { ...snapshot, full: read(snapshot.element), text: nextText, end: snapshot.start + nextText.length };
    result = { ...result, correctedText: finalText, issues: remaining.filter(item => nextText.indexOf(item.original) >= 0 && nextText.indexOf(item.original) === nextText.lastIndexOf(item.original)) };
    lastChecks.set(snapshot.element, { time: lastChecks.get(snapshot.element)?.time || 0, text: snapshot.full });
    render();
    return true;
  }

  function dismissIssue(issue) {
    if (!result) return;
    result.issues = result.issues.filter(item => item !== issue);
    render();
    report('已忽略此条建议。全文预览仍是模型原始结果；只接受想要的单条修改可保留你的选择。');
  }

  function replace(start, end, text) {
    const element = snapshot.element;
    if (!element?.isConnected || !isEditor(element) || read(element) !== snapshot.full) { report('原文已变化，已阻止覆盖。请重新检查。', true); return false; }
    const before = read(element);
    if (element.isContentEditable && !(start === 0 && end === before.length)) {
      const original = before.slice(start, end);
      let prefix = 0;
      while (prefix < original.length && prefix < text.length && original[prefix] === text[prefix]) prefix++;
      let suffix = 0;
      while (suffix < original.length - prefix && suffix < text.length - prefix && original[original.length - 1 - suffix] === text[text.length - 1 - suffix]) suffix++;
      start += prefix;
      end -= suffix;
      text = text.slice(prefix, text.length - suffix);
    }
    const previous = before.slice(start, end);
    element.focus({ preventScroll: true });
    const event = new InputEvent('beforeinput', { bubbles: true, cancelable: true, inputType: 'insertReplacementText', data: text });
    if (!element.dispatchEvent(event)) { report('编辑器拦截了替换，请复制结果自行粘贴。', true); return false; }
    let nativeInput = false;
    const trackInput = () => { nativeInput = true; };
    element.addEventListener('input', trackInput);
    applying = true;
    if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
      const next = before.slice(0, start) + text + before.slice(end);
      const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(prototype, 'value').set.call(element, next);
      try { element.setSelectionRange(start + text.length, start + text.length); } catch {}
    } else {
      const range = start === 0 && end === before.length ? document.createRange() : rangeFor(element, start, end);
      if (!range) { applying = false; element.removeEventListener('input', trackInput); report('此富文本区域无法安全定位，请复制后自行粘贴。', true); return false; }
      if (start === 0 && end === before.length) range.selectNodeContents(element);
      const selection = window.getSelection();
      selection.removeAllRanges(); selection.addRange(range);
      const succeeded = document.execCommand('insertText', false, text);
      if (!succeeded) { applying = false; element.removeEventListener('input', trackInput); report('编辑器不支持安全替换，请复制结果自行粘贴。', true); return false; }
    }
    element.removeEventListener('input', trackInput);
    if (!nativeInput) element.dispatchEvent(new InputEvent('input', { bubbles: true, composed: true, inputType: 'insertReplacementText', data: text }));
    applying = false;
    undo = { element, after: read(element), start, inserted: text, previous };
    $('.undo').classList.remove('hidden');
    return true;
  }

  $('.run').addEventListener('click', () => run());
  $('.apply').addEventListener('click', () => {
    if (!snapshot || !result) return;
    if (replace(snapshot.start, snapshot.end, result.correctedText)) {
      const savedUndo = undo;
      invalidate();
      undo = savedUndo;
      $('.footer').classList.remove('hidden');
      $('.apply').classList.add('hidden');
      $('.copy').classList.add('hidden');
      $('.undo').classList.remove('hidden');
      report('已应用修改。可撤销刚才这次替换。');
    }
  });
  $('.undo').addEventListener('click', () => {
    if (!undo?.element.isConnected || read(undo.element) !== undo.after) { report('内容已变化，无法安全撤销。请使用编辑器自己的撤销。', true); return; }
    const saved = undo;
    snapshot = { element: saved.element, full: saved.after };
    if (replace(saved.start, saved.start + saved.inserted.length, saved.previous)) {
      undo = null;
      invalidate();
      report('已撤销本次修改，请重新检查。');
    }
  });
  $('.copy').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(result.correctedText); report('结果已复制。'); }
    catch { report('无法自动复制，请选中预览文字后手动复制。', true); }
  });
  $('.settings').addEventListener('click', () => chrome.runtime.sendMessage({ type: 'OPEN_OPTIONS' }).catch(() => report('请点击工具栏的插件图标打开设置。')));
  $('.close').addEventListener('click', () => panel.classList.add('hidden'));
  badge.addEventListener('pointerdown', event => {
    if (event.button !== 0) return;
    event.preventDefault();
  });
  window.addEventListener('pointerdown', event => {
    const box = badge.getBoundingClientRect();
    const inside = event.composedPath().includes(badge) || (event.clientX >= box.left && event.clientX <= box.right && event.clientY >= box.top && event.clientY <= box.bottom);
    if (!inside || event.button !== 0 || badgePointer) return;
    badgePointer = { id: event.pointerId, x: event.clientX, y: event.clientY, left: box.left, top: box.top, moved: false };
  }, true);
  const moveBadge = event => {
    if (!badgePointer || event.pointerId !== badgePointer.id) return;
    const dx = event.clientX - badgePointer.x;
    const dy = event.clientY - badgePointer.y;
    if (!badgePointer.moved && Math.hypot(dx, dy) < 4) return;
    badgePointer.moved = true;
    const box = badge.getBoundingClientRect();
    badgePlacement = {
      left: Math.max(4, Math.min(innerWidth - box.width - 4, badgePointer.left + dx)),
      top: Math.max(4, Math.min(innerHeight - box.height - 4, badgePointer.top + dy))
    };
    position();
  };
  const finishBadgePointer = event => {
    if (!badgePointer || event.pointerId !== badgePointer.id) return;
    badgeSuppressClick = badgePointer.moved;
    badgePointer = null;
    if (badge.hasPointerCapture(event.pointerId)) badge.releasePointerCapture(event.pointerId);
  };
  window.addEventListener('pointermove', moveBadge, true);
  window.addEventListener('pointerup', finishBadgePointer, true);
  window.addEventListener('pointercancel', finishBadgePointer, true);
  badge.addEventListener('click', () => {
    if (badgeSuppressClick) { badgeSuppressClick = false; return; }
    show(); if (!result) run();
  });
  shadow.addEventListener('pointerdown', event => {
    if (event.target instanceof HTMLButtonElement) event.preventDefault();
  });
  for (const type of ['keydown', 'keypress', 'keyup', 'beforeinput', 'input', 'compositionstart', 'compositionupdate', 'compositionend', 'copy', 'cut', 'paste']) {
    shadow.addEventListener(type, event => event.stopPropagation());
  }
  document.addEventListener('focusin', event => {
    if (event.composedPath().includes(host)) return;
    const target = findEditor(event.target);
    if (target) focusEditor(target);
    else { inline.clear(); clearTimeout(autoTimer); editor = null; badge.style.display = 'none'; }
  }, true);
  function scheduleCheck(target) {
    position();
    clearTimeout(autoTimer);
    if (!config.automatic || !config.configured || paused()) return;
    autoTimer = setTimeout(async () => {
      if (!target.isConnected || target !== editor || !config.automatic || paused() || composing) return;
      if (busy) { scheduleCheck(target); return; }
      const full = read(target);
      const caret = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement ? target.selectionStart || 0 : richCaret(target);
      const scope = globalThis.WriteWiseText.checkWindow(full, caret);
      const text = scope.text;
      const last = lastChecks.get(target);
      if (text.trim().length < 3 || text.length > 16000) return;
      if (last?.text === full && snapshot?.element === target && snapshot.full === full && result) { inline.render(snapshot, result.issues); return; }
      const elapsed = Date.now() - (last?.time || 0);
      if (elapsed < 1800) { autoTimer = setTimeout(() => scheduleCheck(target), 1800 - elapsed); return; }
      lastChecks.set(target, { time: Date.now(), text: full });
      await run(true, { element: target, full, ...scope });
    }, 650);
  }
  function richCaret(target) {
    const selection = window.getSelection();
    const segment = richMap(target).segments.find(item => item.node === selection?.focusNode);
    return segment ? segment.start + selection.focusOffset : 0;
  }
  document.addEventListener('input', event => {
    if (event.composedPath().includes(host)) return;
    const target = findEditor(event.target);
    if (!target || target !== editor || applying) return;
    inline.clear();
    clearTimeout(autoTimer);
    if (event.isComposing) return;
    scheduleCheck(target);
  }, true);
  document.addEventListener('compositionstart', event => {
    if (event.composedPath().includes(host)) return;
    composing = true; clearTimeout(autoTimer); inline.clear();
  }, true);
  document.addEventListener('compositionend', event => {
    if (event.composedPath().includes(host)) return;
    composing = false;
    const target = findEditor(event.target);
    if (target && target === editor) scheduleCheck(target);
  }, true);
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') panel.classList.add('hidden');
  }, true);
  let scheduled = false;
  const schedulePosition = () => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => { scheduled = false; position(); });
  };
  window.addEventListener('scroll', schedulePosition, true);
  window.addEventListener('resize', schedulePosition);
  chrome.runtime.onMessage.addListener((message, sender, respond) => {
    if (sender.id !== chrome.runtime.id) return;
    if (message.type === 'TASK_MODEL_CHANGED') {
      panelModels.sync();
      selectionTools.modelPicker.sync();
      if (message.action === 'check' && editor) { lastChecks.delete(editor); scheduleCheck(editor); }
    }
    if (message.type === 'CONFIG_CHANGED') {
      config = message.config;
      panelModels.sync();
      selectionTools.modelPicker.sync();
      selectionTools.hide();
      clearTimeout(autoTimer);
      if (paused()) { invalidate(); panel.classList.add('hidden'); }
      if (!config.automatic) inline.clear();
      position();
      if (editor && config.automatic && !paused()) scheduleCheck(editor);
    }
    if (message.type === 'OPEN_SELECTION') {
      const selection = window.getSelection();
      const selectedEditor = findEditor(selection?.anchorNode?.parentElement);
      if (selectedEditor) focusEditor(selectedEditor);
      const captured = capture(true);
      show(); run(false, captured);
    }
    if (message.type === 'TRANSLATE_SELECTION') { selectionTools.update(); selectionTools.translate(); }
    if (message.type === 'CHECK_FOCUSED') {
      if (document.hasFocus() || editor) { show(); run(); }
    }
    if (message.type === 'OPEN_PANEL') {
      show();
      if (!editor) report('请先点击网页上的输入框，或在插件弹窗中打开独立写作台。');
    }
    respond({ ok: true });
  });
  chrome.runtime.sendMessage({ type: 'GET_PUBLIC_SETTINGS' }).then(response => {
    if (response?.ok) config = response.data;
    const focused = findEditor(document.activeElement);
    if (focused) focusEditor(focused);
  }).catch(() => {});
})();
