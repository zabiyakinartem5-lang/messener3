(() => {
  const KEY = 'messenger-winter-mode';
  let snow = null;
  let garland = null;
  const style = document.createElement('style');
  style.textContent = [
    '#cozy-winter-snow{position:fixed;inset:0;overflow:hidden;pointer-events:none;z-index:30;contain:strict}',
    '#cozy-winter-snow span{position:absolute;top:-8vh;color:#fff;opacity:.72;text-shadow:0 1px 8px rgba(210,235,255,.65);user-select:none;animation:cozyWinterFall linear infinite;will-change:transform}',
    '@keyframes cozyWinterFall{from{transform:translate3d(0,-8vh,0) rotate(0deg)}to{transform:translate3d(5vw,112vh,0) rotate(360deg)}}',
    '#cozy-winter-garland{position:fixed;z-index:31;pointer-events:none;top:0;left:0;width:100%;height:15px;opacity:.92;background:radial-gradient(circle,#ffe7a0 0 3px,rgba(255,174,83,.28) 4px,transparent 7px) 0 0/34px 15px repeat-x;filter:drop-shadow(0 1px 5px rgba(255,190,100,.45))}',
    '#cozy-winter-garland:before{content:"";position:absolute;left:0;right:0;top:1px;height:8px;border-top:1px solid rgba(255,224,160,.55);border-radius:50%}',
    'html[data-winter="on"] .sidebar,html[data-winter="on"] .chat-head{box-shadow:0 0 0 1px rgba(255,211,135,.10),0 10px 32px rgba(120,82,38,.08)}',
    '@media(prefers-reduced-motion:reduce){#cozy-winter-snow span{animation:none!important;display:none}#cozy-winter-garland{opacity:.45}}'
  ].join('');
  document.head.appendChild(style);
  function isOn() {
    try { return localStorage.getItem(KEY) === 'on'; } catch { return false; }
  }
  function render() {
    const on = isOn();
    document.documentElement.dataset.winter = on ? 'on' : 'off';
    if (!on) {
      snow?.remove(); snow = null;
      garland?.remove(); garland = null;
      return;
    }
    if (!garland) {
      garland = document.createElement('div');
      garland.id = 'cozy-winter-garland';
      garland.setAttribute('aria-hidden', 'true');
      document.body.appendChild(garland);
    }
    if (!snow) {
      snow = document.createElement('div');
      snow.id = 'cozy-winter-snow';
      snow.setAttribute('aria-hidden', 'true');
      for (let i = 0; i < 26; i++) {
        const flake = document.createElement('span');
        flake.textContent = i % 6 === 0 ? '✧' : '❄';
        flake.style.left = ((i * 37) % 100) + '%';
        flake.style.fontSize = (9 + (i % 5) * 3) + 'px';
        flake.style.opacity = String(.28 + (i % 6) * .1);
        flake.style.animationDuration = (11 + (i % 9) * 1.7) + 's';
        flake.style.animationDelay = (-((i * 1.9) % 22)) + 's';
        snow.appendChild(flake);
      }
      document.body.appendChild(snow);
    }
  }
  window.addEventListener('winter-mode-change', render);
  render();
})();