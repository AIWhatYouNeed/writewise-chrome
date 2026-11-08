const $ = selector => document.querySelector(selector);
const modelSlot = document.createElement('div');
$('#action').parentElement.after(modelSlot);
const taskModels = new globalThis.WriteWiseModelPicker({ container: modelSlot, action: $('#action').value });
let output = '';
let version = 0;
let busy = false;
function changed() {
  version++;
  $('#count').textContent = `${$('#source').value.length.toLocaleString()} / 16,000`;
}
$('#source').addEventListener('input', changed);
$('#instruction').addEventListener('input', changed);
$('#action').addEventListener('change', changed);
$('#action').addEventListener('change', () => taskModels.setAction($('#action').value));
$('#clear').addEventListener('click', () => {
  $('#source').value = '';
  $('#instruction').value = '';
  changed();
  output = '';
  $('#result').textContent = '每个好句子，都从你的声音开始。';
  $('#result').classList.add('placeholder');
  $('#issues').replaceChildren();
  $('#copy').disabled = true;
  $('#continue').classList.add('hidden');
  $('#status').textContent = '已清空。';
});
async function run() {
  if (busy) return;
  const token = version;
  busy = true;
  $('#run').disabled = true;
  $('#status').classList.remove('error');
  $('#status').textContent = '正在写作，请稍候…';
  try {
    const response = await chrome.runtime.sendMessage({ type: 'WRITE', action: $('#action').value, text: $('#source').value, instruction: $('#instruction').value });
    if (version !== token) { $('#status').textContent = '输入已变化，本次结果已丢弃，请重新提交。'; return; }
    if (!response?.ok) throw new Error(response?.error || '连接失败。');
    output = response.data.correctedText;
    $('#result').textContent = output;
    $('#result').classList.remove('placeholder');
    $('#status').textContent = response.data.summary;
    $('#issues').replaceChildren();
    response.data.issues.forEach(issue => {
      const card = document.createElement('div'); card.className = 'issue';
      const change = document.createElement('strong'); change.textContent = `${issue.original} → ${issue.replacement || '（删除）'}`;
      const explanation = document.createElement('p'); explanation.textContent = issue.explanation;
      card.append(change, explanation); $('#issues').append(card);
    });
    $('#copy').disabled = false;
    $('#continue').classList.remove('hidden');
  } catch (error) { $('#status').textContent = error.message; $('#status').classList.add('error'); }
  finally { busy = false; $('#run').disabled = false; }
}
$('#run').addEventListener('click', run);
document.addEventListener('keydown', event => { if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') { event.preventDefault(); run(); } });
$('#copy').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(output); $('#status').textContent = '已复制结果。'; }
  catch { $('#status').textContent = '复制失败，请选择结果后手动复制。'; }
});
$('#continue').addEventListener('click', () => { $('#source').value = output; changed(); $('#source').focus(); });
