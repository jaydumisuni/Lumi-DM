"use strict";
(() => {
  const UI = window.LumiMainUI;
  const { h, number, CONNECTIONS } = UI;

  function destinationFieldsPrimary() {
    const queueOptions = (state.queues || []).map(queue => `<option value="${h(queue.id)}">${h(queue.name)}</option>`).join("");
    return `<div class="field-row"><label class="field">Final folder<div class="lumi-folder-control"><input class="input" name="target_dir" value="${h(state.settings.default_dir || "")}"><button class="btn" type="button" data-main-browse="target_dir">Browse…</button></div></label><label class="field">Queue<select class="select" name="queue_id">${queueOptions}</select></label></div>`;
  }

  function directSourcePrimary() {
    const profileOptions = (state.hostProfiles || []).map(profile => `<option value="${h(profile.id)}">${h(profile.name)} · ${h(profile.host_pattern)}</option>`).join("");
    const connectionValue = number(state.settings.default_connections || 32);
    return `<form class="source-options" data-source-form="direct"><label class="field">URLs<textarea class="textarea" name="urls" required placeholder="One HTTP, HTTPS or FTP URL per line"></textarea></label>${destinationFieldsPrimary()}<div class="field-row"><label class="field">Filename<input class="input" name="filename" placeholder="Optional for one URL"></label><label class="field">Category<select class="select" name="category_id"><option value="">Automatic</option>${(state.categories || []).map(category => `<option value="${h(category.id)}">${h(category.name)}</option>`).join("")}</select></label></div><div class="field-row"><label class="field">Connections<select class="select" name="connections">${CONNECTIONS.map(value => `<option value="${value}" ${value === connectionValue ? "selected" : ""}>${value} connections</option>`).join("")}</select></label><label class="field">Duplicate handling<select class="select" name="duplicate_policy"><option value="rename" selected>Create numbered filename</option><option value="reuse">Use existing task</option><option value="overwrite">Overwrite file</option><option value="reject">Reject duplicate</option></select></label></div><details class="source-session"><summary>Site login or saved session (only when required)</summary><div class="source-session-body"><p class="source-session-note">Leave this on Automatic for normal public downloads. Lumi matches saved credentials only to the correct site.</p><label class="field">Saved site session<select class="select" name="host_profile_id"><option value="">Automatic / no login</option>${profileOptions}</select></label></div></details><label class="check"><input type="checkbox" name="start_paused">Add paused</label><div class="form-actions"><button class="btn" type="button" data-close-source>Cancel</button><button class="btn primary" type="submit">Start Download</button></div></form>`;
  }

  async function verifyCreatedTask(task) {
    if (!task?.id) throw new Error("Lumi did not return a task ID");
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await new Promise(resolve => setTimeout(resolve, attempt ? 450 : 180));
      const response = await api("GET", "/api/downloads?limit=5000");
      const current = (response.downloads || []).find(item => String(item.id) === String(task.id));
      if (!current) continue;
      if (current.status === "failed") throw new Error(current.error || "The download engine rejected the task");
      return current;
    }
    throw new Error("The new task was not persisted by the Lumi engine");
  }

  async function startDirectPrimary(form) {
    const data = typeof formObject === "function" ? formObject(form) : Object.fromEntries(new FormData(form).entries());
    const urls = String(data.urls || "").split(/\r?\n/).map(item => item.trim()).filter(Boolean);
    if (!urls.length) return;
    if (typeof setBusy === "function") setBusy(form, true);
    const errors = [];
    const created = [];
    for (const url of urls) {
      try {
        const task = await api("POST", "/api/downloads/start", {
          url,
          target_dir: data.target_dir,
          filename: urls.length === 1 ? data.filename : "",
          queue_id: data.queue_id || "default",
          category_id: data.category_id || "",
          connections: number(data.connections || 32),
          duplicate_policy: data.duplicate_policy || "rename",
          overwrite: data.duplicate_policy === "overwrite",
          start_paused: Boolean(data.start_paused),
          request_envelope: {
            url,
            original_page: url,
            browser_profile: data.host_profile_id || "",
          },
        });
        created.push(await verifyCreatedTask(task));
      } catch (error) {
        errors.push(`${url}: ${error.message || error}`);
      }
    }
    if (typeof setBusy === "function") setBusy(form, false);
    if (created.length) {
      closeModal("new-modal");
      await refreshFoundation();
      switchView("downloads");
      const active = created.filter(task => ["queued", "resolving", "running", "paused", "staged"].includes(task.status)).length;
      toast("Download started", `${active || created.length} task${created.length === 1 ? "" : "s"} accepted by the engine`, "success");
    }
    if (errors.length) toast("Download not started", errors.join(" · "), "error");
  }

  function installDownloadContract() {
    window.commonDestinationFields = destinationFieldsPrimary;
    window.directSourceHtml = directSourcePrimary;
    window.startDirect = startDirectPrimary;
    try { commonDestinationFields = destinationFieldsPrimary; } catch (_) {}
    try { directSourceHtml = directSourcePrimary; } catch (_) {}
    try { startDirect = startDirectPrimary; } catch (_) {}
  }

  Object.assign(UI, { installDownloadContract });
})();
