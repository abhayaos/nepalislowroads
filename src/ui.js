// HUD + overlay wiring. All DOM created here so main.js stays lean.
export function initUI(opts) {
  const app = document.getElementById('app');
  app.innerHTML = `
    <canvas id="game-canvas"></canvas>
    <div id="hud">
      <div id="topbar">
        <div id="settings">
          <select id="sel-biome" title="Biome (Q/E)">
            <option value="hills">Hills</option>
            <option value="forest">Forest</option>
            <option value="desert">Desert</option>
            <option value="coast">Coast</option>
          </select>
          <select id="sel-time" title="Time of day">
            <option value="sunrise">Sunrise</option>
            <option value="noon" selected>Noon</option>
            <option value="sunset">Sunset</option>
            <option value="night">Night</option>
          </select>
          <select id="sel-weather" title="Weather">
            <option value="clear" selected>Clear</option>
            <option value="fog">Fog</option>
            <option value="rain">Rain</option>
          </select>
          <select id="sel-quality" title="Quality">
            <option value="high" selected>High</option>
            <option value="low">Low</option>
          </select>
          <select id="sel-cam" title="Camera (C)">
            <option value="0">Chase</option>
            <option value="1">Hood</option>
            <option value="2">Top</option>
            <option value="3">Cine</option>
          </select>
          <button id="btn-auto" title="Autodrive (F)">Auto: OFF</button>
          <button id="btn-reset" title="Reset (R)">Reset</button>
        </div>
        <div id="speedo">
          <div class="v"><span id="speed-val">0</span></div>
          <div class="u">KM/H</div>
          <div class="off" id="offroad"></div>
        </div>
      </div>
      <div id="hint"><b>WASD / Arrows</b> drive &nbsp; <b>R</b> reset &nbsp; <b>C</b> camera &nbsp; <b>F</b> autodrive &nbsp; <b>Q/E</b> biome</div>
    </div>
    <div id="touch">
      <div class="tgroup">
        <button class="tbtn" id="t-left">◀</button>
        <button class="tbtn" id="t-right">▶</button>
      </div>
      <div class="tgroup">
        <button class="tbtn" id="t-brake">▼</button>
        <button class="tbtn" id="t-gas">▲</button>
      </div>
    </div>
    <div id="overlay">
      <div class="panel">
        <h1>slow <span>bus</span> roads</h1>
        <p>Endless chill drive through procedural low-poly hills.<br/>No timer. No traffic. Just you and the bus.</p>
        <div class="row"><label>Biome · Time · Weather</label></div>
        <div class="row">
          <select id="o-biome">
            <option value="hills">Hills</option>
            <option value="forest">Forest</option>
            <option value="desert">Desert</option>
            <option value="coast">Coast</option>
          </select>
          <select id="o-time">
            <option value="sunrise">Sunrise</option>
            <option value="noon" selected>Noon</option>
            <option value="sunset">Sunset</option>
            <option value="night">Night</option>
          </select>
          <select id="o-weather">
            <option value="clear" selected>Clear</option>
            <option value="fog">Fog</option>
            <option value="rain">Rain</option>
          </select>
        </div>
        <button id="begin-btn">begin drive</button>
        <div class="keys"><b>W A S D</b> / arrows to drive · <b>R</b> reset · <b>C</b> camera · <b>F</b> auto-drive<br/>Drop your own bus at <b>public/models/bus.glb</b> to replace the built-in one</div>
      </div>
    </div>`;

  const $ = (id) => document.getElementById(id);
  const hud = $('hud');
  const overlay = $('overlay');

  // overlay → main selects sync
  const syncFromOverlay = () => {
    $('sel-biome').value = $('o-biome').value;
    $('sel-time').value = $('o-time').value;
    $('sel-weather').value = $('o-weather').value;
  };

  $('begin-btn').addEventListener('click', () => {
    syncFromOverlay();
    opts.onBegin({
      biome: $('o-biome').value,
      time: $('o-time').value,
      weather: $('o-weather').value,
    });
    overlay.classList.add('hidden');
    hud.classList.add('visible');
  });

  $('sel-biome').addEventListener('change', (e) => opts.onBiome(e.target.value));
  $('sel-time').addEventListener('change', (e) => opts.onTime(e.target.value));
  $('sel-weather').addEventListener('change', (e) => opts.onWeather(e.target.value));
  $('sel-quality').addEventListener('change', (e) => opts.onQuality(e.target.value));
  $('sel-cam').addEventListener('change', (e) => opts.onCamera(Number(e.target.value)));
  $('btn-reset').addEventListener('click', () => opts.onReset());
  $('btn-auto').addEventListener('click', () => {
    const on = opts.onToggleAuto();
    $('btn-auto').textContent = on ? 'Auto: ON' : 'Auto: OFF';
    $('btn-auto').style.background = on ? '#ffbf3f' : '';
    $('btn-auto').style.color = on ? '#201500' : '';
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
      $('offroad').textContent = offroad ? 'OFF-ROAD' : '';
    },
    setCamera(i) { $('sel-cam').value = String(i); },
    setAuto(on) {
      $('btn-auto').textContent = on ? 'Auto: ON' : 'Auto: OFF';
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
