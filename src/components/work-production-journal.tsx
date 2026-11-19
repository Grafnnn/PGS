"use client";

import { ArrowUpRight, ChevronDown, ClipboardList, Download, Search } from "lucide-react";
import { useId, useMemo, useState, type FormEvent } from "react";
import { dailyReportCompletedWorksFromOutputs } from "@/lib/daily-report-work-outputs";
import { dailyReportStatusLabel } from "@/lib/daily-reports";
import type { DailyReport } from "@/lib/types";
import { parseProductionJournalPeriod, productionJournalDays, productionJournalVolumeTotals, productionJournalWorkOptions, type ProductionJournalFilters } from "@/lib/work-production-journal";
import styles from "./work-production-journal.module.css";

const dayLabel = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", timeZone: "UTC" });
const weekdayLabel = new Intl.DateTimeFormat("ru-RU", { weekday: "long", timeZone: "UTC" });
const periodDateLabel = new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" });
const number = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 3 });
const volumeNumber = new Intl.NumberFormat("ru-RU", { maximumSignificantDigits: 15 });
const plural = new Intl.PluralRules("ru-RU");
const dayForms = { one: "день", few: "дня", many: "дней", other: "дней" };
const shiftForms = { one: "рапорт", few: "рапорта", many: "рапортов", other: "рапорта" };
const statusTone = { draft: "gray", submitted: "yellow", checked: "blue", approved: "green" };

function counted(count: number, forms: typeof dayForms) {
  const category = plural.select(count);
  return `${number.format(count)} ${category === "one" || category === "few" || category === "many" ? forms[category] : forms.other}`;
}

function volumePeriodLabel({ from, to }: ProductionJournalFilters) {
  if (from && to) return `С ${periodDateLabel.format(new Date(from))} по ${periodDateLabel.format(new Date(to))}`;
  if (from) return `С ${periodDateLabel.format(new Date(from))}`;
  if (to) return `По ${periodDateLabel.format(new Date(to))}`;
  return "За всё время";
}

type Props = {
  projectId: string;
  reports: DailyReport[];
  canExport: boolean;
  standalone?: boolean;
  onOpenReport: (reportId: string) => void;
};

