import * as XLSX from "xlsx";
import type { Material, ProcurementRequest } from "@/lib/types";

const statusLabels: Record<string, string> = {
  draft: "Черновик",
  submitted: "На подтверждении",
  approved: "Подтверждена",
  ordered: "Заказано",
  expected: "Ожидается",
  partially_received: "Принято частично",
  received: "Принято на склад",
  closed: "Закрыто",
  rejected: "Отклонено"
};

export function buildProcurementWorkbook(projectName: string, requests: ProcurementRequest[], materials: Material[]) {
  const requestRows = requests.map((request) => ({
    "№ заявки": request.requestNumber ?? request.id,
    Заявка: request.title,
    Инициатор: request.initiator,
    Статус: statusLabels[request.status] ?? request.status,
    Приоритет: request.priority,
    "Дата потребности": request.neededAt,
    "Ожидаемая поставка": request.expectedAt ?? "",
    "Срок опережения, дней": request.leadTimeDays ?? 14,
    Позиций: request.items.length
  }));
  const lineRows = requests.flatMap((request) => request.items.map((item) => ({
    "№ заявки": request.requestNumber ?? request.id,
    Статус: statusLabels[request.status] ?? request.status,
    Материал: item.name,
    Количество: item.qty,
    Принято: item.receivedQty ?? 0,
    Осталось: Math.max(item.qty - (item.receivedQty ?? 0), 0),
    Ед: item.unit,
    "Дата потребности": request.neededAt,
    "Ожидаемая поставка": request.expectedAt ?? "",
    Комментарий: item.comment ?? ""
  })));
  const stockRows = materials
    .map((material) => ({
      Материал: material.name,
      "На складе": Math.max(material.deliveredQty - material.consumedQty, 0),
      Ед: material.unit,
      Поставлено: material.deliveredQty,
      Израсходовано: material.consumedQty,
      "Плановая цена": material.plannedUnitPrice,
      "Стоимость остатка": Math.max(material.deliveredQty - material.consumedQty, 0) * material.plannedUnitPrice,
      Поставщик: material.supplier
    }))
    .filter((row) => row["На складе"] > 0 || row.Поставлено > 0);
  const summaryRows = [
    { Показатель: "Проект", Значение: projectName },
    { Показатель: "Заявок в выгрузке", Значение: requests.length },
    { Показатель: "Позиций", Значение: lineRows.length },
    { Показатель: "Позиций на складе", Значение: stockRows.length },
    { Показатель: "Стоимость складского остатка", Значение: stockRows.reduce((sum, row) => sum + row["Стоимость остатка"], 0) }
  ];

  const workbook = XLSX.utils.book_new();
  const requestsSheet = XLSX.utils.json_to_sheet(requestRows.length ? requestRows : [{ "№ заявки": "", Заявка: "", Статус: "" }]);
  const linesSheet = XLSX.utils.json_to_sheet(lineRows.length ? lineRows : [{ "№ заявки": "", Материал: "", Количество: "", Ед: "" }]);
  const stockSheet = XLSX.utils.json_to_sheet(stockRows.length ? stockRows : [{ Материал: "", "На складе": "", Ед: "" }]);
  const summarySheet = XLSX.utils.json_to_sheet(summaryRows);
  requestsSheet["!cols"] = [18, 38, 20, 20, 14, 16, 18, 18, 10].map((wch) => ({ wch }));
  linesSheet["!cols"] = [18, 20, 36, 14, 12, 12, 10, 16, 18, 42].map((wch) => ({ wch }));
  stockSheet["!cols"] = [36, 14, 10, 14, 16, 16, 20, 24].map((wch) => ({ wch }));
  summarySheet["!cols"] = [{ wch: 34 }, { wch: 28 }];
  XLSX.utils.book_append_sheet(workbook, summarySheet, "Сводка");
  XLSX.utils.book_append_sheet(workbook, requestsSheet, "Заявки");
  XLSX.utils.book_append_sheet(workbook, linesSheet, "Позиции");
  XLSX.utils.book_append_sheet(workbook, stockSheet, "Склад");
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
}
