"use client";

import { Save } from "lucide-react";
import React, { type FormEvent, useMemo, useState } from "react";
import type { Project } from "@/lib/types";

function numberFromInput(value: string) {
  const normalized = value.replace(/\s/g, "").replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function money(value: number) {
  return value.toLocaleString("ru-RU", {
    style: "currency",
    currency: "RUB",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

export function ProjectContractSettings({
  project,
  canEdit,
  roleLoaded
}: {
  project: Project;
  canEdit: boolean;
  roleLoaded: boolean;
}) {
  const [customer, setCustomer] = useState(project.customer);
  const [contractAmount, setContractAmount] = useState(String(project.contractAmount));
  const [vatMode, setVatMode] = useState<Project["vatMode"]>(project.vatMode);
  const [vatPercent, setVatPercent] = useState(String(project.vatPercent ?? 0));
  const [paymentNotes, setPaymentNotes] = useState(project.paymentNotes ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  const calculation = useMemo(() => {
    const total = numberFromInput(contractAmount);
    const rate = vatMode === "vat" ? numberFromInput(vatPercent) : 0;
    const valid = Number.isFinite(total) && total >= 0 && Number.isFinite(rate) && rate >= 0 && rate <= 100;
    if (!valid) return { total: 0, base: 0, vat: 0, rate: 0, valid: false };
    const base = rate > 0 ? total / (1 + rate / 100) : total;
    return { total, base, vat: total - base, rate, valid: true };
  }, [contractAmount, vatMode, vatPercent]);

  const formValid = customer.trim().length >= 2 && calculation.valid;

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canEdit || !formValid || saving) return;
    setSaving(true);
    setSaved(false);
    setError("");
    try {
      const response = await fetch(`/api/projects/${project.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          customer: customer.trim(),
          contractAmount: calculation.total,
          vatMode,
          vatPercent: vatMode === "vat" ? calculation.rate : null,
          paymentNotes: paymentNotes.trim() || null
        })
      });
      if (!response.ok) {
        throw new Error(response.status === 403 ? "Недостаточно прав для изменения проекта." : "Не удалось сохранить реквизиты проекта.");
      }
      setSaved(true);
      window.setTimeout(() => window.location.reload(), 650);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Не удалось сохранить реквизиты проекта.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="project-contract-settings" onSubmit={(event) => void save(event)}>
      <div className="project-contract-settings-copy">
        <div>
          <div className="eyebrow">Карточка проекта</div>
          <h3>Реквизиты и договор</h3>
        </div>
        <p className="muted">Сумма хранится как итог договора. При режиме «с НДС» база и налог рассчитываются из итоговой суммы.</p>
      </div>

      <div className="project-contract-settings-grid">
        <label className="field-wide">
          Сторона договора / контрагент
          <input maxLength={200} required value={customer} onChange={(event) => setCustomer(event.target.value)} />
        </label>
        <label>
          Сумма договора, ₽
          <input inputMode="decimal" required value={contractAmount} onChange={(event) => setContractAmount(event.target.value)} />
        </label>
        <label>
          Режим НДС
          <select value={vatMode} onChange={(event) => setVatMode(event.target.value as Project["vatMode"])}>
            <option value="vat">С НДС</option>
            <option value="no_vat">Без НДС</option>
          </select>
        </label>
        <label>
          Ставка НДС, %
          <input disabled={vatMode === "no_vat"} inputMode="decimal" value={vatMode === "no_vat" ? "0" : vatPercent} onChange={(event) => setVatPercent(event.target.value)} />
        </label>
        <label className="field-wide">
          Условия договора / примечание
          <textarea maxLength={4000} rows={3} value={paymentNotes} onChange={(event) => setPaymentNotes(event.target.value)} />
        </label>
      </div>

      <div className="project-contract-calculation" aria-label="Расчет суммы договора">
        <div><small>Стоимость без НДС</small><strong>{money(calculation.base)}</strong></div>
        <div><small>НДС {vatMode === "vat" ? `${calculation.rate.toLocaleString("ru-RU")}%` : "не применяется"}</small><strong>{money(calculation.vat)}</strong></div>
        <div><small>Итого по договору</small><strong>{money(calculation.total)}</strong></div>
      </div>

      <div className="project-contract-settings-actions">
        <button className="button primary" disabled={!roleLoaded || !canEdit || !formValid || saving} type="submit">
          <Save size={17} />
          {saving ? "Сохраняю..." : "Сохранить реквизиты"}
        </button>
        {!roleLoaded ? <span className="muted">Проверяю права доступа.</span> : !canEdit ? <span className="muted">Редактирование доступно OWNER, ADMIN и MANAGER.</span> : null}
        {saved ? <span className="badge green">Реквизиты сохранены</span> : null}
        {error ? <span className="badge red">{error}</span> : null}
      </div>
    </form>
  );
}
