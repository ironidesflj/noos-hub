/* Redirecionamento de idioma do index raiz (Carta cap. 7) — externalizado para CSP sem inline. */
(function(){
  var target='en';
  try{
    var saved=localStorage.getItem('noos-lang');
    if(saved==='pt'||saved==='en'){target=saved;}
    else{
      var nav=(navigator.languages&&navigator.languages[0])||navigator.language||'en';
      target=String(nav).toLowerCase().indexOf('pt')===0?'pt':'en';
    }
  }catch(e){}
  location.replace(target+'/');
})();
