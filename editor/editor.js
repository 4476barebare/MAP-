document.addEventListener('DOMContentLoaded', () => {
  const textarea = document.getElementById('chat-textarea');
  const subHeader = document.getElementById('sub-header');
  const codeBlocks = document.querySelectorAll('.code-block');
  const btnSend = document.getElementById('btn-send');
  
  const drawerMenu = document.getElementById('drawer-menu');
  const btnMenu = document.getElementById('btn-menu');
  const btnBack = document.getElementById('btn-back');

  let activeBlock = null;

  // --- 文字列のフォーマット関数 ---
  function formatCode(text) {
    let html = text
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>')
      .replace(/  /g, '&nbsp;&nbsp;');
    html = html.replace(/(&lt;\/?(div|h[1-6]|p|span|a)[^&]*&gt;)/gi, '<span class="tag">$1</span>');
    html = html.replace(/(function.*?{)/g, '<span class="tag">$1</span>');
    html = html.replace(/(})/g, '<span class="tag">$1</span>');
    return html;
  }

  // --- 本文タップ時（チャット欄への読み込み） ---
  codeBlocks.forEach(block => {
    block.addEventListener('click', () => {
      codeBlocks.forEach(b => b.classList.remove('active'));
      block.classList.add('active');
      activeBlock = block;

      // タグを省いたプレーンテキストを取得
      let content = block.innerText.replace(/<\/?div[^>]*>|<\/?h2>|<\/?p>|function.*?{/g, '').trim();
      textarea.value = content;
      
      subHeader.classList.remove('hidden');
      textarea.focus();
    });
  });

  // --- 反映処理（↑ボタン） ---
  btnSend.addEventListener('click', () => {
    if (!activeBlock || textarea.value.trim() === '') return;
    
    // 現在のテキストエリアの内容で上書き
    activeBlock.innerHTML = formatCode(textarea.value);
    
    subHeader.classList.add('hidden');
    textarea.value = '';
    textarea.blur();
    activeBlock.classList.remove('active');
    activeBlock = null;
  });

  // ==========================================
  // 💡 ツールバーの各種機能実装
  // ==========================================

  // 1. コピー機能
  document.getElementById('btn-copy').addEventListener('click', async () => {
    if (!textarea.value) return;
    try {
      await navigator.clipboard.writeText(textarea.value);
      // 成功したら一瞬アイコンを青くするフィードバック
      const btn = document.getElementById('btn-copy');
      const originalColor = btn.style.color;
      btn.style.color = 'var(--tag-color)';
      setTimeout(() => btn.style.color = originalColor, 500);
    } catch (err) {
      alert("コピーに失敗しました");
    }
    textarea.focus();
  });

  // 2. ペースト機能
  document.getElementById('btn-paste').addEventListener('click', async () => {
    try {
      const text = await navigator.clipboard.readText();
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      // カーソル位置にペースト
      textarea.value = textarea.value.substring(0, start) + text + textarea.value.substring(end);
      
      // カーソルをペーストした文字の末尾へ移動
      textarea.selectionStart = textarea.selectionEnd = start + text.length;
      
      // 高さを再計算
      textarea.style.height = '40px'; 
      textarea.style.height = (textarea.scrollHeight) + 'px';
    } catch (err) {
      alert("クリップボードからの読み取りが許可されていないか、対応していません");
    }
    textarea.focus();
  });

  // 3. アンドゥ (元に戻す)
  document.getElementById('btn-undo').addEventListener('click', () => {
    textarea.focus();
    document.execCommand('undo');
  });

  // 4. リドゥ (やり直し)
  document.getElementById('btn-redo').addEventListener('click', () => {
    textarea.focus();
    document.execCommand('redo');
  });

  // 5. カーソルを左へ
  document.getElementById('btn-left').addEventListener('click', () => {
    const pos = textarea.selectionStart;
    if (pos > 0) {
      textarea.setSelectionRange(pos - 1, pos - 1);
    }
    textarea.focus();
  });

  // 6. カーソルを右へ
  document.getElementById('btn-right').addEventListener('click', () => {
    const pos = textarea.selectionStart;
    if (pos < textarea.value.length) {
      textarea.setSelectionRange(pos + 1, pos + 1);
    }
    textarea.focus();
  });


  // --- メニューの開閉 ---
  btnMenu.addEventListener('click', () => { drawerMenu.classList.add('open'); });
  btnBack.addEventListener('click', () => { drawerMenu.classList.remove('open'); });

  // --- テキストエリアの高さ自動調整 ---
  textarea.addEventListener('input', function() {
    this.style.height = '40px'; 
    this.style.height = (this.scrollHeight) + 'px';
  });
});
