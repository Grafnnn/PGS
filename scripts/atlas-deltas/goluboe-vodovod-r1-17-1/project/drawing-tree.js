(() => {
  'use strict';
  const {volumes, supplement} = window.GOLUBOE_DOCUMENT_TREE;
  const query = document.getElementById('query');
  const tree = document.getElementById('tree');
  const status = document.getElementById('status');
  const side = document.getElementById('volumes');
  const extra = document.getElementById('supplement');
  const params = new URLSearchParams(location.search);
  let scope = volumes.some(v => v.code === params.get('volume')) ? params.get('volume') : '';
  let page = Number(params.get('page')) || 0;
  query.value = params.get('q') || '';
  function normal(s) {
    return String(s).toLowerCase().replace(/ё/g,'е').replace(/[-‐‑–—]/g,' ').replace(/[ø⌀]/g,' ').replace(/[^а-яa-z0-9]+/g,' ').trim();
  }
  function node(tag, text, style) {
    const el = document.createElement(tag);
    if (text) el.textContent = text;
    if (style) el.className = style;
    return el;
  }
  function pdfLink(file, n, title) {
    const a = node('a', title);
    a.href = file + '#page=' + n; a.target = '_blank'; a.rel = 'noopener';
    return a;
  }
  for (const v of volumes) for (const p of v.pages) {
    p.index = normal([v.code, '19/26-2026-'+v.code, v.title, p.group, p.title, p.terms].join(' '));
  }
  function parse(raw) {
    let sheet=null, pdf=null, junction=null;
    const words=raw.toLowerCase().replace(/(?:врезк[а-яё]*|уз(?:ел|л[а-яё]*))\s*№?\s*(\d+)\b/gi,(_,n)=>{junction=Number(n);return ' ';}).replace(/(?:страница|стр[.]?|pdf)\s*[№#]?\s*(\d+)/gi,(_,n)=>{pdf=Number(n);return ' ';})
      .replace(/(?:лист|л[.])\s*[№#]?\s*(\d+)/gi,(_,n)=>{sheet=Number(n);return ' ';});
    return {sheet,pdf,junction,tokens:normal(words).split(' ').filter(Boolean)};
  }
  function row(v,p) {
    const a=pdfLink(v.file,p.page,'');
    a.className='sheet'+(v.code===scope && page===p.page?' sel':'');
    a.append(node('span',p.title),node('small',(p.sheet?'Лист '+p.sheet+' · ':'')+'PDF '+p.page));
    a.setAttribute('aria-label',v.code+' · '+p.title+' · '+(p.sheet?'лист '+p.sheet+', ':'')+'страница PDF '+p.page);
    return a;
  }
  function render() {
    const q=query.value.trim(), f=parse(q);
    tree.replaceChildren();
    for (const b of side.querySelectorAll('button')) b.setAttribute('aria-pressed',String(b.dataset.volume===scope));
    let count=0;
    for (const v of volumes.filter(v=>!scope || v.code===scope)) {
      const list=v.pages.filter(p=>(f.sheet===null||p.sheet===f.sheet)&&(f.pdf===null||p.page===f.pdf)&&(f.junction===null || new RegExp('(?:врезк[а-яё]*|уз(?:ел|л[а-яё]*))\\s*№?\\s*'+f.junction+'(?![0-9])','i').test(p.title))&&f.tokens.every(t=>p.index.includes(t)));
      if(!list.length) continue;
      count+=list.length;
      const book=node('details',null,'book'), title=node('summary');
      title.append(node('span',v.code,'mark'),document.createTextNode(v.title)); book.append(title);
      book.open=Boolean(scope || q);
      const groups=new Map();
      for (const p of list) {
        if(!groups.has(p.group)){
          const d=node('details',null,'group');
          d.append(node('summary',p.group));d.open=Boolean(q);
          book.append(d);groups.set(p.group,d);
        }
        const d=groups.get(p.group);if(page===p.page && v.code===scope)d.open=true;
        d.append(row(v,p));
      }
      tree.append(book);
    }
    extra.hidden=Boolean(scope || q && !normal(supplement.title).includes(normal(q)));
    status.textContent=count?(q?'Найдено страниц: ':'Страниц: ')+count:'По этому запросу страниц не найдено.';
    if(!count) tree.append(node('p','Попробуйте другой номер листа, шифр тома или название детали.'));
  }
  function sync() {
    try {
      const u=new URL(location.href);
      for(const [k,v] of [['q',query.value.trim()],['volume',scope],['page',page]]) v?u.searchParams.set(k,v):u.searchParams.delete(k);
      history.replaceState(null,'',u.href);
    } catch { /* A local file may restrict URL updates. */ }
    render();
  }
  for(const v of [{code:'',title:'Все тома'},...volumes]){
    const b=node('button',v.code||'Все тома','volume');b.type='button';b.dataset.volume=v.code;b.title=v.title;
    b.addEventListener('click',()=>{scope=v.code;page=0;sync();});side.append(b);
  }
  extra.append(pdfLink(supplement.file,1,supplement.title));
  query.addEventListener('input',()=>{page=0;sync();});
  document.getElementById('clear').addEventListener('click',()=>{query.value='';scope='';page=0;sync();query.focus();});
  document.getElementById('search').addEventListener('submit',e=>{e.preventDefault();sync();});
  render();
})();
