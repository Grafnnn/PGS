"use client";

import { ArrowUpRight, ChevronDown, ClipboardList, Download, Search } from "lucide-react";
import { useId, useMemo, useState, type FormEvent } from "react";
import { dailyReportCompletedWorksFromOutputs } from "@/lib/daily-report-work-outputs";
import { dailyReportStatusLabel } from "@/lib/daily-reports";
import type { DailyReport } from "@/lib/types";
import { parseProductionJournalPeriod, productionJournalDays, type ProductionJournalFilters } from "@/lib/work-production-journal";
import styles from "./work-production-journal.module.css";

const dayLabel = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", timeZone: "UTC" });
const weekdayLabel = new Intl.DateTimeFormat("ru-RU", { weekday: "long", timeZone: "UTC" });
const number = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 3 });
const plural = new Intl.PluralRules("ru-RU");
const dayForms = { one: "день", few: "дня", many: "дней", other: "дней" };
const shiftForms = { one: "рапорт", few: "рапорта", many: "рапортов", other: "рапорта" };
const statusTone = { draft: "gray", submitted: "yellow", checked: "blue", approved: "green" };

function counted(count: number, forms: typeof dayForms) {
  const category = plural.select(count);
  return `${number.format(count)} ${category === "one" || category === "few" || category === "many" ? forms[category] : forms.other}`;
}

type Props = {
  projectId: string;
  reports: DailyReport[];
  canExport: boolean;
  onOpenReport: (reportId: string) => void;
};

