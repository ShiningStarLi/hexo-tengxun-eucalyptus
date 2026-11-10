'use strict';

/**
 * 渲染层：PAGE_CSS（可配置主题色）+ renderItem + renderPage
 */

const escapeHTML = (value) =>
  String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

// 自动探测主题 CSS 变量主色：依次尝试多主题暴露的变量
function probePrimaryColor() {
  // 浏览器端没有 document，给一个 fallback
  return 'var(--primary-color,var(--anzhiyu-main,var(--theme-color,var(--blog-primary-color,#3db4f2))))';
}

function buildCSS(options = {}) {
  const columns = options.columns || 5;
  const gap = options.gap || 24;
  const primaryColor = options.primaryColor || probePrimaryColor();

  return [
    ':root{',
    `  --zj-primary:${primaryColor};`,
    '  --zj-card-bg:rgba(255,255,255,.05);',
    '  --zj-border:rgba(128,128,128,.2);',
    '  --zj-hover:rgba(128,128,128,.1);',
    `  --zj-cols:${columns};`,
    `  --zj-gap:${gap}px;`,
    '  --zj-ease:cubic-bezier(.2,.8,.2,1);',
    '}',
    '[data-theme="dark"],html.dark,body.dark{',
    '  --zj-card-bg:rgba(0,0,0,.2);',
    '  --zj-border:rgba(255,255,255,.1);',
    '  --zj-hover:rgba(128,128,128,.15);',
    '}',
    '.zj-container{max-width:100%;margin:0 auto}',
    '.zj-status-tabs{margin:15px 0 20px;display:flex;gap:8px}',
    '.zj-status-tab{',
    '  display:inline-block;padding:3px 12px;cursor:pointer;font-size:13px;font-weight:500;',
    '  line-height:1.6;color:inherit;background:transparent;border:1px solid var(--zj-border);border-radius:14px;',
    '  transition:all .25s ease;user-select:none;',
    '}',
    '.zj-status-tab:hover{border-color:var(--zj-primary);color:var(--zj-primary)}',
    '.zj-status-tab.active{',
    '  background:var(--zj-primary);border-color:var(--zj-primary);color:#fff;font-weight:600;',
    '}',
    '.zj-status-tab.active .zj-count{color:rgba(255,255,255,.85)}',
    '.zj-count{opacity:.7;font-size:.85em;margin-left:4px}',
    '.zj-search-input{',
    '  float:right;padding:6px 12px;border-radius:6px;border:1px solid var(--zj-border);background:transparent;',
    '  color:inherit;font-size:13px;outline:none;width:140px;transition:width .3s var(--zj-ease);margin-top:2px;',
    '}',
    '.zj-search-input:focus{border-color:var(--zj-primary);width:180px}',
    '.zj-list{display:none;grid-template-columns:repeat(var(--zj-cols),1fr);gap:var(--zj-gap)}',
    '.zj-list.active{display:grid;animation:zjFadeIn .4s var(--zj-ease)}',
    '@keyframes zjFadeIn{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}',
    '.zj-card{',
    '  position:relative;display:block;width:100%;height:100%;',
    '  border-radius:16px;overflow:hidden;aspect-ratio:4.5/6.5;',
    '  background:var(--zj-card-bg);border:1px solid var(--zj-border);padding:0;margin:0;',
    '  transition:transform .4s var(--zj-ease),box-shadow .4s var(--zj-ease);',
    '  cursor:pointer;text-decoration:none;',
    '}',
    '.zj-card:hover{',
    '  transform:translateY(-6px) scale(1.02);box-shadow:0 16px 32px rgba(0,0,0,.15);',
    '  border-color:var(--zj-primary);',
    '}',
    'html.dark .zj-card:hover,[data-theme="dark"] .zj-card:hover{box-shadow:0 16px 40px rgba(0,0,0,.4)}',
    '.zj-card img{',
    '  position:absolute;top:0;left:0;right:0;bottom:0;',
    '  width:100%!important;height:100%!important;object-fit:cover;display:block;',
    '  border-radius:0!important;margin:0!important;padding:0!important;',
    '  transition:transform .6s var(--zj-ease);',
    '}',
    '.zj-card:hover img{transform:scale(1.06)}',
    '.zj-score{',
    '  position:absolute;top:12px;left:12px;background:rgba(0,0,0,.65);color:#fff;',
    '  font-size:12px;font-weight:700;padding:4px 8px;border-radius:20px;backdrop-filter:blur(8px);',
    '  display:flex;align-items:center;gap:4px;z-index:2;box-shadow:0 2px 8px rgba(0,0,0,.2);',
    '}',
    '.zj-score.high{color:#4ade80}',
    '.zj-score.mid{color:#facc15}',
    '.zj-score.low{color:#f87171}',
    '.zj-ep{',
    '  position:absolute;top:12px;right:12px;background:rgba(0,0,0,.65);color:#fff;',
    '  font-size:11px;font-weight:700;padding:4px 8px;border-radius:20px;backdrop-filter:blur(8px);',
    '  z-index:2;box-shadow:0 2px 8px rgba(0,0,0,.2);',
    '}',
    '.zj-note-badge{',
    '  position:absolute;top:12px;right:12px;background:linear-gradient(135deg,#f59e0b,#ef4444);',
    '  color:#fff;font-size:11px;font-weight:700;padding:4px 10px;border-radius:20px;',
    '  z-index:2;box-shadow:0 2px 10px rgba(239,68,68,.4);letter-spacing:.5px;',
    '}',
    '.zj-info{',
    '  position:absolute;bottom:0;left:0;right:0;padding:36px 14px 14px;',
    '  background:linear-gradient(to top,rgba(0,0,0,.95) 0%,rgba(0,0,0,.6) 60%,transparent 100%);',
    '  display:flex;flex-direction:column;z-index:2;pointer-events:none;transition:padding .4s var(--zj-ease);',
    '}',
    '.zj-card:hover .zj-info{padding-bottom:18px}',
    '.zj-title{',
    '  font-size:14px;font-weight:700;line-height:1.3;color:#fff;',
    '  display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;',
    '  text-decoration:none;text-shadow:0 2px 4px rgba(0,0,0,.5);pointer-events:auto;',
    '}',
    '.zj-title:hover{color:var(--zj-primary)!important;background:transparent!important}',
    '.zj-meta{font-size:11px;color:rgba(255,255,255,.8);font-weight:500;display:flex;justify-content:space-between;text-shadow:0 1px 3px rgba(0,0,0,.5);margin-top:4px}',
    '.zj-genre-tag{opacity:.7}',
    '.zj-progress{',
    '  position:absolute;bottom:0;left:0;right:0;height:4px;background:rgba(255,255,255,.2);',
    '  z-index:3;',
    '}',
    '.zj-progress-bar{height:100%;background:linear-gradient(90deg,#3db4f2,#4ade80);border-radius:0 4px 4px 0}',
    '.zj-empty{text-align:center;padding:60px 20px;opacity:.7}',
    '.zj-hidden{display:none!important}',
    '.zj-synced{font-size:12px;opacity:.6;text-align:right;margin-bottom:12px}',
    '@media (max-width:1100px){:root{--zj-cols:4}}',
    '@media (max-width:800px){:root{--zj-cols:3}}',
    '@media (max-width:500px){:root{--zj-cols:2}.zj-search-input{width:100%;box-sizing:border-box;float:none;margin:0 0 10px 0}.zj-status-tabs{margin-top:10px}.zj-card{aspect-ratio:4/6.5}.zj-title{font-size:13px}}',
  ].join('');
}

