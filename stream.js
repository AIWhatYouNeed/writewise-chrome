export async function readTextStream(response, onProgress = () => {}) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let text = '';
  let complete = false;
  let finished = false;
  async function event(raw) {
    const data = raw.split(/\r?\n/).filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n');
    if (!data) return;
    if (data.trim() === '[DONE]') { complete = true; return; }
    let payload;
    try { payload = JSON.parse(data); } catch { throw new Error('服务商返回了无法识别的流式数据。'); }
    if (payload.error) throw new Error('服务商在生成过程中返回错误，请重试或更换模型。');
    const choice = payload.choices?.[0];
    if (choice?.finish_reason === 'length') throw new Error('译文被截断，请缩短文字后重试。');
    if (choice?.finish_reason === 'content_filter') throw new Error('服务商阻止了此翻译，请检查原文或更换模型。');
    if (choice?.finish_reason === 'stop') finished = true;
    if (typeof choice?.delta?.content === 'string') {
      text += choice.delta.content;
      if (text.length > 48000) throw new Error('译文过长，请缩短原文后重试。');
      if (choice.delta.content) await onProgress(text);
    }
  }
  try {
    while (!complete) {
      const { value, done } = await reader.read();
      buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });
      let boundary;
      while ((boundary = /\r?\n\r?\n/.exec(buffer))) {
        const raw = buffer.slice(0, boundary.index);
        buffer = buffer.slice(boundary.index + boundary[0].length);
        await event(raw);
        if (complete) break;
      }
      if (buffer.length > 1000000) throw new Error('流式响应格式异常。');
      if (done) { if (buffer.trim()) await event(buffer); break; }
    }
    if (!complete && !finished) throw new Error('翻译连接提前中断，请重新翻译；部分结果尚不可应用。');
    if (!text.trim()) throw new Error('模型没有返回译文，请换一个支持文字输出的模型。');
    return text;
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}
