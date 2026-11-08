(() => {
  class WriteWiseInline {
    constructor({ shadow, container, read, rangeFor, accept, dismiss }) {
      this.read = read;
      this.rangeFor = rangeFor;
      this.accept = accept;
      this.dismiss = dismiss;
      this.rects = [];
      this.snapshot = null;
      this.activeIssue = null;
      this.layer = document.createElement('div');
      this.layer.className = 'inline-marks';
      this.card = document.createElement('section');
      this.card.className = 'inline-card hidden';
      this.card.setAttribute('role', 'dialog');
      this.card.setAttribute('aria-label', '写作修改建议');
      this.card.innerHTML = '<div class="inline-heading"><div class="meta inline-category"></div><button class="inline-close" aria-label="关闭建议">×</button></div><div class="inline-sentence" aria-label="句内修改对比"></div><div class="reason"></div><div class="inline-feedback" role="status"></div><div class="issue-actions"><button class="button primary inline-accept">应用修改</button><button class="button inline-dismiss">忽略此建议</button></div><div class="inline-brand">W <span>WriteWise · 保留你的表达</span></div>';
      this.mirror = document.createElement('div');
      this.mirror.setAttribute('aria-hidden', 'true');
      this.mirror.inert = true;
      container.append(this.layer, this.card, this.mirror);
      const style = document.createElement('style');
      style.textContent = `
        .inline-marks{pointer-events:none}.inline-mark{pointer-events:none;position:fixed;padding:0;margin:0;border:0;border-bottom:2px solid #dd4860;border-radius:0;background:linear-gradient(transparent 88%,#dd486017 88%);min-width:2px;opacity:.95;box-sizing:border-box}.inline-mark[data-category="clarity"],.inline-mark[data-category="tone"]{border-bottom-color:#6681e8;background:linear-gradient(transparent 88%,#6681e817 88%)}.inline-mark:focus-visible{outline:2px solid #147b59;outline-offset:3px}.inline-card{pointer-events:auto;position:fixed;width:min(330px,calc(100vw - 24px));max-height:calc(100vh - 24px);overflow:auto;padding:15px 17px;border:1px solid var(--line);border-radius:13px;background:var(--paper);color:var(--ink);box-shadow:0 8px 35px #15392d30;z-index:2;text-align:left}.inline-card .change{font-size:15px;margin:9px 0;white-space:pre-wrap}.inline-card .issue-actions{margin-top:13px;flex-wrap:wrap}.inline-card .reason{margin:7px 0;line-height:1.7}.inline-feedback{font-size:12px;color:var(--red);white-space:pre-wrap}.inline-mirror{position:fixed!important;visibility:hidden!important;pointer-events:none!important;margin:0!important;overflow:hidden!important;transform-origin:top left!important;color:transparent!important;background:none!important;border-color:transparent!important;box-shadow:none!important;outline:0!important;z-index:-1!important}
      `;
      shadow.append(style);
      const sentenceStyle = document.createElement('style');
      sentenceStyle.textContent = `
        .inline-card{width:min(490px,calc(100vw - 24px));padding:0;border-radius:11px;box-shadow:0 5px 30px #1a273323}.inline-heading{display:flex;align-items:center;justify-content:space-between;padding:15px 20px 0;gap:10px}.inline-category{font-size:12px;letter-spacing:0;text-transform:none;color:var(--muted)}.inline-close{background:none;border:0;font-size:20px;color:var(--muted);padding:2px 4px;line-height:1}.inline-sentence{font-size:18px;line-height:1.85;padding:7px 20px 4px;white-space:pre-wrap;overflow-wrap:anywhere}.inline-sentence .old{color:#d72e51;text-decoration:line-through;text-decoration-thickness:2px;background:transparent;font-weight:650}.inline-sentence .new{color:#4d6dd6;background:transparent;font-weight:650}.inline-sentence .old+.new:before{content:' ';white-space:pre}.inline-card .reason{padding:0 20px;margin:5px 0 10px;font-size:12px;line-height:1.7}.inline-card .issue-actions{padding:0 20px;margin:12px 0 16px;gap:9px}.inline-card .issue-actions button{padding:7px 12px}.inline-card .inline-dismiss{border-color:transparent;color:var(--muted);font-weight:400}.inline-brand{display:flex;align-items:center;gap:9px;border-top:1px solid var(--line);padding:11px 20px;color:var(--green);font-size:17px;font-weight:750}.inline-brand span{font-size:12px;font-weight:400;color:var(--muted)}.inline-feedback{padding:0 20px}.inline-context-mark{pointer-events:none;position:fixed;background:#ed5b7b1c;border-radius:1px;z-index:-1}@media(prefers-color-scheme:dark){.inline-sentence .old{color:#ff91a5}.inline-sentence .new{color:#9eb3ff}.inline-context-mark{background:#ff8aa52b}}
      `;
      shadow.append(sentenceStyle);
      this.contextLayer = document.createElement('div');
      this.contextLayer.className = 'inline-context-layer';
      container.insertBefore(this.contextLayer, this.layer);
      this.card.querySelector('.inline-accept').addEventListener('click', () => {
        if (!this.activeIssue) return;
        if (!this.accept(this.activeIssue)) this.card.querySelector('.inline-feedback').textContent = '原文已变化或编辑器阻止了替换，请重新检查后再试。';
      });
      this.card.querySelector('.inline-dismiss').addEventListener('click', () => {
        if (this.activeIssue) this.dismiss(this.activeIssue);
      });
      this.card.querySelector('.inline-close').addEventListener('click', () => this.close());
      this.card.addEventListener('pointerenter', () => { clearTimeout(this.closeTimer); this.closeTimer = null; });
      this.card.addEventListener('pointerleave', () => this.delayedClose());
      document.addEventListener('pointermove', event => {
        if (event.composedPath().includes(this.card)) return;
        const hit = this.rects.find(rect => event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top - 2 && event.clientY <= rect.bottom + 4);
        const target = event.target;
        if (hit && this.snapshot?.element && (target === this.snapshot.element || this.snapshot.element.contains(target))) {
          clearTimeout(this.closeTimer);
          this.closeTimer = null;
          if (this.activeIssue !== hit.issue || this.card.classList.contains('hidden')) this.open(hit.issue, hit);
        } else this.delayedClose();
      }, { passive: true });
      document.addEventListener('pointerdown', event => {
        if (!event.composedPath().includes(this.card)) this.close();
      }, true);
      document.addEventListener('keydown', event => { if (event.key === 'Escape') this.close(); }, true);
      this.schedule = () => {
        if (this.frame) return;
        this.frame = requestAnimationFrame(() => { this.frame = null; this.paint(); });
      };
      document.addEventListener('scroll', event => { if (!event.composedPath().includes(this.mirror)) this.schedule(); }, true);
      window.addEventListener('resize', this.schedule);
      window.visualViewport?.addEventListener('resize', this.schedule);
      this.resize = new ResizeObserver(this.schedule);
      this.mutation = new MutationObserver(this.schedule);
      document.fonts?.addEventListener('loadingdone', this.schedule);
    }

    delayedClose() {
      if (this.closeTimer) return;
      this.closeTimer = setTimeout(() => { this.closeTimer = null; this.close(); }, 240);
    }

    close() {
      clearTimeout(this.closeTimer);
      this.closeTimer = null;
      this.card.classList.add('hidden');
      this.contextLayer.replaceChildren();
      this.activeIssue = null;
    }

    clear() {
      this.close();
      this.layer.replaceChildren();
      this.rects = [];
      this.snapshot = null;
      this.mirror.replaceChildren();
      this.resize.disconnect();
      this.mutation.disconnect();
    }

    render(snapshot, issues) {
      this.clear();
      if (!snapshot?.element || !issues.length) return;
      this.snapshot = snapshot;
      this.issues = issues;
      this.resize.observe(snapshot.element);
      this.mutation.observe(snapshot.element, { subtree: true, childList: true, characterData: true, attributes: true });
      this.paint();
    }

    clip(element) {
      const box = element.getBoundingClientRect();
      const clip = { left: Math.max(0, box.left + element.clientLeft), top: Math.max(0, box.top + element.clientTop), right: Math.min(innerWidth, box.right - (element.offsetWidth - element.clientWidth - element.clientLeft)), bottom: Math.min(innerHeight, box.bottom - (element.offsetHeight - element.clientHeight - element.clientTop)) };
      for (let parent = element.parentElement; parent; parent = parent.parentElement) {
        const style = getComputedStyle(parent);
        const rect = parent.getBoundingClientRect();
        if (/auto|scroll|hidden|clip/.test(style.overflowX)) { clip.left = Math.max(clip.left, rect.left + parent.clientLeft); clip.right = Math.min(clip.right, rect.left + parent.clientLeft + parent.clientWidth); }
        if (/auto|scroll|hidden|clip/.test(style.overflowY)) { clip.top = Math.max(clip.top, rect.top + parent.clientTop); clip.bottom = Math.min(clip.bottom, rect.top + parent.clientTop + parent.clientHeight); }
      }
      return clip;
    }

    mirrorRange(element, start, end) {
      const range = document.createRange();
      range.setStart(this.mirrorText, start);
      range.setEnd(this.mirrorText, end);
      return range;
    }

    prepareMirror(element, source = this.snapshot.full) {
      const computed = getComputedStyle(element);
      const box = element.getBoundingClientRect();
      this.mirror.removeAttribute('style');
      this.mirror.className = 'inline-mirror';
      const properties = ['boxSizing', 'fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'fontStretch', 'fontVariant', 'fontKerning', 'fontFeatureSettings', 'fontVariationSettings', 'lineHeight', 'letterSpacing', 'wordSpacing', 'textAlign', 'textIndent', 'textTransform', 'textRendering', 'direction', 'tabSize', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth', 'borderTopStyle', 'borderRightStyle', 'borderBottomStyle', 'borderLeftStyle'];
      for (const property of properties) this.mirror.style[property] = computed[property];
      this.mirror.style.boxSizing = 'border-box';
      this.mirror.style.width = `${element.clientWidth + element.clientLeft + parseFloat(computed.borderRightWidth)}px`;
      this.mirror.style.height = `${element.offsetHeight}px`;
      this.mirror.style.left = `${box.left}px`;
      this.mirror.style.top = `${box.top}px`;
      this.mirror.style.transform = `scale(${box.width / element.offsetWidth},${box.height / element.offsetHeight})`;
      const single = element instanceof HTMLInputElement;
      this.mirror.style.whiteSpace = single || element.wrap === 'off' ? 'pre' : 'pre-wrap';
      this.mirror.style.overflowWrap = single || element.wrap === 'off' ? 'normal' : 'break-word';
      if (single) {
        this.mirror.style.display = 'flex';
        this.mirror.style.alignItems = 'center';
      }
      this.mirrorText = document.createTextNode(source);
      const text = document.createElement('span');
      text.style.cssText = 'display:block;flex-shrink:0;';
      if (!single) text.style.display = 'contents';
      text.append(this.mirrorText);
      this.mirror.replaceChildren(text);
      this.mirror.scrollTop = element.scrollTop;
      this.mirror.scrollLeft = element.scrollLeft;
    }

    paint() {
      const snapshot = this.snapshot;
      if (!snapshot) return;
      const element = snapshot.element;
      if (!element.isConnected || this.read(element) !== snapshot.full || !element.getClientRects().length || getComputedStyle(element).visibility === 'hidden') { this.clear(); return; }
      const box = element.getBoundingClientRect();
      if (!box.width || !box.height) { this.clear(); return; }
      const active = this.activeIssue;
      const clip = this.clip(element);
      const plain = element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement;
      if (plain) this.prepareMirror(element);
      this.layer.replaceChildren();
      this.rects = [];
      for (const issue of this.issues) {
        const offset = snapshot.text.indexOf(issue.original);
        if (offset < 0) continue;
        const start = snapshot.start + offset;
        const end = start + issue.original.length;
        const range = plain ? this.mirrorRange(element, start, end) : this.rangeFor(element, start, end);
        if (!range) continue;
        for (const rect of range.getClientRects()) {
          const visible = { issue, left: Math.max(rect.left, clip.left), right: Math.min(rect.right, clip.right), top: Math.max(rect.top, clip.top), bottom: Math.min(rect.bottom, clip.bottom) };
          if (visible.right - visible.left < 1 || visible.bottom - visible.top < 2 || rect.bottom > clip.bottom + 1) continue;
          const mark = document.createElement('button');
          mark.className = 'inline-mark';
          mark.dataset.category = issue.category;
          mark.setAttribute('aria-label', `查看修改建议：${issue.original}`);
          mark.style.cssText = `left:${visible.left}px;top:${visible.top}px;width:${visible.right - visible.left}px;height:${visible.bottom - visible.top}px;`;
          mark.addEventListener('focus', () => this.open(issue, visible));
          mark.addEventListener('click', () => this.open(issue, visible));
          this.layer.append(mark);
          this.rects.push(visible);
        }
      }
      if (active) {
        const anchor = this.rects.find(rect => rect.issue === active);
        if (anchor) this.open(active, anchor); else this.close();
      }
    }

    open(issue, rect) {
      if (!this.snapshot || this.read(this.snapshot.element) !== this.snapshot.full) { this.clear(); return; }
      clearTimeout(this.closeTimer);
      this.closeTimer = null;
      this.activeIssue = issue;
      this.card.querySelector('.inline-category').textContent = ({ grammar: '语法建议', spelling: '拼写建议', punctuation: '标点建议', clarity: '表达更清晰', tone: '语气建议' })[issue.category] || '写作建议';
      const offset = this.snapshot.text.indexOf(issue.original);
      const context = globalThis.WriteWiseText.sentenceContext(this.snapshot.text, offset, offset + issue.original.length);
      const sentence = this.card.querySelector('.inline-sentence');
      sentence.replaceChildren(document.createTextNode(context.before));
      for (const part of globalThis.WriteWiseText.diffParts(issue.original, issue.replacement)) {
        if (part.type === 'equal') sentence.append(document.createTextNode(part.text));
        else {
          const span = document.createElement('span');
          span.className = part.type === 'delete' ? 'old' : 'new';
          span.textContent = part.text;
          sentence.append(span);
        }
      }
      sentence.append(document.createTextNode(context.after));
      this.contextLayer.replaceChildren();
      const element = this.snapshot.element;
      const plain = element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement;
      const range = plain ? this.mirrorRange(element, this.snapshot.start + context.start, this.snapshot.start + context.end) : this.rangeFor(element, this.snapshot.start + context.start, this.snapshot.start + context.end);
      const clip = this.clip(element);
      for (const bounds of range?.getClientRects() || []) {
        const left = Math.max(bounds.left, clip.left);
        const right = Math.min(bounds.right, clip.right);
        const top = Math.max(bounds.top, clip.top);
        const bottom = Math.min(bounds.bottom, clip.bottom);
        if (right <= left || bottom <= top) continue;
        const highlight = document.createElement('div');
        highlight.className = 'inline-context-mark';
        highlight.style.cssText = `left:${left}px;top:${top}px;width:${right - left}px;height:${bottom - top}px;`;
        this.contextLayer.append(highlight);
      }
      this.card.querySelector('.reason').textContent = issue.explanation;
      this.card.querySelector('.inline-feedback').textContent = '';
      this.card.classList.remove('hidden');
      const width = this.card.getBoundingClientRect().width;
      const height = this.card.getBoundingClientRect().height;
      this.card.style.left = `${Math.max(12, Math.min(innerWidth - width - 12, rect.left))}px`;
      this.card.style.top = `${Math.max(12, rect.bottom + height + 12 <= innerHeight ? rect.bottom + 6 : Math.min(innerHeight - height - 12, rect.top - height - 6))}px`;
    }
  }
  globalThis.WriteWiseInline = WriteWiseInline;
})();
