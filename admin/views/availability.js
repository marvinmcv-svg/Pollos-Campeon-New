// "86" board: big touch targets to mark an item sold out at a store. Blocks web + Campe-IA orders instantly.
import { sb, state, $, esc, storeSelect, toast, errMsg, isAdmin } from "../lib.js";

export async function render(el) {
  let store = isAdmin() ? (state.storeFilter || state.stores[0].id) : state.staff.store_id;
  el.innerHTML = `<div class="vhead"><h1>Agotados</h1>${isAdmin() ? storeSelect("av", { all: false, value: store }) : ""}</div><p class="muted">Tocá un producto para marcarlo agotado (rojo) o disponible (verde) en esta sucursal.</p><div class="avail" id="grid"></div>`;
  if (isAdmin()) $("#av", el).addEventListener("change", (e) => { store = e.target.value; load(); });
  async function load() {
    const { data, error } = await sb.from("store_item_availability").select("*").eq("store_id", store);
    if (error) return toast(errMsg(error), true);
    const off = new Set(data.filter((r) => !r.available).map((r) => r.item_id));
    $("#grid", el).innerHTML = state.menu.filter((m) => m.active).map((m) => `<button type="button" data-id="${m.id}" aria-pressed="${!off.has(m.id)}">${esc(m.name)}<small>${off.has(m.id) ? "AGOTADO" : "Disponible"}</small></button>`).join("");
  }
  el.addEventListener("click", async (e) => {
    const b = e.target.closest("[data-id]"); if (!b) return;
    const available = b.getAttribute("aria-pressed") !== "true";
    b.disabled = true;
    const { error } = await sb.from("store_item_availability").upsert({ store_id: store, item_id: b.dataset.id, available, updated_at: new Date().toISOString(), updated_by: state.staff.user_id });
    b.disabled = false;
    if (error) return toast(errMsg(error), true);
    toast(available ? "Disponible de nuevo" : "Marcado como agotado"); load();
  });
  const ch = sb.channel(`avail-${Math.random().toString(36).slice(2)}`).on("postgres_changes", { event: "*", schema: "public", table: "store_item_availability" }, load).subscribe();
  await load();
  return () => sb.removeChannel(ch);
}