function renderItem(item, isReserved) {
  const scoreClass = (() => {
    const s = Number(item.score);
    if (!s) return '';
    if (s >= 8.5) return 'high';
    if (s >= 6) return 'mid';
    return 'low';
  })();

  const showProgress = item.progress != null && !isReserved;
  const progressWidth = showProgress ? Math.max(2, Math.min(100, item.progress)) : 0;

  const topRightBadge = isReserved
    ? item.note ? `<span class="zj-note-badge">预约</span>` : ''
    : item.episode ? `<span class="zj-ep">${escapeHTML(item.episode)}集</span>` : '';

  return [
    `<a class="zj-card zj-hidden" href="${escapeHTML(item.link)}" target="_blank" rel="noopener" data-title="${escapeHTML(item.title.toLowerCase())}">`,
    `  <img src="${escapeHTML(item.cover)}" alt="${escapeHTML(item.title)}" loading="lazy" decoding="async" referrerpolicy="no-referrer">`,
    item.score ? `  <span class="zj-score ${scoreClass}">★ ${escapeHTML(item.score)}</span>` : '',
    topRightBadge,
    `  <div class="zj-info">`,
    `    <span class="zj-title">${escapeHTML(item.title)}</span>`,
    `    <div class="zj-meta">`,
    item.genre ? `      <span class="zj-genre-tag">${escapeHTML(item.genre)}</span>` : '',
    item.year ? `      <span>${escapeHTML(item.year)}</span>` : '',
    `    </div>`,
    `  </div>`,
    showProgress ? `  <div class="zj-progress"><div class="zj-progress-bar" style="width:${progressWidth}%"></div></div>` : '',
    '</a>',
  ]
    .filter(Boolean)
    .join('\n');
}

