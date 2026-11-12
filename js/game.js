(() => {
  const TOTAL = FRAGMENTS.length // 18
  const HIGHLIGHT_MS = 1800
  const FIRE_COOLDOWN_MS = 260
  const STAR_SPEED = 0.11 // доля ширины поля в секунду
  const BULLET_SPEED = 1.2
  const TAU = Math.PI * 2
  const STORAGE_KEY = 'gift_dima_progress'

  // ---------- Настройки уровня (из <body data-...>) ----------
  const cfg = document.body.dataset
  const FROM = Number(cfg.from) // первый номер звезды этого уровня
  const TO = Number(cfg.to) // последний номер
  const LEVEL_NUMS = Array.from({ length: TO - FROM + 1 }, (_, i) => FROM + i)
  const IS_LAST_LEVEL = !cfg.next

  const $ = (id) => document.getElementById(id)
  const app = $('app')
  const field = $('field')
  const canvas = $('canvas')
  const ctx = canvas.getContext('2d')
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

  document.querySelectorAll('[data-name]').forEach((el) => (el.textContent = NAME))
  document.title = 'Уровень ' + cfg.level + ' — с днём рождения, ' + NAME + '!'
  $('total').textContent = TOTAL

  // ---------- Прогресс между страницами ----------
  function loadProgress() {
    try {
      const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
      return Array.isArray(raw) ? raw.filter((n) => Number.isInteger(n) && n >= 1 && n <= TOTAL) : []
    } catch (e) {
      return []
    }
  }

  function saveProgress() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify([...collected]))
    } catch (e) {
      /* без сохранения прогресс не переносится на следующую страницу */
    }
  }

  // собранные фрагменты предыдущих уровней
  let collected = new Set(loadProgress().filter((n) => n < FROM))

  // ---------- Панель с фрагментами ----------
  const chipsEl = $('chips')
  const chipEls = FRAGMENTS.map(() => {
    const li = document.createElement('li')
    chipsEl.appendChild(li)
    return li
  })
  let newChip = 0
  let chipTimer = null

  function renderChip(n, isNew) {
    const li = chipEls[n - 1]
    li.textContent = ''
    if (collected.has(n)) {
      li.className = 'chip chip--open' + (isNew ? ' chip--new' : '')
      const num = document.createElement('b')
      num.textContent = '#' + n
      li.append(num, FRAGMENTS[n - 1])
    } else {
      li.className = 'chip chip--empty'
      li.textContent = '#' + n
    }
  }

  function renderAllChips() {
    for (let n = 1; n <= TOTAL; n++) renderChip(n, false)
    updateCount()
  }

  function highlightChip(n) {
    clearTimeout(chipTimer)
    if (newChip) renderChip(newChip, false)
    newChip = n
    renderChip(n, true)
    chipEls[n - 1].scrollIntoView({ block: 'nearest' })
    chipTimer = setTimeout(() => {
      renderChip(n, false)
      newChip = 0
    }, HIGHLIGHT_MS)
  }

  function updateCount() {
    $('count').textContent = collected.size
  }

  // ---------- Состояние игры ----------
  let state = 'idle' // idle | play | ending | over | done
  let lane = 1
  let stars = []
  let bullets = []
  let pops = []
  let queue = []
  let spawned = 0
  let spawnTimer = 0
  let lastFire = 0
  let lastSpawnLane = -1
  let endTimer = null

  function shuffle(arr) {
    const a = arr.slice()
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[a[i], a[j]] = [a[j], a[i]]
    }
    return a
  }

  function startGame() {
    clearTimeout(endTimer)
    clearTimeout(chipTimer)
    newChip = 0
    // сбрасываем этот уровень и все следующие, прошлые уровни остаются
    collected = new Set([...collected].filter((n) => n < FROM))
    saveProgress()
    renderAllChips()

    lane = 1
    stars = []
    bullets = []
    pops = []
    queue = shuffle(LEVEL_NUMS)
    spawned = 0
    spawnTimer = 0.8
    lastSpawnLane = -1
    $('over').hidden = true
    state = 'play'
  }

  function spawnStar() {
    let l
    do {
      l = Math.floor(Math.random() * 3)
    } while (l === lastSpawnLane)
    lastSpawnLane = l
    stars.push({ n: queue[spawned], lane: l, x: 1 + R / W })
    spawned += 1
  }

  function move(dir) {
    if (state !== 'play') return
    lane = Math.max(0, Math.min(2, lane + dir))
  }

  function fire() {
    if (state !== 'play') return
    const now = performance.now()
    if (now - lastFire < FIRE_COOLDOWN_MS) return
    lastFire = now
    bullets.push({ x: (player.x + player.w) / W, lane })
  }

  function destroyStar(index) {
    const s = stars[index]
    stars.splice(index, 1)
    spawnPop(s)
    collected.add(s.n)
    saveProgress()
    updateCount()
    highlightChip(s.n)

    if (LEVEL_NUMS.every((n) => collected.has(n))) {
      state = 'ending'
      endTimer = setTimeout(finishLevel, HIGHLIGHT_MS)
    }
  }

  function spawnPop(s) {
    const x = s.x * W
    const y = laneY[s.lane]
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * TAU
      const v = 80 + Math.random() * 160
      pops.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0, max: 0.5 })
    }
  }

  function gameOver() {
    state = 'over'
    $('over').hidden = false
  }

  function finishLevel() {
    state = 'done'
    if (IS_LAST_LEVEL) {
      $('finalText').textContent = FRAGMENTS.join(' ')
      app.classList.add('is-win')
      resizeFire()
    } else {
      app.classList.add('is-done')
      $('nextBtn').focus({ preventScroll: true })
    }
  }

  function update(dt) {
    if (spawned < LEVEL_NUMS.length) {
      spawnTimer -= dt
      if (spawnTimer <= 0) {
        spawnStar()
        spawnTimer = Math.max(1.9, 2.5 - spawned * 0.08)
      }
    }

    for (const s of stars) {
      s.x -= STAR_SPEED * dt
      if (s.x * W - R <= player.x + player.w * 0.75) {
        gameOver()
        return
      }
    }

    for (let i = bullets.length - 1; i >= 0; i--) {
      const bl = bullets[i]
      bl.x += BULLET_SPEED * dt
      let hit = false
      for (let j = 0; j < stars.length; j++) {
        const s = stars[j]
        if (s.lane === bl.lane && Math.abs(bl.x * W - s.x * W) < R + 8) {
          destroyStar(j)
          hit = true
          break
        }
      }
      if (hit || bl.x > 1.1) bullets.splice(i, 1)
    }

    for (let i = pops.length - 1; i >= 0; i--) {
      const p = pops[i]
      p.life += dt
      p.x += p.vx * dt
      p.y += p.vy * dt
      if (p.life >= p.max) pops.splice(i, 1)
    }
  }

  // ---------- Размеры ----------
  let W = 0
  let H = 0
  let laneH = 0
  let laneY = []
  let R = 30
  const player = { x: 8, w: 60, h: 80 }

  // Персонаж: положи прозрачный PNG в assets/player.png, и он заменит заглушку
  const playerImg = new Image()
  let playerReady = false
  playerImg.onload = () => {
    playerReady = true
    layoutPlayer()
  }
  playerImg.src = 'assets/player.png'

  function layoutPlayer() {
    if (playerReady) {
      player.h = Math.min(laneH * 0.95, 140)
      player.w = player.h * (playerImg.width / playerImg.height)
    } else {
      player.h = Math.min(laneH * 0.8, 84)
      player.w = player.h * 0.9
    }
  }

  function resize() {
    const dpr = window.devicePixelRatio || 1
    const rect = field.getBoundingClientRect()
    W = rect.width
    H = rect.height
    canvas.width = Math.round(W * dpr)
    canvas.height = Math.round(H * dpr)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    laneH = H / 3
    laneY = [laneH * 0.5, laneH * 1.5, laneH * 2.5]
    R = Math.min(laneH * 0.36, 34)
    layoutPlayer()
    resizeFire()
  }

  // ---------- Отрисовка ----------
  function roundRect(x, y, w, h, r) {
    ctx.beginPath()
    ctx.moveTo(x + r, y)
    ctx.arcTo(x + w, y, x + w, y + h, r)
    ctx.arcTo(x + w, y + h, x, y + h, r)
    ctx.arcTo(x, y + h, x, y, r)
    ctx.arcTo(x, y, x + w, y, r)
    ctx.closePath()
  }

  function drawField() {
    ctx.clearRect(0, 0, W, H)
    ctx.fillStyle = 'rgba(255, 255, 255, 0.07)'
    ctx.fillRect(0, lane * laneH, W, laneH)
    ctx.strokeStyle = 'rgba(215, 218, 230, 0.6)'
    ctx.lineWidth = 2
    for (let i = 1; i < 3; i++) {
      ctx.beginPath()
      ctx.moveTo(0, i * laneH)
      ctx.lineTo(W, i * laneH)
      ctx.stroke()
    }
  }

  function drawPlayer() {
    const cy = laneY[lane]
    const x = player.x
    if (playerReady) {
      ctx.drawImage(playerImg, x, cy - player.h / 2, player.w, player.h)
      return
    }
    // заглушка, пока нет assets/player.png
    const s = player.h / 2
    ctx.fillStyle = '#ffffff'
    roundRect(x + player.w * 0.45, cy - s * 0.12, player.w * 0.55, s * 0.24, s * 0.08)
    ctx.fill()
    ctx.fillStyle = '#ffe45c'
    ctx.beginPath()
    ctx.arc(x + player.w * 0.42, cy, s * 0.6, 0, TAU)
    ctx.fill()
    ctx.fillStyle = '#ff3df0'
    ctx.beginPath()
    ctx.moveTo(x + player.w * 0.42 - s * 0.4, cy - s * 0.45)
    ctx.lineTo(x + player.w * 0.42, cy - s * 1.2)
    ctx.lineTo(x + player.w * 0.42 + s * 0.4, cy - s * 0.45)
    ctx.closePath()
    ctx.fill()
    ctx.fillStyle = '#1a27a8'
    ctx.beginPath()
    ctx.arc(x + player.w * 0.42 + s * 0.22, cy - s * 0.08, s * 0.1, 0, TAU)
    ctx.fill()
  }

  function starPath(cx, cy, outer, inner) {
    ctx.beginPath()
    for (let i = 0; i < 10; i++) {
      const r = i % 2 === 0 ? outer : inner
      const a = -Math.PI / 2 + (i * Math.PI) / 5
      const px = cx + Math.cos(a) * r
      const py = cy + Math.sin(a) * r
      if (i === 0) ctx.moveTo(px, py)
      else ctx.lineTo(px, py)
    }
    ctx.closePath()
  }

  function drawStar(s) {
    const x = s.x * W
    const y = laneY[s.lane]
    const outer = R * 1.2
    const g = ctx.createLinearGradient(x, y - outer, x, y + outer)
    g.addColorStop(0, '#fff3a6')
    g.addColorStop(1, '#ffb400')
    ctx.fillStyle = g
    ctx.strokeStyle = '#fff6c4'
    ctx.lineWidth = 2
    ctx.lineJoin = 'round'
    starPath(x, y + R * 0.05, outer, outer * 0.5)
    ctx.fill()
    ctx.stroke()
    ctx.fillStyle = '#5a3a00'
    ctx.font = '800 ' + Math.round(R * 0.62) + 'px Unbounded, system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('#' + s.n, x, y + R * 0.18)
  }

  function drawBullet(bl) {
    const x = bl.x * W
    const y = laneY[bl.lane]
    ctx.fillStyle = '#ffd84a'
    roundRect(x - 13, y - 2.5, 26, 5, 2.5)
    ctx.fill()
  }

  function drawPops() {
    for (const p of pops) {
      const t = p.life / p.max
      ctx.globalAlpha = 1 - t
      ctx.fillStyle = '#ffe45c'
      ctx.beginPath()
      ctx.arc(p.x, p.y, 4 * (1 - t) + 1, 0, TAU)
      ctx.fill()
    }
    ctx.globalAlpha = 1
  }

  function draw() {
    drawField()
    stars.forEach(drawStar)
    bullets.forEach(drawBullet)
    drawPops()
    drawPlayer()
  }

  // ---------- Финал: дракон и огонь (только на последнем уровне) ----------
  const winEl = $('win')
  const fireCanvas = $('fire')
  const fctx = fireCanvas ? fireCanvas.getContext('2d') : null
  const mouthEl = $('mouth')
  const dragonEl = $('dragon')
  let sparks = []

  function resizeFire() {
    if (!fctx) return
    const dpr = window.devicePixelRatio || 1
    const r = winEl.getBoundingClientRect()
    fireCanvas.width = Math.round(r.width * dpr)
    fireCanvas.height = Math.round(r.height * dpr)
    fctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  }

  function fireFrame(dt) {
    const wr = winEl.getBoundingClientRect()
    const mr = mouthEl.getBoundingClientRect()
    const dw = dragonEl.getBoundingClientRect().width
    const mx = mr.left + mr.width / 2 - wr.left
    const my = mr.top + mr.height / 2 - wr.top

    const amount = reducedMotion ? 1 : 4
    for (let i = 0; i < amount; i++) {
      sparks.push({
        x: mx,
        y: my,
        vx: -(0.25 + Math.random() * 0.45) * dw,
        vy: (Math.random() - 0.5) * 0.16 * dw,
        r: (0.022 + Math.random() * 0.026) * dw,
        life: 0,
        max: 0.45 + Math.random() * 0.45,
      })
    }

    fctx.clearRect(0, 0, wr.width, wr.height)
    fctx.globalCompositeOperation = 'lighter'
    for (let i = sparks.length - 1; i >= 0; i--) {
      const s = sparks[i]
      s.life += dt
      if (s.life >= s.max) {
        sparks.splice(i, 1)
        continue
      }
      const t = s.life / s.max
      s.x += s.vx * dt
      s.vy -= dw * 0.35 * dt
      s.y += s.vy * dt
      fctx.globalAlpha = (1 - t) * 0.9
      fctx.fillStyle = 'hsl(' + (52 - 46 * t) + ', 100%, ' + (62 - 22 * t) + '%)'
      fctx.beginPath()
      fctx.arc(s.x, s.y, s.r * (1 - 0.5 * t), 0, TAU)
      fctx.fill()
    }
    fctx.globalAlpha = 1
    fctx.globalCompositeOperation = 'source-over'
  }

  // ---------- Главный цикл ----------
  let last = performance.now()
  function frame(now) {
    const dt = Math.min((now - last) / 1000, 0.05)
    last = now
    if (state === 'play' || state === 'ending') update(dt)
    if (state === 'done' && IS_LAST_LEVEL) fireFrame(dt)
    else draw()
    requestAnimationFrame(frame)
  }

  // ---------- Управление ----------
  $('startBtn').addEventListener('click', () => {
    $('rules').hidden = true
    startGame()
  })

  $('upBtn').addEventListener('pointerdown', () => move(-1))
  $('downBtn').addEventListener('pointerdown', () => move(1))

  let holdTimer = null
  const fireBtn = $('fireBtn')
  function stopHold() {
    clearInterval(holdTimer)
    holdTimer = null
  }
  fireBtn.addEventListener('pointerdown', () => {
    fire()
    stopHold()
    holdTimer = setInterval(fire, FIRE_COOLDOWN_MS)
  })
  ;['pointerup', 'pointerleave', 'pointercancel'].forEach((e) => fireBtn.addEventListener(e, stopHold))

  // тап по полю после Game Over перезапускает уровень
  field.addEventListener('click', () => {
    if (state === 'over') startGame()
  })

  window.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') {
      move(-1)
      e.preventDefault()
    } else if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') {
      move(1)
      e.preventDefault()
    } else if (e.key === ' ') {
      if (document.activeElement && document.activeElement.tagName === 'BUTTON') return
      fire()
      e.preventDefault()
    }
  })

  renderAllChips()
  new ResizeObserver(resize).observe(field)
  window.addEventListener('resize', resize)
  resize()
  requestAnimationFrame(frame)
})()
