/* Noos — hub noos.study
   Tema (claro/escuro), idioma persistente e ano do rodapé.
   Padrões do Manual de Identidade Noos v1.0:
   - localStorage 'noos-theme' + data-theme="dark" (mesma chave do manual)
   - ao trocar o tema, o Campo Noosférico é re-colorido via window.__noosField.refresh()
   - localStorage 'noos-lang' persiste a troca manual de idioma (política: idioma do
     dispositivo manda; inglês é o fallback universal; troca manual sempre visível)
*/
(function(){
  var root=document.documentElement;

  /* ---------- Tema ---------- */
  function isDark(){return root.getAttribute('data-theme')==='dark';}
  function syncTheme(){
    var dark=isDark();
    root.querySelectorAll('[data-theme-toggle]').forEach(function(btn){
      btn.setAttribute('aria-label',dark?btn.getAttribute('data-label-light')||'':btn.getAttribute('data-label-dark')||'');
    });
    root.querySelectorAll('[data-theme-label]').forEach(function(el){
      el.textContent=dark?(el.getAttribute('data-txt-light')||''):(el.getAttribute('data-txt-dark')||'');
    });
    if(window.__noosField){window.__noosField.refresh();}
  }
  document.querySelectorAll('[data-theme-toggle]').forEach(function(btn){
    btn.addEventListener('click',function(){
      if(isDark()){
        root.removeAttribute('data-theme');
        try{localStorage.removeItem('noos-theme');}catch(e){}
      }else{
        root.setAttribute('data-theme','dark');
        try{localStorage.setItem('noos-theme','dark');}catch(e){}
      }
      syncTheme();
    });
  });
  syncTheme();

  /* ---------- Idioma (troca manual persiste) ---------- */
  document.querySelectorAll('a[data-lang]').forEach(function(a){
    a.addEventListener('click',function(){
      try{localStorage.setItem('noos-lang',a.getAttribute('data-lang'));}catch(e){}
    });
  });

  /* ---------- Ano no rodapé ---------- */
  var y=new Date().getFullYear();
  document.querySelectorAll('[data-year]').forEach(function(el){el.textContent=String(y);});
})();
