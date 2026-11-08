(() => {
  function sentenceContext(text, start, end) {
    let left = start;
    let right = end;
    while (left > 0 && !/[。！？!?\n\r]/.test(text[left - 1]) && !(text[left - 1] === '.' && /\s/.test(text[left] || ''))) left--;
    while (right < text.length && !/[。！？!?\n\r]/.test(text[right]) && !(text[right] === '.' && /\s|$/.test(text[right + 1] || ''))) right++;
    if (right < text.length && /[。！？!?.]/.test(text[right])) right++;
    while (left < start && /\s/.test(text[left])) left++;
    const fullStart = left;
    const fullEnd = right;
    left = Math.max(left, start - 240);
    right = Math.min(right, end + 240);
    return { start: fullStart, end: fullEnd, before: `${left > fullStart ? '…' : ''}${text.slice(left, start)}`, after: `${text.slice(end, right)}${right < fullEnd ? '…' : ''}` };
  }

  function diffParts(original, replacement) {
    const tokenize = text => text.match(/\s+|[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]|[\p{L}\p{N}_]+|[^\s]/gu) || [];
    const before = tokenize(original);
    const after = tokenize(replacement);
    if (before.length * after.length > 90000) return [{ type: 'delete', text: original }, { type: 'insert', text: replacement }].filter(part => part.text);
    const table = Array.from({ length: before.length + 1 }, () => new Uint16Array(after.length + 1));
    for (let left = before.length - 1; left >= 0; left--) {
      for (let right = after.length - 1; right >= 0; right--) table[left][right] = before[left] === after[right] ? table[left + 1][right + 1] + 1 : Math.max(table[left + 1][right], table[left][right + 1]);
    }
    const parts = [];
    function append(type, text) {
      if (parts.at(-1)?.type === type) parts.at(-1).text += text;
      else parts.push({ type, text });
    }
    let left = 0;
    let right = 0;
    while (left < before.length || right < after.length) {
      if (left < before.length && right < after.length && before[left] === after[right]) { append('equal', before[left++]); right++; }
      else if (left < before.length && (right === after.length || table[left + 1][right] >= table[left][right + 1])) append('delete', before[left++]);
      else append('insert', after[right++]);
    }
    return parts;
  }
  function checkWindow(text, caret = 0, limit = 4000) {
    if (text.length <= limit) return { start: 0, end: text.length, text };
    const position = Math.max(0, Math.min(text.length, caret));
    let start = Math.max(0, position - Math.floor(limit / 2));
    let end = Math.min(text.length, start + limit);
    start = Math.max(0, end - limit);
    const nextBreak = text.indexOf('\n', start);
    if (start > 0 && nextBreak >= start && nextBreak < position && nextBreak - start < 500) start = nextBreak + 1;
    const previousBreak = text.lastIndexOf('\n', end);
    if (end < text.length && previousBreak > position && end - previousBreak < 500) end = previousBreak;
    return { start, end, text: text.slice(start, end) };
  }
  function translationTarget(text) {
    return /\p{Script=Han}/u.test(text) ? 'English' : '简体中文';
  }
  globalThis.WriteWiseText = { sentenceContext, diffParts, checkWindow, translationTarget };
})();
