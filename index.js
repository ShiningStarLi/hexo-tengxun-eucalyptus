'use strict';

// 插件直接在顶层执行（Hexo loadPlugin 会把源码包成 wrapper 并传入 hexo）

/**
 * Hexo 腾讯视频追剧页插件
 *
 * 注册命令：hexo zhuiju -u     更新数据
 * 注册 generator：自动生成 /zhuijus/index.html
 *
 * 两种模式：
 *   A. 账号同步：.vqq-cookie 或环境变量 VQQ_COOKIE
 *   B. 手动清单：source/_data/zhuiju_src.json
 */

const fs = require('fs');
const path = require('path');

const {
  sizedCover,
  cidFrom,
  fetchItem,
  fetchAlbumList,
  mapAlbumItem,
  autoGroup,
  runChunk,
  sleep,
} = require('./lib/fetcher');

const { renderPage } = require('./lib/renderer');

// 默认分组（可在 _config.yml 里覆盖）
const DEFAULT_GROUPS = [
  { key: 'airing', label: '追剧' },
  { key: 'finished', label: '已完结' },
  { key: 'reserved', label: '预约' },
];

// ----- 工具 -----

function dataPath(hexo, name) {
  return path.join(hexo.source_dir, '_data', name);
}

function readJSON(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (_error) {
    return fallback;
  }
}

