// Branches: hours, pause with auto-resume, delivery/pickup toggles, prep minutes, fee, WhatsApp, address.
import { sb, state, $, esc, money, modal, toast, errMsg, isAdmin } from "../lib.js";

export async function render(el) {
  async function load() {
    const { data, error } = await sb.from("stores").select("*").order("sort");
    if (error) return toast(errMsg(error), true);
    state.stores = data;
    const list = isAdmin() ? data : data.filter((s) => s.id === state.staff.store_id);
    el.innerHTML = `<div class="vhead"><h1>Sucursales</h1></div><div class="card tablewrap"><table class="table"><tr><th>Sucursal</th><th>Horario</th><th>Estado</th><th>Delivery</th><th>Recoger</th><th>Prep.</th><th>Costo delivery</th><th></th></tr>
      ${list.map((s) => { const paused = s.is_paused && (!s.paused_until || new Date(s.paused_until) > new Date());
        return `<tr><td><b>${esc(s.name)}</b><br/><small class="muted">${esc(s.address || "")}</small></td><td>${s.open_time ? `${s.open_time.slice(0, 5)}–${s.close_time.slice(0, 5)}` : `<span class="pill">Sin cargar</span>`}</td>
        <td>${paused ? `<span class="pill s-cancelled">Pausada${s.paused_until ? ` hasta ${new Date(s.paused_until).toLocaleTimeString("es-BO", { hour: "2-digit", minute: "2-digit", timeZone: "America/La_Paz" })}` : ""}</span><br/><button class="btn btn--sm" data-resume="${s.id}">Reanudar</button>` : `<button class="btn btn--sm btn--danger" data-pause="${s.id}">Pausar pedidos</button>`}</td>
        <td><input type="checkbox" data-tg="accepts_delivery" data-id="${s.id}" ${s.accepts_delivery ? "checked" : ""} aria-label="Acepta delivery" /></td><td><input type="checkbox" data-tg="accepts_pickup" data-id="${s.id}" ${s.accepts_pickup ? "checked" : ""} aria-label="Acepta recoger" /></td>
        <td>${s.prep_minutes} min</td><td>${s.delivery_fee == null ? "a cotizar" : money(s.delivery_fee)}</td><td><button class="btn btn--sm btn--ghost" data-edit="${s.id}">Editar</button></td></tr>`; }).join("")}</table></div>`;
  }
  const upd = async (id, patch, msg) => { const { error } = await sb.from("stores").update(patch).eq("id", id); if (error) toast(errMsg(error), true); else { toast(msg || "Guardado"); load(); } };
  el.addEventListener("change", (e) => { const t = e.target.closest("[data-tg]"); if (t) upd(t.dataset.id, { [t.dataset.tg]: t.checked }); });
  el.addEventListener("click", (e) => {
    const r = e.target.closest("[data-resume]"), p = e.target.closest("[data-pause]"), ed = e.target.closest("[data-edit]");
    if (r) upd(r.dataset.resume, { is_paused: false, pause_reason: null, paused_until: null }, "Pedidos reanudados");
    if (p) {
      const { box, close } = modal("Pausar pedidos", `<label class="field"><span>Motivo</span><input class="input" id="pr" placeholder="Cocina saturada, corte de luz…" /></label>
        <div class="row">${[[15, "15 min"], [30, "30 min"], [60, "60 min"], [0, "Hasta que reanude"]].map(([m, l]) => `<button class="btn btn--dark" data-m="${m}">${l}</button>`).join("")}</div>`);
      box.addEventListener("click", (ev) => { const b = ev.target.closest("[data-m]"); if (!b) return; const m = +b.dataset.m; close();
        upd(p.dataset.pause, { is_paused: true, pause_reason: box.querySelector("#pr").value || null, paused_until: m ? new Date(Date.now() + m * 60000).toISOString() : null }, "Sucursal pausada"); });
    }
    if (ed) {
      const s = state.stores.find((x) => x.id === ed.dataset.edit);
      const { box, close } = modal(s.name, `<div class="grid2"><label class="field"><span>Abre</span><input class="input" type="time" id="o" value="${(s.open_time || "").slice(0, 5)}" /></label><label class="field"><span>Cierra</span><input class="input" type="time" id="c" value="${(s.close_time || "").slice(0, 5)}" /></label>
        <label class="field"><span>Minutos de preparación</span><input class="input" type="number" min="1" max="240" id="pm" value="${s.prep_minutes}" /></label><label class="field"><span>Costo de delivery (vacío = a cotizar)</span><input class="input" type="number" min="0" step="0.5" id="df" value="${s.delivery_fee ?? ""}" /></label></div>
        <label class="field"><span>WhatsApp (591…)</span><input class="input" id="wa" value="${esc(s.whatsapp || "")}" /></label><label class="field"><span>Dirección</span><input class="input" id="ad" value="${esc(s.address || "")}" /></label>
        <button class="btn btn--primary" id="sv">Guardar</button><p class="muted">Recordá actualizar también <code>js/data.js</code> (horarios y WhatsApp) para que la web y Campe-IA muestren lo mismo.</p>`);
      box.querySelector("#sv").addEventListener("click", () => { const g = (i) => box.querySelector(i).value;
        close(); upd(s.id, { open_time: g("#o") || null, close_time: g("#c") || null, prep_minutes: +g("#pm") || 20, delivery_fee: g("#df") === "" ? null : +g("#df"), whatsapp: g("#wa") || null, address: g("#ad") || null }); });
    }
  });
  await load();
}
