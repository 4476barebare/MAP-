document.addEventListener('DOMContentLoaded', () => {
  const textarea = document.getElementById('chat-textarea');
  const subHeader = document.getElementById('sub-header');
  const btnCloseChat = document.getElementById('btn-close-chat');
  const codeBlocks = document.querySelectorAll('.code-block');
  const btnSend = document.getElementById('btn-send');
  
  const drawerMenu = document.getElementById('drawer-menu');
  const btnMenu = document.getElementById('btn-menu');
  const btnBack = document.getElementById('btn-back');

  let activeBlock = null;

  // 1. 本文タップ時の処理（「追記・編集」モードへ）
  codeBlocks.forEach(block => {
    block.addEventListener('click', () => {
      // ハイライトを切り替え
      codeBlocks.forEach(b => b.classList.remove('active'));
      block.classList.add('active');
      activeBlock = block;

      // タップしたブロック内のテキストを疑似的に取得して入力欄へ
      // ※プロトタイプのため、本来は選択範囲を取得する処理が入ります
      let content = block.innerText.replace(/<\/?div[^>]*>|<\/?h1>|<\/?p>|function.*?{/g, '').trim();
      textarea.value = content;
      
      // サブヘッダーを表示し、フォーカスを当てる
      subHeader.classList.remove('hidden');
      textarea.focus();
    });
  });

  // 2. 「閉じる(✖️)」ボタン処理
  btnCloseChat.addEventListener('click', () => {
    closeChat();
  });

  function closeChat() {
    subHeader.classList.add('hidden');
    textarea.value = '';
    textarea.blur(); // キーボードを閉じる
    if(activeBlock) activeBlock.classList.remove('active');
    activeBlock = null;
  }

  // 3. 「↑」送信ボタン処理（本文への反映）
  btnSend.addEventListener('click', () => {
    if (!activeBlock || textarea.value.trim() === '') return;

    // ※プロトタイプのため、単純にテキストを置換する処理
    // 実際には安全なDOM操作やカーソル位置への挿入を行います
    alert("「" + textarea.value + "」を本文に反映しました（プロトタイプ）");
    
    // 反映後はチャット欄をクリアして閉じる
    closeChat();
  });

  // 4. メニュー（ドリルダウン）の開閉
  btnMenu.addEventListener('click', () => {
    drawerMenu.classList.add('open');
  });

  btnBack.addEventListener('click', () => {
    drawerMenu.classList.remove('open');
  });

  // 5. テキストエリアの高さ自動調整（入力内容に応じて）
  textarea.addEventListener('input', function() {
    this.style.height = '40px'; // 一旦リセット
    this.style.height = (this.scrollHeight) + 'px';
  });
});