function JournalShift({ report, onOpenReport }: { report: DailyReport; onOpenReport: Props["onOpenReport"] }) {
  const outputs = report.workOutputs ?? [];
  const completed = report.completedWorks.trim();
  const showNarrative = completed && completed !== dailyReportCompletedWorksFromOutputs(outputs);
  const facts = [
    { label: "Погода", value: report.weather },
    { label: "Техника", value: report.equipment },
    { label: "Получены материалы", value: report.materialsReceived },
    { label: "Израсходованы материалы", value: report.materialsConsumed },
    { label: "Простои", value: report.downtime },
    { label: "Замечания", value: report.issues }
  ].filter(({ value }) => value.trim());

  return (
    <article className={styles.shift}>
      <header className={styles.shiftHeader}>
        <strong>{report.author}</strong>
        <span className={styles.shiftStats}>
          Рабочие: {number.format(report.workers)} · ИТР: {number.format(report.engineers)}
          {report.shiftHours !== undefined ? ` · ${number.format(report.shiftHours)} ч` : ""}
        </span>
        <span className={`badge ${statusTone[report.status]}`}>{dailyReportStatusLabel(report.status)}</span>
      </header>
      {showNarrative ? <p className={styles.narrative}>{completed}</p> : null}
      {outputs.length > 0 ? (
        <ul className={styles.workList} aria-label="Выполненные работы">
          {outputs.map((output, index) => (
            <li key={index}>
              <span>{output.workName}</span>
              <strong>{number.format(output.quantity)} {output.unit}</strong>
            </li>
          ))}
        </ul>
      ) : !completed ? <p className={styles.muted}>Факт работ не указан.</p> : null}
      {facts.length > 0 ? (
        <details className={styles.details}>
          <summary><ChevronDown size={15} aria-hidden="true" />Детали смены</summary>
          <dl>
            {facts.map(({ label, value }) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        </details>
      ) : null}
      <button className={styles.source} onClick={() => onOpenReport(report.id)} type="button" aria-label={`Открыть рапорт · ${report.author}`}>
        Открыть рапорт <ArrowUpRight size={15} aria-hidden="true" />
      </button>
    </article>
  );
}

export function WorkProductionJournal({ projectId, reports, canExport, onOpenReport }: Props) {
  const headingId = useId();
  const errorId = useId();
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [period, setPeriod] = useState<ProductionJournalFilters>({});
  const [invalidPeriod, setInvalidPeriod] = useState(false);

  const allDays = useMemo(() => productionJournalDays(reports), [reports]);
  const filtered = Boolean(period.from || period.to || period.query);
  const unapplied = from !== (period.from ?? "") || to !== (period.to ?? "") || search.trim() !== (period.query ?? "");
  const days = useMemo(() => filtered ? productionJournalDays(reports, period) : allDays, [allDays, filtered, period, reports]);
  const reportCount = days.reduce((count, day) => count + day.reports.length, 0);
  const exportQuery = new URLSearchParams();
  if (period.from) exportQuery.set("from", period.from);
  if (period.to) exportQuery.set("to", period.to);
  if (period.query) exportQuery.set("q", period.query);
  const query = exportQuery.toString();
  const exportHref = `/api/projects/${encodeURIComponent(projectId)}/work-production-journal/export${query ? `?${query}` : ""}`;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextPeriod = parseProductionJournalPeriod(from, to);
    setInvalidPeriod(!nextPeriod);
    if (nextPeriod) setPeriod({ ...nextPeriod, query: search.trim() });
  }

  function clearFilters() {
    setSearch("");
    setFrom("");
    setTo("");
    setPeriod({});
    setInvalidPeriod(false);
  }

  return (
    <section className={styles.journal} aria-labelledby={headingId}>
      <header className={styles.heading}>
        <div>
          <h3 id={headingId}>Журнал производства работ</h3>
          <p>Закрытые смены автоматически появляются здесь после отправки рапорта.</p>
        </div>
        {canExport ? (
          <a className="button secondary" href={exportHref}><Download size={16} aria-hidden="true" />Скачать Excel</a>
        ) : null}
      </header>
      <div className={styles.toolbar}>
        <form className={styles.period} aria-label="Фильтр журнала" onSubmit={handleSubmit}>
          <label className={`field ${styles.search}`}>
            <span>Поиск по работам</span>
            <span className={styles.searchControl}>
              <Search size={15} aria-hidden="true" />
              <input type="search" placeholder="Название работы" value={search} maxLength={200} onChange={(event) => setSearch(event.target.value)} />
            </span>
          </label>
          <label className="field">
            <span>Дата начала</span>
            <input type="date" value={from} onChange={(event) => { setFrom(event.target.value); setInvalidPeriod(false); }} aria-invalid={invalidPeriod || undefined} aria-describedby={invalidPeriod ? errorId : undefined} />
          </label>
          <label className="field">
            <span>Дата окончания</span>
            <input type="date" value={to} onChange={(event) => { setTo(event.target.value); setInvalidPeriod(false); }} aria-invalid={invalidPeriod || undefined} aria-describedby={invalidPeriod ? errorId : undefined} />
          </label>
          <div className={styles.actions}>
            <button className="button primary" type="submit">Показать</button>
            <button className="button secondary" onClick={clearFilters} type="button">Показать всё</button>
          </div>
          {invalidPeriod ? <p className={styles.error} id={errorId} role="alert">Укажите корректные даты. Начало периода не может быть позже конца.</p> : null}
        </form>
        <p className={styles.count} role="status">
          {unapplied && !invalidPeriod
            ? "Нажмите «Показать», чтобы применить фильтр."
            : `${counted(days.length, dayForms)} · ${counted(reportCount, shiftForms)}`}
        </p>
      </div>
      {days.length ? (
        <div className={styles.register}>
          {days.map((day) => {
            const date = new Date(`${day.date}T00:00:00Z`);
            return (
              <section className={styles.day} key={day.date} aria-labelledby={`${headingId}-${day.date}`}>
                <header className={styles.dayLabel}>
                  <h4 id={`${headingId}-${day.date}`}><time dateTime={day.date}>{dayLabel.format(date)}</time></h4>
                  <span>{weekdayLabel.format(date)}, {day.date.slice(0, 4)}</span>
                </header>
                <div className={styles.shifts}>
                  {day.reports.map((report) => <JournalShift key={report.id} report={report} onOpenReport={onOpenReport} />)}
                </div>
              </section>
            );
          })}
        </div>
      ) : (
        <div className={styles.empty}>
          <ClipboardList size={22} aria-hidden="true" />
          <div>
            <strong>{allDays.length ? "Подходящих записей нет" : "Записей пока нет"}</strong>
            <p>{allDays.length ? "Измените запрос или даты." : "Первая запись появится после отправки закрытого рапорта."}</p>
          </div>
        </div>
      )}
    </section>
  );
}
