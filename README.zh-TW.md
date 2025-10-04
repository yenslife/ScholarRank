# ScholarRanks 專案指南（台灣正體）

## 專案簡介
ScholarRanks 聚焦於兩項功能：
- **Chrome 擴充功能**：在 Google Scholar 搜尋結果旁顯示會議的排名資訊。
- **資料蒐集腳本**：從 ConferenceRanks.com 匯出會議排名資料，產出擴充功能使用的 JSON。

## 目錄結構
- `extension/scholar-rank/`：Chrome 擴充功能原始碼、資料集與樣式檔案。
- `scripts/`：使用 uv 管理的 Python 腳本與相依套件。
- `README.md`：英文版說明；本檔案為台灣正體對應版本。

## 快速開始
### 安裝 Chrome 擴充功能
1. 開啟 `chrome://extensions` 並啟用 **開發人員模式**。
2. 點選 **載入未封裝項目**，選擇 `extension/scholar-rank/` 資料夾。
3. 前往 [https://scholar.google.com](https://scholar.google.com) 搜尋，若資料集中有對應場館即會顯示排名徽章。

### 更新會議資料集
1. 進入 `scripts/` 目錄並執行 `uv run conferenceranks_scraper.py --verbose`。指令會下載 ConferenceRanks 最新資料並覆寫 `extension/scholar-rank/data/conferences.json`。
2. 在 Chrome 擴充功能頁面重新載入 ScholarRank，即可套用新的資料。若想額外保存另一份檔案，可搭配 `--output` 或 `--stdout`。

## 開發注意事項
- 擴充功能在執行時會讀取 `extension/scholar-rank/data/conferences.json`，請透過爬蟲產生或後製這份資料。
- Python 腳本相依 `requests` 與 `beautifulsoup4`，均由 uv 自動管理。
- 修改後請配合既有 Git 流程進行檢查與提交。
