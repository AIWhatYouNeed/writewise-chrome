(() => {
  class WriteWiseModelPicker {
    constructor({ container, action, changed = () => {} }) {
      this.action = action;
      this.changed = changed;
      this.version = 0;
      this.element = document.createElement('div');
      this.element.className = 'task-model-picker';
      this.element.innerHTML = '<button type="button" class="task-model-toggle" title="为当前任务选择模型">选择模型 ▾</button><section class="task-model-menu hidden" aria-label="任务模型选择"><div class="task-model-title"></div><input class="task-model-search" type="search" placeholder="搜索模型…" aria-label="搜索任务模型"><select class="task-model-list" aria-label="当前任务的模型"></select><div class="task-model-note" role="status"></div><button type="button" class="task-model-refresh">刷新模型列表</button></section>';
      const style = document.createElement('style');
      style.textContent = '.task-model-picker{position:relative;min-width:0;font-size:12px}.task-model-toggle{max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font:inherit;border:1px solid var(--line);border-radius:7px;padding:6px 9px;background:var(--paper);color:var(--ink);cursor:pointer}.task-model-menu{position:relative;min-width:0;width:100%;max-width:100%;box-sizing:border-box;background:var(--paper);border:1px solid var(--line);border-radius:9px;padding:11px;margin:7px 0;box-shadow:0 5px 20px #17382b18;z-index:6}.task-model-title{font-weight:650;margin-bottom:8px}.task-model-menu input,.task-model-menu select{box-sizing:border-box;display:block;width:100%;max-width:100%;min-width:0;margin:7px 0;padding:8px;border:1px solid var(--line);border-radius:6px;background:var(--paper);color:var(--ink);font:inherit}.task-model-note{line-height:1.65;white-space:pre-wrap;color:var(--muted);margin:7px 0}.task-model-refresh{font:inherit;border:0;background:none;color:var(--green,var(--accent));cursor:pointer;padding:4px 0}.task-model-menu.hidden{display:none}';
      this.element.append(style);
      container.append(this.element);
      this.button = this.element.querySelector('.task-model-toggle');
      this.menu = this.element.querySelector('.task-model-menu');
      this.select = this.element.querySelector('select');
      this.search = this.element.querySelector('input');
      this.note = this.element.querySelector('.task-model-note');
      this.button.addEventListener('click', () => {
        this.menu.classList.toggle('hidden');
        if (!this.menu.classList.contains('hidden')) this.load();
      });
      this.element.querySelector('.task-model-refresh').addEventListener('click', () => this.load(true));
      this.search.addEventListener('input', () => this.render());
      this.select.addEventListener('change', async () => {
        const model = this.select.value;
        const action = this.action;
        this.note.textContent = '正在保存此任务的模型…';
        try {
          const response = await chrome.runtime.sendMessage({ type: 'SET_TASK_MODEL', action, model });
          if (action !== this.action) return;
          if (!response?.ok) throw new Error(response?.error || '保存模型失败。');
          this.current = response.data.model;
          this.updateButton();
          this.note.textContent = '已记住此任务的模型，其他任务保持各自选择。';
          this.changed(this.current);
        } catch (error) { this.note.textContent = error.message; }
      });
      this.sync();
    }

    updateButton() { this.button.textContent = `模型 · ${this.current || '默认'} ▾`; this.button.title = `当前任务：${this.action}，模型：${this.current || '默认'}。点击切换。`; }

    async sync() {
      const version = this.version;
      const response = await chrome.runtime.sendMessage({ type: 'GET_TASK_PREFERENCES' }).catch(() => null);
      if (version !== this.version || !response?.ok) return;
      this.current = response.data.models[this.action] || response.data.defaultModel;
      this.updateButton();
    }

    setAction(action) {
      this.version++;
      this.action = action;
      this.menu.classList.add('hidden');
      this.search.value = '';
      this.sync();
    }

    async load(refresh = false) {
      const version = ++this.version;
      this.note.textContent = '正在获取模型；只查询列表，不发送写作内容…';
      this.select.disabled = true;
      const response = await chrome.runtime.sendMessage({ type: 'GET_TASK_MODELS', action: this.action, refresh }).catch(() => null);
      if (version !== this.version) return;
      if (!response?.ok) { this.note.textContent = response?.error || '读取模型失败，请检查 API 配置。'; return; }
      this.data = response.data;
      this.current = this.data.model;
      this.element.querySelector('.task-model-title').textContent = `为「${({ check: '纠错', translate: '翻译', ask: '问 AI', rewrite: '润色', concise: '精简', tone: '语气', draft: '草稿', outline: '大纲', brainstorm: '灵感' })[this.action]}」选择模型`;
      this.render();
      this.updateButton();
      this.note.textContent = `${this.data.warning || '只列出当前 API 的模型。快速文字模型适合翻译，复杂写作可选更强模型。'}\n耗时来自已完成调用，未测模型不会标为最快；列表不保证每个模型都支持文字任务。`;
    }

    render() {
      if (!this.data) return;
      const query = this.search.value.trim().toLowerCase();
      this.select.replaceChildren(new Option(`跟随默认模型 · ${this.data.defaultModel}`, ''));
      const entries = [...new Set([this.current, ...this.data.ids])].filter(Boolean).filter(id => id.toLowerCase().includes(query) || id === this.current);
      const measured = entries.filter(id => this.data.timings[id]?.firstTextMs !== undefined);
      const fastest = measured.sort((first, second) => this.data.timings[first].firstTextMs - this.data.timings[second].firstTextMs)[0];
      for (const id of entries) {
        const timing = this.data.timings[id];
        const label = `${id}${timing ? ` · ${this.action === 'translate' ? '首字' : '平均'} ${(timing.firstTextMs / 1000).toFixed(1)}秒${id === fastest ? ' · 已测最快' : ''}` : ''}`;
        this.select.add(new Option(label, id));
      }
      this.select.value = this.current || '';
      this.select.disabled = false;
    }
  }
  globalThis.WriteWiseModelPicker = WriteWiseModelPicker;
})();
