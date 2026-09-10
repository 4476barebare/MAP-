document.addEventListener('DOMContentLoaded', () => {
  const textarea = document.getElementById('chat-textarea');
  const subHeader = document.getElementById('sub-header');
  const codeBlocks = document.querySelectorAll('.code-block');
  const btnSend = document.getElementById('btn-send');
  
  const drawerMenu = document.getElementById('drawer-menu');
  const btnMenu = document.getElementById('btn-menu');
  const btnBack = document.getElementById('btn-back');

  let activeBlock = null;

  // 1. 本文タップ時
  codeBlocks.forEach(block => {
    block.addEventListener('click', () => {
      codeBlocks.forEach(b => b.classList.remove('active'));
      block.classList.add('active');
      activeBlock = block;

      let content = block.innerText.replace(/<\/?div[^>]*>|<\/?h1>|<\/?p>|function.*?{/g, '').trim();
      textarea.value = content;
      
      subHeader.classList.remove('hidden');
      textarea.focus();
    });
  });

  // 2. 反映（↑ボタン）処理
  btnSend.addEventListener('click', () => {
    if (!activeBlock || textarea.value.trim() === '') return;

    alert("「" + textarea.value + "」を本文に反映しました（プロトタイプ）");
    
    // 反映後はチャット欄をクリアして状態をリセット
    subHeader.classList.add('hidden');
    textarea.value = '';
    textarea.blur(); // キーボードを閉じる
    if(activeBlock) activeBlock.classList.remove('active');
    activeBlock = null;
  });

  // 3. メニュー（ドリルダウン）の開閉
  btnMenu.addEventListener('click', () => {
    drawerMenu.classList.add('open');
  });

  btnBack.addEventListener('click', () => {
    drawerMenu.classList.remove('open');
  });

  // 4. テキストエリアの高さ自動調整
  textarea.addEventListener('input', function() {
    this.style.height = '40px'; 
    this.style.height = (this.scrollHeight) + 'px';
  });
});