function readCookie(hexo) {
  if (process.env.VQQ_COOKIE && process.env.VQQ_COOKIE.trim()) return process.env.VQQ_COOKIE.trim();
  const cookieFile = path.join(hexo.base_dir, '.vqq-cookie');
  if (!fs.existsSync(cookieFile)) return '';
  return fs
    .readFileSync(cookieFile, 'utf8')
    .replace(/^\s*cookie\s*:\s*/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function pageConfig(hexo) {
  const userCfg = hexo.config.zhuiju_vqq || hexo.config.zhuiju || {};
  const groups = Array.isArray(userCfg.groups) && userCfg.groups.length
    ? userCfg.groups
    : DEFAULT_GROUPS;
  return {
    enable: userCfg.enable !== false,
    path: userCfg.path || 'zhuijus/',
    title: userCfg.title || '追剧列表',
    quote: userCfg.quote || '',
    columns: userCfg.columns || 5,
    primary_color: userCfg.primary_color || null,
    groups,
  };
}

// ----- 核心：refresh -----

// 用缓存数据重新按分组写回（Cookie 过期兜底）
function regroupFromCache(cached, overrides, outFile, groups, hexo) {
  const prev = groups.reduce((a, g) => a.concat(cached[g.key] || []), []);
  const result = {};
  groups.forEach((g) => { result[g.key] = []; });
  prev.forEach((item) => {
    const key = groups.some((g) => g.key === overrides[item.cid])
      ? overrides[item.cid]
      : item.finished ? 'finished' : 'airing';
    item.updated = new Date().toISOString().slice(0, 10);
    item.note = item.note || '';
    result[key].push(item);
  });
  const total = prev.length;
  const payload = Object.assign({ mode: 'account', syncedAt: new Date().toISOString() }, result);
  fs.writeFileSync(outFile, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  const summary = groups.map((g) => `${g.label} ${result[g.key].length}`).join(' / ');
  hexo.log.warn(`Cookie 已过期，用缓存重新分组：${total} 部（${summary}）`);
}

async function refreshFromAccount(hexo, cookie, outFile, groups) {
  const cached = readJSON(outFile, {});
  const previousItems = groups.reduce((all, group) => all.concat(cached[group.key] || []), []);
  const overrides = readJSON(dataPath(hexo, 'zhuiju_status.json'), {}) || {};
  let list;
  let reserved = [];

  // scene=1 加追（追剧 + 已完结）
  try {
    list = await fetchAlbumList(cookie, 1);
  } catch (error) {
    hexo.log.warn(`${error.message}，Cookie 已过期，用缓存数据兜底`);
    if (previousItems.length) {
      regroupFromCache(cached, overrides, outFile, groups, hexo);
    } else {
      hexo.log.error('没有缓存数据，先手动更新 Cookie：从浏览器复制一份到 .vqq-cookie');
    }
    return;
  }

  // scene=2 预约
  try {
    reserved = await fetchAlbumList(cookie, 2);
  } catch (error) {
    hexo.log.warn(`预约列表没取到（${error.message}），这次先跳过`);
  }

  const result = {};
  groups.forEach((g) => { result[g.key] = []; });
  let failed = 0;
  let skipped = 0;

  // 每条处理：集数没变就跳过详情接口
  const buildItem = async (raw, isReserved) => {
    const mapped = mapAlbumItem(raw);
    if (!mapped.cid) {
      hexo.log.warn(`跳过（没有 cid）：${mapped.title || JSON.stringify(raw).slice(0, 80)}`);
      failed += 1;
      return null;
    }
    const previous = previousItems.find((item) => item && item.cid === mapped.cid);
    const episodeChanged = !previous.episode || mapped.episode !== previous.episode;
    const coverMissing = !previous.cover && mapped.cover;
    const skipFetch = isReserved || (!episodeChanged && !coverMissing);

    let item;
    if (skipFetch) {
      item = Object.assign({}, previous, {
        updated: new Date().toISOString().slice(0, 10),
        cover: sizedCover(previous.cover || mapped.cover),
      });
      skipped += 1;
      hexo.log.debug(`[跳过详情] ${mapped.title}${mapped.episode ? `（${mapped.episode}）` : ''}`);
    } else {
      try {
        item = await fetchItem(mapped.cid, previous);
      } catch (error) {
        failed += 1;
        item = Object.assign(
          {
            cid: mapped.cid,
            title: mapped.title,
            link: mapped.link,
            cover: mapped.cover,
            updated: new Date().toISOString().slice(0, 10),
          },
          previous || {}
        );
        hexo.log.warn(`详情抓取失败，用列表兜底：${mapped.title || mapped.cid}（${error.message}）`);
      }
    }

    item.finished = mapped.finished;
    item.note = mapped.note;
    if (!item.cover && mapped.cover) item.cover = mapped.cover;
    if (isReserved) {
      item.episode = ''; item.progressText = ''; item.progress = null;
    } else {
      item.progressText = mapped.progressText;
      item.progress = mapped.progress;
      if (mapped.episode) item.episode = mapped.episode;
    }
    return { item, mapped };
  };

  // 并发处理追剧列表（chunk=5）
  const listResults = await runChunk(list, 5, (raw) => buildItem(raw, false));
  // 串行处理预约（数量少）
  const reservedResults = [];
  for (const raw of reserved) {
    reservedResults.push(await buildItem(raw, true));
  }

  listResults.forEach((built) => {
    if (!built) return;
    const { item, mapped } = built;
    const key = groups.some((g) => g.key === overrides[mapped.cid])
      ? overrides[mapped.cid]
      : autoGroup(item);
    result[key].push(item);
    const groupLabel = (groups.find((g) => g.key === key) || {}).label || key;
    hexo.log.info(
      `[${groupLabel}] ${item.title}${item.score ? `（${item.score} 分）` : ''} ${mapped.progressText}`
    );
  });
  reservedResults.forEach((built) => {
    if (!built) return;
    result.reserved.push(built.item);
    hexo.log.info(`[预约] ${built.item.title} ${built.mapped.note || ''}`);
  });

  const total = groups.reduce((sum, g) => sum + result[g.key].length, 0);
  const payload = Object.assign({ mode: 'account', syncedAt: new Date().toISOString() }, result);
  fs.writeFileSync(outFile, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  const summary = groups.map((g) => `${g.label} ${result[g.key].length}`).join(' / ');
  const detail = skipped > 0 ? `，${skipped} 部集数未变跳过详情` : '';
  hexo.log.info(`已同步：${total} 部（${summary}，${failed} 部信息不全${detail}）→ ${outFile}`);
}

async function refreshFromManual(hexo, srcFile, outFile, groups) {
  const source = readJSON(srcFile, null);
  if (!source) {
    hexo.log.error(`找不到 ${srcFile}`);
    return;
  }
  const cached = readJSON(outFile, {});
  const result = {};
  let total = 0;
  let failed = 0;

  for (const group of groups) {
    const entries = Array.isArray(source[group.key]) ? source[group.key] : [];
    result[group.key] = [];
    for (const entry of entries) {
      const cid = cidFrom(entry);
      if (!cid) {
        hexo.log.warn(`[${group.label}] 无法识别：${JSON.stringify(entry)}`);
        failed += 1;
        continue;
      }
      const previous = (cached[group.key] || []).find((item) => item && item.cid === cid);
      try {
        const item = await fetchItem(cid, previous);
        result[group.key].push(item);
        total += 1;
        hexo.log.info(`[${group.label}] ${item.title}${item.score ? `（${item.score} 分）` : ''}`);
      } catch (error) {
        failed += 1;
        if (previous) {
          result[group.key].push(previous);
          hexo.log.warn(`[${group.label}] ${cid} 抓取失败，沿用缓存（${error.message}）`);
        } else {
          hexo.log.error(`[${group.label}] ${cid} 抓取失败：${error.message}`);
        }
      }
      await sleep(300);
    }
  }

  fs.writeFileSync(outFile, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  hexo.log.info(`手动清单已更新：${total} 部成功，${failed} 部失败 → ${outFile}`);
}

async function refresh(hexo) {
  const cfg = pageConfig(hexo);
  const outFile = dataPath(hexo, 'zhuijus.json');
  const cookie = readCookie(hexo);

  if (cookie) {
    hexo.log.info('读到登录态，按账号「加追」列表同步');
    return refreshFromAccount(hexo, cookie, outFile, cfg.groups);
  }
  hexo.log.info('没有 .vqq-cookie，按 source/_data/zhuiju_src.json 手动清单抓取');
  return refreshFromManual(hexo, dataPath(hexo, 'zhuiju_src.json'), outFile, cfg.groups);
}

// ----- Hexo 插件注册（直接在顶层执行，hexo 由 Hexo loadPlugin wrapper 传入） -----

// 注册命令：hexo zhuiju -u
hexo.extend.console.register(
  'zhuiju',
  '抓取腾讯视频追剧数据并生成追剧页（-u 更新数据）',
  { options: [{ name: '-u, --update', desc: 'Update data' }] },
  function (args) {
    if (!args.u) {
      this.log.info('用法：npx hexo zhuiju -u');
      return;
    }
    return refresh(this);
  }
);

// 注册 generator：构建时自动生成 /zhuijus/index.html
hexo.extend.generator.register('zhuiju', function (locals) {
  const cfg = pageConfig(this);
  if (!cfg.enable) return;

  const output = String(cfg.path || 'zhuijus/').replace(/^\/+/, '').replace(/\/?$/, '/');
  const data = readJSON(dataPath(this, 'zhuijus.json'), null);

  if (!data) {
    this.log.warn('缺少 source/_data/zhuijus.json，先执行 npx hexo zhuiju -u');
  }

  return {
    path: `${output}index.html`,
    data: {
      title: cfg.title,
      content: renderPage(cfg, data || {}),
      type: 'page',
      top_img: false,
    },
    layout: ['page', 'post'],
  };
});
