/* ══════════════════════════════════════════════════════════════════
   20-visitor-help-settings.js  不重複訪客統計、使用說明視窗、Firebase 設定/分享視窗
══════════════════════════════════════════════════════════════════ */

/* ════════ 不重複訪客統計 ════════ */
function getDeviceId() { let id = localStorage.getItem(LS_DEVICE); if (!id) { id = "d_" + Math.random().toString(36).slice(2) + Date.now().toString(36); localStorage.setItem(LS_DEVICE, id); } return id; }
async function countVisitor() {
  if (LOCAL_MODE) {
    // 本地模式：簡單計數，不寫 DB
    document.getElementById("visitCount").textContent = "本地";
    return;
  }
  const date = todayStr(), did = getDeviceId(), ref = db.collection("visits").doc(date);
  ref.onSnapshot(doc => { const devices = doc.exists ? (doc.data().devices || {}) : {}; document.getElementById("visitCount").textContent = Object.keys(devices).length || 0; });
  try { await ref.set({ devices: { [did]: true } }, { merge: true }); } catch (e) { console.warn("訪客計數失敗", e); }
}

/* ════════ 說明視窗 ════════ */
function openHelp() {
  showModal(`
    <div class="p-6 space-y-4 overflow-y-auto">
      <div class="flex items-center justify-between"><h3 class="text-lg font-bold">📖 v3.0 使用說明</h3><button onclick="closeModal()" class="text-slate-400 hover:text-slate-600 text-xl">×</button></div>

      <div class="space-y-3 text-sm text-slate-600 leading-relaxed">
        <p><b>🎉 v3.0 重大更新：</b>已完全移除 Firebase 依賴，採用純本地架構。</p>

        <h4 class="font-bold text-slate-700">💻 純本地模式（預設）</h4>
        <ul class="list-disc pl-5 space-y-1">
          <li>資料儲存在你的瀏覽器（localStorage），不需要網路</li>
          <li>支援多個班級，可隨時切換</li>
          <li>一鍵匯出 / 匯入 JSON 備份</li>
          <li>QR Code 產生器，方便家長下載當週資料</li>
        </ul>

        <h4 class="font-bold text-slate-700">📱 給家長分享資料</h4>
        <ol class="list-decimal pl-5 space-y-1">
          <li>點頁尾「<b>📱 產生家長 QR</b>」按鈕</li>
          <li>選擇要分享的內容（公告、聯絡資訊、當週作業）</li>
          <li>產生 QR Code，截圖傳到 Line 群組或印出</li>
          <li>家長掃描後在手機上看到唯讀的當週資料</li>
        </ol>

        <h4 class="font-bold text-slate-700">☁️ 想升級雲端同步？</h4>
        <p>v3.0 預留 <b>Supabase 同步</b>介面（可選啟用）。Supabase 比 Firebase 簡單：
          免費額度更慷慨、設定只要 5 分鐘、不用懂 GCP。</p>
        <p>未來啟用時只要填入 Supabase URL + Anon Key，就能讓家長即時看到作業更新。</p>

        <h4 class="font-bold text-slate-700">🔒 資料安全</h4>
        <p>本系統使用前端輕量密碼保護（SHA-256 hash + sessionStorage），適合一般班級非機敏用途。
          重要個資請加密備份、定期匯出 JSON 存到安全位置。</p>
      </div>

      <div class="text-right"><button onclick="closeModal();openSettings()" class="btn3d b-blue text-sm">前往班級設定 →</button></div>
    </div>`, { size: "max-w-xl" });
}

