document.addEventListener('DOMContentLoaded', () => {
  const textarea = document.getElementById('chat-textarea');
  const subHeader = document.getElementById('sub-header');
  const codeBlocks = document.querySelectorAll('.code-block');
  const btnSend = document.getElementById('btn-send');
  
  const drawerMenu = document.getElementById('drawer-menu');
  const btnMenu = document.getElementById('btn-menu');
  const btnBack = document.getElementById('btn-back');

  let activeBlock = null;

  // テキストを安全にHTMLへ戻す関数
  function formatCode(text) {
    let html = text
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>')
      .replace(/  /g, '&nbsp;&nbsp;');
    html = html.replace(/(&lt;\/?(div|h[1-6]|p|span|a)[^&]*&gt;)/gi, '<span class="tag">$1</span>');
    html = html.replace(/(function.*?{)/g, '<span class="tag">$1</span>');
    html = html.replace(/(})/g, '<span class="tag">$1</span>');
    return html;
  }

  // --- 1. 本文タップ時（選択とフォーカス） ---
  codeBlocks.forEach(block => {
    block.addEventListener('click', () => {
      // ハイライト切り替え
      codeBlocks.forEach(b => b.classList.remove('active'));
      block.classList.add('active');
      activeBlock = block;

      // テキストを取得して入力欄へ
      let content = block.innerText.replace(/<\/?div[^>]*>|<\/?h2>|<\/?p>|function.*?{/g, '').trim();
      textarea.value = content;
      
      // ツールバーを表示してキーボードを呼び出す
      subHeader.classList.remove('hidden');
      textarea.focus();
      
      textarea.style.height = '40px'; 
      textarea.style.height = (textarea.scrollHeight) + 'px';

      // 🚀【修正ポイント】
      // スマホのキーボード出現と、ツールバーの展開アニメーションが終わるのを待つ（300ミリ秒）
      setTimeout(() => {
        const editorArea = document.getElementById('editor-area');
        const chatArea = document.getElementById('chat-input-area');
        
        // 展開しきったチャットエリア（ツールバー含む）の最終的な高さを取得
        const chatHeight = chatArea.offsetHeight;
        
        // 選択したブロックの「下端」の座標を計算
        const blockBottom = block.offsetTop + block.offsetHeight;
        
        // ブロックの下端が、ツールバーの直上（24pxのゆとりを持たせる）にピタリと来るようにスクロール量を計算
        const targetScrollTop = blockBottom - (editorArea.clientHeight - chatHeight) + 24; 
        
        editorArea.scrollTo({
          top: targetScrollTop,
          behavior: 'smooth'
        });
      }, 300); // 待機時間を100ms → 300msに延長し、確実性をアップ
    });
  });

  // --- 2. 反映（↑ボタン）処理 ---
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

  // --- 3. ツールバーの各種機能 ---
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
        // OS側の制約でペーストできない場合の保険
        console.warn("クリップボードAPIがブロックされました");
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
