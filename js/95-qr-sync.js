/* ══════════════════════════════════════════════════════════════════
   95-qr-sync.js  v3.0 新增
   ────────────────────────────────────────────────────────────────
   兩個工具：
     1. QR Code 產生器：給家長掃描下載班級資料（取代 Firebase 分享）
     2. Supabase 雲端同步：可選啟用，預設關閉（取代 Firebase 雲端）

   設計原則：
     • 全部 API 掛載在 window.HermesTools 命名空間，避免污染全域
     • QR 與 Supabase 互相獨立，可單獨使用
     • 所有方法失敗都有降級方案，不會讓主流程當掉
══════════════════════════════════════════════════════════════════ */

(function (global) {
  "use strict";

  /* ════════════════════════════════════════════════════════════════
     ★ QR Code 工具（純本地，無需任何後端）
     ──────────────────────────────────────────────────────────────
     用 davidshimjs/qrcodejs（1KB CDN）產生 QR Code
     內容採用 JSON + LZString 壓縮，支援長內容分段
  ════════════════════════════════════════════════════════════════ */

  /* ════════════════════════════════════════════════════════════════
     QR Code 渲染：使用 qrcode-generator 函式庫（純演算法，UMD）
     ──────────────────────────────────────────────────────────────
     採用 kazuhikoarase/qrcode-generator (MIT 授權)
     載入後直接呼叫 global.qrcode() 產生 QR Code 物件
     自行實作 SVG 渲染（避免額外的 createSvgTag 依賴）
  ════════════════════════════════════════════════════════════════ */

  // 載入 qrcode-generator 完整函式庫（純演算法 UMD）
  function loadQRCodeLib() {
    return new Promise((resolve, reject) => {
      if (global.qrcode) return resolve(global.qrcode);
      const s = document.createElement("script");
      s.src = "https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.js";
      s.onload = () => {
        if (global.qrcode) resolve(global.qrcode);
        else reject(new Error("qrcode 函式庫載入後找不到全域變數"));
      };
      s.onerror = () => reject(new Error("無法載入 QRCode 函式庫（CDN 404 或網路問題）"));
      document.head.appendChild(s);
    });
  }

  // 載入 LZString（壓縮用，CDN）
  function loadLZString() {
    return new Promise((resolve, reject) => {
      if (global.LZString) return resolve(global.LZString);
      const s = document.createElement("script");
      s.src = "https://cdn.jsdelivr.net/npm/lz-string@1.5.0/libs/lz-string.min.js";
      s.onload = () => resolve(global.LZString);
      s.onerror = () => reject(new Error("無法載入 LZString"));
      document.head.appendChild(s);
    });
  }

  /**
   * 收集班級的可分享資料
   * @param {string} classId
   * @param {string} shareType - "snapshot"（當週快照）| "full"（完整備份）
   * @returns {object}
   */
  function collectShareData(classId, shareType) {
    const prefix = "LOCAL_ldb_" + classId + "_";
    const data = {
      type: "cc-snapshot",
      version: "3.0",
      classId,
      exportedAt: new Date().toISOString(),
      content: {}
    };

    if (shareType === "snapshot") {
      // 當週資料：公告、本週作業、家長聯絡資訊
      const now = new Date();
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

      // 公告（最新 5 筆）
      const annIdx = JSON.parse(localStorage.getItem(prefix + "announcements/__index__") || "[]");
      data.content.announcements = annIdx.slice(-5).map(id => {
        try { return JSON.parse(localStorage.getItem(prefix + "announcements/" + id)); }
        catch (e) { return null; }
      }).filter(Boolean);

      // 本週作業
      const hwIdx = JSON.parse(localStorage.getItem(prefix + "homework/__index__") || "[]");
      data.content.homework = hwIdx
        .filter(id => {
          const m = id.match(/hw-(\d{4}-\d{2}-\d{2})/);
          if (!m) return false;
          const d = new Date(m[1]);
          return d >= weekAgo && d <= now;
        })
        .map(id => {
          try { return JSON.parse(localStorage.getItem(prefix + "homework/" + id)); }
          catch (e) { return null; }
        }).filter(Boolean);

      // 家長聯絡資訊（從聯絡簿取）
      const cbIdx = JSON.parse(localStorage.getItem(prefix + "contactbook/__index__") || "[]");
      if (cbIdx.length > 0) {
        const last = cbIdx[cbIdx.length - 1];
        try {
          const cb = JSON.parse(localStorage.getItem(prefix + "contactbook/" + last));
          data.content.contact = cb && cb.students ? cb.students : [];
        } catch (e) {}
      }
    } else {
      // 完整備份：所有 collections
      const cols = ["contactbook", "homework", "announcements", "calendar", "slips", "resources", "quiz", "students", "messages", "points", "seating", "adminConfig"];
      cols.forEach(col => {
        const idx = JSON.parse(localStorage.getItem(prefix + col + "/__index__") || "[]");
        data.content[col] = idx.map(id => {
          try {
            return [id, JSON.parse(localStorage.getItem(prefix + col + "/" + id))];
          } catch (e) { return null; }
        }).filter(Boolean);
      });
    }

    return data;
  }

  /**
   * 產生 QR Code 並顯示在 modal
   * @param {string} classId
   * @param {string} shareType - "snapshot" | "full"
   */
  async function showShareQR(classId, shareType) {
    try {
      showModal(`
        <div class="p-6 space-y-4">
          <h3 class="text-lg font-bold">📱 產生家長 QR Code</h3>
          <p class="text-sm text-slate-500">載入 QR Code 工具中...</p>
          <div class="flex justify-center py-8">
            <div class="animate-spin w-8 h-8 border-4 border-violet-200 border-t-violet-600 rounded-full"></div>
          </div>
        </div>
      `, { size: "max-w-md" });

      // 載入函式庫
      await Promise.all([loadQRCodeLib(), loadLZString()]);

      // 收集資料
      const data = collectShareData(classId, shareType);
      const json = JSON.stringify(data);
      const compressed = "CC3:" + global.LZString.compressToEncodedURIComponent(json);

      // 產生 QR Code（SVG）
      const qr = global.qrcode(0, 'M');
      qr.addData(compressed);
      qr.make();
      const size = qr.getModuleCount();
      const cellSize = 6;
      const margin = cellSize * 4;
      const totalSize = size * cellSize + margin * 2;
      let path = "";
      for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) {
          if (qr.isDark(r, c)) {
            const x = c * cellSize + margin;
            const y = r * cellSize + margin;
            path += `M${x},${y}h${cellSize}v${cellSize}h-${cellSize}z`;
          }
        }
      }
      const qrSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${totalSize}" height="${totalSize}" viewBox="0 0 ${totalSize} ${totalSize}"><path d="${path}" fill="#1e293b"/></svg>`;

      // 計算大小
      const kbSize = (compressed.length / 1024).toFixed(1);
      const numQRs = compressed.length > 2000 ? Math.ceil(compressed.length / 2000) : 1;

      showModal(`
        <div class="p-6 space-y-4">
          <div class="flex items-center justify-between">
            <h3 class="text-lg font-bold">📱 家長 QR Code</h3>
            <button onclick="closeModal()" class="text-slate-400 hover:text-slate-600 text-xl">×</button>
          </div>
          <p class="text-sm text-slate-600">
            ${shareType === "snapshot" ? "📋 當週資料（公告、作業、家長聯絡資訊）" : "💾 完整備份"}
          </p>
          <div class="flex justify-center bg-white p-4 rounded-xl border" id="qrContainer">
            ${qrSvg}
          </div>
          <div class="text-xs text-slate-400 text-center">
            大小: ${kbSize} KB ｜ ${numQRs > 1 ? `⚠️ 需要 ${numQRs} 個 QR Code（建議改用匯出 JSON）` : "單張 QR Code"}
          </div>
          <div class="space-y-2 text-xs text-slate-500">
            <p>📌 <b>使用方式</b>：</p>
            <ul class="list-disc pl-5 space-y-0.5">
              <li>截圖傳到 Line 群組，或印出貼佈告欄</li>
              <li>家長用手機相機掃描即可開啟</li>
              <li>家長只能「看」，不能編輯（唯讀）</li>
            </ul>
          </div>
          <div class="flex gap-2">
            <button onclick="HermesTools.downloadShareJSON('${classId}','${shareType}')" class="flex-1 btn3d b-indigo text-sm">📥 下載 JSON</button>
            <button onclick="HermesTools.copyShareLink('${classId}','${shareType}')" class="flex-1 btn3d b-emerald text-sm">📋 複製連結</button>
          </div>
        </div>
      `, { size: "max-w-md" });

    } catch (e) {
      console.error("QR Code 產生失敗:", e);
      showModal(`
        <div class="p-6 space-y-4">
          <h3 class="text-lg font-bold text-rose-600">❌ 產生失敗</h3>
          <p class="text-sm text-slate-600">${e.message}</p>
          <p class="text-xs text-slate-400">建議改用「下載 JSON」方式分享。</p>
          <div class="flex gap-2">
            <button onclick="HermesTools.downloadShareJSON('${classId}','${shareType}')" class="flex-1 btn3d b-indigo text-sm">📥 下載 JSON</button>
            <button onclick="closeModal()" class="flex-1 btn3d text-sm">關閉</button>
          </div>
        </div>
      `, { size: "max-w-sm" });
    }
  }

  /**
   * 讓家長開啟班級頁 + 載入分享資料
   * URL 格式：?cc-data={compressed}
   */
  function checkURLForSharedData() {
    const params = new URLSearchParams(location.search);
    const compressed = params.get("cc-data");
    if (!compressed) return false;

    try {
      const stripped = compressed.replace(/^CC3:/, "");
      const json = global.LZString ? global.LZString.decompressFromEncodedURIComponent(stripped) : decodeURIComponent(escape(atob(stripped)));
      const data = JSON.parse(json);
      if (data.type !== "cc-snapshot") return false;

      // 顯示唯讀的家長端頁面
      showParentView(data);
      return true;
    } catch (e) {
      console.error("分享資料解析失敗:", e);
      return false;
    }
  }

  /**
   * 顯示家長端唯讀頁面
   */
  function showParentView(data) {
    document.body.innerHTML = `
      <div style="max-width:600px; margin:0 auto; padding:20px; font-family:system-ui,'Noto Sans TC',sans-serif;">
        <header style="text-align:center; padding:20px 0; border-bottom:2px solid #e2e8f0;">
          <h1 style="margin:0; color:#6366f1;">📚 班級親師互動網</h1>
          <p style="margin:5px 0 0 0; color:#64748b; font-size:14px;">家長端唯讀模式 ｜ v3.0</p>
          <p style="margin:5px 0 0 0; color:#94a3b8; font-size:12px;">資料匯出時間：${new Date(data.exportedAt).toLocaleString("zh-TW")}</p>
        </header>

        <main style="padding:20px 0;">
          ${data.content.announcements && data.content.announcements.length > 0 ? `
            <section style="margin-bottom:30px;">
              <h2 style="color:#6366f1; border-left:4px solid #6366f1; padding-left:10px;">📢 最新公告</h2>
              ${data.content.announcements.reverse().map(ann => `
                <article style="background:#f8fafc; padding:15px; border-radius:10px; margin-top:10px;">
                  <h3 style="margin:0 0 5px 0;">${escapeHtml(ann.title || "(無標題)")}</h3>
                  <p style="color:#64748b; font-size:12px; margin:0 0 8px 0;">📅 ${ann.date || ""}</p>
                  <p style="margin:0; white-space:pre-wrap;">${escapeHtml(ann.content || "")}</p>
                </article>
              `).join("")}
            </section>
          ` : ""}

          ${data.content.homework && data.content.homework.length > 0 ? `
            <section style="margin-bottom:30px;">
              <h2 style="color:#6366f1; border-left:4px solid #6366f1; padding-left:10px;">📚 本週作業</h2>
              ${data.content.homework.reverse().map(hw => `
                <article style="background:#fef3c7; padding:15px; border-radius:10px; margin-top:10px;">
                  <h3 style="margin:0 0 8px 0;">📅 ${hw.date}</h3>
                  ${(hw.items || []).map(item => `
                    <div style="padding:5px 0; border-bottom:1px dashed #fbbf24;">
                      <b>[${escapeHtml(item.subject || "")}]</b> ${escapeHtml(item.content || "")}
                      ${item.note ? `<div style="color:#92400e; font-size:12px; margin-top:3px;">💡 ${escapeHtml(item.note)}</div>` : ""}
                    </div>
                  `).join("")}
                </article>
              `).join("")}
            </section>
          ` : ""}

          ${data.content.contact && data.content.contact.length > 0 ? `
            <section style="margin-bottom:30px;">
              <h2 style="color:#6366f1; border-left:4px solid #6366f1; padding-left:10px;">📇 班級聯絡資訊</h2>
              <div style="background:#f0fdf4; padding:15px; border-radius:10px; margin-top:10px;">
                ${data.content.contact.map(stu => `
                  <div style="padding:8px 0; border-bottom:1px dashed #86efac;">
                    <b>座號 ${stu.seat || stu.seatNumber || "?"} ｜ ${escapeHtml(stu.name || "")}</b>
                    ${(stu.parents || []).map(p => `
                      <div style="color:#166534; font-size:13px; margin-top:3px;">
                        👤 ${escapeHtml(p.name || "")} (${escapeHtml(p.relation || "")})：${escapeHtml(p.phone || "")}
                      </div>
                    `).join("")}
                  </div>
                `).join("")}
              </div>
            </section>
          ` : ""}
        </main>

        <footer style="text-align:center; padding:20px 0; border-top:1px solid #e2e8f0; color:#94a3b8; font-size:11px;">
          <p>本頁面由老師透過 QR Code 分享，<b>唯讀模式</b>，家長無法編輯資料。</p>
          <p>如有問題請聯絡老師 ｜ 班級親師互動網 v3.0</p>
        </footer>
      </div>
    `;
  }

  function escapeHtml(s) {
    if (s == null) return "";
    return String(s).replace(/[&<>"']/g, c => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[c]));
  }

  /**
   * 下載分享資料為 JSON
   */
  function downloadShareJSON(classId, shareType) {
    const data = collectShareData(classId, shareType);
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `class-connect-${classId}-${shareType}-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast("已下載 " + a.download, "success");
  }

  /**
   * 複製分享連結到剪貼簿
   */
  function copyShareLink(classId, shareType) {
    const data = collectShareData(classId, shareType);
    const compressed = "CC3:" + global.LZString.compressToEncodedURIComponent(JSON.stringify(data));
    const baseURL = location.origin + location.pathname;
    const link = baseURL + "?cc-data=" + encodeURIComponent(compressed);

    if (navigator.clipboard) {
      navigator.clipboard.writeText(link).then(() => {
        toast("連結已複製！（" + (link.length / 1024).toFixed(1) + " KB）", "success");
      }).catch(() => {
        prompt("請複製以下連結：", link);
      });
    } else {
      prompt("請複製以下連結：", link);
    }
  }

  /* ════════════════════════════════════════════════════════════════
     ★ Supabase 雲端同步（可選，預設關閉）
     ──────────────────────────────────────────────────────────────
     為什麼用 Supabase 而非 Firebase？
       • 免費額度：500MB 資料庫 + 1GB 儲存 + 5GB 流量
       • 設定簡單：5 分鐘，URL + Anon Key 兩個值就夠
       • 不用懂 GCP，不用裝 CLI
       • 開源、可自架

     使用流程：
       1. 老師到 https://supabase.com 註冊、創建專案
       2. 建立一個 table "class_data"（schema：見 enableSupabase）
       3. 把 Supabase URL 和 anon key 貼到本系統
       4. 啟用後所有 localStorage 變更會自動同步
       5. 家長訪問 ?class={id} 即可看到最新資料
  ════════════════════════════════════════════════════════════════ */

  let supabaseClient = null;
  const LS_SUPABASE_CONFIG = "supabaseConfig";

  function getSupabaseConfig() {
    try { return JSON.parse(localStorage.getItem(LS_SUPABASE_CONFIG) || "null"); }
    catch (e) { return null; }
  }

  function setSupabaseConfig(cfg) {
    if (cfg) localStorage.setItem(LS_SUPABASE_CONFIG, JSON.stringify(cfg));
    else localStorage.removeItem(LS_SUPABASE_CONFIG);
  }

  async function loadSupabaseLib() {
    return new Promise((resolve, reject) => {
      if (global.supabase) return resolve(global.supabase);
      const s = document.createElement("script");
      s.src = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js";
      s.onload = () => resolve(global.supabase);
      s.onerror = () => reject(new Error("無法載入 Supabase SDK"));
      document.head.appendChild(s);
    });
  }

  async function enableSupabase(cfg) {
    if (!cfg || !cfg.url || !cfg.anonKey) {
      throw new Error("需要 Supabase URL 和 Anon Key");
    }
    await loadSupabaseLib();
    supabaseClient = global.supabase.createClient(cfg.url, cfg.anonKey);
    setSupabaseConfig(cfg);
    return supabaseClient;
  }

  async function disableSupabase() {
    supabaseClient = null;
    setSupabaseConfig(null);
  }

  /**
   * 推送班級資料到 Supabase
   */
  async function pushToSupabase(classId) {
    if (!supabaseClient) throw new Error("Supabase 未啟用");
    const data = collectShareData(classId, "full");
    const { error } = await supabaseClient
      .from("class_data")
      .upsert({
        class_id: classId,
        data: data,
        updated_at: new Date().toISOString()
      });
    if (error) throw error;
    return true;
  }

  /**
   * 從 Supabase 拉取班級資料
   */
  async function pullFromSupabase(classId) {
    if (!supabaseClient) throw new Error("Supabase 未啟用");
    const { data, error } = await supabaseClient
      .from("class_data")
      .select("*")
      .eq("class_id", classId)
      .single();
    if (error) throw error;
    return data;
  }

  /**
   * 顯示 Supabase 設定視窗
   */
  function showSupabaseSettings() {
    const cfg = getSupabaseConfig() || {};
    showModal(`
      <div class="p-6 space-y-4">
        <div class="flex items-center justify-between">
          <h3 class="text-lg font-bold">☁️ Supabase 雲端同步（可選）</h3>
          <button onclick="closeModal()" class="text-slate-400 hover:text-slate-600 text-xl">×</button>
        </div>

        <div class="text-sm text-slate-600 space-y-2">
          <p>Supabase 是一個開源的 Firebase 替代方案，免費額度比 Firebase 更慷慨。</p>
          <p>啟用後可讓家長透過連結即時看到最新作業、公告、聯絡資訊。</p>
        </div>

        <details class="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs">
          <summary class="font-bold cursor-pointer text-amber-800">📖 第一次使用？點我看設定步驟</summary>
          <ol class="list-decimal pl-5 mt-2 space-y-1 text-slate-700">
            <li>到 <a href="https://supabase.com" target="_blank" class="text-blue-600 underline">supabase.com</a> 註冊（GitHub 登入最快）</li>
            <li>點「New Project」，選 region（推薦 Singapore）</li>
            <li>等 1-2 分鐘專案建好，到 SQL Editor 執行：<br>
              <code class="block bg-white p-2 mt-1 rounded text-[10px]">create table class_data (<br>
              &nbsp;&nbsp;class_id text primary key,<br>
              &nbsp;&nbsp;data jsonb,<br>
              &nbsp;&nbsp;updated_at timestamp<br>
              );</code>
            </li>
            <li>到 Settings → API，複製 <b>URL</b> 和 <b>anon public</b> key</li>
            <li>貼到下方兩欄，按「啟用」</li>
          </ol>
        </details>

        <div class="space-y-2">
          <label class="text-sm font-medium block">Supabase URL</label>
          <input id="supabaseUrl" type="url" class="w-full border rounded-xl px-3 py-2 text-sm font-mono" placeholder="https://xxx.supabase.co" value="${cfg.url || ""}">
        </div>

        <div class="space-y-2">
          <label class="text-sm font-medium block">Anon Key</label>
          <input id="supabaseKey" type="password" class="w-full border rounded-xl px-3 py-2 text-sm font-mono" placeholder="eyJhbGciOiJIUzI1NiIs..." value="${cfg.anonKey || ""}">
        </div>

        <div class="flex gap-2">
          <button onclick="HermesTools.connectSupabase()" class="flex-1 btn3d b-emerald text-sm">🚀 啟用</button>
          ${cfg.url ? '<button onclick="HermesTools.disconnectSupabase()" class="btn3d b-rose text-sm">停用</button>' : ""}
          <button onclick="closeModal()" class="btn3d text-sm">取消</button>
        </div>

        ${cfg.url ? `<p class="text-xs text-emerald-600">✅ 目前已啟用 Supabase 同步</p>` : ""}
      </div>
    `, { size: "max-w-lg" });
  }

  async function connectSupabase() {
    const url = document.getElementById("supabaseUrl").value.trim();
    const anonKey = document.getElementById("supabaseKey").value.trim();
    if (!url || !anonKey) { toast("請填寫 URL 和 Key", "warn"); return; }
    try {
      await enableSupabase({ url, anonKey });
      toast("Supabase 已啟用", "success");
      setTimeout(() => location.reload(), 800);
    } catch (e) {
      toast("啟用失敗：" + e.message, "error");
    }
  }

  function disconnectSupabase() {
    if (!confirm("確定要停用 Supabase 嗎？本機資料不會被刪除。")) return;
    disableSupabase();
    toast("已停用 Supabase", "success");
    setTimeout(() => location.reload(), 500);
  }

  /* ════════════════════════════════════════════════════════════════
     ★ 對外 API
  ════════════════════════════════════════════════════════════════ */
  global.HermesTools = {
    // QR Code 工具
    showShareQR,
    downloadShareJSON,
    copyShareLink,
    checkURLForSharedData,
    collectShareData,

    // Supabase 工具
    showSupabaseSettings,
    connectSupabase,
    disconnectSupabase,
    pushToSupabase,
    pullFromSupabase,
    isSupabaseEnabled: () => !!supabaseClient,
  };

  /* ════════ 立即檢查 URL 是否有分享資料（最早執行） ════════
     注意：此檢查必須在 02-app-core.js 的 init() 之前執行，
     否則 init() 會建立老師介面，覆蓋掉家長端頁面。
     所以這裡不能等 DOMContentLoaded，要在腳本載入時立即跑。
  */
  function _tryCheckParent() {
    if (global.LZString) {
      try {
        if (global.HermesTools.checkURLForSharedData()) {
          console.log("📱 已載入家長端分享資料");
          return true;
        }
      } catch (e) {
        console.warn("家長端資料檢查失敗:", e);
      }
    } else {
      // LZString 還沒載入，先預載
      loadLZString().then(() => {
        try {
          if (global.HermesTools.checkURLForSharedData()) {
            console.log("📱 已載入家長端分享資料（延遲）");
          }
        } catch (e) {
          console.warn("家長端資料檢查失敗（延遲）:", e);
        }
      }).catch(() => {});
    }
  }
  _tryCheckParent();

})(window);
