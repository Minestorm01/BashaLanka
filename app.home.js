(function(){
  const homeView = document.getElementById('view-home');
  const learnView = document.getElementById('view-learn');
  
  if(!homeView || !learnView) return;

  function hasProgress(){
    try{
      const stored = localStorage.getItem('bashalanka-progress');
      if(!stored) return false;
      const progress = JSON.parse(stored);
      return Object.keys(progress).length > 0;
    }catch{
      return false;
    }
  }

  function handleRoute(){
    const hash = location.hash || '';
    
    if(hash === '' || hash === '#/' || hash === '#/home'){
      if(hasProgress()){
        location.hash = '#/learn';
      }else{
        return;
      }
    }
  }

  window.addEventListener('hashchange', handleRoute);
  handleRoute();
})();
