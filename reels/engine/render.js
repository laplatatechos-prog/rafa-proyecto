// Uso: node render.js <reel> [salida.mp4] [--frames 1,5.6,10]  (frames = solo PNG de control)
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

(async () => {
  const reel = process.argv[2] || 'sobretecho';
  const out = process.argv[3] && !process.argv[3].startsWith('--') ? process.argv[3]
            : path.join(__dirname, '..', 'out', `reel-${reel}.mp4`);
  const fi = process.argv.indexOf('--frames');
  const stills = fi > 0 ? process.argv[fi + 1].split(',').map(Number) : null;
  const FPS = 30;

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
  await page.goto('file://' + path.join(__dirname, 'reel.html') + '?reel=' + reel);
  await page.evaluate(() => window.READY);
  const dur = await page.evaluate(() => window.DURATION);
  fs.mkdirSync(path.dirname(out), { recursive: true });

  if (stills) {
    for (const t of stills) {
      await page.evaluate(t => setT(t), t);
      const f = out.replace(/\.mp4$/, `-t${t}.png`);
      await page.screenshot({ path: f });
      console.log(f);
    }
    await browser.close(); return;
  }

  const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error',
    '-f', 'image2pipe', '-framerate', String(FPS), '-i', '-',
    '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo',
    '-shortest', '-c:v', 'libx264', '-preset', 'slow', '-crf', '18',
    '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-r', String(FPS),
    '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', out], { stdio: ['pipe', 'inherit', 'inherit'] });

  const N = Math.round(dur * FPS);
  for (let i = 0; i < N; i++) {
    await page.evaluate(t => setT(t), i / FPS);
    const buf = await page.screenshot({ type: 'jpeg', quality: 95 });
    if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
  }
  ff.stdin.end();
  await new Promise(r => ff.on('close', r));
  await browser.close();
  console.log('OK', out, N, 'frames');
})();
