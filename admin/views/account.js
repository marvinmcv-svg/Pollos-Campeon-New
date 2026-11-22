// My account: profile summary + change own password.
import { sb, state, $, esc, ROLES, toast, errMsg } from "../lib.js";

export async function render(el) {
  const s = state.staff;
  el.innerHTML = `<div class="vhead"><h1>Mi cuenta</h1></div><div class="grid2"><div class="card"><p><b>${esc(s.full_name)}</b><br/>${esc(s.email || "")}<br/>${esc(ROLES[s.role])}${s.store_id ? ` · ${esc((state.stores.find((x) => x.id === s.store_id) || {}).name || "")}` : ""}</p></div>
    <form class="card" id="pf"><h2 style="font-size:1rem;margin-bottom:10px">Cambiar contraseña</h2><label class="field"><span>Nueva contraseña (mín. 8)</span><input class="input" type="password" id="p1" autocomplete="new-password" /></label>
    <label class="field"><span>Repetila</span><input class="input" type="password" id="p2" autocomplete="new-password" /></label><button class="btn btn--primary">Guardar</button></form></div>`;
  $("#pf", el).addEventListener("submit", async (e) => {
    e.preventDefault(); const a = $("#p1", el).value, b = $("#p2", el).value;
    if (a.length < 8) return toast("Mínimo 8 caracteres.", true);
    if (a !== b) return toast("Las contraseñas no coinciden.", true);
    const { error } = await sb.auth.updateUser({ password: a });
    if (error) toast(errMsg(error), true); else { toast("Contraseña actualizada"); e.target.reset(); }
  });
}
