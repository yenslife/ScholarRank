# ConferenceRanks 爬蟲腳本（台灣正體）

此腳本會匯出 [ConferenceRanks.com](http://www.conferenceranks.com/) 的公開會議排名資料，並直接產出 Chrome 擴充功能可用的 `extension/scholar-rank/data/conferences.json`。

## 環境設定
使用 [uv](https://github.com/astral-sh/uv) 執行指令即可自動建立與更新虛擬環境，無需手動同步：

```bash
uv run conferenceranks_scraper.py --help
```

若希望離線預先安裝套件，可額外執行 `uv sync`。

## 使用方式
```bash
# 以預設路徑重建擴充功能資料集，並顯示詳細日誌
uv run conferenceranks_scraper.py --verbose

# 匯出到自訂 JSON 檔並同時列印內容
uv run conferenceranks_scraper.py --output data/conferences.json --stdout

# 轉存為 CSV 快照
uv run conferenceranks_scraper.py --format csv --output data/conferences.csv
```

腳本會下載網頁內嵌的 `data/*.js` 檔案（ERA 2010 與 Qualis 2012），解析後統一整理。預設輸出為 `extension/scholar-rank/data/conferences.json`，重載擴充功能即可套用。請善用 `--delay` 控制請求頻率，並遵守目標網站的使用條款；若官方移除這些腳本檔，程式會回退至使用 BeautifulSoup 解析頁面第一頁資料。