function renderPage(config, data) {
  const groups = config.groups.map((group) => ({
    ...group,
    items: Array.isArray(data[group.key]) ? data[group.key].filter((item) => item && item.title) : [],
  }));

  const activeIndex = groups.findIndex((g) => g.items.length > 0);
  const firstVisible = activeIndex >= 0 ? activeIndex : 0;

  const tabs = groups
    .map(
      (group, index) =>
        `<div class="zj-status-tab${index === firstVisible ? ' active' : ''}" data-target="zj-list-${group.key}">${group.label}（<span class="zj-count">${group.items.length}</span>）</div>`
    )
    .join('\n');

  const lists = groups
    .map((group, index) => {
      const body = group.items.length
        ? group.items.map((item) => renderItem(item, group.key === 'reserved')).join('\n')
        : '<div class="zj-empty">这里还空着～</div>';
      return `<div id="zj-list-${group.key}" class="zj-list${index === firstVisible ? ' active' : ''}">\n${body}\n</div>`;
    })
    .join('\n');

  const clientJS = [
    '<script>',
    '(function(){',
    '  var root=document.querySelector(".zj-container");',
    '  if(!root)return;',
    '  var tabs=root.querySelectorAll(".zj-status-tab");',
    '  var lists=root.querySelectorAll(".zj-list");',
    '  var cards=root.querySelectorAll(".zj-card");',
    '  function activate(idx){',
    '    tabs.forEach(function(t,i){t.classList.toggle("active",i===idx)});',
    '    lists.forEach(function(l,i){l.classList.toggle("active",i===idx)});',
    '  }',
    '  tabs.forEach(function(t,i){t.addEventListener("click",function(){activate(i)})});',
    '  var input=root.querySelector(".zj-search-input");',
    '  if(input){',
    '    input.addEventListener("input",function(){',
    '      var q=this.value.trim().toLowerCase();',
    '      cards.forEach(function(c){',
    '        var ok=!q||(c.getAttribute("data-title")||"").indexOf(q)>=0;',
    '        c.classList.toggle("zj-hidden",!ok);',
    '      });',
    '    });',
    '  }',
    '  cards.forEach(function(c){c.classList.remove("zj-hidden")});',
    '})();',
    '</script>',
  ].join('\n');

  return [
    config.quote ? `<blockquote><p>${escapeHTML(config.quote)}</p></blockquote>` : '',
    `<style>${buildCSS({ columns: config.columns, primaryColor: config.primary_color })}</style>`,
    `<div class="zj-container">`,
    `  <input type="text" class="zj-search-input" placeholder="搜索剧名..." />`,
    `  <div class="zj-status-tabs">\n${tabs}\n  </div>`,
    `${lists}`,
    `  ${clientJS}`,
    `</div>`,
  ]
    .filter(Boolean)
    .join('\n');
}

module.exports = { renderPage, renderItem, buildCSS };
