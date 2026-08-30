"use client";

import React from "react";
import { ArrowRight, ChevronDown, ListChecks } from "lucide-react";
import type { ProjectTab } from "@/components/project-module-menu";

export type ProjectSignalTone = "good" | "warn" | "bad" | "info" | "neutral";

export type ProjectSignalKey =
  | "contract"
  | "profit"
  | "completion"
  | "cash"
  | "budgetVariance"
  | "delayed"
  | "materialDeficit"
  | "requests"
  | "reports"
  | "risks"
  | "documents"
  | "members"
  | "readiness"
  | "payments"
  | "audit";

export type ProjectSectionSignal = {
  key: ProjectSignalKey;
  label: string;
  value: string;
  tone: ProjectSignalTone;
};

type ProjectSectionGuideConfig = {
  objective: string;
  question: string;
  signalKeys: readonly [ProjectSignalKey, ProjectSignalKey, ProjectSignalKey];
  relatedTabs: readonly [ProjectTab, ProjectTab];
};

export const projectSectionGuides: Record<ProjectTab, ProjectSectionGuideConfig> = {
  Обзор: {
    objective: "Понять состояние проекта и выбрать следующее управленческое действие",
    question: "Где проект отклоняется от плана и что требует решения сегодня?",
    signalKeys: ["completion", "profit", "cash"],
    relatedTabs: ["Действия", "Аналитика"]
  },
  "Бюджет / ВОР": {
    objective: "Свести объемы, себестоимость и изменения бюджета",
    question: "Какие позиции формируют перерасход и требуют уточнения ВОР?",
    signalKeys: ["budgetVariance", "profit", "completion"],
    relatedTabs: ["Финансы", "Материалы"]
  },
  ФОТ: {
    objective: "Сопоставить трудовую потребность, штат и стоимость выполнения",
    question: "Хватит ли людей для плана и укладывается ли ФОТ в экономику проекта?",
    signalKeys: ["profit", "completion", "reports"],
    relatedTabs: ["График", "Финансы"]
  },
  График: {
    objective: "Управлять сроками от этапа до детальной работы",
    question: "Что отстает, что блокирует следующий фронт и где нужен ресурс?",
    signalKeys: ["completion", "delayed", "materialDeficit"],
    relatedTabs: ["Материалы", "Рапорты"]
  },
  Материалы: {
    objective: "Закрыть потребность площадки до даты начала работ",
    question: "Какие дефициты и поставки уже влияют на производственный график?",
    signalKeys: ["materialDeficit", "requests", "delayed"],
    relatedTabs: ["Заявки", "График"]
  },
  Заявки: {
    objective: "Провести закупочную потребность до заказа и поставки",
    question: "Какие заявки требуют согласования, цены или действия снабжения?",
    signalKeys: ["requests", "materialDeficit", "cash"],
    relatedTabs: ["Материалы", "Финансы"]
  },
  Финансы: {
    objective: "Управлять прогнозом затрат, платежами и кассовым разрывом",
    question: "Где меняется итоговая маржа и какие платежи требуют решения?",
    signalKeys: ["cash", "profit", "budgetVariance"],
    relatedTabs: ["Бюджет / ВОР", "КС"]
  },
  "ERP / Учёт": {
    objective: "Сверить управленческие данные с бухгалтерским учетом",
    question: "Какие платежи и операции еще не сопоставлены или требуют импорта?",
    signalKeys: ["payments", "cash", "audit"],
    relatedTabs: ["Финансы", "История"]
  },
  "Договор / Тендер": {
    objective: "Выявить коммерческие обязательства и договорные риски",
    question: "Какие условия влияют на цену, сроки, оплату и право на уведомление?",
    signalKeys: ["risks", "documents", "cash"],
    relatedTabs: ["Риски", "КП / Подача"]
  },
  "КП / Подача": {
    objective: "Подготовить коммерчески обоснованное предложение",
    question: "Достаточно ли данных для цены, пакета подачи и защиты маржи?",
    signalKeys: ["profit", "readiness", "documents"],
    relatedTabs: ["Договор / Тендер", "Бюджет / ВОР"]
  },
  КС: {
    objective: "Подготовить подтвержденные объемы к предъявлению и оплате",
    question: "Что готово к закрытию и каких подтверждающих документов не хватает?",
    signalKeys: ["completion", "documents", "cash"],
    relatedTabs: ["Документы", "Финансы"]
  },
  "Сдача / Гарантия": {
    objective: "Собрать пакет передачи объекта и контролировать гарантийные обязательства",
    question: "Какие работы, документы и замечания еще блокируют закрытие проекта?",
    signalKeys: ["completion", "documents", "risks"],
    relatedTabs: ["Документы", "КС"]
  },
  Исполнение: {
    objective: "Контролировать подрядчиков, фронты, качество и безопасность",
    question: "Кто отвечает за отклонение и какое действие вернет работу в план?",
    signalKeys: ["delayed", "reports", "risks"],
    relatedTabs: ["График", "Площадка"]
  },
  Площадка: {
    objective: "Быстро фиксировать факт смены непосредственно с объекта",
    question: "Что выполнено, какие ресурсы работали и что мешает продолжению?",
    signalKeys: ["reports", "delayed", "materialDeficit"],
    relatedTabs: ["Рапорты", "График"]
  },
  Рапорты: {
    objective: "Превратить ежедневный факт в управленческие отклонения",
    question: "Подтвержден ли прогресс и какие проблемы повторяются по сменам?",
    signalKeys: ["reports", "delayed", "risks"],
    relatedTabs: ["Площадка", "График"]
  },
  Риски: {
    objective: "Сделать отклонения видимыми, назначить владельцев и сроки",
    question: "Какой риск сильнее всего влияет на срок, деньги или приемку?",
    signalKeys: ["risks", "delayed", "budgetVariance"],
    relatedTabs: ["Действия", "Аналитика"]
  },
  Документы: {
    objective: "Управлять версиями, комплектностью и передачей документов",
    question: "Какие документы отсутствуют, устарели или блокируют следующий этап?",
    signalKeys: ["documents", "readiness", "risks"],
    relatedTabs: ["RFI / Согласования", "КС"]
  },
  "RFI / Согласования": {
    objective: "Контролировать вопросы, ответы и сроки согласования",
    question: "Какие запросы блокируют работы и кто должен дать следующий ответ?",
    signalKeys: ["documents", "risks", "delayed"],
    relatedTabs: ["Документы", "График"]
  },
  Действия: {
    objective: "Собрать обязательства команды в единый исполняемый список",
    question: "Что просрочено, что ждет согласования и что нужно сделать сегодня?",
    signalKeys: ["readiness", "risks", "delayed"],
    relatedTabs: ["Обзор", "Процессы"]
  },
  Процессы: {
    objective: "Настроить понятные маршруты согласования и контроля",
    question: "Где решение зависает между ролями и как сократить цикл?",
    signalKeys: ["readiness", "audit", "members"],
    relatedTabs: ["Действия", "Участники"]
  },
  Аналитика: {
    objective: "Объяснить отклонения проекта через связанные показатели",
    question: "Как сроки, стоимость, снабжение и риски меняют прогноз результата?",
    signalKeys: ["completion", "profit", "risks"],
    relatedTabs: ["Обзор", "Действия"]
  },
  Участники: {
    objective: "Распределить доступ, роли и ответственность команды",
    question: "У каждого ли процесса есть владелец с достаточными правами?",
    signalKeys: ["members", "audit", "readiness"],
    relatedTabs: ["Процессы", "История"]
  },
  История: {
    objective: "Восстановить последовательность решений и изменений",
    question: "Кто, когда и почему изменил данные или статус проекта?",
    signalKeys: ["audit", "documents", "members"],
    relatedTabs: ["Участники", "Обзор"]
  },
  Настройки: {
    objective: "Безопасно управлять параметрами и жизненным циклом проекта",
    question: "Соответствуют ли права и опасные действия текущему намерению?",
    signalKeys: ["members", "audit", "readiness"],
    relatedTabs: ["Участники", "История"]
  },
  "AI-помощник": {
    objective: "Получить объяснимую сводку и проект управленческого решения",
    question: "Какой сценарий анализа даст полезный следующий шаг без потери контроля?",
    signalKeys: ["readiness", "risks", "audit"],
    relatedTabs: ["Действия", "Аналитика"]
  }
};

