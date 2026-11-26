(() => {
  const KEY = 'messenger-winter-mode';
  const isOn = () => {
    try { return localStorage.getItem(KEY) === 'on'; } catch { return false; }
  };
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
    '.s-toggle.winter-toggle{padding:12px;margin:8px 0 14px;border-radius:14px;background:linear-gradient(120deg,rgba(47,126,91,.12),rgba(220,172,91,.13));border:1px solid rgba(201,164,103,.25)}',
    '.winter-toggle .winter-label{font-weight:650}.winter-toggle .winter-hint{display:block;margin-top:3px;font-size:12px;opacity:.7}.winter-toggle .switch{flex:0 0 auto}',
    '.m3d{display:none!important}.spin-stage{pointer-events:none!important;touch-action:auto!important}.spin-card{transform:none!important}.spin-face.back,.spin-hint{display:none!important}',
    '@media(prefers-reduced-motion:reduce){#cozy-winter-snow span{animation:none!important;display:none}#cozy-winter-garland{opacity:.45}}'
  ].join('');
  document.head.appendChild(style);

  function setMode(on) {
    try { localStorage.setItem(KEY, on ? 'on' : 'off'); } catch {}
    document.documentElement.dataset.winter = on ? 'on' : 'off';
    renderDecor();
    updateToggle();
  }

  function renderDecor() {
    if (!isOn()) {
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
      for (let i = 0; i < 30; i++) {
        const flake = document.createElement('span');
        flake.textContent = i % 5 === 0 ? '✧' : '❄';
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

  function updateToggle() {
    const button = document.querySelector('#cozy-winter-toggle');
    if (!button) return;
    const on = isOn();
    button.setAttribute('aria-checked', String(on));
    button.classList.toggle('on', on);
  }

  function addToggle() {
    const heading = [...document.querySelectorAll('.s-body h4')]
      .find((el) => el.textContent.trim() === 'Effects');
    if (!heading || document.querySelector('#cozy-winter-toggle')) return;
    const row = document.createElement('div');
    row.className = 's-toggle winter-toggle';
    const copy = document.createElement('div');
    const label = document.createElement('div');
    label.className = 'winter-label';
    label.textContent = '🎄 Cozy New Year mode';
    const hint = document.createElement('small');
    hint.className = 'muted winter-hint';
    hint.textContent = 'Soft snowfall, warm lights and a festive atmosphere. Only you control this on your device.';
    copy.append(label, hint);
    const button = document.createElement('button');
    button.type = 'button';
    button.id = 'cozy-winter-toggle';
    button.className = 'switch';
    button.setAttribute('role', 'switch');
    button.setAttribute('aria-label', 'Cozy New Year mode');
    const knob = document.createElement('span');
    button.appendChild(knob);
    button.addEventListener('click', () => setMode(!isOn()));
    row.append(copy, button);
    heading.after(row);
    updateToggle();
  }

  function remove3DPresentation(root) {
    root.querySelectorAll('.m3d').forEach((model) => {
      const emoji = model.querySelector('span')?.textContent?.trim() || '🎁';
      const flat = document.createElement('div');
      flat.className = 'gift-emoji';
      flat.textContent = emoji;
      model.replaceWith(flat);
    });
    root.querySelectorAll('.tier-chip').forEach((chip) => {
      if (/3D/i.test(chip.textContent)) chip.remove();
    });
    root.querySelectorAll('.tier-badge').forEach((badge) => {
      badge.textContent = badge.textContent.replace(/^3D\\s*·\\s*/i, '');
    });
    root.querySelectorAll('.auth-hero li').forEach((item) => {
      if (/3D/i.test(item.textContent)) item.textContent = '🎁 Collectible gifts with unique styles';
    });
    root.querySelectorAll('.spin-hint').forEach((hint) => hint.remove());
  }

  function refresh() {
    addToggle();
    remove3DPresentation(document);
  }

  document.documentElement.dataset.winter = isOn() ? 'on' : 'off';
  renderDecor();
  refresh();
  const observer = new MutationObserver(() => refresh());
  observer.observe(document.body, { childList: true, subtree: true });
})();