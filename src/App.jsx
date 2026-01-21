import React, { useState, useRef } from 'react'
import './App.css'
import { generateImageDescriptionsWithText, generateTextStyle } from './utils/gemini'
import { generateCharacter, generateStickerWithText, generateMainImage, generateTabImage, generateGrid8Image } from './utils/characterGenerator'
import { createGrid8, splitGrid8, removeBackgroundSimple, fileToDataURL } from './utils/imageUtils'
import { downloadAsZip } from './utils/zipDownloader'

function App() {
  // 步驟 1: API Key
  const [apiKey, setApiKey] = useState('')
  
  // 步驟 2: 張數選擇
  const [count, setCount] = useState(8)
  
  // 步驟 3: 角色描述/圖片和主題說明
  const [characterDescription, setCharacterDescription] = useState('')
  const [theme, setTheme] = useState('')
  const [uploadedCharacterImage, setUploadedCharacterImage] = useState(null)
  
  // 步驟 4: 角色生成/確認
  const [characterImage, setCharacterImage] = useState(null)
  const [characterConfirmed, setCharacterConfirmed] = useState(false)
  const [generatingCharacter, setGeneratingCharacter] = useState(false)
  
  // 步驟 5: 文字風格描述
  const [textStyle, setTextStyle] = useState('')
  const [generatingTextStyle, setGeneratingTextStyle] = useState(false)
  const [textStyleConfirmed, setTextStyleConfirmed] = useState(false)
  
  // 步驟 6: 文字描述
  const [descriptions, setDescriptions] = useState([])
  const [generatingDescriptions, setGeneratingDescriptions] = useState(false)
  const [excludedTexts, setExcludedTexts] = useState('') // 排除的文字（每行一個）
  
  // 步驟 6-8: 8宮格生成、去背、裁切
  const [gridImages, setGridImages] = useState([]) // 8宮格圖片陣列
  const [processedGridImages, setProcessedGridImages] = useState([]) // 去背後的8宮格
  const [cutImages, setCutImages] = useState([]) // 裁切後的單張圖片
  const [mainImage, setMainImage] = useState(null) // 主要圖片 240x240
  const [tabImage, setTabImage] = useState(null) // 標籤圖片 96x74
  const [backgroundThreshold, setBackgroundThreshold] = useState(240) // 去背閾值
  const [processingBackground, setProcessingBackground] = useState(false) // 正在處理去背
  const [previewBackgroundDark, setPreviewBackgroundDark] = useState(false) // 預覽背景是否為深色
  const [currentStep, setCurrentStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [progress, setProgress] = useState('')

  // 處理角色圖片上傳
  const handleCharacterUpload = async (e) => {
    const file = e.target.files[0]
    if (file) {
      const dataUrl = await fileToDataURL(file)
      setUploadedCharacterImage(dataUrl)
      setCharacterImage(dataUrl)
      // 如果上傳了角色圖片，自動確認並進入下一步
      setCharacterConfirmed(true)
    }
  }

  // 步驟 4: 生成角色
  const handleGenerateCharacter = async () => {
    if (!apiKey.trim()) {
      alert('請輸入 Gemini API Key')
      return
    }
    if (!characterDescription.trim() && !uploadedCharacterImage) {
      alert('請輸入角色描述或上傳角色圖片')
      return
    }

    setGeneratingCharacter(true)
    setProgress('正在生成角色圖片...')

    try {
      const character = await generateCharacter(apiKey, characterDescription || theme, uploadedCharacterImage)
      setCharacterImage(character)
      setCharacterConfirmed(false) // 需要用戶確認
      setProgress('角色生成完成，請確認是否符合要求')
    } catch (error) {
      console.error('生成角色失敗:', error)
      alert(`生成角色失敗: ${error.message}`)
      setProgress('')
    } finally {
      setGeneratingCharacter(false)
    }
  }

  // 確認角色
  const handleConfirmCharacter = () => {
    setCharacterConfirmed(true)
  }
  
  // 步驟 5: 生成文字風格描述
  const handleGenerateTextStyle = async () => {
    if (!apiKey.trim()) {
      alert('請輸入 Gemini API Key')
      return
    }
    if (!theme.trim()) {
      alert('請輸入主題說明')
      return
    }

    setGeneratingTextStyle(true)
    setProgress('正在生成文字風格描述...')

    try {
      const style = await generateTextStyle(apiKey, theme, characterDescription)
      setTextStyle(style)
      setTextStyleConfirmed(true)
      setProgress('文字風格描述生成完成，可以編輯後繼續')
    } catch (error) {
      console.error('生成文字風格失敗:', error)
      alert(`生成文字風格失敗: ${error.message}`)
      setProgress('')
    } finally {
      setGeneratingTextStyle(false)
    }
  }

  // 重新生成角色
  const handleRegenerateCharacter = () => {
    setCharacterImage(null)
    setCharacterConfirmed(false)
    setCurrentStep(4)
  }

  // 步驟 6: 生成文字描述
  const handleGenerateDescriptions = async () => {
    if (!apiKey.trim()) {
      alert('請輸入 Gemini API Key')
      return
    }
    if (!theme.trim()) {
      alert('請輸入主題說明')
      return
    }

    setGeneratingDescriptions(true)
    
    // 如果沒有文字風格描述，先自動生成
    let finalTextStyle = textStyle
    if (!textStyle.trim()) {
      setProgress('正在自動生成文字風格描述...')
      try {
        finalTextStyle = await generateTextStyle(apiKey, theme, characterDescription)
        setTextStyle(finalTextStyle)
        setProgress('文字風格已自動生成，正在生成文字描述...')
      } catch (error) {
        console.error('自動生成文字風格失敗:', error)
        // 如果自動生成失敗，使用預設值
        finalTextStyle = '可愛簡潔的風格，文字清晰易讀，使用明亮的文字框背景'
        setTextStyle(finalTextStyle)
        setProgress('使用預設文字風格，正在生成文字描述...')
      }
    } else {
      setProgress('正在生成文字描述...')
    }

    try {
      // 處理排除文字：將文字按行分割，過濾空行，去除前後空白
      const excludedTextList = excludedTexts
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0)
      
      const items = await generateImageDescriptionsWithText(apiKey, theme, finalTextStyle, count, excludedTextList)
      setDescriptions(items)
      setProgress('文字描述生成完成，可以編輯後繼續')
    } catch (error) {
      console.error('生成描述失敗:', error)
      const errorMessage = error.message || error.toString() || '未知錯誤'
      
      // 檢查是否為 overloaded 錯誤
      if (errorMessage.includes('overloaded') || errorMessage.includes('overload') || errorMessage.includes('503')) {
        alert(`生成描述失敗：API 服務器過載\n\n錯誤信息：${errorMessage}\n\n建議：\n1. 等待幾秒後再試\n2. 如果持續失敗，可能是 API 服務器負載過高，請稍後再試`)
      } else {
        alert(`生成描述失敗: ${errorMessage}`)
      }
      setProgress('')
    } finally {
      setGeneratingDescriptions(false)
    }
  }

  // 更新描述
  const handleUpdateDescription = (index, field, value) => {
    const newDescriptions = [...descriptions]
    newDescriptions[index][field] = value
    setDescriptions(newDescriptions)
  }

  // 步驟 6-8: 生成8宮格、去背、裁切
  const handleGenerateStickers = async () => {
    if (!characterImage) {
      alert('請先生成或上傳角色圖片')
      return
    }
    if (descriptions.length === 0) {
      alert('請先生成文字描述')
      return
    }

    // 檢查文字是否重複
    const textSet = new Set()
    const duplicateTexts = []
    for (let i = 0; i < descriptions.length; i++) {
      const text = descriptions[i].text?.trim()
      if (!text) {
        alert(`第 ${i + 1} 張貼圖的文字為空，請填寫`)
        return
      }
      if (textSet.has(text)) {
        duplicateTexts.push({ index: i + 1, text })
      } else {
        textSet.add(text)
      }
    }

    if (duplicateTexts.length > 0) {
      const duplicateList = duplicateTexts.map(d => `第 ${d.index} 張: "${d.text}"`).join('\n')
      alert(`發現重複的文字，請修改後再生成：\n${duplicateList}`)
      return
    }

    setLoading(true)
    setProgress('開始生成貼圖...')

    try {
      const gridCount = Math.ceil(count / 8) // 需要多少張8宮格
      const allGridImages = []
      const allProcessedImages = []
      const allCutImages = []

      // 生成所有8宮格（直接生成包含8宮格的圖片）
      for (let gridIndex = 0; gridIndex < gridCount; gridIndex++) {
        // 在生成每張8宮格之間添加延遲，避免請求過於頻繁
        if (gridIndex > 0) {
          const delay = 3000 // 3秒延遲
          setProgress(`等待 ${delay / 1000} 秒後生成下一張8宮格（避免 API 過載）...`)
          await new Promise(resolve => setTimeout(resolve, delay))
        }
        
        setProgress(`正在生成第 ${gridIndex + 1}/${gridCount} 張8宮格圖片...`)
        
        // 獲取當前8宮格的8個貼圖描述
        const startIndex = gridIndex * 8
        const endIndex = Math.min(startIndex + 8, count)
        const gridStickers = []
        
        for (let i = startIndex; i < endIndex; i++) {
          gridStickers.push(descriptions[i])
        }
        
        // 如果不足8張，用空白描述填充（最後一張8宮格可能不足8張）
        while (gridStickers.length < 8) {
          gridStickers.push({
            description: '空白貼圖',
            text: ''
          })
        }
        
        // 驗證文字不重複
        const texts = gridStickers.map(s => s.text).filter(Boolean)
        const uniqueTexts = new Set(texts)
        if (texts.length !== uniqueTexts.size) {
          console.warn('警告：當前8宮格中有重複文字，將繼續生成')
        }
        
        // 直接生成包含8宮格的圖片
        let gridImage = null
        let retryCount = 0
        const maxRetries = 5 // 增加重試次數到 5 次
        
        while (!gridImage && retryCount < maxRetries) {
          try {
            gridImage = await generateGrid8Image(
              apiKey,
              characterImage,
              gridStickers,
              textStyle || ''
            )
          } catch (error) {
            retryCount++
            if (retryCount < maxRetries) {
              // 檢查是否為 overloaded 錯誤，使用更長的等待時間
              const isOverloaded = error.message && (
                error.message.includes('overloaded') || 
                error.message.includes('overload') ||
                error.message.includes('請稍後再試')
              )
              
              // 使用指數退避策略
              // 對於 overloaded 錯誤：10秒、20秒、40秒、80秒
              // 對於其他錯誤：5秒、10秒、20秒、40秒
              const baseDelay = isOverloaded ? 10000 : 5000
              const delay = baseDelay * Math.pow(2, retryCount - 1)
              
              console.warn(`生成8宮格失敗，重試中 (${retryCount}/${maxRetries})...`, error.message)
              setProgress(`生成8宮格失敗，正在重試 (${retryCount}/${maxRetries})，等待 ${Math.round(delay / 1000)} 秒...`)
              await new Promise(resolve => setTimeout(resolve, delay))
            } else {
              console.error(`生成8宮格失敗，已重試 ${maxRetries} 次:`, error)
              throw new Error(`生成第 ${gridIndex + 1} 張8宮格失敗（已重試 ${maxRetries} 次）: ${error.message}`)
            }
          }
        }
        
        if (gridImage) {
          allGridImages.push(gridImage)
        }
      }

      setGridImages(allGridImages)
      // 自動進行初始去背
      setProgress('正在進行自動去背...')
      const initialProcessed = []
      for (let i = 0; i < allGridImages.length; i++) {
        setProgress(`正在為第 ${i + 1}/${allGridImages.length} 張8宮格去背...`)
        const processed = await removeBackgroundSimple(allGridImages[i], backgroundThreshold, null)
        initialProcessed.push(processed)
      }
      setProcessedGridImages(initialProcessed)
      setCurrentStep(7) // 進入去背調整步驟
      setProgress('去背完成，請調整去背程度後點擊「下一步」進行裁切')
    } catch (error) {
      console.error('生成失敗:', error)
      alert(`生成失敗: ${error.message}`)
      setProgress('')
    } finally {
      setLoading(false)
    }
  }

  // 步驟 7: 調整去背並應用
  const handleApplyBackgroundRemoval = async () => {
    setProcessingBackground(true)
    setProgress('正在重新處理去背...')
    
    try {
      const newProcessed = []
      for (let i = 0; i < gridImages.length; i++) {
        setProgress(`正在為第 ${i + 1}/${gridImages.length} 張8宮格重新去背...`)
        const processed = await removeBackgroundSimple(gridImages[i], backgroundThreshold, null)
        newProcessed.push(processed)
      }
      setProcessedGridImages(newProcessed)
      setProgress('去背已更新')
    } catch (error) {
      console.error('去背處理失敗:', error)
      alert(`去背處理失敗: ${error.message}`)
    } finally {
      setProcessingBackground(false)
    }
  }


  // 步驟 8: 裁切8宮格，然後生成主要圖片和標籤圖片
  const handleSplitGrids = async () => {
    if (processedGridImages.length === 0) {
      alert('請先完成去背')
      return
    }

    setLoading(true)
    setProgress('正在裁切8宮格...')

    try {
      const allCutImages = []
      const gridCount = processedGridImages.length

      for (let gridIndex = 0; gridIndex < gridCount; gridIndex++) {
        setProgress(`正在裁切第 ${gridIndex + 1}/${gridCount} 張8宮格...`)
        const cutCells = await splitGrid8(processedGridImages[gridIndex], 370, 320)
        
        // 計算這個8宮格實際有多少張貼圖
        const startIndex = gridIndex * 8
        const endIndex = Math.min(startIndex + 8, count)
        const actualCutCount = endIndex - startIndex
        
        allCutImages.push(...cutCells.slice(0, actualCutCount))
      }

      setCutImages(allCutImages)
      setProgress('裁切完成！正在生成主要圖片和標籤圖片...')

      // 生成主要圖片（240x240，無文字）
      setProgress('正在生成主要圖片（240×240，無文字）...')
      const mainImg = await generateMainImage(apiKey, characterImage, theme)
      const mainImgProcessed = await removeBackgroundSimple(mainImg, backgroundThreshold)
      setMainImage(mainImgProcessed)

      // 生成標籤圖片（96x74，無文字，角色為主）
      setProgress('正在生成標籤圖片（96×74，無文字）...')
      const tabImg = await generateTabImage(apiKey, characterImage, theme)
      const tabImgProcessed = await removeBackgroundSimple(tabImg, backgroundThreshold)
      setTabImage(tabImgProcessed)

      setCurrentStep(9)
      setProgress('完成！所有貼圖已生成，可以下載了')
    } catch (error) {
      console.error('處理失敗:', error)
      alert(`處理失敗: ${error.message}`)
      setProgress('')
    } finally {
      setLoading(false)
    }
  }

  // 步驟 9: 打包下載
  const handleDownload = async () => {
    if (cutImages.length === 0) {
      alert('請先生成貼圖')
      return
    }

    try {
      // 將裁切後的圖片轉換為下載格式
      const imagesForDownload = cutImages.map((dataUrl, index) => ({
        index: index + 1,
        description: descriptions[index]?.description || `貼圖 ${index + 1}`,
        dataUrl: dataUrl
      }))

      await downloadAsZip(imagesForDownload, mainImage, tabImage, theme)
    } catch (error) {
      console.error('下載失敗:', error)
      alert(`下載失敗: ${error.message}`)
    }
  }

  return (
    <div className="app">
      <div className="container">
        <h1 className="title">LINE 貼圖製作</h1>

        {/* 步驟 1: API Key */}
        <div className="step-section">
          <h2>步驟 1: 填入 Gemini API Key</h2>
          <div className="form-group">
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="請輸入您的 Gemini API Key"
              className="form-input"
            />
          </div>
        </div>

        {/* 步驟 2: 選擇張數 */}
        <div className="step-section">
          <h2>步驟 2: 選擇創作張數</h2>
          <div className="form-group">
            <select
              value={count}
              onChange={(e) => setCount(Number(e.target.value))}
              className="form-input"
            >
              <option value={8}>8 張</option>
              <option value={16}>16 張</option>
              <option value={24}>24 張</option>
              <option value={32}>32 張</option>
              <option value={40}>40 張</option>
            </select>
          </div>
        </div>

        {/* 步驟 3: 角色描述/圖片和主題說明 */}
        <div className="step-section">
          <h2>步驟 3: 填入角色描述或上傳角色圖片</h2>
          <div className="form-group">
            <label>角色描述（如果不上傳圖片，則根據描述生成角色）</label>
            <textarea
              value={characterDescription}
              onChange={(e) => setCharacterDescription(e.target.value)}
              placeholder="請描述角色的外觀、特徵、風格等..."
              rows={3}
              className="form-input"
              disabled={!!uploadedCharacterImage}
            />
          </div>
          <div className="form-group">
            <label>或上傳角色圖片（如果上傳，將使用此圖片作為角色）</label>
            <input
              type="file"
              accept="image/*"
              onChange={handleCharacterUpload}
              className="form-input"
            />
            {uploadedCharacterImage && (
              <div>
                <img src={uploadedCharacterImage} alt="上傳的角色" className="preview-image-small" />
                <p className="success-message">✓ 已上傳角色圖片，將在步驟 4 自動顯示</p>
              </div>
            )}
          </div>
          <div className="form-group">
            <label>主題說明</label>
            <textarea
              value={theme}
              onChange={(e) => setTheme(e.target.value)}
              placeholder="請描述貼圖的主題、情境、用途等..."
              rows={3}
              className="form-input"
            />
          </div>
        </div>

        {/* 步驟 4: 生成角色/確認角色 */}
        <div className="step-section">
          <h2>步驟 4: 角色確認</h2>
          
          {/* 如果已上傳角色圖片，直接顯示 */}
          {uploadedCharacterImage && characterImage && (
            <div className="character-preview">
              <h3>上傳的角色圖片</h3>
              <img src={characterImage} alt="上傳的角色" className="preview-image character-image" />
              <p className="success-message">✓ 已使用上傳的角色圖片</p>
              <button className="btn btn-success" onClick={handleConfirmCharacter}>
                確認，繼續下一步
              </button>
            </div>
          )}

          {/* 如果沒有上傳，則生成角色 */}
          {!uploadedCharacterImage && (
            <>
              <button
                className="btn btn-primary"
                onClick={handleGenerateCharacter}
                disabled={generatingCharacter || !apiKey || (!characterDescription.trim() && !theme.trim())}
              >
                {generatingCharacter ? '生成中...' : '生成角色'}
              </button>

              {characterImage && (
                <div className="character-preview">
                  <h3>角色預覽（請確認是否符合要求）</h3>
                  <img src={characterImage} alt="生成的角色" className="preview-image character-image" />
                  {!characterConfirmed ? (
                    <div className="character-actions">
                      <button className="btn btn-success" onClick={handleConfirmCharacter}>
                        確認，繼續下一步
                      </button>
                      <button className="btn btn-secondary" onClick={handleRegenerateCharacter}>
                        重新生成
                      </button>
                    </div>
                  ) : (
                    <p className="success-message">✓ 角色已確認</p>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* 步驟 5: 文字風格描述 */}
        {characterConfirmed && (
          <div className="step-section">
            <h2>步驟 5: 字體樣式風格描述</h2>
            <div className="form-group">
              <label>字體樣式風格描述（可選，不填寫則在生成文字描述時自動由 AI 生成）</label>
              <textarea
                value={textStyle}
                onChange={(e) => setTextStyle(e.target.value)}
                placeholder="例如：可愛簡潔的風格，文字清晰易讀，使用粗體字，文字框使用白色或黃色背景..."
                rows={3}
                className="form-input"
                disabled={generatingTextStyle}
              />
              <p className="form-hint">如果不填寫，系統會在生成文字描述時自動生成統一的字體樣式風格</p>
            </div>
            <button
              className="btn btn-primary"
              onClick={handleGenerateTextStyle}
              disabled={generatingTextStyle || !apiKey || !theme.trim()}
            >
              {generatingTextStyle ? '生成中...' : textStyle ? '重新生成字體樣式風格' : '預覽 AI 生成的字體樣式風格'}
            </button>
            
            {textStyle && (
              <div className="text-style-preview">
                <h3>字體樣式風格：</h3>
                <p className="text-style-content">{textStyle}</p>
                <button className="btn btn-success" onClick={() => setTextStyleConfirmed(true)}>
                  確認，繼續下一步
                </button>
              </div>
            )}
            
            {!textStyle && (
              <div className="info-box">
                <p>💡 提示：如果現在不填寫文字風格，系統會在生成文字描述時自動生成統一的字體樣式風格，確保所有貼圖的文字樣式一致。</p>
                <button className="btn btn-success" onClick={() => setTextStyleConfirmed(true)}>
                  跳過，直接進入下一步（將自動生成字體樣式風格）
                </button>
              </div>
            )}
          </div>
        )}

        {/* 步驟 6: 生成文字描述 */}
        {textStyleConfirmed && (
          <div className="step-section">
            <h2>步驟 6: 生成文字描述（可編輯）</h2>
            
            {/* 排除文字輸入框 */}
            <div className="form-group" style={{ marginBottom: '20px' }}>
              <label htmlFor="excludedTexts" style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>
                排除這些文字（選填，每行一個）：
              </label>
              <textarea
                id="excludedTexts"
                value={excludedTexts}
                onChange={(e) => setExcludedTexts(e.target.value)}
                placeholder="例如：&#10;你好&#10;謝謝&#10;再見&#10;&#10;（每行輸入一個要排除的文字，這樣在延伸同一系列時可以避免文字重複）"
                className="form-input"
                style={{
                  width: '100%',
                  minHeight: '100px',
                  padding: '10px',
                  fontSize: '14px',
                  fontFamily: 'inherit',
                  border: '1px solid #ddd',
                  borderRadius: '4px',
                  resize: 'vertical'
                }}
              />
              <p style={{ marginTop: '5px', fontSize: '12px', color: '#666' }}>
                💡 提示：輸入之前已使用的文字，生成時會自動排除這些文字，避免重複。適合延伸同一系列貼圖時使用。
              </p>
            </div>
            
            <button
              className="btn btn-primary"
              onClick={handleGenerateDescriptions}
              disabled={generatingDescriptions || !apiKey}
            >
              {generatingDescriptions ? '生成中...' : textStyle ? '生成文字描述' : '生成文字描述（將自動生成字體樣式風格）'}
            </button>

            {descriptions.length > 0 && (
              <div className="descriptions-editor">
                <h3>編輯描述和文字（共 {descriptions.length} 張）</h3>
                {descriptions.map((item, index) => (
                  <div key={index} className="description-item">
                    <div className="description-field">
                      <label>描述 {index + 1}:</label>
                      <input
                        type="text"
                        value={item.description}
                        onChange={(e) => handleUpdateDescription(index, 'description', e.target.value)}
                        className="form-input"
                      />
                    </div>
                    <div className="description-field">
                      <label>文字 {index + 1}:</label>
                      <input
                        type="text"
                        value={item.text}
                        onChange={(e) => handleUpdateDescription(index, 'text', e.target.value)}
                        className="form-input"
                        maxLength={10}
                      />
                    </div>
                  </div>
                ))}
                <button
                  className="btn btn-primary"
                  onClick={handleGenerateStickers}
                  disabled={loading}
                >
                  {loading ? '生成中...' : '開始生成8宮格貼圖'}
                </button>
              </div>
            )}
          </div>
        )}

        {/* 進度顯示 */}
        {progress && (
          <div className="progress">{progress}</div>
        )}

        {/* 步驟 7: 去背調整 */}
        {processedGridImages.length > 0 && currentStep === 7 && (
          <div className="step-section">
            <h2>步驟 7: 調整去背程度</h2>
            <div className="form-group">
              <label>去背閾值（數值越小，去背越強；數值越大，保留越多背景）</label>
              <div className="threshold-control">
                <input
                  type="range"
                  min="200"
                  max="255"
                  value={backgroundThreshold}
                  onChange={async (e) => {
                    const newThreshold = Number(e.target.value)
                    setBackgroundThreshold(newThreshold)
                    // 實時應用去背調整
                    setProcessingBackground(true)
                    try {
                      const newProcessed = []
                      for (let i = 0; i < gridImages.length; i++) {
                        const processed = await removeBackgroundSimple(gridImages[i], newThreshold, null)
                        newProcessed.push(processed)
                      }
                      setProcessedGridImages(newProcessed)
                    } catch (error) {
                      console.error('去背處理失敗:', error)
                    } finally {
                      setProcessingBackground(false)
                    }
                  }}
                  className="threshold-slider"
                />
                <span className="threshold-value">{backgroundThreshold}</span>
              </div>
              <p className="threshold-hint">
                當前值：{backgroundThreshold}（建議範圍：200-255，預設：240）- 調整滑桿會即時預覽效果
              </p>
            </div>

            <button
              className="btn btn-primary"
              onClick={handleApplyBackgroundRemoval}
              disabled={processingBackground}
            >
              {processingBackground ? '處理中...' : '應用去背調整'}
            </button>

            <div className="preview-group">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px', flexWrap: 'wrap', gap: '10px' }}>
                <h3 style={{ margin: 0 }}>去背後預覽（{processedGridImages.length} 張8宮格）</h3>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '14px', color: '#666', fontWeight: '500' }}>切換背景：</span>
                  <button
                    className="btn btn-secondary"
                    onClick={() => setPreviewBackgroundDark(!previewBackgroundDark)}
                    style={{ 
                      fontSize: '14px', 
                      padding: '8px 16px',
                      width: 'auto',
                      minWidth: '140px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px',
                      backgroundColor: previewBackgroundDark ? '#2d2d2d' : '#f0f0f0',
                      color: previewBackgroundDark ? '#fff' : '#333',
                      border: previewBackgroundDark ? '2px solid #555' : '2px solid #ddd',
                      transition: 'all 0.3s ease',
                      cursor: 'pointer'
                    }}
                  >
                    <span style={{ fontSize: '18px' }}>{previewBackgroundDark ? '🌙' : '☀️'}</span>
                    <span>{previewBackgroundDark ? '深色背景' : '淺色背景'}</span>
                  </button>
                  <span style={{ fontSize: '12px', color: '#999', fontStyle: 'italic' }}>
                    {previewBackgroundDark ? '（模擬 LINE 深色模式）' : '（模擬 LINE 淺色模式）'}
                  </span>
                </div>
              </div>
              <div 
                className="grid-preview" 
                style={{ 
                  backgroundColor: previewBackgroundDark ? '#1a1a1a' : '#ffffff',
                  padding: '20px',
                  borderRadius: '8px',
                  transition: 'background-color 0.3s ease',
                  border: previewBackgroundDark ? '2px solid #333' : '2px solid #e0e0e0'
                }}
              >
                {processedGridImages.map((img, idx) => (
                  <div 
                    key={idx} 
                    className="grid-item"
                    style={{
                      backgroundColor: previewBackgroundDark ? '#1a1a1a' : 'transparent',
                      padding: '10px',
                      borderRadius: '8px',
                      transition: 'background-color 0.3s ease',
                      position: 'relative'
                    }}
                  >
                    <div
                      style={{
                        backgroundColor: previewBackgroundDark ? '#1a1a1a' : '#ffffff',
                        border: previewBackgroundDark ? '1px solid #444' : '2px solid #e0e0e0',
                        borderRadius: '4px',
                        padding: '0',
                        display: 'inline-block',
                        transition: 'all 0.3s ease',
                        overflow: 'hidden'
                      }}
                    >
                      <img 
                        src={img} 
                        alt={`去背後 8宮格 ${idx + 1}`} 
                        className="preview-image grid-image"
                        style={{
                          backgroundColor: previewBackgroundDark ? '#1a1a1a' : 'transparent',
                          display: 'block',
                          maxWidth: '100%',
                          height: 'auto',
                          mixBlendMode: previewBackgroundDark ? 'normal' : 'normal'
                        }}
                      />
                    </div>
                    <p style={{ marginTop: '8px', fontSize: '0.85em', color: previewBackgroundDark ? '#999' : '#6c757d', textAlign: 'center' }}>
                      8宮格 {idx + 1}
                    </p>
                  </div>
                ))}
              </div>
              <p style={{ 
                marginTop: '12px', 
                fontSize: '13px', 
                color: '#666', 
                fontStyle: 'italic',
                textAlign: 'center',
                padding: '10px',
                backgroundColor: '#f8f9fa',
                borderRadius: '6px',
                border: '1px solid #e0e0e0'
              }}>
                💡 提示：切換到深色背景可以更好地檢查去背效果，因為 LINE 貼圖會在深色背景下使用。如果去背不完整，在深色背景下會更容易發現問題。
              </p>
            </div>

            <button
              className="btn btn-success"
              onClick={handleSplitGrids}
              disabled={loading || processingBackground}
            >
              {loading ? '處理中...' : '下一步：進行裁切'}
            </button>
          </div>
        )}

        {/* 步驟 8-9: 預覽結果 */}
        {cutImages.length > 0 && currentStep >= 8 && (
          <div className="step-section">
            <h2>{currentStep === 9 ? '步驟 9: 完成並下載' : '步驟 8: 裁切完成'}</h2>
            
            {/* 主要圖片和標籤圖片 */}
            {(mainImage || tabImage) && (
              <div className="preview-group">
                <h3>主要圖片和標籤圖片</h3>
                <div className="main-tab-preview">
                  {mainImage && (
                    <div className="preview-item">
                      <h4>主要圖片 (240×240)</h4>
                      <img src={mainImage} alt="主要圖片" className="preview-image main-image" />
                    </div>
                  )}
                  {tabImage && (
                    <div className="preview-item">
                      <h4>標籤圖片 (96×74)</h4>
                      <img src={tabImage} alt="標籤圖片" className="preview-image tab-image" />
                    </div>
                  )}
                </div>
              </div>
            )}
            
            {/* 8宮格預覽 */}
            {gridImages.length > 0 && (
              <div className="preview-group">
                <h3>8宮格圖片（{gridImages.length} 張）</h3>
                <div className="grid-preview">
                  {gridImages.map((img, idx) => (
                    <div key={idx} className="grid-item">
                      <img src={img} alt={`8宮格 ${idx + 1}`} className="preview-image grid-image" />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 裁切後的單張預覽 */}
            <div className="preview-group">
              <h3>裁切後的貼圖（{cutImages.length} 張）</h3>
              <div className="sticker-grid">
                {cutImages.map((img, idx) => (
                  <div key={idx} className="sticker-item">
                    <img src={img} alt={`貼圖 ${idx + 1}`} className="preview-image sticker-image" />
                    <p className="sticker-info">
                      {descriptions[idx]?.description || `貼圖 ${idx + 1}`}
                      <br />
                      <strong>{descriptions[idx]?.text || ''}</strong>
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {/* 下載按鈕 - 只在步驟 9 顯示 */}
            {currentStep === 9 && mainImage && tabImage && (
              <div className="download-section">
                <button
                  className="btn btn-download"
                  onClick={handleDownload}
                  disabled={loading}
                >
                  {loading ? '打包中...' : '打包下載 ZIP'}
                </button>
                <p className="download-hint">
                  將下載包含 {cutImages.length} 張貼圖、1 張主要圖片和 1 張標籤圖片的 ZIP 檔案
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default App
