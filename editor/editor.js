document.addEventListener('DOMContentLoaded', () => {
  const subHeader = document.getElementById('sub-header');
  const btnCloseChat = document.getElementById('btn-close-chat');
  const codeBlocks = document.querySelectorAll('.code-block');
  
  const drawerMenu = document.getElementById('drawer-menu');
  const btnMenu = document.getElementById('btn-menu');
  const btnBack = document.getElementById('btn-back');

  let activeBlock = null;

  codeBlocks.forEach(block => {
    block.addEventListener('click', () => {
      codeBlocks.forEach(b => b.classList.remove('active'));
      block.classList.add('active');
      activeBlock = block;
      subHeader.classList.remove('hidden');
    });
  });

  btnCloseChat.addEventListener('click', () => {
    subHeader.classList.add('hidden');
    if(activeBlock) activeBlock.classList.remove('active');
    activeBlock = null;
  });

  btnMenu.addEventListener('click', () => {
    drawerMenu.classList.add('open');
  });

  btnBack.addEventListener('click', () => {
    drawerMenu.classList.remove('open');
  });
});
