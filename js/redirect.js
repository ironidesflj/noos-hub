/* Redirect estático de alias/forma sem idioma (v10.2) — externalizado para CSP sem inline. */
(function(){
  var s=document.currentScript;
  var dest=s&&s.getAttribute('data-destiny');
  if(dest) location.replace(dest);
})();