export function ProjectSectionGuide({
  activeTab,
  signals,
  priorities,
  lastEvent,
  onNavigate
}: {
  activeTab: ProjectTab;
  signals: ProjectSectionSignal[];
  priorities: string[];
  lastEvent: string;
  onNavigate: (tab: ProjectTab) => void;
}) {
  const guide = projectSectionGuides[activeTab];

  return (
    <section className="project-section-guide" aria-label={`Контекст раздела ${activeTab}`}>
      <div className="project-section-guide-main">
        <div className="project-section-focus">
          <small>Задача раздела</small>
          <h2>{guide.objective}</h2>
          <p>{guide.question}</p>
        </div>
        <div className="project-section-signals" aria-label="Ключевые сигналы раздела">
          {signals.map((signal) => (
            <div className={`project-section-signal tone-${signal.tone}`} key={signal.key}>
              <span>{signal.label}</span>
              <strong>{signal.value}</strong>
            </div>
          ))}
        </div>
      </div>
      <details className="project-section-context">
        <summary>
          <span><ListChecks size={17} aria-hidden="true" />Контекст и следующие действия</span>
          <ChevronDown size={17} aria-hidden="true" />
        </summary>
        <div className="project-section-context-body">
          <div>
            <h3>Приоритеты</h3>
            <ul>
              {priorities.map((priority) => <li key={priority}>{priority}</li>)}
            </ul>
          </div>
          <div>
            <h3>Последнее событие</h3>
            <p>{lastEvent}</p>
          </div>
          <div className="project-section-related">
            <h3>Связанные разделы</h3>
            {guide.relatedTabs.map((tab) => (
              <button className="project-section-link" key={tab} onClick={() => onNavigate(tab)} type="button">
                {tab}<ArrowRight size={15} aria-hidden="true" />
              </button>
            ))}
          </div>
        </div>
      </details>
    </section>
  );
}
