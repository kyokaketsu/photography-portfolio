// v13 (ios-single-glass-v13) 移动端基线自动化检查
// 390 x 844 移动视口,模拟交接文档第 5 节的检查项
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { extname, join, resolve } from 'node:path';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ROOT = resolve(process.cwd());
const OUT = join(ROOT, 'v13-baseline');
await mkdir(OUT, { recursive: true });

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.ico': 'image/x-icon',
};

// ---------------- 静态文件服务器(随机端口) ----------------
const server = createServer(async (req, res) => {
  try {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (p === '/') p = '/index.html';
    const fp = join(ROOT, p);
    if (!fp.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
    const data = await readFile(fp);
    res.writeHead(200, { 'Content-Type': MIME[extname(fp).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(data);
  } catch { res.writeHead(404); res.end('nf'); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const PORT = server.address().port;
console.log(`[server] http://127.0.0.1:${PORT}/`);

// ---------------- 启动 headless Chrome ----------------
// 清理上一轮的 profile(此时 Chrome 已退出,锁已释放)
for (const name of ['.chrome-profile']) {
  await rm(join(ROOT, name), { recursive: true, force: true }).catch(() => {});
}
const profile = join(ROOT, '.chrome-profile');
const chrome = spawn(CHROME, [
  '--headless', '--remote-debugging-port=0', `--user-data-dir=${profile}`,
  '--no-first-run', '--no-default-browser-check', '--disable-extensions',
  '--hide-scrollbars', '--remote-allow-origins=*',
  `http://127.0.0.1:${PORT}/index.html`,
], { stdio: 'ignore' });
process.on('exit', () => { try { chrome.kill(); } catch {} });

const portFile = join(profile, 'DevToolsActivePort');
let wsPort = null;
for (let i = 0; i < 100 && !wsPort; i++) {
  if (existsSync(portFile)) {
    wsPort = parseInt((await readFile(portFile, 'utf8')).split('\n')[0].trim(), 10) || null;
  }
  if (!wsPort) await sleep(100);
}
if (!wsPort) throw new Error('Chrome DevTools 端口未就绪');

let target = null;
for (let i = 0; i < 50 && !target; i++) {
  try {
    const list = await (await fetch(`http://127.0.0.1:${wsPort}/json/list`)).json();
    target = list.find((t) => t.type === 'page' && t.url.includes('index.html')) || list.find((t) => t.type === 'page');
  } catch {}
  if (!target) await sleep(200);
}
if (!target) throw new Error('找不到页面 target');
console.log('[chrome] target:', target.url);

// ---------------- CDP 客户端 ----------------
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });

let msgId = 0;
const pending = new Map();
const consoleEntries = [];
ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
  if (msg.method === 'Runtime.consoleAPICalled') {
    const t = msg.params.type;
    if (t === 'error' || t === 'warning') consoleEntries.push({ kind: t, text: msg.params.args.map((a) => a.value ?? a.description ?? '').join(' ') });
  }
  if (msg.method === 'Runtime.exceptionThrown') {
    consoleEntries.push({ kind: 'exception', text: msg.params.exceptionDetails.text + ' ' + (msg.params.exceptionDetails.exception?.description || '') });
  }
  if (msg.method === 'Log.entryAdded') {
    const e = msg.params.entry;
    if (e.level === 'error' || e.level === 'warning') consoleEntries.push({ kind: 'log-' + e.level, text: `${e.source}: ${e.text} ${e.url || ''}` });
  }
};
function cdp(method, params = {}) {
  return new Promise((resP, rejP) => {
    const id = ++msgId;
    pending.set(id, (m) => (m.error ? rejP(new Error(method + ': ' + m.error.message)) : resP(m.result)));
    ws.send(JSON.stringify({ id, method, params }));
  });
}
async function evaljs(expression) {
  const r = await cdp('Runtime.evaluate', { expression, returnByValue: true });
  if (r.exceptionDetails) throw new Error('eval: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
  return r.result.value;
}
async function shot(name) {
  const r = await cdp('Page.captureScreenshot', { format: 'png' });
  await writeFile(join(OUT, name), Buffer.from(r.data, 'base64'));
  console.log('[shot]', name);
}

// ---------------- 结果记录 ----------------
const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok: !!ok, detail: String(detail) });
  console.log(`${ok ? 'PASS' : 'FAIL'} | ${name}${detail ? ' | ' + detail : ''}`);
};
const near = (a, b, tol = 2) => Math.abs(a - b) <= tol;
// Chrome 计算值可能保留 calc() 未解析,两种形式都认
const clippedToHeader = (clip) => {
  if (clip.includes('calc(100% - 68px')) return true;
  const m = clip.match(/inset\(([^)]+)\)/);
  if (!m) return false;
  const v = m[1].split(/\s+/);
  return v.length === 4 && near(parseFloat(v[2]), 776, 3);
};

// ---------------- 初始化 ----------------
await cdp('Runtime.enable');
await cdp('Log.enable');
await cdp('Page.enable');
await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
await cdp('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
await cdp('Page.reload', { ignoreCache: true });
for (let i = 0; i < 60; i++) {
  const rs = await evaljs('document.readyState').catch(() => 'loading');
  if (rs === 'complete') break;
  await sleep(250);
}
await sleep(1200); // 等字体与图片布局稳定
console.log('--- 页面加载完成,开始检查 ---');

const SNAPSHOT = `(() => {
  const bd = document.querySelector('.menu-backdrop');
  const blend = document.querySelector('.menu-toolbar-blend');
  const panel = document.querySelector('.menu-panel');
  const brand = document.querySelector('.brand');
  const toggle = document.querySelector('.menu-toggle');
  const meta = document.querySelector('.menu-meta');
  const cs = (el) => getComputedStyle(el);
  const rc = (el) => { const r = el.getBoundingClientRect(); return { top: +r.top.toFixed(1), bottom: +r.bottom.toFixed(1), left: +r.left.toFixed(1), right: +r.right.toFixed(1), width: +r.width.toFixed(1), height: +r.height.toFixed(1) }; };
  const bdc = cs(bd), pc = cs(panel);
  return {
    htmlClass: document.documentElement.className || '(none)',
    bodyPos: document.body.style.position || '(none)',
    bodyTop: document.body.style.top || '(none)',
    scrollY: Math.round(window.scrollY),
    scrollW: document.documentElement.scrollWidth,
    clientW: document.documentElement.clientWidth,
    bd: { clip: bdc.clipPath, pe: bdc.pointerEvents, wc: bdc.willChange, bf: bdc.backdropFilter || '(none)', z: bdc.zIndex, rect: rc(bd), vis: bdc.visibility, ta: bdc.touchAction },
    blend: { vis: cs(blend).visibility, op: cs(blend).opacity, rect: rc(blend) },
    panel: { vis: pc.visibility, pe: pc.pointerEvents, op: pc.opacity, clip: pc.clipPath, tf: pc.transform, z: pc.zIndex },
    brand: { rect: rc(brand), z: cs(brand).zIndex, op: cs(brand).opacity },
    toggle: { rect: rc(toggle), z: cs(toggle).zIndex },
    meta: { rect: rc(meta), op: cs(meta).opacity },
    firstLinkOp: cs(document.querySelector('.menu-panel a')).opacity,
    hitMain: (() => { const el = document.elementFromPoint(195, 500); return el ? el.tagName + '.' + String(el.className).split(' ')[0] : 'null'; })(),
  };
})()`;

// ================= 阶段 A:关闭态 =================
console.log('\n=== A. 菜单关闭态 ===');
await evaljs('window.scrollTo(0,0)');
await sleep(400);
const A = await evaljs(SNAPSHOT);
check('A1 关闭态全屏背景隐藏且不拦截', A.bd.vis === 'hidden' && A.bd.pe === 'none', `${A.bd.vis}/${A.bd.pe}`);
check('A2 关闭态保留毛玻璃定义供预热', A.bd.bf.includes('blur(18px)'), A.bd.bf);
check('A3 关闭态 backdrop pointer-events=none', A.bd.pe === 'none', A.bd.pe);
check('A4 关闭态 backdrop 保持 opacity 合成提示', A.bd.wc === 'opacity', A.bd.wc);
check('A5 关闭态 menu-panel 隐藏且不接收事件', A.panel.vis === 'hidden' && A.panel.pe === 'none', `${A.panel.vis}/${A.panel.pe}`);
check('A6 关闭态 toolbar-blend 隐藏', A.blend.vis === 'hidden' && A.blend.op === '0', `${A.blend.vis}/${A.blend.op}`);
check('A7 关闭态无滚动锁/菜单类', !/is-(menu-open|menu-closing|scroll-locked)/.test(A.htmlClass) && A.bodyPos === '(none)', `${A.htmlClass} / body=${A.bodyPos}`);
check('A8 无横向溢出', A.scrollW <= A.clientW, `scrollW=${A.scrollW} clientW=${A.clientW}`);
check('A9 点击落点在正文(不被透明层拦截)', !/MENU|NAV|ASIDE/.test(A.hitMain), A.hitMain);
await shot('A-closed.png');

// ================= 阶段 B:页面中段打开菜单 =================
console.log('\n=== B. 滚动到中段 -> 打开菜单 ===');
await evaljs('window.scrollTo(0,600)');
await sleep(400);
const scrollBefore = await evaljs('Math.round(window.scrollY)');
await evaljs(`document.querySelector('.menu-toggle').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'touch' }))`);
const preparing = await evaljs(`(() => ({
  htmlClass: document.documentElement.className,
  backdropOpacity: getComputedStyle(document.querySelector('.menu-backdrop')).opacity,
  backdropFilter: getComputedStyle(document.querySelector('.menu-backdrop')).backdropFilter,
}))()`);
check('B0 打开前先预热透明毛玻璃层', preparing.htmlClass.includes('is-menu-preparing') && preparing.backdropOpacity === '0' && preparing.backdropFilter.includes('blur(18px)'), JSON.stringify(preparing));
await evaljs(`document.querySelector('.menu-toggle').click()`);
await sleep(200);
await shot('B-opening-mid.png');
await sleep(700); // 超过 520ms 动画
const B = await evaljs(SNAPSHOT);
check('B1 html 带 is-menu-open', B.htmlClass.includes('is-menu-open'), B.htmlClass);
check('B2 全屏背景不使用裁剪', B.bd.clip === 'none' && B.bd.vis === 'visible', B.bd.clip);
const headerGlass = await evaljs(`(() => { const s = getComputedStyle(document.querySelector('.site-sidebar'), '::before'); return { filter: s.backdropFilter, opacity: s.opacity }; })()`);
check('B13 顶栏滤镜层保持合成但完全透明', headerGlass.filter.includes('blur(18px)') && headerGlass.opacity === '0', JSON.stringify(headerGlass));
const delays = await evaljs(`Array.from(document.querySelectorAll('.nav-children a'), a => parseFloat(getComputedStyle(a).transitionDelay))`);
check('B14 四个子项按顺序进入', delays.length === 4 && delays.every((d,i) => !i || d > delays[i-1]), delays);
check('B3 backdrop 向下超额延伸(bottom≈1024=844+180)', near(B.bd.rect.bottom, 1024, 3), `bottom=${B.bd.rect.bottom}`);
check('B4 backdrop 毛玻璃生效且接收事件', B.bd.bf.includes('blur(18px)') && B.bd.pe === 'auto', `${B.bd.bf} / ${B.bd.pe}`);
check('B5 toolbar-blend 可见(opacity=1)', B.blend.vis === 'visible' && B.blend.op === '1', `${B.blend.vis}/${B.blend.op}`);
check('B6 toolbar-blend 覆盖到视口底部', near(B.blend.rect.bottom, 844, 2), `bottom=${B.blend.rect.bottom}`);
check('B7 品牌 kyokaketsu 可见且在顶层', B.brand.rect.width > 0 && B.brand.rect.top >= 0 && B.brand.rect.top < 80 && parseInt(B.brand.z) > parseInt(B.bd.z), `top=${B.brand.rect.top} z=${B.brand.z}>${B.bd.z}`);
check('B8 Close 按钮可见且在顶层', B.toggle.rect.width > 0 && B.toggle.rect.top >= 0 && B.toggle.rect.top < 80 && parseInt(B.toggle.z) > parseInt(B.bd.z), `top=${B.toggle.rect.top} z=${B.toggle.z}`);
check('B9 menu-panel 展开(clip/opacity/transform 归位)', /^inset\(0(px)?( 0(px)?){0,3}\)$/.test(B.panel.clip) && B.panel.op === '1' && /matrix\(1, 0, 0, 1, 0, 0\)|none/.test(B.panel.tf), `${B.panel.clip} / ${B.panel.op} / ${B.panel.tf}`);
check('B10 菜单链接已淡入', B.firstLinkOp === '1', B.firstLinkOp);
check('B11 底部版权信息完整落在视口内', B.meta.rect.bottom <= 844 && B.meta.rect.bottom > 700, `bottom=${B.meta.rect.bottom}`);
// v13 设计:菜单不靠 body 锁,而是 backdrop 作为全屏事件护盾(touch-action:none 吞掉触摸滚动)
check('B12 打开时 backdrop 是事件护盾(无需 body 锁)', B.bd.pe === 'auto' && B.bd.ta === 'none' && B.bodyPos === '(none)', `pe=${B.bd.pe} ta=${B.bd.ta} body=${B.bodyPos}`);
await shot('B-open.png');

// ================= 阶段 C:关闭菜单与动画窗口 =================
console.log('\n=== C. 关闭菜单 ===');
await evaljs(`document.querySelector('.menu-toggle').click()`);
await sleep(150);
const C1 = await evaljs(SNAPSHOT);
check('C1 关闭中: is-menu-closing 已挂上', C1.htmlClass.includes('is-menu-closing'), C1.htmlClass);
check('C2 关闭中: panel 仍可见(动画在播放)', C1.panel.vis === 'visible', C1.panel.vis);
await shot('C-closing.png');
await sleep(750); // 总计 900ms > 520ms
const C2 = await evaljs(SNAPSHOT);
check('C3 关闭完成: 状态类全部清除', !/is-(menu-open|menu-closing|scroll-locked)/.test(C2.htmlClass), C2.htmlClass);
check('C4 关闭完成: panel 隐藏且不拦截', C2.panel.vis === 'hidden' && C2.panel.pe === 'none', `${C2.panel.vis}/${C2.panel.pe}`);
check('C5 关闭完成: 全屏背景隐藏但保留滤镜定义', C2.bd.vis === 'hidden' && C2.bd.pe === 'none' && C2.bd.bf.includes('blur(18px)') && C2.bd.wc === 'opacity', JSON.stringify(C2.bd));
check('C6 关闭完成: toolbar-blend 重新隐藏', C2.blend.vis === 'hidden' && C2.blend.op === '0', `${C2.blend.vis}/${C2.blend.op}`);
check('C7 滚动锁已解除(body 行内样式清空)', C2.bodyPos === '(none)' && C2.bodyTop === '(none)', `pos=${C2.bodyPos} top=${C2.bodyTop}`);
check('C8 滚动位置恢复到打开前', near(C2.scrollY, scrollBefore, 3), `${C2.scrollY} vs ${scrollBefore}`);
check('C9 点击落点回到正文', !/MENU|NAV|ASIDE/.test(C2.hitMain), C2.hitMain);
await shot('C-after-close.png');

// 真滑一下确认页面可滚(instant 跳过 CSS smooth 动画)
await evaljs(`window.scrollTo({ top: 1200, behavior: 'instant' })`);
await sleep(300);
const scrolled = await evaljs('Math.round(window.scrollY)');
check('C10 关闭后页面可正常滑动', near(scrolled, 1200, 3), `scrollY=${scrolled}`);
await evaljs(`setMenuOpen(true)`);
await sleep(850);
await evaljs(`setMenuOpen(false)`);
await sleep(500);
const repeat = await evaljs(SNAPSHOT);
check('C11 第二次开合后正常隐藏', repeat.bd.vis === 'hidden' && repeat.bd.pe === 'none' && repeat.bd.bf.includes('blur(18px)') && near(repeat.scrollY, 1200), repeat.htmlClass);
await evaljs(`setMenuOpen(true); setMenuOpen(false); setMenuOpen(true)`);
await sleep(850);
check('C12 快速重开不被旧计时器关闭', await evaljs(`document.documentElement.classList.contains('is-menu-open')`));
await evaljs(`setMenuOpen(false)`);
await sleep(400);

// ================= 阶段 D:Lightbox =================
console.log('\n=== D. Lightbox ===');
await evaljs(`document.querySelector('.photo-button').click()`);
await sleep(450);
const D1 = await evaljs(`(() => ({
  open: document.querySelector('.lightbox').classList.contains('is-open'),
  bodyPos: document.body.style.position || '(none)',
  img: !!document.querySelector('#lightbox-image').src,
}))()`);
check('D1 Lightbox 打开且滚动锁定', D1.open && D1.bodyPos === 'fixed', `open=${D1.open} body=${D1.bodyPos}`);
check('D2 Lightbox 图片已加载', await evaljs(`lightboxImage.complete && lightboxImage.naturalWidth > 0`));
await evaljs(`lightbox.classList.add('is-dragging'); lightboxImage.style.transition='none'; lightboxImage.style.transform='translateY(60px) scale(.94)'; lightboxBackdrop.style.opacity='.8'; lightboxImage.getBoundingClientRect(); reboundLightbox()`);
await sleep(100);
const rebound = await evaljs(`getComputedStyle(lightboxImage).transform`);
check('D6 回弹中保留中间位移', rebound !== 'matrix(1, 0, 0, 1, 0, 0)' && rebound !== 'none', rebound);
await sleep(350);
check('D7 回弹完成归位', await evaljs(`Math.abs(new DOMMatrix(getComputedStyle(lightboxImage).transform).m42) < .1`));
check('D8 大图尺寸与预加载尺寸一致', await evaljs(`lightboxImage.sizes === lightboxImageSizes(photoButtons[activePhotoIndex].querySelector('img'))`));
await shot('D-lightbox.png');
await evaljs(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))`);
await sleep(600);
const D2 = await evaljs(SNAPSHOT);
check('D3 Lightbox 关闭后滚动锁解除', D2.bodyPos === '(none)', `body=${D2.bodyPos}`);
check('D4 Lightbox 关闭后滚动位置保持', near(D2.scrollY, scrolled, 3), `scrollY=${D2.scrollY} vs ${scrolled}`);
await evaljs(`window.scrollTo({ top: 1800, behavior: 'instant' })`);
await sleep(300);
const scrolled2 = await evaljs('Math.round(window.scrollY)');
check('D5 Lightbox 关闭后页面可滑动', near(scrolled2, 1800, 3), `scrollY=${scrolled2}`);
for (const id of ['field-color', 'field-monochrome']) {
  await evaljs(`window.scrollTo({top: document.getElementById('${id}').getBoundingClientRect().top + window.scrollY + 160, behavior:'instant'})`);
  await sleep(500);
  check('导航高亮 ' + id, await evaljs(`document.querySelector('.menu-panel a[href="#${id}"]').classList.contains('is-current')`));
}

// ================= 汇总 =================
const pass = results.filter((r) => r.ok).length;
const fail = results.length - pass;
const consoleErrs = consoleEntries.filter((e) => e.kind !== 'log-warning');
console.log(`\n=== 结果: ${pass} PASS / ${fail} FAIL ===`);
if (consoleEntries.length) {
  console.log('--- 控制台 error/warning ---');
  consoleEntries.forEach((e) => console.log(`[${e.kind}] ${e.text.slice(0, 300)}`));
} else {
  console.log('--- 控制台无 error/warning ---');
}
await writeFile(join(OUT, 'report.json'), JSON.stringify({
  version: 'ios-single-glass-v13', viewport: '390x844@2', time: new Date().toISOString(),
  pass, fail, results, consoleEntries,
}, null, 2));

ws.close();
chrome.kill();
server.close();
await new Promise((r) => { chrome.once('exit', r); setTimeout(r, 5000); });
for (let i = 0; i < 5; i++) {
  try { await rm(profile, { recursive: true, force: true }); break; }
  catch { await sleep(800); }
}
console.log('[done] 截图与报告已写入 v13-baseline/');
process.exit(fail ? 1 : 0);
