"use client";

import { Construction, PackageCheck, Plus, Trash2 } from "lucide-react";
import React from "react";
import type {
  DailyReportEquipmentActual,
  DailyReportMaterialActual,
  Material
} from "@/lib/types";

type Props = {
  materials: Material[];
  materialActuals: DailyReportMaterialActual[];
  equipmentActuals: DailyReportEquipmentActual[];
  onMaterialsChange: (items: DailyReportMaterialActual[]) => void;
  onEquipmentChange: (items: DailyReportEquipmentActual[]) => void;
};

function emptyMaterial(materials: Material[]): DailyReportMaterialActual {
  return {
    materialId: materials[0]?.id ?? "",
    kind: "consumed",
    quantity: 0,
    unit: materials[0]?.unit ?? "",
    note: ""
  };
}

function emptyEquipment(): DailyReportEquipmentActual {
  return { name: "", quantity: 1, hours: 0, downtimeHours: 0, note: "" };
}

export function DailyReportActualsEditor({
  materials,
  materialActuals,
  equipmentActuals,
  onMaterialsChange,
  onEquipmentChange
}: Props) {
  function updateMaterial(index: number, patch: Partial<DailyReportMaterialActual>) {
    onMaterialsChange(materialActuals.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item));
  }

  function selectMaterial(index: number, materialId: string) {
    const material = materials.find((item) => item.id === materialId);
    updateMaterial(index, { materialId, unit: material?.unit ?? "" });
  }

  function updateEquipment(index: number, patch: Partial<DailyReportEquipmentActual>) {
    onEquipmentChange(equipmentActuals.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item));
  }

  return (
    <section className="daily-report-actuals-editor" aria-label="Материалы и техника смены">
      <div className="daily-report-actuals-column">
        <header>
          <div><PackageCheck size={18} /><span><strong>Движение материалов</strong><small>Только выбранные позиции попадут в учет поставки и расхода.</small></span></div>
          <button className="button secondary compact-button" disabled={!materials.length || materialActuals.length >= 60} type="button" onClick={() => onMaterialsChange([...materialActuals, emptyMaterial(materials)])}><Plus size={15} /> Материал</button>
        </header>
        {materialActuals.length ? (
          <div className="daily-report-actual-list">
            {materialActuals.map((actual, index) => (
              <div className="daily-report-material-row" key={index}>
                <label className="field actual-name"><span>Позиция</span><select required value={actual.materialId} onChange={(event) => selectMaterial(index, event.target.value)}><option value="">Выберите материал</option>{materials.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.unit}</option>)}</select></label>
                <label className="field"><span>Операция</span><select value={actual.kind} onChange={(event) => updateMaterial(index, { kind: event.target.value as DailyReportMaterialActual["kind"] })}><option value="received">Получено</option><option value="consumed">Израсходовано</option></select></label>
                <label className="field"><span>Количество</span><input min={0.001} required step="0.001" type="number" value={actual.quantity || ""} onChange={(event) => updateMaterial(index, { quantity: Number(event.target.value) })} /></label>
                <label className="field actual-unit"><span>Ед.</span><input readOnly value={actual.unit} /></label>
                <label className="field actual-note"><span>Комментарий</span><input maxLength={500} value={actual.note ?? ""} onChange={(event) => updateMaterial(index, { note: event.target.value })} /></label>
                <button className="icon-button danger" title="Удалить строку материала" type="button" onClick={() => onMaterialsChange(materialActuals.filter((_, itemIndex) => itemIndex !== index))}><Trash2 size={16} /></button>
              </div>
            ))}
          </div>
        ) : <p className="daily-report-output-empty">{materials.length ? "Добавьте только фактически полученные или израсходованные позиции." : "Сначала добавьте номенклатуру во вкладке «Материалы»."}</p>}
      </div>

      <div className="daily-report-actuals-column">
        <header>
          <div><Construction size={18} /><span><strong>Техника и машино-часы</strong><small>Фиксируйте общую работу и простой за смену.</small></span></div>
          <button className="button secondary compact-button" disabled={equipmentActuals.length >= 30} type="button" onClick={() => onEquipmentChange([...equipmentActuals, emptyEquipment()])}><Plus size={15} /> Техника</button>
        </header>
        {equipmentActuals.length ? (
          <div className="daily-report-actual-list">
            {equipmentActuals.map((actual, index) => (
              <div className="daily-report-equipment-row" key={index}>
                <label className="field actual-name"><span>Техника</span><input required minLength={2} value={actual.name} onChange={(event) => updateEquipment(index, { name: event.target.value })} placeholder="Экскаватор" /></label>
                <label className="field"><span>Единиц</span><input min={1} required step={1} type="number" value={actual.quantity || ""} onChange={(event) => updateEquipment(index, { quantity: Number(event.target.value) })} /></label>
                <label className="field"><span>Маш.-ч</span><input min={0} required step="0.1" type="number" value={actual.hours} onChange={(event) => updateEquipment(index, { hours: Number(event.target.value) })} /></label>
                <label className="field"><span>Простой, ч</span><input min={0} step="0.1" type="number" value={actual.downtimeHours} onChange={(event) => updateEquipment(index, { downtimeHours: Number(event.target.value) })} /></label>
                <label className="field actual-note"><span>Комментарий</span><input maxLength={500} value={actual.note ?? ""} onChange={(event) => updateEquipment(index, { note: event.target.value })} /></label>
                <button className="icon-button danger" title="Удалить строку техники" type="button" onClick={() => onEquipmentChange(equipmentActuals.filter((_, itemIndex) => itemIndex !== index))}><Trash2 size={16} /></button>
              </div>
            ))}
          </div>
        ) : <p className="daily-report-output-empty">Добавьте технику, если нужно учесть машино-часы или простой.</p>}
      </div>
    </section>
  );
}
