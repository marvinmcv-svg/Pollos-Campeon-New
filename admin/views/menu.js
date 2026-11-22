// Menu editor (owner/admin): name, description, price, active, meat-free.
import { sb, state, $, esc, money, toast, errMsg } from "../lib.js";

export async function render(el) {
  async function load() {
    const { data, error } = await sb.from("menu_items").select("*").order("sort");
    if (error) return toast(errMsg(error), true);
    state.menu = data;
    el.innerHTML = `<div class="vhead"><h1>Menú</h1></div>
      <p class="card">⚠ La base de datos cobra estos precios; la web y Campe-IA muestran los de <code>js/data.js</code>. Si cambiás un precio aquí, actualizá también <code>js/data.js</code> y volvé a publicar.</p>
      <div class="card tablewrap"><table class="table"><tr><th>Producto</th><th>Descripción</th><th>Precio (Bs)</th><th>Activo</th><th>Sin carne</th><th></th></tr>
      ${data.map((m) => `<tr data-id="${m.id}"><td><input class="input" data-f="name" value="${esc(m.name)}" /><small class="muted">${esc(m.id)} · ${esc(m.kind)}${m.available_days ? ` · solo día ${m.available_days.join(",")}` : ""}</small></td>
        <td><input class="input" data-f="description" value="${esc(m.description || "")}" /></td><td><input class="input" type="number" min="0" step="0.5" data-f="price" value="${m.price}" style="width:100px" /></td>
        <td><input type="checkbox" data-f="active" ${m.active ? "checked" : ""} /></td><td><input type="checkbox" data-f="veg" ${m.veg ? "checked" : ""} /></td><td><button class="btn btn--sm btn--dark" data-save>Guardar</button></td></tr>`).join("")}</table></div>`;
  }
  el.addEventListener("click", async (e) => {
    if (!e.target.closest("[data-save]")) return;
    const tr = e.target.closest("tr"), g = (f) => tr.querySelector(`[data-f="${f}"]`);
    const patch = { name: g("name").value.trim(), description: g("description").value.trim() || null, price: +g("price").value, active: g("active").checked, veg: g("veg").checked };
    if (!patch.name || !(patch.price >= 0)) return toast("Nombre y precio válidos.", true);
    const { error } = await sb.from("menu_items").update(patch).eq("id", tr.dataset.id);
    if (error) toast(errMsg(error), true); else toast(`Guardado · ${money(patch.price)}. Acordate de js/data.js`);
  });
  await load();
}