function JournalShift({ report, workOnly, onOpenReport }: { report: DailyReport; workOnly: boolean; onOpenReport: Props["onOpenReport"] }) {
  const outputs = report.workOutputs ?? [];
  const completed = report.completedWorks.trim();
  const showNarrative = !workOnly && completed && completed !== dailyReportCompletedWorksFromOutputs(outputs);
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
        {!workOnly && <span className={styles.shiftStats}>
          Рабочие: {number.format(report.workers)} · ИТР: {number.format(report.engineers)}
          {report.shiftHours !== undefined ? ` · ${number.format(report.shiftHours)} ч` : ""}
        </span>}
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
      {!workOnly && facts.length > 0 ? (
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

export function WorkProductionJournal({ projectId, reports, canExport, standalone = false, onOpenReport }: Props) {
  const Title = standalone ? "h2" : "h3";
  const DayTitle = standalone ? "h3" : "h4";
  const headingId = useId();
  const errorId = useId();
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [period, setPeriod] = useState<ProductionJournalFilters>({});
  const [invalidPeriod, setInvalidPeriod] = useState(false);

  const allDays = useMemo(() => productionJournalDays(reports), [reports]);
  const workOptions = useMemo(() => productionJournalWorkOptions(allDays), [allDays]);
  const workOnly = Boolean(period.work);
  const filtered = Boolean(period.from || period.to || period.query || period.work);
  const unapplied = from !== (period.from ?? "") || to !== (period.to ?? "") || search.trim() !== (period.query ?? "");
  const days = useMemo(() => filtered ? productionJournalDays(reports, period) : allDays, [allDays, filtered, period, reports]);
  const volumeTotals = useMemo(() => workOnly ? productionJournalVolumeTotals(days) : [], [days, workOnly]);
  const reportCount = days.reduce((count, day) => count + day.reports.length, 0);
  const exportQuery = new URLSearchParams();
  if (period.from) exportQuery.set("from", period.from);
  if (period.to) exportQuery.set("to", period.to);
  if (period.query) exportQuery.set("q", period.query);
  if (period.work) exportQuery.set("work", period.work);
  const query = exportQuery.toString();
  const exportHref = `/api/projects/${encodeURIComponent(projectId)}/work-production-journal/export${query ? `?${query}` : ""}`;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextPeriod = parseProductionJournalPeriod(from, to);
    setInvalidPeriod(!nextPeriod);
    if (nextPeriod) setPeriod({ ...nextPeriod, work: period.work, query: search.trim() });
  }

  function selectWork(work: string) {
    setSearch("");
    setFrom("");
    setTo("");
    setPeriod(work ? { work } : {});
    setInvalidPeriod(false);
  }

  return (
    <section className={styles.journal} aria-labelledby={headingId}>
      <header className={styles.heading}>
        <div>
          <Title className={styles.title} id={headingId}>Журнал производства работ</Title>
          <p>Закрытые смены автоматически появляются здесь после отправки рапорта.</p>
        </div>
        {canExport ? (
          <a className="button secondary" href={exportHref}><Download size={16} aria-hidden="true" />{workOnly ? "Скачать Excel по работе" : "Скачать Excel"}</a>
        ) : null}
      </header>
      <div className={styles.toolbar}>
        <form className={styles.period} aria-label="Фильтр журнала" onSubmit={handleSubmit}>
          <label className={`field ${styles.workSelect}`}>
            <span>Работа из рапортов</span>
            <select disabled={!workOptions.length} value={period.work ?? ""} onChange={(event) => selectWork(event.target.value)}>
              <option value="">{workOptions.length ? "Все работы" : "Нет работ с указанным объёмом"}</option>
              {workOptions.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          {!workOnly && <label className={`field ${styles.search}`}>
            <span>Поиск по работам</span>
            <span className={styles.searchControl}>
              <Search size={15} aria-hidden="true" />
              <input type="search" placeholder="Название работы" value={search} maxLength={200} onChange={(event) => setSearch(event.target.value)} />
            </span>
          </label>}
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
            <button className="button secondary" onClick={() => selectWork("")} type="button">Показать всё</button>
          </div>
          {invalidPeriod ? <p className={styles.error} id={errorId} role="alert">Укажите корректные даты. Начало периода не может быть позже конца.</p> : null}
        </form>
        <p className={styles.count} role="status">
          {unapplied && !invalidPeriod
            ? "Нажмите «Показать», чтобы применить фильтр."
            : `${counted(days.length, dayForms)} · ${counted(reportCount, shiftForms)}`}
        </p>
      </div>
      {workOnly && (
        <section className={styles.volumeSummary} aria-label="Итого по работе" aria-live="polite">
          <div>
            <strong>Итого по работе</strong>
            <p className={styles.muted}>{volumePeriodLabel(period)}</p>
          </div>
          {volumeTotals.length ? (
            <ul className={styles.volumeTotals} aria-label="Объёмы по единицам измерения">
              {volumeTotals.map(({ unit, quantity }) => (
                <li key={unit}><strong>{volumeNumber.format(quantity)}</strong> <span>{unit}</span></li>
              ))}
            </ul>
          ) : <p className={styles.muted}>Нет объёмов</p>}
        </section>
      )}
      {days.length ? (
        <div className={styles.register}>
          {days.map((day) => {
            const date = new Date(`${day.date}T00:00:00Z`);
            return (
              <section className={styles.day} key={day.date} aria-labelledby={`${headingId}-${day.date}`}>
                <header className={styles.dayLabel}>
                  <DayTitle className={styles.dayTitle} id={`${headingId}-${day.date}`}><time dateTime={day.date}>{dayLabel.format(date)}</time></DayTitle>
                  <span>{weekdayLabel.format(date)}, {day.date.slice(0, 4)}</span>
                </header>
                <div className={styles.shifts}>
                  {day.reports.map((report) => <JournalShift key={report.id} report={report} workOnly={workOnly} onOpenReport={onOpenReport} />)}
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
