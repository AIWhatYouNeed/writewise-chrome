(() => {
  class WriteWiseSelection {
    constructor({ shadow, container, host, enabled, read, findEditor, capture, rectsFor, apply }) {
      Object.assign(this, { host, enabled, read, findEditor, capture, rectsFor, apply });
      this.version = 0;
      this.toolbar = document.createElement('div');
      this.toolbar.className = 'selection-toolbar hidden';
      this.toolbar.setAttribute('role', 'toolbar');
      this.toolbar.setAttribute('aria-label', '选中文字操作');
      this.toolbar.innerHTML = '<span class="selection-logo selection-drag" role="button" tabindex="0" aria-label="拖动工具条，方向键移动" title="拖动工具条 · 方向键也可移动">⠿</span><button class="selection-original-copy" title="复制选中文字">复制</button><button class="selection-translate" title="翻译选中文字">翻译</button><select class="selection-language" aria-label="翻译目标语言"></select><button class="selection-ask" title="针对所选文字提问">问 AI</button><button class="selection-close" aria-label="关闭选区工具条">×</button><span class="selection-toast" role="status" aria-live="polite"></span>';
      this.card = document.createElement('section');
      this.card.className = 'selection-card hidden';
      this.card.setAttribute('role', 'dialog');
      this.card.setAttribute('aria-label', '选区翻译结果');
      this.card.innerHTML = '<div class="selection-header"><strong>选区翻译</strong><button class="selection-close" aria-label="关闭结果">×</button></div><div class="selection-ask-form hidden"><textarea class="selection-question" rows="2" maxlength="2000" aria-label="对选中文字提问" placeholder="例如：解释这段话、总结重点，或帮我改写…"></textarea><div class="selection-quick"><button type="button" data-question="解释这段文字，包括术语的含义。">解释</button><button type="button" data-question="简洁总结这段文字的重点。">总结</button><button type="button" data-question="保持原意和语言，把这段文字改写得更清晰。">改写</button><button type="button" class="selection-ask-send">发送 ↗</button></div></div><p class="selection-status" role="status" aria-live="polite"></p><div class="selection-result" tabindex="0"></div><div class="selection-actions"><button class="button selection-copy" disabled>复制译文</button><button class="button primary selection-apply" disabled>替换选中文字</button></div>';
      container.append(this.toolbar, this.card);
      const modelSlot = document.createElement('div');
      modelSlot.className = 'selection-model-slot';
      this.card.querySelector('.selection-status').before(modelSlot);
      this.modelPicker = new globalThis.WriteWiseModelPicker({ container: modelSlot, action: 'translate', changed: () => {
        if (this.selected && !this.card.classList.contains('hidden')) {
          if (this.mode === 'ask') { if (this.lastQuestion) this.ask(this.lastQuestion); }
          else this.translate();
        }
      } });
      this.cardResize = new ResizeObserver(() => {
        if (!this.card.classList.contains('hidden')) this.place(this.card, this.toolbar.getBoundingClientRect());
      });
      this.cardResize.observe(this.card);
      const style = document.createElement('style');
      style.textContent = '.selection-toolbar,.selection-card{pointer-events:auto;position:fixed;z-index:4;background:var(--paper);color:var(--ink);border:1px solid var(--line);box-shadow:0 5px 25px #183b2825}.selection-toolbar{display:flex;align-items:center;gap:4px;max-width:calc(100vw - 24px);border-radius:10px;padding:5px 8px}.selection-toolbar button,.selection-toolbar select,.selection-close{background:transparent;color:var(--ink);border:0;border-radius:5px;padding:5px 7px;font-size:12px}.selection-toolbar button:hover{background:var(--soft)}.selection-toolbar select{width:auto;max-width:112px;border-left:1px solid var(--line)}.selection-logo{color:var(--green);font-size:17px;font-weight:800;padding:0 5px}.selection-card{width:min(440px,calc(100vw - 24px));max-height:calc(100vh - 24px);overflow:auto;border-radius:12px;padding:16px 18px}.selection-header{display:flex;justify-content:space-between;align-items:center}.selection-close{cursor:pointer}.selection-status{font-size:12px;line-height:1.7;color:var(--muted);margin:9px 0}.selection-result{white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.9;font-size:15px;max-height:330px;overflow:auto}.selection-result:empty{display:none}.selection-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px}';
      shadow.append(style);
      const extras = document.createElement('style');
      extras.textContent = '.selection-toolbar{flex-wrap:wrap;gap:2px}.selection-toolbar select{max-width:94px}.selection-drag{touch-action:none;cursor:grab;user-select:none;font-size:21px;font-weight:400}.selection-drag:active{cursor:grabbing}.selection-toast{font-size:11px;color:var(--green);white-space:nowrap}.selection-toast:empty{display:none}.selection-ask-form{margin:12px 0}.selection-question{box-sizing:border-box;width:100%;padding:9px 10px;border:1px solid var(--line);border-radius:8px;background:var(--paper);color:var(--ink);resize:vertical;font:inherit;line-height:1.6}.selection-quick{display:flex;gap:6px;flex-wrap:wrap;margin-top:7px}.selection-quick button{border:1px solid var(--line);border-radius:6px;background:var(--paper);color:var(--ink);font:inherit;padding:5px 9px}.selection-quick .selection-ask-send{margin-left:auto;color:var(--green)}';
      shadow.append(extras);
      const layering = document.createElement('style');
      layering.textContent = '.selection-toolbar{z-index:7;width:max-content}.selection-card{z-index:4}';
      shadow.append(layering);
      this.mode = 'translate';
      this.toolbar.querySelector('.selection-original-copy').addEventListener('click', async () => {
        if (!this.selected) return;
        const toast = this.toolbar.querySelector('.selection-toast');
        try { await this.copyText(this.selected.text); toast.textContent = '已复制'; }
        catch { toast.textContent = '复制失败，请用快捷键'; }
        clearTimeout(this.toastTimer);
        this.toastTimer = setTimeout(() => { toast.textContent = ''; }, 1800);
        this.clampToolbar();
      });
      this.toolbar.querySelector('.selection-ask').addEventListener('click', () => this.openAsk());
      this.card.querySelector('.selection-ask-send').addEventListener('click', () => this.ask());
      for (const button of this.card.querySelectorAll('[data-question]')) button.addEventListener('click', () => {
        this.card.querySelector('.selection-question').value = button.dataset.question;
        this.ask();
      });
      this.card.querySelector('.selection-question').addEventListener('keydown', event => {
        if (event.isComposing || event.keyCode === 229) return;
        if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') { event.preventDefault(); this.ask(); }
      });
      const handle = this.toolbar.querySelector('.selection-drag');
      handle.addEventListener('pointerdown', event => {
        if (event.button !== 0) return;
        event.preventDefault();
        clearTimeout(this.timer);
        const box = this.toolbar.getBoundingClientRect();
        this.drag = { id: event.pointerId, x: event.clientX, y: event.clientY, left: box.left, top: box.top };
        handle.setPointerCapture(event.pointerId);
      });
      handle.addEventListener('pointermove', event => {
        if (!this.drag || event.pointerId !== this.drag.id) return;
        this.toolbar.style.left = `${this.drag.left + event.clientX - this.drag.x}px`;
        this.toolbar.style.top = `${this.drag.top + event.clientY - this.drag.y}px`;
        this.manuallyPositioned = true;
        this.clampToolbar();
      });
      const finishDrag = event => {
        if (!this.drag || event.pointerId !== this.drag.id) return;
        this.drag = null;
        if (handle.hasPointerCapture(event.pointerId)) handle.releasePointerCapture(event.pointerId);
      };
      handle.addEventListener('pointerup', finishDrag);
      handle.addEventListener('pointercancel', finishDrag);
      handle.addEventListener('lostpointercapture', () => { this.drag = null; });
      handle.addEventListener('keydown', event => {
        const delta = { ArrowLeft: [-12, 0], ArrowRight: [12, 0], ArrowUp: [0, -12], ArrowDown: [0, 12] }[event.key];
        if (!delta) return;
        event.preventDefault();
        const box = this.toolbar.getBoundingClientRect();
        this.toolbar.style.left = `${box.left + delta[0]}px`;
        this.toolbar.style.top = `${box.top + delta[1]}px`;
        this.manuallyPositioned = true;
        this.clampToolbar();
      });
      this.languages = this.toolbar.querySelector('select');
      for (const language of ['简体中文', 'English', '繁體中文', '日本語', '한국어', 'Français', 'Deutsch', 'Español']) this.languages.add(new Option(language, language));
      this.toolbar.querySelector('.selection-translate').addEventListener('click', () => this.translate());
      this.languages.addEventListener('change', () => { if (this.mode === 'translate' && !this.card.classList.contains('hidden')) this.translate(); });
      for (const close of [...this.toolbar.querySelectorAll('.selection-close'), ...this.card.querySelectorAll('.selection-close')]) close.addEventListener('click', () => this.hide());
      this.card.querySelector('.selection-copy').addEventListener('click', async () => {
        try { await this.copyText(this.output); this.status(this.mode === 'ask' ? '回答已复制。' : '译文已复制。'); }
        catch { this.status('复制失败，请选中译文后手动复制。'); }
      });
      this.card.querySelector('.selection-apply').addEventListener('click', () => {
        if (this.selected && this.output && this.apply(this.selected, this.output)) this.hide();
        else this.status('原文已变化，已阻止覆盖。请重新选择文字。');
      });
      const schedule = () => {
        clearTimeout(this.timer);
        this.timer = setTimeout(() => this.update(), 100);
      };
      document.addEventListener('selectionchange', schedule);
      document.addEventListener('pointerup', event => {
        if (event.composedPath().includes(host)) return;
        this.pointerAnchor = { left: event.clientX, top: event.clientY, bottom: event.clientY };
        this.pointerSelection = null;
        schedule();
      });
      document.addEventListener('keyup', event => { if (event.key.startsWith('Arrow') && event.shiftKey) schedule(); });
      document.addEventListener('keydown', event => {
        if (event.isComposing || event.keyCode === 229) return;
        if (!event.composedPath().includes(host)) this.pointerAnchor = null;
        if (event.key === 'Escape') this.hide();
      }, true);
      document.addEventListener('input', event => {
        if (event.composedPath().includes(host)) return;
        if (this.selected?.element && (event.target === this.selected.element || this.selected.element.contains(event.target))) this.hide();
      }, true);
      document.addEventListener('pointerdown', event => {
        if (event.composedPath().includes(host)) return;
        this.hide();
      }, true);
      document.addEventListener('scroll', event => {
        if (event.composedPath().includes(this.host)) return;
        if (!this.toolbar.classList.contains('hidden')) this.clampToolbar();
      }, true);
      window.addEventListener('resize', () => this.hide());
    }

    status(message) { this.card.querySelector('.selection-status').textContent = message; }

    hide() {
      this.version++;
      this.port?.disconnect();
      this.port = null;
      clearTimeout(this.timer);
      this.toolbar.classList.add('hidden');
      this.card.classList.add('hidden');
      this.modelPicker.menu.classList.add('hidden');
      this.selected = null;
      this.drag = null;
      this.manuallyPositioned = false;
      this.lastQuestion = '';
      this.toolbar.querySelector('.selection-toast').textContent = '';
      this.pointerAnchor = null;
      this.pointerSelection = null;
      this.output = '';
    }

    place(element, rect) {
      const box = element.getBoundingClientRect();
      element.style.left = `${Math.max(12, Math.min(innerWidth - box.width - 12, rect.left))}px`;
      const top = rect.bottom + box.height + 19 <= innerHeight ? rect.bottom + 7 : rect.top - box.height - 7;
      element.style.top = `${Math.max(12, Math.min(innerHeight - box.height - 12, top))}px`;
    }

    clampToolbar() {
      const box = this.toolbar.getBoundingClientRect();
      this.toolbar.style.left = `${Math.max(12, Math.min(innerWidth - box.width - 12, box.left))}px`;
      this.toolbar.style.top = `${Math.max(12, Math.min(innerHeight - box.height - 12, box.top))}px`;
      if (!this.card.classList.contains('hidden')) this.place(this.card, this.toolbar.getBoundingClientRect());
    }

    async copyText(text) {
      try { await navigator.clipboard.writeText(text); }
      catch {
        const field = document.createElement('textarea');
        field.value = text;
        field.style.cssText = 'position:fixed;left:-10000px;top:0;';
        this.toolbar.append(field);
        const active = this.toolbar.getRootNode().activeElement;
        let copied;
        try { field.focus(); field.select(); copied = document.execCommand('copy'); }
        finally { field.remove(); active?.focus({ preventScroll: true }); }
        if (!copied) throw new Error('复制失败。');
      }
    }

    update() {
      if (!this.enabled()) { this.hide(); return; }
      if (this.drag) return;
      if (!this.card.classList.contains('hidden')) return;
      const active = document.activeElement;
      if (active === this.host) return;
      let selected = null;
      let rect = null;
      if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) {
        if (!this.findEditor(active)) { this.hide(); return; }
        const start = active.selectionStart;
        const end = active.selectionEnd;
        if (start !== null && end !== null && end > start) {
          const full = this.read(active);
          selected = { element: active, full, text: full.slice(start, end), start, end };
          const rects = this.rectsFor(selected);
          const backward = active.selectionDirection === 'backward';
          const edge = (backward ? rects[0] : rects.at(-1)) || active.getBoundingClientRect();
          rect = { left: backward ? edge.left : edge.right, top: edge.top, bottom: edge.bottom };
        }
      } else {
        const selection = window.getSelection();
        if (selection?.rangeCount && !selection.isCollapsed) {
          const anchor = selection.anchorNode?.parentElement;
          if (anchor?.closest('#writewise-assistant,[data-sensitive],[data-private],[data-writewise-ignore]')) return;
          const editor = this.findEditor(anchor);
          selected = editor ? this.capture(editor) : null;
          if (!selected) selected = { element: null, text: selection.toString() };
          const caret = document.createRange();
          caret.setStart(selection.focusNode, selection.focusOffset);
          caret.collapse(true);
          rect = Array.from(caret.getClientRects()).find(bounds => bounds.height > 0);
          if (!rect) {
            const range = selection.getRangeAt(0);
            const backward = selection.focusNode === range.startContainer && selection.focusOffset === range.startOffset;
            const bounds = Array.from(range.getClientRects());
            const edge = (backward ? bounds[0] : bounds.at(-1)) || range.getBoundingClientRect();
            rect = { left: backward ? edge.left : edge.right, top: edge.top, bottom: edge.bottom };
          }
        }
      }
      if (!selected?.text.trim() || selected.text.length > 16000 || !rect) { this.hide(); return; }
      this.selected = selected;
      const signature = JSON.stringify([selected.text, selected.start, selected.end]);
      if (this.pointerSelection && this.pointerSelection !== signature) this.manuallyPositioned = false;
      if (this.pointerSelection && this.pointerSelection !== signature) this.pointerAnchor = null;
      this.pointerSelection = signature;
      this.anchor = this.pointerAnchor || { left: rect.left, top: rect.top, bottom: rect.bottom };
      this.languages.value = globalThis.WriteWiseText.translationTarget(selected.text);
      this.toolbar.classList.remove('hidden');
      if (!this.manuallyPositioned) this.place(this.toolbar, this.anchor);
    }

    openAsk() {
      if (!this.selected || !this.enabled()) return;
      this.version++;
      this.port?.disconnect();
      this.mode = 'ask';
      this.lastQuestion = '';
      this.modelPicker.setAction('ask');
      this.card.querySelector('.selection-header strong').textContent = '问 AI · 基于选中文字';
      this.card.querySelector('.selection-ask-form').classList.remove('hidden');
      this.card.querySelector('.selection-question').value = '';
      this.card.querySelector('.selection-result').textContent = '';
      this.card.querySelector('.selection-copy').textContent = '复制回答';
      this.card.querySelector('.selection-copy').disabled = true;
      this.card.querySelector('.selection-apply').classList.add('hidden');
      this.output = '';
      this.card.classList.remove('hidden');
      this.status(`已选中 ${this.selected.text.length} 个字符。输入问题后发送，或选择解释、总结、改写。`);
      this.place(this.card, this.toolbar.getBoundingClientRect());
      this.card.querySelector('.selection-question').focus({ preventScroll: true });
    }

    ask(question = this.card.querySelector('.selection-question').value.trim()) {
      if (!question) { this.status('请先输入问题。'); return; }
      this.lastQuestion = question;
      return this.request('ask', question);
    }

    async translate() {
      this.mode = 'translate';
      if (this.modelPicker.action !== 'translate') this.modelPicker.setAction('translate');
      this.card.querySelector('.selection-header strong').textContent = '选区翻译';
      this.card.querySelector('.selection-ask-form').classList.add('hidden');
      this.card.querySelector('.selection-copy').textContent = '复制译文';
      return this.request('translate');
    }

    async request(action, instruction = '') {
      if (!this.selected || !this.enabled()) return;
      const selected = this.selected;
      const version = ++this.version;
      this.port?.disconnect();
      const targetLanguage = this.languages.value;
      this.output = '';
      this.card.querySelector('.selection-result').textContent = '';
      this.card.querySelector('.selection-copy').disabled = true;
      this.card.querySelector('.selection-apply').disabled = true;
      this.card.querySelector('.selection-apply').classList.toggle('hidden', action === 'ask' || !selected.element);
      this.card.querySelector('.selection-apply').textContent = selected.element?.isContentEditable ? '替换选区（纯文本）' : '替换选中文字';
      this.card.classList.remove('hidden');
      const toolbarBox = this.toolbar.getBoundingClientRect();
      this.place(this.card, toolbarBox);
      this.status(action === 'ask' ? '正在思考你的问题…' : `正在翻译成${targetLanguage}…`);
      try {
        const response = await new Promise(resolve => {
          const port = chrome.runtime.connect({ name: 'writewise-translation' });
          this.port = port;
          let completed = false;
          port.onMessage.addListener(message => {
            if (version !== this.version) return;
            if (message.type === 'PROGRESS') {
              this.card.querySelector('.selection-result').textContent = message.data.text;
              this.status(`${message.data.model} · 首字 ${(message.data.firstTextMs / 1000).toFixed(1)} 秒 · 正在生成…`);
              this.place(this.card, this.toolbar.getBoundingClientRect());
            }
            if (message.type === 'DONE' || message.type === 'ERROR') {
              completed = true;
              resolve(message.type === 'DONE' ? { ok: true, data: message.data } : { ok: false, error: message.error });
              port.disconnect();
              if (this.port === port) this.port = null;
            }
          });
          port.onDisconnect.addListener(() => {
            const error = chrome.runtime.lastError?.message;
            if (!completed) resolve({ ok: false, error: error || '翻译连接已结束，请重试。' });
          });
          port.postMessage({ type: 'TRANSLATE', action, instruction, text: selected.text, ...(action === 'translate' ? { targetLanguage } : {}) });
        });
        if (version !== this.version) return;
        if (!response?.ok) throw new Error(response?.error || '翻译失败，请重试。');
        this.output = response.data.correctedText;
        this.card.querySelector('.selection-result').textContent = this.output;
        this.card.querySelector('.selection-copy').disabled = false;
        this.card.querySelector('.selection-apply').disabled = !selected.element;
        const label = action === 'ask' ? '问 AI' : targetLanguage;
        this.status(response.data.cached ? `${label} · ${response.data.model} · ${action === 'ask' ? '已复用近期回答' : '已复用近期翻译'}` : `${label} · ${response.data.model} · 首字 ${(response.data.firstTextMs / 1000).toFixed(1)} 秒 · 总计 ${(response.data.apiMs / 1000).toFixed(1)} 秒`);
        this.modelPicker.sync();
        this.place(this.card, this.toolbar.getBoundingClientRect());
      } catch (error) {
        if (version === this.version) { this.status(error.message); this.card.querySelector('.selection-result').textContent = ''; }
      }
    }
  }
  globalThis.WriteWiseSelection = WriteWiseSelection;
})();