/* ════════ 設定視窗 ════════ */
function openSettings() {
  if (LOCAL_MODE) { openLocalSettings(); return; }
  showModal(`
    <div class="p-6 space-y-4 overflow-y-auto">
      <div class="flex items-center justify-between"><h3 class="text-lg font-bold">⚙️ 設定 Firebase 連線</h3><button onclick="closeModal()" class="text-slate-400 hover:text-slate-600 text-xl">×</button></div>
      <div class="space-y-2">
        <label class="text-sm font-medium block">貼上 Firebase 設定</label>
        <p class="text-xs text-slate-500 leading-relaxed">
          請從您的 Firebase 專案中，複製 <code>firebaseConfig</code> 物件 <code>{</code> 和 <code>}</code> 之間的
          <b>六行內容（Key: Value）</b>，貼到下方。<br/>
          <span class="text-rose-500 font-medium">請勿貼上大括號 {} 或變數宣告</span>，只需貼上
          <code>apiKey: "..."</code> 到 <code>appId: "..."</code> 的內容。（貼整段含括號也能自動解析）
        </p>
        <textarea id="cfgInput" style="min-height:150px" class="w-full border rounded-xl p-3 text-xs font-mono" placeholder='apiKey: "AIza...",
authDomain: "xxx.firebaseapp.com",
projectId: "xxx",
storageBucket: "xxx.appspot.com",
messagingSenderId: "1234567890",
appId: "1:1234:web:abcd"'></textarea>
        <button id="saveCfg" class="btn3d b-blue w-full">解析並儲存（重新整理）</button>
      </div>
      <hr/>
      <div class="space-y-2">
        <h4 class="text-sm font-bold">🔗 產生分享連結 / QR Code</h4>
        <p class="text-xs text-slate-500">將目前設定加密（Base64）放入網址，他人開啟即自動連線。</p>
        <button id="genShare" class="btn3d b-emerald w-full text-sm ${ACTIVE_CONFIG ? "" : "opacity-50 pointer-events-none"}">產生分享連結</button>
        <div id="shareResult" class="hidden space-y-2">
          <div class="flex gap-2"><input id="shareUrl" readonly class="flex-1 border rounded-xl px-2 py-1.5 text-xs bg-slate-50" /><button onclick="copyText(document.getElementById('shareUrl').value,'已複製分享連結')" class="px-3 py-1.5 rounded-xl bg-slate-200 text-sm">複製</button></div>
          <div id="shortUrlBox" class="text-xs text-slate-500"></div>
          <div id="qrBox" class="flex justify-center pt-2"></div>
        </div>
      </div>
      <hr/>
      <button id="clearCfg" class="w-full py-2.5 rounded-xl bg-rose-50 text-rose-600 border border-rose-200 font-bold text-sm hover:bg-rose-100">🗑️ 清除本機設定（回到未設定狀態）</button>
    </div>`, { size: "max-w-lg" });
  document.getElementById("saveCfg").onclick = saveConfigFromInput;
  document.getElementById("genShare").onclick = genShareLink;
  document.getElementById("clearCfg").onclick = clearConfig;
}
function parseConfigText(text) {
  const keys = ["apiKey","authDomain","projectId","storageBucket","messagingSenderId","appId"]; const result = {};
  for (const k of keys) { const re = new RegExp(`["']?${k}["']?\\s*[:=]\\s*["']([^"']+)["']`, "i"); const m = text.match(re); if (m) result[k] = m[1].trim(); }
  return result;
}
function saveConfigFromInput() {
  const cfg = parseConfigText(document.getElementById("cfgInput").value);
  if (!cfg.apiKey || !cfg.projectId) { toast("解析失敗：至少需包含 apiKey 與 projectId", "error"); return; }
  ["authDomain","storageBucket","messagingSenderId","appId"].forEach(k => { if (!cfg[k]) cfg[k] = ""; });
  if (!cfg.authDomain && cfg.projectId) cfg.authDomain = cfg.projectId + ".firebaseapp.com";
  localStorage.setItem(LS_CONFIG, JSON.stringify(cfg));
  toast("設定已儲存，即將重新整理…", "success"); setTimeout(() => location.reload(), 800);
}
function clearConfig() {
  confirmDialog("清除本機設定", "將移除本機儲存的 Firebase 設定並重新整理，回到初始未設定狀態。確定嗎？", { okText: "清除", danger: true })
    .then(ok => { if (!ok) return; localStorage.removeItem(LS_CONFIG); toast("已清除，重新整理中…", "info"); setTimeout(() => location.reload(), 600); });
}
function genShareLink() {
  if (!ACTIVE_CONFIG) { toast("目前無有效設定可分享", "warn"); return; }
  const enc = btoa(unescape(encodeURIComponent(JSON.stringify(ACTIVE_CONFIG))));
  const url = `${location.origin}${location.pathname}?config=${enc}`;
  document.getElementById("shareResult").classList.remove("hidden");
  document.getElementById("shareUrl").value = url;
  const qrBox = document.getElementById("qrBox"); qrBox.innerHTML = "";
  try { new QRCode(qrBox, { text: url, width: 180, height: 180 }); } catch (e) { qrBox.innerHTML = '<span class="text-xs text-slate-400">QR 產生失敗</span>'; }
  const box = document.getElementById("shortUrlBox"); box.textContent = "短網址產生中…";
  fetch("https://tinyurl.com/api-create.php?url=" + encodeURIComponent(url)).then(r => r.text())
    .then(short => { if (short && short.startsWith("http")) box.innerHTML = `短網址：<a href="${short}" target="_blank" class="text-blue-600 underline">${short}</a> <button onclick="copyText('${short}','已複製短網址')" class="text-blue-600 underline ml-1">複製</button>`; else box.textContent = "（短網址服務暫時無法使用）"; })
    .catch(() => box.textContent = "（短網址服務暫時無法使用）");
}
function copyText(text, msg = "已複製") {
  if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text).then(() => toast(msg, "success")).catch(() => fallbackCopy(text, msg));
  else fallbackCopy(text, msg);
}
function fallbackCopy(text, msg) {
  const ta = document.createElement("textarea"); ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0"; ta.style.left = "-9999px";
  document.body.appendChild(ta); ta.select();
  try { document.execCommand("copy"); toast(msg, "success"); } catch(e) { toast("複製失敗", "error"); }
  document.body.removeChild(ta);
}

