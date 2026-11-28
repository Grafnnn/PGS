(() => {
  "use strict";
  const data = window.FACTORY_SHEETS;
  const $ = id => document.getElementById(id);
  const albums = new Map(data.documents.map(doc => [doc.id, doc]));
  const pageSize = 24;
  let currentPage = 0;

  function element(tag, text, css) {
    const node = document.createElement(tag);
    if (text != null) node.textContent = text;
    if (css) node.className = css;
    return node;
  }

  function link(text, path, external = false) {
    const node = element("a", text);
    node.href = path;
    if (external) { node.target = "_blank"; node.rel = "noopener"; }
    return node;
  }

  function pdfLink(doc, n) {
    return link("Открыть PDF · стр. " + n, "../" + doc.path + "#page=" + n, true);
  }

  function normalized(str) {
    return String(str).toLocaleLowerCase("ru").replace(/ё/g, "е").replace(/[‐‑–—−]/g, "-");
  }

  function result(row, query) {
    const d = albums.get(row.doc);
    const item = element("details");
    const head = element("summary");
    head.append(element("span", d.code + " · стр. " + row.pdf_page, "path"),
                element("span", row.kind, "kind"));
    if (row.objects.length) head.append(element("span", row.objects.length + " в модели / каталоге", "kind"));
    else if (!row.review.length) head.append(element("span", "В описи", "kind"));
    item.append(head);
    const body = element("div", null, "detail");
    body.append(element("p", d.source_name));
    if (row.hints.length) body.append(element("p", row.hints.join(" · "), "caption"));
    body.append(pdfLink(d, row.pdf_page));
    if (row.audit) body.append(element("p", row.audit.state + " · " + row.audit.note, "caption"));
    for (const check of row.review) {
      const text = [check.result, check.note].filter(Boolean).join(" · ");
      if (text) body.append(element("p", text, "caption"));
    }
    for (const scheme of row.schemes ?? []) {
      body.append(element("p", scheme.title + " · " + scheme.positionIds.length + " обозначений", "caption"));
      if (scheme.positionIds.length) body.append(element("p", scheme.positionIds.join(", "), "caption"));
    }
    if (row.objects.length) {
      const matching = query.length ? row.objects.filter(o => query.every(q => normalized(o.id + " " + o.title).includes(q))) : [];
      const objects = matching.length ? matching : row.objects;
      const list = element("ul");
      const more = element("button", "Показать ещё");
      more.type = "button";
      let shown = 0;
      function renderMore() {
        const end = Math.min(shown + 30, objects.length);
        for (const object of objects.slice(shown, end)) {
          const line = element("li");
          const target = object.local ? "../catalogue-model.html#id/" + encodeURIComponent(object.id) :
            "../index.html#scope=BUILDING&id=" + encodeURIComponent(object.id);
          line.append(link(object.title, target),
                      element("span", object.id, "kind"),
                      element("span", object.local ? "Локальный узел" : object.status, "kind"));
          list.append(line);
        }
        shown = end;
        more.hidden = shown === objects.length;
        more.textContent = "Показать ещё · " + (objects.length - shown);
      }
      more.addEventListener("click", renderMore);
      item.addEventListener("toggle", () => { if (item.open && shown === 0) renderMore(); });
      body.append(list, more);
    }
    item.append(body);
    return item;
  }

  function render() {
    const q = normalized($("query").value.trim()).split(/\s+/).filter(Boolean);
    const doc = $("document").value;
    const state = $("filterState").value;
    const rows = data.pages.filter(row => {
      if (doc && row.doc !== doc) return false;
      if (state === "model" && !row.objects.some(obj => !obj.local)) return false;
      if (state === "drawing" && !row.drawing) return false;
      if (state === "verify" && !row.audit?.needsItemReview) return false;
      if (!q.length) return true;
      const a = albums.get(row.doc);
      const text = normalized([a.code, a.file, "стр. " + row.pdf_page, ...row.hints,
        ...row.objects.map(r => r.title + " " + r.id), ...row.review.map(r => r.note),
        ...(row.schemes ?? []).map(s => s.title + " " + s.positionIds.join(" "))].join(" "));
      return q.every(word => text.includes(word));
    });
    const maxPage = Math.max(0, Math.ceil(rows.length / pageSize) - 1);
    currentPage = Math.min(currentPage, maxPage);
    $("rows").replaceChildren(...rows.slice(currentPage * pageSize, (currentPage + 1) * pageSize).map(row => result(row, q)));
    $("count").textContent = rows.length ? "Найдено страниц: " + rows.length.toLocaleString("ru") : "По этому запросу нет страниц.";
    $("current").textContent = rows.length ? (currentPage + 1) + " / " + (maxPage + 1) : "0 / 0";
    $("back").disabled = currentPage === 0;
    $("next").disabled = currentPage >= maxPage;
  }

  function toggle(target) {
    const map = {sheets: "showPages", gaps: "showGaps", clashes: "showClashes"};
    for (const [id, button] of Object.entries(map)) {
      $(id).hidden = target !== id;
      $(button).setAttribute("aria-pressed", String(target === id));
    }
  }

  const clashes = window.FACTORY_COLLISIONS;
  $("clash-summary").textContent = clashes.pairs + " пар, " + clashes.markers + " записей на модели. " + clashes.method;
  if (clashes.comparison?.baseline_pairs) {
    const prior = clashes.comparison;
    $("clash-summary").append(document.createTextNode(
      " В R0.2 тем же методом найдено " + prior.baseline_pairs + " пар. После правок не обнаружено " +
      prior.no_longer_detected + " прежних, добавилось " + prior.new_pairs + "."));
  }
  const clashCards = clashes.items.map(row => {
    const card = element("details");
    card.append(element("summary", row.id + " · " + row.size + " пар"));
    const content = element("div", null, "detail");
    content.append(element("p", row.text));
    const sources = element("ul");
    for (const ref of row.refs) {
      const entry = element("li");
      entry.append(link(ref.title, "../" + ref.url, true));
      sources.append(entry);
    }
    content.append(link("Показать пару в 3D", "../index.html#issues=1&issue=" + encodeURIComponent(row.id) + "&pair=1"), sources);
    card.append(content);
    const search = normalized([row.id, row.text, ...row.refs.map(ref => ref.title)].join(" "));
    return {card, search};
  });
  $("clash-rows").append(...clashCards.map(item => item.card));

  function filterClashes() {
    const query = normalized($("clash-query").value).split(/\s+/).filter(Boolean);
    let count = 0;
    for (const {card, search} of clashCards) {
      card.hidden = !query.every(word => search.includes(word));
      if (!card.hidden) count++;
    }
    $("clash-count").textContent = "Найдено карточек: " + count.toLocaleString("ru");
  }

  $("clash-query").addEventListener("input", filterClashes);
  filterClashes();

  for (const d of albums.values()) {
    const option = element("option", d.code + " · " + d.source_name);
    option.value = d.id;
    $("document").append(option);
  }
  $("summary").textContent = data.documents.length + " PDF · " + data.pages.length.toLocaleString("ru") +
    " страниц · " + data.workbooks.length + " сводная ведомость объёмов";
  const discrepancies = data.pages.filter(sheet => sheet.audit?.state === "Расхождение в ПД");

  function renderGaps() {
    const onlyDiscrepancies = $("gap-kind").value === "discrepancies";
    const rows = onlyDiscrepancies ? discrepancies.map(sheet => ({
      doc: sheet.doc,
      page: sheet.pdf_page,
      title: (albums.get(sheet.doc)?.code || "ПД") + " · " + sheet.kind,
      note: sheet.audit.note
    })) : data.gaps;
    const label = onlyDiscrepancies ? "Листов с расхождениями" : "Вопросов по комплекту";
    $("gap-count").textContent = label + " · " + rows.length.toLocaleString("ru");
    const items = rows.map(gap => {
      const item = element("li");
      item.append(element("strong", gap.title), document.createTextNode(" · " + gap.note + " "));
      const doc = albums.get(gap.doc);
      if (doc && gap.page) item.append(pdfLink(doc, gap.page));
      return item;
    });
    $("gap-list").replaceChildren(...items);
    if (!items.length) $("gap-list").append(element("li", "В этой выборке уточнений нет."));
  }

  function openGaps(mode) {
    $("gap-kind").value = mode;
    renderGaps();
    toggle("gaps");
  }

  function applySectionHash() {
    if (location.hash === "#discrepancies") openGaps("discrepancies");
    else if (location.hash === "#gaps") openGaps("");
    else if (location.hash === "#clashes") toggle("clashes");
    else toggle("sheets");
  }

  function openSection(hash) {
    history.replaceState(history.state, "", hash || location.href.split("#")[0]);
    applySectionHash();
  }

  $("gap-kind").addEventListener("change", () => {
    const hash = $("gap-kind").value === "discrepancies" ? "#discrepancies" : "#gaps";
    history.replaceState(history.state, "", hash);
    renderGaps();
  });
  window.addEventListener("hashchange", applySectionHash);
  renderGaps();
  applySectionHash();
  data.workbooks.forEach((book, i) => {
    const node = element("p");
    node.append(link(book.file.split("/").pop(), "../albums/vor-" + (i + 1) + ".xlsx"));
    const sheetNames = book.sheets.map(s => s.name).join(", ");
    node.append(document.createTextNode(" · Листы: " + sheetNames));
    $("workbooks").append(node);
  });
  $("showPages").addEventListener("click", () => openSection(""));
  $("showGaps").addEventListener("click", () =>
    openSection($("gap-kind").value === "discrepancies" ? "#discrepancies" : "#gaps"));
  $("showClashes").addEventListener("click", () => openSection("#clashes"));
  $("filters").addEventListener("submit", event => event.preventDefault());
  $("filters").addEventListener("input", () => { currentPage = 0; render(); });
  $("back").addEventListener("click", () => { currentPage--; render(); });
  $("next").addEventListener("click", () => { currentPage++; render(); });
  render();
})();
