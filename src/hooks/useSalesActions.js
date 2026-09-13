import { useCallback } from "react";
import { recordDeletions } from "../online";
import { defaultBusinessUnits } from "../sales-model.mjs";

// Agrupa las acciones de la pantalla Ventas: altas/bajas de ventas, objetivos
// y unidades de negocio. Se agrupan porque las tres operan sobre las mismas
// tres colecciones (sales / salesGoals / businessUnits) dentro de `data` y no
// comparten estado con el resto de App() más allá de setData/confirm.
export function useSalesActions(data, setData, confirm) {
  const saveSale = useCallback((sale) => {
    const stamp = new Date().toISOString();
    const record = {
      ...sale,
      id: sale.id || crypto.randomUUID(),
      createdAt: sale.createdAt || stamp,
      updatedAt: stamp,
    };
    setData((current) => ({
      ...current,
      sales: (current.sales || []).some((item) => item.id === record.id)
        ? current.sales.map((item) => (item.id === record.id ? record : item))
        : [...(current.sales || []), record],
    }));
  }, [setData]);

  const saveSales = useCallback((rows) => {
    const stamp = new Date().toISOString();
    setData((current) => {
      const sales = [...(current.sales || [])];
      for (const sale of rows) {
        const record = {
          ...sale,
          id: sale.id || crypto.randomUUID(),
          createdAt: sale.createdAt || stamp,
          updatedAt: stamp,
        };
        const index = sales.findIndex((item) => item.id === record.id);
        if (index === -1) sales.push(record);
        else sales[index] = record;
      }
      return { ...current, sales };
    });
  }, [setData]);

  const deleteSale = useCallback(async (id) => {
    const sale = (data.sales || []).find((item) => item.id === id);
    const label = sale?.customer ? `la venta a "${sale.customer}"` : "esta venta";
    if (!(await confirm(`¿Eliminar ${label} del registro? Esto no se puede deshacer.`, { danger: true, confirmLabel: "Eliminar" }))) return;
    setData((current) => recordDeletions({
      ...current,
      sales: (current.sales || []).filter((item) => item.id !== id),
    }, { sales: [id] }));
  }, [data.sales, confirm, setData]);

  const deleteSales = useCallback(async (ids) => {
    if (!ids.length) return;
    if (!(await confirm(`¿Eliminar ${ids.length} venta${ids.length === 1 ? "" : "s"} del registro? Esto no se puede deshacer.`, { danger: true, confirmLabel: "Eliminar" }))) return;
    setData((current) => recordDeletions({
      ...current,
      sales: (current.sales || []).filter((item) => !ids.includes(item.id)),
    }, { sales: ids }));
  }, [confirm, setData]);

  const saveSalesGoal = useCallback((goal) => {
    setData((current) => {
      const existing = Array.isArray(current.salesGoals) ? current.salesGoals : [];
      const index = existing.findIndex((item) => item.id === goal.id);
      const salesGoals = index === -1 ? [...existing, goal] : existing.map((item, i) => (i === index ? goal : item));
      return { ...current, salesGoals };
    });
  }, [setData]);

  const deleteSalesGoal = useCallback((id) => {
    setData((current) => recordDeletions({
      ...current,
      salesGoals: (Array.isArray(current.salesGoals) ? current.salesGoals : []).filter((goal) => goal.id !== id),
    }, { salesGoals: [id] }));
  }, [setData]);

  const saveBusinessUnit = useCallback((unit) => {
    setData((current) => {
      const existing = Array.isArray(current.businessUnits) && current.businessUnits.length
        ? current.businessUnits
        : defaultBusinessUnits();
      const index = existing.findIndex((item) => item.id === unit.id);
      const businessUnits = index === -1
        ? [...existing, unit]
        : existing.map((item) => (item.id === unit.id ? unit : item));
      return { ...current, businessUnits };
    });
  }, [setData]);

  const deleteBusinessUnit = useCallback(async (id) => {
    if (!(await confirm("¿Eliminar esta unidad de negocio? Las ventas ya cargadas con esta unidad no se modifican.", { danger: true, confirmLabel: "Eliminar" }))) return;
    setData((current) => {
      const existing = Array.isArray(current.businessUnits) && current.businessUnits.length
        ? current.businessUnits
        : defaultBusinessUnits();
      return recordDeletions({ ...current, businessUnits: existing.filter((item) => item.id !== id) }, { businessUnits: [id] });
    });
  }, [confirm, setData]);

  return {
    saveSale,
    saveSales,
    deleteSale,
    deleteSales,
    saveSalesGoal,
    deleteSalesGoal,
    saveBusinessUnit,
    deleteBusinessUnit,
  };
}