/* ════════════════════════════════════════════════════════════
   純本地模式 設定視窗
════════════════════════════════════════════════════════════ */
function openLocalSettings() {
  const classes  = LocalDB.getClasses();
  const activeId = LocalDB.getActiveClassId();
  const activeCls = classes.find(c => c.id === activeId);

  const classRows = classes.map(c => `
    <div class="flex items-center gap-2 py-2 border-b border-slate-100 last:border-0">
      <span class="flex-1 text-sm font-medium ${c.id === activeId ? 'text-violet-700' : 'text-slate-700'}">
        ${escapeHtml(c.name)} ${c.id === activeId ? '<span class="text-xs bg-violet-100 text-violet-600 rounded px-1.5 py-0.5 ml-1">目前使用</span>' : ''}
      </span>
      <div class="flex gap-1.5 shrink-0">
        ${c.id !== activeId ? `<button onclick="localSwitchClass('${c.id}')" class="text-xs btn3d b-indigo">切換</button>` : ''}
        <button onclick="localExportClass('${c.id}')" class="text-xs btn3d b-emerald" title="匯出備份">⬇️</button>
        <button onclick="localDeleteClass('${c.id}','${escapeHtml(c.name)}')" class="text-xs text-rose-500 hover:text-rose-700 border border-rose-200 rounded-lg px-2 py-1">刪除</button>
      </div>
    </div>`).join("");

  showModal(`
    <div class="flex flex-col max-h-[90vh]">
      <div class="px-6 py-4 border-b flex items-center justify-between shrink-0">
        <h3 class="text-lg font-bold">💻 本地模式設定</h3>
        <button onclick="closeModal()" class="text-slate-400 hover:text-slate-600 text-xl">×</button>
      </div>
      <div class="px-6 py-4 overflow-y-auto space-y-5">

        <!-- 班級管理 -->
        <div class="space-y-3">
          <h4 class="text-sm font-bold text-slate-700">📚 班級管理</h4>
          <div class="bg-slate-50 rounded-xl border border-slate-200 divide-y divide-slate-100 px-3">
            ${classRows || '<p class="text-sm text-slate-400 py-3 text-center">尚無班級</p>'}
          </div>
          <div class="flex gap-2">
            <input id="newClsName" class="flex-1 border rounded-xl px-3 py-2 text-sm" placeholder="新班級名稱" maxlength="30">
            <button onclick="localAddClassInSettings()" class="btn3d b-violet text-sm whitespace-nowrap">＋ 新增</button>
          </div>
        </div>

        <!-- 資料備份 -->
        <div class="space-y-3">
          <h4 class="text-sm font-bold text-slate-700">💾 資料備份與還原</h4>
          <div class="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-700 leading-relaxed">
            ⚠️ 瀏覽器本地儲存（LocalStorage）可能在清除快取或更換瀏覽器時消失。<b>請定期匯出備份</b>，以防資料遺失。
          </div>
          <div class="grid grid-cols-2 gap-3">
            <button onclick="localExportClass('${activeId}')" class="local-io-btn local-io-export">
              <span class="text-2xl">⬇️</span>
              <span class="font-bold text-sm">匯出目前班級</span>
              <span class="text-xs opacity-75">${activeCls ? escapeHtml(activeCls.name) : ''}</span>
            </button>
            <button onclick="localExportAll()" class="local-io-btn local-io-export">
              <span class="text-2xl">📦</span>
              <span class="font-bold text-sm">匯出全部班級</span>
              <span class="text-xs opacity-75">所有班級一次備份</span>
            </button>
          </div>
          <label class="local-io-btn local-io-import w-full cursor-pointer">
            <span class="text-2xl">⬆️</span>
            <span class="font-bold text-sm">匯入備份檔案</span>
            <span class="text-xs opacity-75">選取先前匯出的 .json 檔</span>
            <input type="file" accept=".json" class="hidden" onchange="localImportFile(this)">
          </label>
        </div>
      </div>
    </div>`, { size: "max-w-lg" });
}

