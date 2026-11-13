(() => {
  const TOTAL = FRAGMENTS.length // 18
  const HIGHLIGHT_MS = 1800
  const FIRE_COOLDOWN_MS = 260
  const BALLOON_SPEED = 0.11 // доля ширины поля в секунду
  const BULLET_SPEED = 1.2
  const TAU = Math.PI * 2
  const STORAGE_KEY = 'gift_dima_progress'

  // Цвета шариков: [светлый, тёмный]
  const BALLOON_COLORS = [
    ['#ff8fc2', '#d63384'],
    ['#c58bff', '#7a3fe0'],
    ['#e6c2ff', '#a64dff'],
    ['#ff6ad5', '#c2189a'],
    ['#8dffb8', '#1fbf6a'],
    ['#ffab72', '#e0561a'],
  ]

  // ---------- Настройки уровня (из <body data-...>) ----------
  const cfg = document.body.dataset
  const FROM = Number(cfg.from) // первый номер шарика этого уровня
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
      num.textContent = String(n)
      li.append(num, FRAGMENTS[n - 1])
    } else {
      li.className = 'chip chip--empty'
      li.textContent = String(n)
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
  let balloons = []
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
    balloons = []
    bullets = []
    pops = []
    queue = shuffle(LEVEL_NUMS)
    spawned = 0
    spawnTimer = 1.2
    lastSpawnLane = -1
    $('over').hidden = true
    state = 'play'
  }

  function spawnBalloon() {
    let l
    do {
      l = Math.floor(Math.random() * 3)
    } while (l === lastSpawnLane)
    lastSpawnLane = l
    balloons.push({ n: queue[spawned], lane: l, x: 1 + R / W })
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
    bullets.push({ x: (player.x + player.w * 0.7) / W, lane, dy: playerDy(lane) })
  }

  function destroyBalloon(index) {
    const b = balloons[index]
    balloons.splice(index, 1)
    spawnPop(b)
    collected.add(b.n)
    saveProgress()
    updateCount()
    highlightChip(b.n)

    if (LEVEL_NUMS.every((n) => collected.has(n))) {
      state = 'ending'
      endTimer = setTimeout(finishLevel, HIGHLIGHT_MS)
    }
  }

  function spawnPop(b) {
    const x = b.x * W
    const y = laneY[b.lane]
    const color = BALLOON_COLORS[b.n % BALLOON_COLORS.length][0]
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * TAU
      const v = 80 + Math.random() * 170
      pops.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0, max: 0.55, color })
    }
  }

  function gameOver() {
    state = 'over'
    $('over').hidden = false
  }

  function finishLevel() {
    state = 'done'
    if (IS_LAST_LEVEL) {
      buildFinalText()
      app.classList.add('is-win')
      resizeBlast()
    } else {
      app.classList.add('is-done')
      $('nextBtn').focus({ preventScroll: true })
    }
  }

  function update(dt) {
    if (spawned < LEVEL_NUMS.length) {
      spawnTimer -= dt
      if (spawnTimer <= 0) {
        spawnBalloon()
        spawnTimer = Math.max(1.9, 2.5 - spawned * 0.08)
      }
    }

    for (const b of balloons) {
      b.x -= BALLOON_SPEED * dt
      if (b.x * W - R * 0.9 <= player.x + player.w * 0.75) {
        gameOver()
        return
      }
    }

    for (let i = bullets.length - 1; i >= 0; i--) {
      const bl = bullets[i]
      bl.x += BULLET_SPEED * dt
      let hit = false
      for (let j = 0; j < balloons.length; j++) {
        const b = balloons[j]
        if (b.lane === bl.lane && Math.abs(bl.x * W - b.x * W) < R + 8) {
          destroyBalloon(j)
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
      p.vy += 160 * dt
      if (p.life >= p.max) pops.splice(i, 1)
    }
  }

  // ---------- Размеры ----------
  let W = 0
  let H = 0
  let laneH = 0
  let laneY = []
  let R = 30
  const player = { x: 6, w: 60, h: 80 }

  // Персонаж: assets/player.png (если файла нет, рисуется заглушка)
  const playerImg = new Image()
  let playerReady = false
  playerImg.onload = () => {
    playerReady = true
    layoutPlayer()
  }
  playerImg.src = 'assets/player.png'

  function playerDy(l) {
    return Math.min(0, H - (laneY[l] + player.h * 0.6))
  }

  function layoutPlayer() {
    if (playerReady) {
      player.h = Math.min(laneH * 1.2, 280)
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
    R = Math.min(laneH * 0.3, 52)
    layoutPlayer()
    resizeBlast()
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
      // дуло миниганa на высоте ~40% картинки: выравниваем его по дорожке
      ctx.drawImage(playerImg, x, cy - player.h * 0.4 + playerDy(lane), player.w, player.h)
      return
    }
    // заглушка, пока нет assets/player.png
    const s = player.h / 2
    ctx.fillStyle = '#ffffff'
    roundRect(x + player.w * 0.45, cy - s * 0.12, player.w * 0.55, s * 0.24, s * 0.08)
    ctx.fill()
    ctx.fillStyle = '#b88cff'
    ctx.beginPath()
    ctx.arc(x + player.w * 0.42, cy, s * 0.6, 0, TAU)
    ctx.fill()
  }

  function drawBalloon(b) {
    const x = b.x * W
    const cy = laneY[b.lane] - R * 0.2
    const rx = R * 0.92
    const ry = R * 1.1
    const [light, dark] = BALLOON_COLORS[b.n % BALLOON_COLORS.length]

    // ниточка
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.75)'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(x, cy + ry + 4)
    ctx.bezierCurveTo(x + R * 0.5, cy + ry + R * 0.4, x - R * 0.4, cy + ry + R * 0.8, x + R * 0.2, cy + ry + R * 1.15)
    ctx.stroke()

    // узелок
    ctx.fillStyle = dark
    ctx.beginPath()
    ctx.moveTo(x, cy + ry - 1)
    ctx.lineTo(x - R * 0.16, cy + ry + R * 0.2)
    ctx.lineTo(x + R * 0.16, cy + ry + R * 0.2)
    ctx.closePath()
    ctx.fill()

    // шарик
    const g = ctx.createRadialGradient(x - rx * 0.35, cy - ry * 0.4, R * 0.1, x, cy, ry * 1.15)
    g.addColorStop(0, light)
    g.addColorStop(1, dark)
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.ellipse(x, cy, rx, ry, 0, 0, TAU)
    ctx.fill()

    // блик
    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)'
    ctx.beginPath()
    ctx.ellipse(x - rx * 0.4, cy - ry * 0.45, rx * 0.16, ry * 0.26, -0.5, 0, TAU)
    ctx.fill()

    // номер
    ctx.fillStyle = '#0a0612'
    ctx.font = '800 ' + Math.round(R * 0.56) + 'px Unbounded, system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(String(b.n), x, cy + R * 0.05)
  }

  function drawBullet(bl) {
    const x = bl.x * W
    const y = laneY[bl.lane] + bl.dy
    const len = Math.max(26, R * 0.9)
    ctx.fillStyle = '#e3ccff'
    roundRect(x - len / 2, y - 3, len, 6, 3)
    ctx.fill()
  }

  function drawPops() {
    for (const p of pops) {
      const t = p.life / p.max
      ctx.globalAlpha = 1 - t
      ctx.fillStyle = p.color
      ctx.beginPath()
      ctx.arc(p.x, p.y, 4 * (1 - t) + 1, 0, TAU)
      ctx.fill()
    }
    ctx.globalAlpha = 1
  }

  function draw() {
    drawField()
    balloons.forEach(drawBalloon)
    bullets.forEach(drawBullet)
    drawPops()
    drawPlayer()
  }

  // ---------- Финал (только на последнем уровне) ----------
  const stageEl = $('stage')
  const blastCanvas = $('blast')
  const bctx = blastCanvas ? blastCanvas.getContext('2d') : null
  let blastW = 0
  let blastH = 0
  let particles = []
  let rings = []
  let burstTimer = 0

  if ($('winCount')) $('winCount').textContent = TOTAL + '/' + TOTAL

  function buildFinalText() {
    const box = $('finalText')
    box.textContent = ''
    let p = null
    FRAGMENTS.forEach((text, i) => {
      if (!p || PARAGRAPH_STARTS.includes(i)) {
        p = document.createElement('p')
        box.appendChild(p)
      }
      p.append((p.textContent ? ' ' : '') + text)
    })
    const ps = document.createElement('p')
    ps.className = 'win__ps'
    ps.textContent = POSTSCRIPT
    box.appendChild(ps)
  }

  function resizeBlast() {
    if (!bctx) return
    const dpr = window.devicePixelRatio || 1
    const r = stageEl.getBoundingClientRect()
    blastW = r.width
    blastH = r.height
    blastCanvas.width = Math.round(blastW * dpr)
    blastCanvas.height = Math.round(blastH * dpr)
    bctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  }

  // Взрыв: вспышка-кольцо и разлетающиеся искры
  function spawnBurst(x, y) {
    const colors = ['#ff7ab6', '#e6c2ff', '#c58bff', '#ffffff', '#ff6ad5']
    const n = reducedMotion ? 12 : 36
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU
      const v = 60 + Math.random() * 190
      particles.push({
        x,
        y,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v,
        r: 1.5 + Math.random() * 2.5,
        life: 0,
        max: 0.7 + Math.random() * 0.6,
        color: colors[Math.floor(Math.random() * colors.length)],
      })
    }
    rings.push({ x, y, life: 0, max: 0.55 })
  }

  function blastFrame(dt) {
    if (!bctx || !blastW) return
    burstTimer -= dt
    if (burstTimer <= 0) {
      burstTimer = reducedMotion ? 1.6 : 0.55 + Math.random() * 0.5
      spawnBurst(blastW * (0.15 + Math.random() * 0.8), blastH * (0.2 + Math.random() * 0.6))
    }

    bctx.clearRect(0, 0, blastW, blastH)
    bctx.globalCompositeOperation = 'lighter'

    for (let i = rings.length - 1; i >= 0; i--) {
      const r = rings[i]
      r.life += dt
      if (r.life >= r.max) {
        rings.splice(i, 1)
        continue
      }
      const t = r.life / r.max
      bctx.globalAlpha = 0.8 * (1 - t)
      bctx.strokeStyle = '#e9c8ff'
      bctx.lineWidth = 4 * (1 - t) + 1
      bctx.beginPath()
      bctx.arc(r.x, r.y, 8 + t * 70, 0, TAU)
      bctx.stroke()
    }

    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i]
      p.life += dt
      if (p.life >= p.max) {
        particles.splice(i, 1)
        continue
      }
      const t = p.life / p.max
      p.vy += 140 * dt
      p.x += p.vx * dt
      p.y += p.vy * dt
      bctx.globalAlpha = 1 - t
      bctx.fillStyle = p.color
      bctx.beginPath()
      bctx.arc(p.x, p.y, p.r * (1 - 0.4 * t), 0, TAU)
      bctx.fill()
    }

    bctx.globalAlpha = 1
    bctx.globalCompositeOperation = 'source-over'
  }

  // ---------- Главный цикл ----------
  let last = performance.now()
  function frame(now) {
    const dt = Math.min((now - last) / 1000, 0.05)
    last = now
    if (state === 'play' || state === 'ending') update(dt)
    if (state === 'done' && IS_LAST_LEVEL) blastFrame(dt)
    else draw()
    requestAnimationFrame(frame)
  }

  // ---------- Управление ----------
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
      fire()
      e.preventDefault()
    }
  })

  renderAllChips()
  new ResizeObserver(resize).observe(field)
  window.addEventListener('resize', resize)
  resize()
  startGame()
  requestAnimationFrame(frame)
})()
