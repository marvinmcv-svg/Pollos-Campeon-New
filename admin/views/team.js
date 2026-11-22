// Team: list, create users (email, temp password, role, store), change role/store/active, reset password.
import { sb, state, $, esc, ROLES, modal, toast, errMsg, is } from "../lib.js";

export async function render(el) {
  const roles = Object.keys(ROLES).filter((r) => r !== "owner" || is("owner"));
  const storeOpts = (v) => `<option value="">Todas (dueño/admin)</option>${state.stores.map((s) => `<option value="${s.id}" ${v === s.id ? "selected" : ""}>${esc(s.name)}</option>`).join("")}`;
  async function load() {
    const { data, error } = await sb.from("staff").select("*").order("created_at");
    if (error) return toast(errMsg(error), true);
    el.innerHTML = `<div class="vhead"><h1>Equipo</h1><button class="btn btn--primary" id="add">Agregar persona</button></div>
      <div class="card tablewrap"><table class="table"><tr><th>Nombre</th><th>Correo</th><th>Rol</th><th>Sucursal</th><th>Activo</th><th></th></tr>
      ${data.map((s) => `<tr data-id="${s.user_id}"><td>${esc(s.full_name)}</td><td>${esc(s.email || "")}</td>
        <td><select class="input" data-f="role" ${s.role === "owner" && !is("owner") ? "disabled" : ""}>${(s.role === "owner" && !is("owner") ? ["owner"] : roles).map((r) => `<option value="${r}" ${s.role === r ? "selected" : ""}>${ROLES[r]}</option>`).join("")}</select></td>
        <td><select class="input" data-f="store">${storeOpts(s.store_id)}</select></td><td><input type="checkbox" data-f="active" ${s.active ? "checked" : ""} /></td>
        <td class="row"><button class="btn btn--sm btn--dark" data-save>Guardar</button><button class="btn btn--sm btn--ghost" data-pw>Contraseña</button></td></tr>`).join("")}</table></div>`;
  }
  el.addEventListener("click", async (e) => {
    const tr = e.target.closest("tr[data-id]");
    if (e.target.closest("[data-save]") && tr) {
      const g = (f) => tr.querySelector(`[data-f="${f}"]`);
      const { error } = await sb.rpc("admin_update_staff", { p_user: tr.dataset.id, p_role: g("role").value, p_store: g("store").value || null, p_active: g("active").checked });
      if (error) toast(errMsg(error), true); else { toast("Actualizado"); load(); }
    }
    if (e.target.closest("[data-pw]") && tr) {
      const { box, close } = modal("Nueva contraseña", `<label class="field"><span>Contraseña (mín. 8)</span><input class="input" type="text" id="np" autocomplete="new-password" /></label><button class="btn btn--primary" id="ok">Cambiar</button>`);
      box.querySelector("#ok").addEventListener("click", async () => {
        const { error } = await sb.rpc("admin_set_password", { p_user: tr.dataset.id, p_password: box.querySelector("#np").value });
        if (error) toast(errMsg(error), true); else { toast("Contraseña cambiada. Pasala en privado."); close(); }
      });
    }
    if (e.target.closest("#add")) {
      const { box, close } = modal("Agregar persona", `<label class="field"><span>Nombre completo</span><input class="input" id="n" /></label><label class="field"><span>Correo</span><input class="input" type="email" id="em" /></label>
        <label class="field"><span>Contraseña temporal (mín. 8)</span><input class="input" type="text" id="pw" autocomplete="new-password" /></label>
        <div class="grid2"><label class="field"><span>Rol</span><select class="input" id="r">${roles.map((r) => `<option value="${r}" ${r === "cashier" ? "selected" : ""}>${ROLES[r]}</option>`).join("")}</select></label><label class="field"><span>Sucursal</span><select class="input" id="st">${storeOpts("")}</select></label></div>
        <label class="field"><span>Teléfono</span><input class="input" id="ph" /></label><button class="btn btn--primary" id="ok">Crear</button>`);
      box.querySelector("#ok").addEventListener("click", async () => {
        const g = (i) => box.querySelector(i).value.trim();
        if (!["owner", "admin"].includes(g("#r")) && !g("#st")) return toast("Elegí la sucursal para ese rol.", true);
        const { error } = await sb.rpc("admin_create_staff", { p_email: g("#em"), p_password: box.querySelector("#pw").value, p_full_name: g("#n"), p_role: g("#r"), p_store: g("#st") || null, p_phone: g("#ph") || null });
        if (error) return toast(errMsg(error), true);
        toast("Persona creada. Pasale la contraseña en privado."); close(); load();
      });
    }
  });
  await load();
}