/* ── 在設定視窗內新增班級 ── */
window.localAddClassInSettings = function() {
  const name = (document.getElementById("newClsName") || {}).value?.trim();
  if (!name) { toast("請輸入班級名稱", "warn"); return; }
  const id = LocalDB.createClass(name);
  toast("班級「" + name + "」已建立", "success");
  openLocalSettings(); // 重新開啟更新清單
};

/* ── 匯出單一班級 ── */
window.localExportClass = function(classId) {
  if (!classId) { toast("找不到班級", "error"); return; }
  try {
    const data = LocalDB.exportClass(classId);
    const cls  = LocalDB.getClasses().find(c => c.id === classId);
    const name = cls ? cls.name : classId;
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url  = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const date = new Date().toISOString().slice(0,10);
    a.href = url; a.download = `班級備份_${name}_${date}.json`;
    a.click(); URL.revokeObjectURL(url);
    toast(`「${name}」備份已下載`, "success");
  } catch (e) { toast("匯出失敗：" + e.message, "error"); }
};

/* ── 匯出全部班級 ── */
window.localExportAll = function() {
  const classes = LocalDB.getClasses();
  if (!classes.length) { toast("尚無任何班級資料", "warn"); return; }
  try {
    const all = { _version: 1, _type: "all", _exportedAt: Date.now(), classes: [] };
    classes.forEach(c => { all.classes.push(LocalDB.exportClass(c.id)); });
    const json = JSON.stringify(all, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url  = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const date = new Date().toISOString().slice(0,10);
    a.href = url; a.download = `班級備份_全部_${date}.json`;
    a.click(); URL.revokeObjectURL(url);
    toast(`已匯出 ${classes.length} 個班級的備份`, "success");
  } catch (e) { toast("匯出失敗：" + e.message, "error"); }
};

/* ── 匯入備份檔案 ── */
window.localImportFile = function(input) {
  const file = input.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const data = JSON.parse(e.target.result);
      if (!data._version) throw new Error("不是有效的備份檔案");

      if (data._type === "all" && Array.isArray(data.classes)) {
        // 全部班級
        data.classes.forEach(cls => { try { LocalDB.importClass(cls); } catch(err) { console.warn("匯入班級失敗", err); } });
        toast(`已匯入 ${data.classes.length} 個班級的資料`, "success");
      } else {
        // 單一班級
        const classId = LocalDB.importClass(data);
        toast(`班級「${data._className || classId}」已匯入`, "success");
      }
      // 若目前沒有 active class，自動切換
      if (!LocalDB.getActiveClassId()) {
        const cls = LocalDB.getClasses();
        if (cls.length) LocalDB.setActiveClass(cls[0].id);
      }
      localStorage.setItem(LS_MODE, "local");
      setTimeout(() => location.reload(), 600);
    } catch (err) {
      toast("匯入失敗：" + err.message, "error");
    }
    input.value = "";
  };
  reader.readAsText(file);
};

/* ── 切換到 Firebase 模式 ── */
window.switchToFirebase = function() {
  confirmDialog("切換至 Firebase 模式",
    "將移除「本地模式」旗標並重新整理。本地班級資料不受影響，可隨時匯入備份後切回本地模式。確定切換嗎？",
    { okText: "切換" })
    .then(ok => {
      if (!ok) return;
      localStorage.removeItem(LS_MODE);
      toast("已切換，重新整理中…", "info");
      setTimeout(() => location.reload(), 600);
    });
};

