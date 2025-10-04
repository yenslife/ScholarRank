# ScholarRank Companion 擴充功能（台灣正體）

這個 Chrome 擴充功能會在 Google Scholar 搜尋結果中顯示對應會議的排名資訊，資料來源為 ConferenceRanks.com。

## 本機載入步驟
- 開啟 `chrome://extensions`，啟用 **開發人員模式**，點選 **載入未封裝項目**。
- 選取本儲存庫的 `extension/scholar-rank/` 資料夾。
- 前往 [https://scholar.google.com](https://scholar.google.com) 搜尋，若場館名稱與資料集比對成功，將在作者資訊旁顯示藍色排名徽章。
- 點擊藍色徽章即可展開詳細資訊，包含正式名稱、排名、別名與資料來源。

## 更新場館資料
- 擴充功能會透過背景程式向 ConferenceRanks.com 取得最新資料，離線時則回退到內建的 `data/conferences.json`。
- 在 `scripts/` 目錄執行 `uv run conferenceranks_scraper.py --verbose` 即可重新整理資料；指令會覆寫 JSON 檔並同步 ConferenceRanks.com 的最新排名與別名。
- 維護 `source`、`source_url` 與 `last_updated` 欄位，並在再散佈資料前遵守 ConferenceRanks.com 的使用規範。

## 開發說明
- `contentScript.js` 會載入 `conferences.json`，標準化別名後比對 `.gs_ri` 搜尋結果節點並插入徽章。
- 樣式設定集中在 `styles.css`，可調整色彩與字型大小。
- 調整比對邏輯時建議開啟 Chrome 擴充功能頁面的 **Inspect views** 觀察 Console 訊息。

## 限制與後續工作
- Scholar 顯示的場館名稱多樣，需持續擴充爬蟲或內容腳本的別名產生策略以提高命中率。
- 可考慮在 CI 或排程內自動執行爬蟲，以維持資料最新。
- 若涉及不允許再散佈的資料來源，請勿直接匯入；必要時以本機私有檔案載入即可。
