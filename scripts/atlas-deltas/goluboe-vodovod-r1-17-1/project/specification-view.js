(() => {
  'use strict';
  const data = window.GOLUBOE_SPECIFICATION;
  const search = document.getElementById('search');
  const group = document.getElementById('group');
  const order = document.getElementById('order');
  const results = document.getElementById('results');
  const clear = document.getElementById('clear');
  const count = document.getElementById('count');
  const collator = new Intl.Collator('ru', {numeric:true, sensitivity:'base'});
  const notes = {
    'Вопросы по чертежам':'Вопросы о комплектности и нерасшифрованных выносках. Строки этого раздела не прибавляются к количеству материалов.',
    'Водопровод В1':'Заполненные позиции листов 1 и 2 спецификации ТКР. Штуки и метры одной позиции обозначают одно количество поставки в двух единицах.',
    'Узлы и состав изделий':'Состав одного изделия или местного узла. Расходы по деталям приведены отдельно от итоговых позиций В1.',
    'Крепление выемок':'Суммарные количества таблицы 12. Расход по каждой из пяти выемок приведён в подробностях.',
    'Выемка по участкам':'Разбивка объёма разработки по пяти выемкам. Общие объёмы и виды работ приведены в таблице 13.',
    'Оснащение при эксплуатации':'Перечень ТБЭ для работы в подземных сооружениях. Количество средств в этом перечне не задано.',
    'Машины и механизмы':'Потребность строительства по таблице 3 ПОС.'
  };
  const el = (tag, text, cls) => {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (cls) node.className = cls;
    return node;
  };
  const anchor = (label, path) => { const a = el('a', label); a.href = path; return a; };
  const pdfPath = (doc, page) => '../albums/'+encodeURIComponent(data.albums[doc])+'#page='+page;
  function normalize(value) {
    return String(value).normalize('NFKC').toLowerCase().replace(/ё/g,'е')
      .replace(/[‐‑‒–—−]/g,'-').replace(/[×х]/g,'x')
      .replace(/(?:[ø⌀∅ф]|(?<![а-яa-z])(?:ду|dn|д\.|d))\s*0*(?=\d)/gu,'d')
      .replace(/(\d),(?=\d)/g,'$1.').replace(/\s+/g,' ').trim();
  }
  const numberOf = r => String(r.displayPos ?? r.pos).replace(/^(?:поз\.|стр\.)\s*/iu,'');
  const positionNumbers = new Set(data.rows.map(numberOf));
  const searchable = data.rows.map(r => {
    const text = normalize([r.group, r.displayPos ?? r.pos, r.name, r.qty, r.unit, r.zone, r.info, r.check?.title, r.check?.text, r.modelValue, ...(r.places || []).map(p=>p[0]), r.doc, r.sheet].filter(Boolean).join(' '));
    return {r, text, compact:text.replace(/[^\p{L}\d.]/gu,'')};
  });
  function docCell(r) {
    const cell=el('td'), items=el('div',undefined,'docLinks');
    items.append(anchor(r.doc+' · '+r.sheet+' · PDF '+r.page, pdfPath(r.doc,r.page)));
    if(r.link) items.append(anchor(r.link[0],r.link[1]));
    cell.append(items); return cell;
  }
  function rowView(r) {
    const tr = el('tr'), title=el('td');
    title.append(el('div',r.name,'name'),el('div',r.zone,'zone'));
    if(r.info || r.related || r.places || r.check) {
      const more=el('details');
      more.append(el('summary',r.check?.title || 'Подробности'));
      if(r.check){more.className='check';more.append(el('p',r.check.text));}
      if(r.info) more.append(el('p',r.info));
      const links=el('div',undefined,'docLinks');
      for(const [label,doc,page] of r.related || []) links.append(anchor(label+' · '+doc+', PDF '+page,pdfPath(doc,page)));
      for(const [label,path] of r.places || []) links.append(anchor(label+' в 3D',path));
      if(links.childElementCount) more.append(links);
      title.append(more);
    }
    const amount=el('td',r.qty ? r.qty+' '+r.unit : (r.checkOnly ? '—' : 'Не указано'),r.qty ? '' : 'qty-missing');
    if(r.modelValue) amount.append(el('small',r.modelValue,'modelAmount'));
    tr.append(el('td',r.displayPos ?? r.pos), title, amount, docCell(r));
    return tr;
  }
  function render() {
    const term = normalize(search.value);
    const posMatch = term.match(/^(?:поз(?:иция)?\.?\s*)?(\d+(?:\.\d+)?)$/u);
    const tokens = term.split(' ').filter(Boolean);
    const matches = searchable.filter(({r,text,compact}) => {
      if (group.value && r.group !== group.value) return false;
      if(posMatch && (/^поз/u.test(term) || positionNumbers.has(posMatch[1]))) return numberOf(r)===posMatch[1];
      return tokens.every(t=>text.includes(t) || compact.includes(t.replace(/[^\p{L}\d.]/gu,'')));
    }).map(v=>v.r);
    clear.hidden = !search.value && !group.value && order.value==='pos';
    count.textContent='Показано строк: '+matches.length+' из '+data.rows.length;
    const fragment=document.createDocumentFragment();
    for(const name of data.groups) {
      const subset=matches.filter(r=>r.group===name);
      if (!subset.length) continue;
      subset.sort((a,b)=>order.value==='name'?collator.compare(a.name,b.name):collator.compare(a.pos,b.pos)*(order.value==='pos-desc'?-1:1));
      const section=el('section'), head=el('header',undefined,'groupHead');
      head.append(el('h2',name)); if(notes[name]) head.append(el('p',notes[name],'sectionNote'));
      const table=el('table');table.setAttribute('aria-label',name);
      const header=table.createTHead().insertRow();
      ['Поз.','Наименование и узел','Количество по ПД','Источник и модель'].forEach(s=>{const h=el('th',s);h.scope='col';header.append(h)});
      const body=table.createTBody();subset.forEach(r=>body.append(rowView(r)));
      section.append(head,table);fragment.append(section);
    }
    if(!matches.length) fragment.append(el('p','Ничего не найдено. Измените запрос или выберите другую ведомость.','empty'));
    results.replaceChildren(fragment);
  }
  for(const name of data.groups) group.add(new Option(name,name));
  search.value=new URLSearchParams(location.search).get('q') || '';
  search.addEventListener('input',render);group.addEventListener('change',render);order.addEventListener('change',render);
  document.getElementById('filters').addEventListener('submit',e=>{e.preventDefault();render()});
  clear.addEventListener('click',()=>{search.value='';group.value='';order.value='pos';render();search.focus()});
  render();
})();
