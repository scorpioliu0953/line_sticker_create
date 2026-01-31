# LINE 貼圖製作工具

一個使用 React 開發的 LINE 貼圖自動生成工具，整合 Gemini API 進行智能圖片生成和處理。

## 🌐 使用頁面

**線上版本**：https://scorpioliu0953.github.io/line_sticker_create/

直接在瀏覽器中使用，無需安裝任何軟體。

## 📺 教學影片

[![LINE 貼圖製作教學](https://img.youtube.com/vi/nxlflN0bw8s/0.jpg)](https://www.youtube.com/watch?v=nxlflN0bw8s)

點擊上方圖片觀看教學影片，或直接前往：[YouTube 影片連結](https://youtu.be/nxlflN0bw8s)

## 功能特色

- 🔑 **API Key 管理**：安全輸入 Gemini API Key
- 📊 **靈活選擇**：支援 8、16、24、32、40 張貼圖生成
- 🎨 **角色生成**：根據主題生成角色，或上傳自己的角色圖片
- ✏️ **文字描述生成**：AI 自動生成每張貼圖的描述和文字，可手動編輯
- 🖼️ **8宮格生成**：自動生成 2×4 布局的 8 宮格圖片
- 🎭 **自動去背**：使用智能算法自動去除背景
- ✂️ **自動裁切**：將 8 宮格自動裁切為單張貼圖
- 👀 **即時預覽**：每個步驟都可預覽結果
- 📦 **一鍵下載**：打包成 ZIP 檔案，一鍵下載全部圖檔

## 使用流程

1. **填入 Gemini API Key**
2. **選擇創作張數**（8、16、24、32 或 40 張）
3. **填入主題描述或上傳角色圖片**
4. **生成角色**（白色背景，用於確認角色是否符合要求）
5. **生成文字描述**（AI 自動生成，可手動編輯）
6. **生成 8 宮格貼圖**（自動生成、去背、裁切）
7. **預覽結果**
8. **打包下載**

## 技術棧

- **React 18** - 前端框架
- **Vite** - 構建工具
- **Google Gemini API** - AI 圖片生成和文字生成
  - **gemini-3-pro-preview** - 用於生成文字描述
  - **gemini-3-pro-image-preview** (Nano Banana Pro) - 用於生成實際圖片
- **Canvas API** - 圖片處理（8宮格組合、裁切、去背）
- **JSZip** - ZIP 檔案打包

## 安裝與使用

### 1. 安裝依賴

```bash
npm install
```

### 2. 啟動開發伺服器

```bash
npm run dev
```

### 3. 取得 Gemini API Key

1. 前往 [Google AI Studio](https://makersuite.google.com/app/apikey)
2. 登入您的 Google 帳號
3. 創建新的 API Key
4. 複製 API Key 備用

### 4. 使用工具

按照步驟提示操作：
1. 輸入 Gemini API Key
2. 選擇要生成的貼圖張數
3. 輸入主題描述或上傳角色圖片
4. 生成並確認角色
5. 生成並編輯文字描述
6. 生成 8 宮格貼圖
7. 預覽並下載

## 專案結構

```
├── src/
│   ├── App.jsx                    # 主應用組件
│   ├── App.css                    # 應用樣式
│   ├── main.jsx                   # 應用入口
│   ├── index.css                  # 全局樣式
│   └── utils/
│       ├── gemini.js                    # Gemini API 文字生成
│       ├── characterGenerator.js        # 角色和貼圖生成
│       ├── imageUtils.js                # 圖片處理工具（8宮格、去背、裁切）
│       └── zipDownloader.js             # ZIP 打包下載工具
├── index.html                     # HTML 模板
├── package.json                   # 專案配置
├── vite.config.js                 # Vite 配置
└── README.md                      # 說明文件
```

## 功能說明

### 8 宮格生成

- 每張 8 宮格包含 2 列 × 4 行 = 8 格
- 每格尺寸：370×320px（符合 LINE 貼圖規範）
- 如果選擇的張數不是 8 的倍數，最後一張 8 宮格會用白色背景填充多餘的格子
- 裁切時只會裁切實際生成的貼圖，不會包含填充的白色背景

### 去背功能

- 使用基於顏色閾值的簡單去背算法
- 將接近白色的像素設為透明
- 可調整閾值參數（預設 240）

### 文字描述生成

- AI 自動生成每張貼圖的描述和要添加的文字
- 所有文字內容保證不重複
- 生成後可手動編輯每個描述和文字

## 注意事項

### API 限制

- **免費帳號**：可能有每日生成數量限制
- **達到限制後**：可能降級為舊模型或無法使用
- **建議**：使用付費帳號以獲得更好的體驗

### 圖片生成

- 使用 **Gemini 3 Pro Image Preview** 模型生成圖片
- 生成的圖片為白色背景（非透明）
- 使用內建去背功能將白色背景轉為透明

### 角色一致性

- 如果上傳角色圖片，後續生成的貼圖會以此為依據
- 如果使用 AI 生成角色，建議先確認角色是否符合要求再繼續

## 開發指令

```bash
# 開發模式
npm run dev

# 建置生產版本
npm run build

# 預覽生產版本
npm run preview
```

## 授權

MIT License

## 貢獻

歡迎提交 Issue 和 Pull Request！
