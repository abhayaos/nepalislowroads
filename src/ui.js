// HUD + overlay wiring. All DOM created here so main.js stays lean.
export function initUI(opts) {
  const app = document.getElementById('app');
  app.innerHTML = `
    <canvas id="game-canvas"></canvas>
    <div id="hud">
      <div id="speedo">
        <div class="v"><span id="speed-val">0</span></div>
        <div class="u">km/h</div>
        <div class="off" id="offroad"></div>
      </div>
      <div id="panel">
        <div id="panel-head">
          <span>settings</span>
          <button id="panel-toggle" title="hide panel">–</button>
        </div>
        <div id="panel-body">
          <label class="fld"><span>location</span>
            <select id="sel-biome" title="Biome (Q/E)">
              <option value="hills">hills</option>
              <option value="forest">forest</option>
              <option value="desert">desert</option>
              <option value="coast">coast</option>
            </select>
          </label>
          <label class="fld"><span>theme</span>
            <select id="sel-theme" title="Theme (T)">
              <option value="normal" selected>normal</option>
              <option value="dashain">dashain</option>
            </select>
          </label>
          <label class="fld"><span>light</span>
            <select id="sel-time" title="Time of day">
              <option value="sunrise">sunrise</option>
              <option value="noon" selected>noon</option>
              <option value="sunset">sunset</option>
              <option value="night">night</option>
            </select>
          </label>
          <label class="fld"><span>weather</span>
            <select id="sel-weather" title="Weather">
              <option value="clear" selected>clear</option>
              <option value="fog">fog</option>
              <option value="rain">rain</option>
            </select>
          </label>
          <label class="fld"><span>detail</span>
            <select id="sel-quality" title="Quality">
              <option value="high" selected>high</option>
              <option value="low">low</option>
            </select>
          </label>
          <label class="fld"><span>view</span>
            <select id="sel-cam" title="Camera (C)">
              <option value="0">chase</option>
              <option value="1">hood</option>
              <option value="2">top</option>
              <option value="3">cine</option>
              <option value="4">cabin</option>
            </select>
          </label>
          <div id="panel-btns">
            <button id="btn-auto" title="Autodrive (F)">auto</button>
            <button id="btn-mute" title="Sound (M)">sound</button>
            <button id="btn-reset" title="Reset (R)">reset</button>
          </div>
        </div>
      </div>
      <div id="hint"><b>wasd</b> drive &nbsp;·&nbsp; <b>r</b> reset &nbsp;·&nbsp; <b>c</b> camera &nbsp;·&nbsp; <b>f</b> auto &nbsp;·&nbsp; <b>t</b> theme &nbsp;·&nbsp; <b>m</b> sound &nbsp;·&nbsp; <b>h</b> horn &nbsp;·&nbsp; <b>drag</b> look</div>
      <div id="festive">&#x1FA81; shubha dashain · happy dashain &#x1FA94;</div>
    </div>
    <div id="touch">
      <div class="tgroup">
        <button class="tbtn" id="t-left">&#x25C0;</button>
        <button class="tbtn" id="t-right">&#x25B6;</button>
      </div>
      <div class="tgroup">
        <button class="tbtn" id="t-brake">&#x25BC;</button>
        <button class="tbtn" id="t-gas">&#x25B2;</button>
      </div>
    </div>
    <div id="overlay">
      <div id="brand">jamara<em>journey</em></div>
      <div id="tag">endless driving zen</div>
      <div id="setup">
        <label class="fld"><span>location</span>
          <select id="o-biome">
            <option value="hills">hills</option>
            <option value="forest">forest</option>
            <option value="desert">desert</option>
            <option value="coast">coast</option>
          </select>
        </label>
        <label class="fld"><span>theme</span>
          <select id="o-theme">
            <option value="normal" selected>normal</option>
            <option value="dashain">dashain</option>
          </select>
        </label>
        <label class="fld"><span>light</span>
          <select id="o-time">
            <option value="sunrise">sunrise</option>
            <option value="noon" selected>noon</option>
            <option value="sunset">sunset</option>
            <option value="night">night</option>
          </select>
        </label>
        <label class="fld"><span>weather</span>
          <select id="o-weather">
            <option value="clear" selected>clear</option>
            <option value="fog">fog</option>
            <option value="rain">rain</option>
          </select>
        </label>
      </div>
      <button id="begin-btn">begin</button>
      <div id="keys"><b>w a s d</b> drive &nbsp; <b>r</b> reset &nbsp; <b>c</b> camera &nbsp; <b>f</b> auto-drive &nbsp; <b>t</b> theme &nbsp; <b>m</b> sound &nbsp; <b>h</b> horn</div>
    </div>`;

  const $ = (id) => document.getElementById(id);
  const hud = $('hud');
  const overlay = $('overlay');

  // overlay → main selects sync
  const syncFromOverlay = () => {
    $('sel-biome').value = $('o-biome').value;
    $('sel-theme').value = $('o-theme').value;
    $('sel-time').value = $('o-time').value;
    $('sel-weather').value = $('o-weather').value;
  };

  $('begin-btn').addEventListener('click', () => {
    syncFromOverlay();
    opts.onBegin({
      biome: $('o-biome').value,
      theme: $('o-theme').value,
      time: $('o-time').value,
      weather: $('o-weather').value,
    });
    overlay.classList.add('hidden');
    hud.classList.add('visible');
  });

  $('sel-biome').addEventListener('change', (e) => opts.onBiome(e.target.value));
  $('sel-theme').addEventListener('change', (e) => opts.onTheme(e.target.value));
  $('sel-time').addEventListener('change', (e) => opts.onTime(e.target.value));
  $('sel-weather').addEventListener('change', (e) => opts.onWeather(e.target.value));
  $('sel-quality').addEventListener('change', (e) => opts.onQuality(e.target.value));
  $('sel-cam').addEventListener('change', (e) => opts.onCamera(Number(e.target.value)));
  $('btn-reset').addEventListener('click', () => opts.onReset());
  $('btn-mute').addEventListener('click', () => {
    const muted = opts.onToggleMute();
    $('btn-mute').textContent = muted ? 'muted' : 'sound';
    $('btn-mute').classList.toggle('on', muted);
  });
  $('btn-auto').addEventListener('click', () => {
    const on = opts.onToggleAuto();
    $('btn-auto').textContent = on ? 'auto · on' : 'auto';
    $('btn-auto').classList.toggle('on', on);
  });
  $('panel-toggle').addEventListener('click', () => {
    const panel = $('panel');
    panel.classList.toggle('closed');
    $('panel-toggle').textContent = panel.classList.contains('closed') ? '+' : '–';
  });

  if ('ontouchstart' in window) document.body.classList.add('touch');

  const bindHold = (id, key) => {
    const el = $(id);
    const on = (e) => { e.preventDefault(); opts.touch[key] = true; };
    const off = (e) => { e.preventDefault(); opts.touch[key] = false; };
    el.addEventListener('pointerdown', on);
    el.addEventListener('pointerup', off);
    el.addEventListener('pointerleave', off);
    el.addEventListener('pointercancel', off);
  };
  bindHold('t-gas', 'up');
  bindHold('t-brake', 'down');
  bindHold('t-left', 'left');
  bindHold('t-right', 'right');

  return {
    setSpeed(kmh, offroad) {
      $('speed-val').textContent = String(Math.round(kmh));
      $('offroad').textContent = offroad ? 'off-road' : '';
    },
    setCamera(i) { $('sel-cam').value = String(i); },
    setTheme(t) {
      $('sel-theme').value = t;
      $('festive').style.display = t === 'dashain' ? 'block' : 'none';
    },
    setAuto(on) {
      $('btn-auto').textContent = on ? 'auto · on' : 'auto';
      $('btn-auto').classList.toggle('on', on);
    },
    setMuted(muted) {
      $('btn-mute').textContent = muted ? 'muted' : 'sound';
      $('btn-mute').classList.toggle('on', muted);
    },
    cycleBiome(dir) {
      const order = ['hills', 'forest', 'desert', 'coast'];
      let i = order.indexOf($('sel-biome').value);
      i = (i + dir + order.length) % order.length;
      $('sel-biome').value = order[i];
      opts.onBiome(order[i]);
    },
  };
}
