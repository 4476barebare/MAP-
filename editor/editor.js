document.addEventListener('DOMContentLoaded', () => {
  const textarea = document.getElementById('chat-textarea');
  const subHeader = document.getElementById('sub-header');
  const codeBlocks = document.querySelectorAll('.code-block');
  const btnSend = document.getElementById('btn-send');
  
  const drawerMenu = document.getElementById('drawer-menu');
  const btnMenu = document.getElementById('btn-menu');
  const btnBack = document.getElementById('btn-back');

  let activeBlock = null;

  // --- 本文をHTMLに戻すための装飾関数 ---
  function formatCode(text) {
    let html = text
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>')
      .replace(/  /g, '&nbsp;&nbsp;');
    html = html.replace(/(&lt;\/?(div|h[1-6]|p|span|a)[^&]*&gt;)/gi, '<span class="tag">$1</span>');
    html = html.replace(/(function.*?{)/g, '<span class="tag">$1</span>');
    html = html.replace(/(})/g, '<span class="tag">$1</span>');
    return html;
  }

  // --- 1. 本文タップ時（チャット欄への読み込み） ---
  codeBlocks.forEach(block => {
    block.addEventListener('click', () => {
      codeBlocks.forEach(b => b.classList.remove('active'));
      block.classList.add('active');
      activeBlock = block;

      let content = block.innerText.replace(/<\/?div[^>]*>|<\/?h2>|<\/?p>|function.*?{/g, '').trim();
      textarea.value = content;
      
      subHeader.classList.remove('hidden');
      textarea.focus();
      
      textarea.style.height = '40px'; 
      textarea.style.height = (textarea.scrollHeight) + 'px';
    });
  });

  // --- 2. 反映処理（↑ボタン） ---
  if(btnSend) {
    btnSend.addEventListener('click', () => {
      if (!activeBlock || textarea.value.trim() === '') return;
      
      activeBlock.innerHTML = formatCode(textarea.value);
      
      subHeader.classList.add('hidden');
      textarea.value = '';
      textarea.blur();
      activeBlock.classList.remove('active');
      activeBlock = null;
    });
  }

  // ==========================================
  // 💡 ツールバーの各種機能（安全設計版）
  // ==========================================
  
  const btnCopy = document.getElementById('btn-copy');
  if(btnCopy) {
    btnCopy.addEventListener('click', async () => {
      if (!textarea.value) return;
      try {
        await navigator.clipboard.writeText(textarea.value);
        const originalColor = btnCopy.style.color;
        btnCopy.style.color = 'var(--tag-color)';
        setTimeout(() => btnCopy.style.color = originalColor, 500);
      } catch (err) {
        alert("コピーに失敗しました");
      }
      textarea.focus();
    });
  }

  const btnPaste = document.getElementById('btn-paste');
  if(btnPaste) {
    btnPaste.addEventListener('click', async () => {
      try {
        const text = await navigator.clipboard.readText();
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        textarea.value = textarea.value.substring(0, start) + text + textarea.value.substring(end);
        textarea.selectionStart = textarea.selectionEnd = start + text.length;
        textarea.style.height = '40px'; 
        textarea.style.height = (textarea.scrollHeight) + 'px';
      } catch (err) {
        alert("ペーストに失敗しました");
      }
      textarea.focus();
    });
  }

  const btnUndo = document.getElementById('btn-undo');
  if(btnUndo) btnUndo.addEventListener('click', () => { textarea.focus(); document.execCommand('undo'); });

  const btnRedo = document.getElementById('btn-redo');
  if(btnRedo) btnRedo.addEventListener('click', () => { textarea.focus(); document.execCommand('redo'); });

  const btnLeft = document.getElementById('btn-left');
  if(btnLeft) btnLeft.addEventListener('click', () => {
    const pos = textarea.selectionStart;
    if (pos > 0) textarea.setSelectionRange(pos - 1, pos - 1);
    textarea.focus();
  });

  const btnRight = document.getElementById('btn-right');
  if(btnRight) btnRight.addEventListener('click', () => {
    const pos = textarea.selectionStart;
    if (pos < textarea.value.length) textarea.setSelectionRange(pos + 1, pos + 1);
    textarea.focus();
  });

  // --- メニューの開閉 ---
  if(btnMenu) btnMenu.addEventListener('click', () => { drawerMenu.classList.add('open'); });
  if(btnBack) btnBack.addEventListener('click', () => { drawerMenu.classList.remove('open'); });

  // --- テキストエリアの高さ自動調整 ---
  if(textarea) {
    textarea.addEventListener('input', function() {
      this.style.height = '40px'; 
      this.style.height = (this.scrollHeight) + 'px';
    });
  }
});
