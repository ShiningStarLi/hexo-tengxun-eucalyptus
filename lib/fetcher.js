'use strict';

/**
 * 抓取层：三个腾讯接口 + 封面缩略分流 + 增量同步逻辑
 */

const fs = require('fs');
const path = require('path');

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const INFO_API = 'https://node.video.qq.com/x/api/float_vinfo2?cid=';
const GRADE_API =
  'https://pbaccess.video.qq.com/trpc.message.grade_adapter.GradeService/GetGradeDetail?video_appid=3000010&vplatform=2';
const ALBUM_API =
  'https://pbaccess.video.qq.com/trpc.universal_backend_service.video_list.VideoListService/getAlbumList?appid=3000005&video_appid=3000005&new_mark_label_enabled=1&vversion_platform=2';

const REGION_TAG = /^(内地|国产|中国大陆|中国|大陆|香港|台湾|港台|日本|韩国|美国|英国|泰国|欧美|其他)$/;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const toHttps = (url) => (url ? String(url).replace(/^http:\/\//, 'https://') : '');

// 腾讯封面缩略：竖版 vt-pic 用 /220，横版 hz-pic 用 /498（横版不认 /220）
// 用 URL API 只改 pathname，保留 query / hash 不动
function sizedCover(url) {
  if (!url) return '';
  let parsed;
  try {
    parsed = new URL(toHttps(url));
  } catch (_error) {
    return toHttps(url);
  }
  const cleanPath = parsed.pathname.replace(/\/(0|220|300|498|640)$/, '');
  // 横版标识在域名里（vcover-hz-pic.puui.qpic.cn），pathname 里是 vcover_hz_pic，所以两段都要看
  const isHorizontal = /hz[-_]pic/i.test(`${parsed.hostname}${parsed.pathname}`);
  parsed.pathname = `${cleanPath}${isHorizontal ? '/498' : '/220'}`;
  return parsed.toString();
}

function flatten(value) {
  const out = [];
  const walk = (node) => {
    if (Array.isArray(node)) node.forEach(walk);
    else if (node != null && node !== '') out.push(String(node));
  };
  walk(value);
  return out;
}

function cidFrom(value) {
  if (value == null) return '';
  if (typeof value === 'object') return cidFrom(value.cid || value.url || value.link);
  const raw = String(value).trim();
  const byQuery = raw.match(/[?&]cid=([A-Za-z0-9]+)/);
  if (byQuery) return byQuery[1];
  const byCover = raw.match(/\/cover\/([A-Za-z0-9]+)/);
  if (byCover) return byCover[1];
  return /^[A-Za-z0-9]{8,}$/.test(raw) ? raw : '';
}

function formatCount(value) {
  const num = Number(value);
  if (!num || Number.isNaN(num)) return '';
  if (num >= 100000000) return `${(num / 100000000).toFixed(1)}亿`;
  if (num >= 10000) return `${(num / 10000).toFixed(1)}万`;
  return String(num);
}

function goodRateOf(dimension) {
  if (!Array.isArray(dimension)) return '';
  const total = dimension.reduce((sum, item) => sum + (Number(item.percent) || 0), 0);
  const good = dimension
    .filter((item) => Number(item.start_num) >= 4)
    .reduce((sum, item) => sum + (Number(item.percent) || 0), 0);
  if (!total) return '';
  return `${Math.round((good / total) * 100)}%`;
}

async function requestJSON(url, options = {}, tries = 3) {
  let lastError;
  for (let attempt = 0; attempt < tries; attempt += 1) {
    try {
      // 每次重试用新的 AbortSignal.timeout，避免第一次超时后 signal 已 aborted 导致后续重试直接 abort
      const { signal: _ignored, ...optsWithoutSignal } = options;
      const response = await fetch(url, {
        ...optsWithoutSignal,
        signal: AbortSignal.timeout(20000),
      });
      const text = await response.text();
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return JSON.parse(text);
    } catch (error) {
      lastError = error;
      if (attempt < tries - 1) await sleep(800 * (attempt + 1));
    }
  }
  throw lastError;
}

// 抓取单部剧详情
async function fetchItem(cid, previous) {
  const info = await requestJSON(INFO_API + encodeURIComponent(cid), {
    headers: { 'user-agent': UA, referer: 'https://v.qq.com/' },
  });
  const detail = info && info.c;
  if (!detail || !detail.title) throw new Error('接口没有返回剧集信息');

  let grade = null;
  try {
    const payload = await requestJSON(
      GRADE_API,
      {
        method: 'POST',
        headers: {
          'user-agent': UA,
          'content-type': 'application/json',
          origin: 'https://v.qq.com',
          referer: `https://v.qq.com/x/cover/${cid}.html`,
        },
        body: JSON.stringify({ cid }),
      },
      2
    );
    grade = (payload && payload.data && (payload.data.enough || payload.data.lack)) || null;
  } catch (_error) {
    grade = null;
  }

  const episodes = Array.isArray(detail.video_ids) ? detail.video_ids.length : 0;
  const keep = previous || {};

  return {
    cid,
    title: String(detail.title).trim(),
    link: `https://v.qq.com/x/cover/${cid}.html`,
    cover: sizedCover((grade && grade.image_url) || detail.pic || keep.cover || ''),
    episode: episodes ? String(episodes) : keep.episode || '',
    genre: (() => {
      const tags = flatten(info.typ);
      if (!tags.length) return keep.genre || '';
      return tags.filter((tag) => !REGION_TAG.test(tag)).slice(0, 2).join(' / ');
    })(),
    year: detail.year ? String(detail.year) : keep.year || '',
    score: grade && grade.show_score ? String(grade.show_score) : keep.score || '',
    scoreCount:
      grade && grade.evaluate_number ? formatCount(grade.evaluate_number) : keep.scoreCount || '',
    goodRate: (grade && goodRateOf(grade.dimension)) || keep.goodRate || '',
    cast: flatten(info.nam).slice(0, 3).join(' / ') || keep.cast || '',
    desc: String(detail.description || keep.desc || '')
      .replace(/\s+/g, ' ')
      .trim(),
    updated: new Date().toISOString().slice(0, 10),
  };
}

function mapAlbumItem(item) {
  const link = item.url || item.link || '';
  const cid = cidFrom(link) || cidFrom(item.asset_id) || '';
  const extra = item.extra || {};
  const second = String(item.second_title || '').trim();
  const isProgress = /(第\s*\d+\s*集|已看完|更新至|已完结)/.test(second);
  const percent = /(\d+)\s*%/.exec(second);
  const labels = (item.mark_label_list || [])
    .map((mark) => String((mark && mark.prime_text) || '').trim())
    .filter(Boolean);
  // 完结标签必须整条匹配：全 32 集 / 全32集 / 已完结 / 完结（不能是「全网独播/全季」这类）
  const finishedLabel = labels.find((text) => /^(?:全\s*\d+\s*集|已完结|完结)$/.test(text));
  // 集数只认 完结标签 或 更新至 N 集，其余文案一律忽略
  const episodeLabel = finishedLabel || labels.find((text) => /^更新至\s*(?:第\s*)?\d+\s*集$/.test(text)) || '';
  const totalFromLabel = (/(\d+)\s*集/.exec(episodeLabel) || [])[1] || '';
  const finished = Boolean(finishedLabel);
  return {
    cid,
    title: String(item.title || '').trim(),
    link: cid ? `https://v.qq.com/x/cover/${cid}.html` : link,
    cover: sizedCover(extra.cover || item.cover || ''),
    episode: totalFromLabel || '',
    finished,
    note: /即将上线|敬请期待|即将开播/.test(second) ? second : '',
    progressText: isProgress ? second : '',
    progress: percent ? Math.min(100, Number(percent[1])) : isProgress ? 100 : null,
  };
}

async function fetchAlbumList(cookie, scene = 1) {
  const all = [];
  const referer =
    scene === 2
      ? 'https://v.qq.com/biu/u/binge?selectTab=appoint&subTabId=0'
      : 'https://v.qq.com/biu/u/binge?selectTab=append&subTabId=0';
  for (let page = 0; page < 30; page += 1) {
    const payload = await requestJSON(
      ALBUM_API,
      {
        method: 'POST',
        headers: {
          'user-agent': UA,
          'content-type': 'application/json',
          origin: 'https://v.qq.com',
          referer,
          cookie,
        },
        body: JSON.stringify({ scene, filter: 1, page, size: 30 }),
      },
      2
    );
    const ret = payload.ret != null ? payload.ret : payload.code;
    if (ret !== 0) {
      throw new Error(`getAlbumList(scene=${scene}) 失败：ret=${ret} msg=${payload.msg || ''}`);
    }
    const data = payload.data || {};
    const list = Array.isArray(data.list) ? data.list : [];
    all.push(...list);
    if (!data.has_next || !list.length) break;
    await sleep(300);
  }
  return all;
}

function autoGroup(item) {
  return item.finished ? 'finished' : 'airing';
}

async function runChunk(items, size, worker) {
  const results = [];
  for (let i = 0; i < items.length; i += size) {
    const chunk = items.slice(i, i + size);
    results.push(...(await Promise.all(chunk.map(worker))));
  }
  return results;
}

module.exports = {
  sizedCover,
  cidFrom,
  fetchItem,
  fetchAlbumList,
  mapAlbumItem,
  autoGroup,
  runChunk,
  requestJSON,
  sleep,
};
