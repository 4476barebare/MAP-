document.addEventListener('DOMContentLoaded', () => {
  const textarea = document.getElementById('chat-textarea');
  const subHeader = document.getElementById('sub-header');
  const codeBlocks = document.querySelectorAll('.code-block');
  const btnSend = document.getElementById('btn-send');
  
  const drawerMenu = document.getElementById('drawer-menu');
  const btnMenu = document.getElementById('btn-menu');
  const btnBack = document.getElementById('btn-back');

  let activeBlock = null;

  // 💡新機能：編集したテキストを安全にHTMLへ戻し、タグに色をつける関数
  function formatCode(text) {
    // 1. HTMLの誤作動を防ぐため < や > を無害化（エスケープ）し、改行を <br> に変換
    let html = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\n/g, '<br>');

    // 2. インデント（半角スペース2個）をHTML用のスペース(&nbsp;)に変換して構造を維持
    html = html.replace(/  /g, '&nbsp;&nbsp;');

    // 3. <div>や<h2>などの構造タグ、およびfunction構文を青色(タグカラー)でハイライト
    html = html.replace(/(&lt;\/?(div|h[1-6]|p|span|a)[^&]*&gt;)/gi, '<span class="tag">$1</span>');
    html = html.replace(/(function.*?{)/g, '<span class="tag">$1</span>');
    html = html.replace(/(})/g, '<span class="tag">$1</span>');

    return html;
  }

  // 1. 本文タップ時（コードをチャット欄に読み込む）
  codeBlocks.forEach(block => {
    block.addEventListener('click', () => {
      // ハイライトのリセットと適用
      codeBlocks.forEach(b => b.classList.remove('active'));
      block.classList.add('active');
      activeBlock = block;

      // 💡新機能：innerTextを使うことで、画面に表示されているままの「プレーンテキスト（改行込み）」を取得
      textarea.value = block.innerText;
      
      subHeader.classList.remove('hidden');
      textarea.focus();
      
      // 文字量に合わせてチャット欄の高さを再計算
      textarea.style.height = '40px'; 
      textarea.style.height = (textarea.scrollHeight) + 'px';
    });
  });

  // 2. 反映（↑ボタン）処理（編集したコードを本文に書き戻す）
  btnSend.addEventListener('click', () => {
    if (!activeBlock || textarea.value.trim() === '') return;
    
    // 🚀【超重要】ここが実際の書き換え処理
    // チャット欄のテキストを formatCode で再装飾し、アクティブなブロックの中身を上書きする
    activeBlock.innerHTML = formatCode(textarea.value);

    // 反映後はチャット欄をクリアして状態をリセット
    subHeader.classList.add('hidden');
    textarea.value = '';
    textarea.blur(); // キーボードを閉じる
    activeBlock.classList.remove('active');
    activeBlock = null;
  });

  // 3. メニュー（ドリルダウン）の開閉
  btnMenu.addEventListener('click', () => { drawerMenu.classList.add('open'); });
  btnBack.addEventListener('click', () => { drawerMenu.classList.remove('open'); });

  // 4. テキストエリアの高さ自動調整
  textarea.addEventListener('input', function() {
    this.style.height = '40px'; 
    this.style.height = (this.scrollHeight) + 'px';
  });
});
