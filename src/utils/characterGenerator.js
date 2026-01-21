import { GoogleGenerativeAI } from '@google/generative-ai'

/**
 * 生成角色圖片（白色背景）
 * @param {string} apiKey - Gemini API Key
 * @param {string} theme - 主題描述
 * @param {string} uploadedImage - 上傳的參考圖片（可選）
 * @returns {Promise<string>} 角色圖片的 Data URL
 */
export async function generateCharacter(apiKey, theme, uploadedImage = null) {
  const genAI = new GoogleGenerativeAI(apiKey)
  const model = genAI.getGenerativeModel({ model: 'gemini-3-pro-image-preview' })

  // 清理主題，避免觸發安全過濾
  const cleanTheme = theme.trim()
  
  let prompt = `Create a cute and friendly character design for messaging stickers.

Theme: ${cleanTheme}

Design Requirements:
- **NO TEXT**: Do not include any text, words, or letters in the image. Just the character.
- **Clean Background**: Solid, high-contrast background color (e.g., white or a color distinct from the character) to facilitate easy background removal.
- **Character Focus**: Full body or upper body character view, centered and well-positioned.
- **Consistency Base**: This image will be used as a strict reference for generating multiple sticker variations, so make the features clear and recognizable.
- Cute and simple character design (adorable, friendly style).
- High quality digital illustration.
- Safe, appropriate, and family-friendly content.`

  // 如果有上傳的參考圖片，在 prompt 中提及
  if (uploadedImage) {
    prompt += `\n- Use the uploaded reference image as a base for the character design`
  }

  try {
    // 構建請求內容
    const contents = [{
      parts: [{
        text: prompt
      }]
    }]

    // 如果有上傳的圖片，添加到 parts 中
    if (uploadedImage) {
      // 將 Data URL 轉換為 base64
      const base64Data = uploadedImage.split(',')[1]
      contents[0].parts.push({
        inlineData: {
          mimeType: 'image/png',
          data: base64Data
        }
      })
    }

    // 使用 REST API 調用，添加超時控制（60秒）
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 60000)

    let response
    try {
      response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-image-preview:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            contents,
            generationConfig: {
              temperature: 0.8,
              topK: 40,
              topP: 0.95,
              maxOutputTokens: 2048,
            }
          }),
          signal: controller.signal
        }
      )
      clearTimeout(timeoutId)
    } catch (fetchError) {
      clearTimeout(timeoutId)
      if (fetchError.name === 'AbortError') {
        throw new Error('請求超時（超過60秒），請稍後再試')
      }
      throw fetchError
    }

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      console.error('API 錯誤詳情:', {
        status: response.status,
        statusText: response.statusText,
        error: errorData
      })
      const errorMessage = errorData.error?.message || errorData.message || response.statusText
      throw new Error(`API 錯誤: ${errorMessage}`)
    }

    const data = await response.json()
    console.log('API 完整回應:', JSON.stringify(data, null, 2))
    
    // 檢查是否有錯誤
    if (data.error) {
      throw new Error(`API 錯誤: ${data.error.message || JSON.stringify(data.error)}`)
    }
    
    // 檢查 finishReason
    if (data.candidates && data.candidates[0]) {
      const candidate = data.candidates[0]
      
      if (candidate.finishReason && candidate.finishReason !== 'STOP') {
        console.warn('Finish reason:', candidate.finishReason)
        if (candidate.finishReason === 'SAFETY' || candidate.finishReason === 'IMAGE_SAFETY') {
          const finishMessage = candidate.finishMessage || ''
          const errorMsg = finishMessage || '生成的圖片被 Google 安全過濾器阻止。這可能是因為 prompt 中的某些內容觸發了安全策略。'
          throw new Error(`圖片生成被安全過濾器阻止。\n\n建議：\n1. 嘗試調整描述文字，避免可能敏感的內容\n2. 簡化 prompt，使用更中性的描述\n3. 如果認為這是誤判，可以向 Google 反饋\n\n詳細信息：${errorMsg}`)
        }
        if (candidate.finishReason === 'RECITATION') {
          throw new Error('內容可能包含受版權保護的內容')
        }
      }
      
      // 檢查 content.parts
      if (candidate.content && candidate.content.parts) {
        for (const part of candidate.content.parts) {
          // 檢查內聯圖片數據
          if (part.inlineData) {
            return `data:${part.inlineData.mimeType || 'image/png'};base64,${part.inlineData.data}`
          }
          // 檢查圖片 URL
          if (part.image && part.image.url) {
            const imageResponse = await fetch(part.image.url)
            const blob = await imageResponse.blob()
            return await blobToDataURL(blob)
          }
          // 檢查是否有 base64 數據
          if (part.image && part.image.data) {
            return `data:image/png;base64,${part.image.data}`
          }
        }
      }
      
      // 檢查是否有直接的圖片數據
      if (candidate.imageData) {
        return `data:image/png;base64,${candidate.imageData}`
      }
      
      // 如果只有文本回應，記錄並拋出錯誤
      if (candidate.content && candidate.content.parts) {
        const textParts = candidate.content.parts.filter(p => p.text)
        if (textParts.length > 0) {
          console.error('API 返回了文本而不是圖片:', textParts.map(p => p.text).join('\n'))
          throw new Error(`API 返回了文本回應而不是圖片。回應內容: ${textParts[0].text.substring(0, 200)}`)
        }
      }
    }

    // 如果標準格式沒有圖片，嘗試其他可能的格式
    if (data.images && data.images.length > 0) {
      const imageData = data.images[0]
      if (imageData.base64) {
        return `data:image/png;base64,${imageData.base64}`
      }
      if (imageData.url) {
        const imageResponse = await fetch(imageData.url)
        const blob = await imageResponse.blob()
        return await blobToDataURL(blob)
      }
    }

    // 詳細的錯誤信息
    console.error('無法找到圖片數據，完整回應:', data)
    throw new Error(`API 回應中沒有找到圖片數據。回應格式: ${JSON.stringify(data).substring(0, 500)}`)
  } catch (error) {
    console.error('生成角色失敗:', error)
    throw error
  }
}

/**
 * 生成主要圖片（無文字，240x240）
 * @param {string} apiKey - Gemini API Key
 * @param {string} characterImageDataUrl - 角色圖片（Data URL）
 * @param {string} theme - 主題說明
 * @returns {Promise<string>} 生成的圖片 Data URL
 */
export async function generateMainImage(apiKey, characterImageDataUrl, theme) {
  const genAI = new GoogleGenerativeAI(apiKey)
  const model = genAI.getGenerativeModel({ model: 'gemini-3-pro-image-preview' })

  // 清理主題
  const cleanTheme = theme.trim()
  
  const prompt = `Create a main image for a messaging sticker pack based on the character reference image.

Character Reference: Use the provided character image as reference
Theme: ${cleanTheme}

Technical Requirements:
1. Use the character design from the reference image
2. Maintain visual consistency with the reference character
3. **DO NOT add any text** - this is a main image without text or words
4. Clean white background (solid, high-contrast, distinct from character)
5. **EXACT dimensions: 240px width × 240px height** (must be exactly 240×240 pixels)
6. Target Aspect Ratio: 1:1 (Square) - COMPOSITION MUST FIT SQUARE RATIO
7. Cute, expressive, and friendly sticker illustration style
8. High quality digital illustration
8. Character should be centered and well-positioned in the frame
9. Clean, simple, and appropriate design suitable as a sticker pack main image
10. Safe, family-friendly content`

  try {
    // 檢查並提取 base64 數據
    if (!characterImageDataUrl) {
      throw new Error('角色圖片數據為空')
    }
    
    let base64Data
    if (characterImageDataUrl.includes(',')) {
      base64Data = characterImageDataUrl.split(',')[1]
    } else {
      base64Data = characterImageDataUrl
    }
    
    if (!base64Data || base64Data.length === 0) {
      throw new Error('無法提取圖片 base64 數據')
    }
    
    // 清理 base64 數據（移除可能的空白字符）
    base64Data = base64Data.trim().replace(/\s/g, '')
    
    // 驗證 base64 格式
    if (!/^[A-Za-z0-9+/=]+$/.test(base64Data)) {
      throw new Error('base64 數據格式無效，包含非法字符')
    }
    
    // 檢查 base64 長度（圖片應該有一定大小）
    if (base64Data.length < 100) {
      throw new Error('base64 數據長度不足，可能不是有效的圖片數據')
    }

    // 構建請求體
    // 注意：根據最初可用的版本，應該包含 maxOutputTokens
    const requestBody = {
      contents: [{
        parts: [
          {
            text: prompt
          },
          {
            inlineData: {
              mimeType: 'image/png',
              data: base64Data
            }
          }
        ]
      }],
      generationConfig: {
        temperature: 0.8,
        topK: 40,
        topP: 0.95,
        maxOutputTokens: 2048,
      }
    }
    
    console.log('發送圖片生成請求:', {
      promptLength: prompt.length,
      base64Length: base64Data.length,
      model: 'gemini-3-pro-image-preview'
    })

    // 添加超時控制（60秒）
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 60000)

    let response
    try {
      response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-image-preview:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(requestBody),
          signal: controller.signal
        }
      )
      clearTimeout(timeoutId)
    } catch (fetchError) {
      clearTimeout(timeoutId)
      if (fetchError.name === 'AbortError') {
        throw new Error('請求超時（超過60秒），請稍後再試或減少同時生成的數量')
      }
      throw fetchError
    }

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      console.error('API 錯誤詳情:', {
        status: response.status,
        statusText: response.statusText,
        error: errorData
      })
      const errorMessage = errorData.error?.message || errorData.message || response.statusText
      throw new Error(`API 錯誤: ${errorMessage}`)
    }

    const data = await response.json()
    console.log('生成主要圖片 - API 完整回應:', JSON.stringify(data, null, 2))
    
    // 檢查是否有錯誤
    if (data.error) {
      throw new Error(`API 錯誤: ${data.error.message || JSON.stringify(data.error)}`)
    }
    
    // 檢查 finishReason
    if (data.candidates && data.candidates[0]) {
      const candidate = data.candidates[0]
      
      if (candidate.finishReason && candidate.finishReason !== 'STOP') {
        console.warn('Finish reason:', candidate.finishReason)
        if (candidate.finishReason === 'SAFETY' || candidate.finishReason === 'IMAGE_SAFETY') {
          const finishMessage = candidate.finishMessage || ''
          const errorMsg = finishMessage || '生成的圖片被 Google 安全過濾器阻止。這可能是因為 prompt 中的某些內容觸發了安全策略。'
          throw new Error(`圖片生成被安全過濾器阻止。\n\n建議：\n1. 嘗試調整描述文字，避免可能敏感的內容\n2. 簡化 prompt，使用更中性的描述\n3. 如果認為這是誤判，可以向 Google 反饋\n\n詳細信息：${errorMsg}`)
        }
        if (candidate.finishReason === 'RECITATION') {
          throw new Error('內容可能包含受版權保護的內容')
        }
      }
      
      // 檢查 content.parts
      if (candidate.content && candidate.content.parts) {
        for (const part of candidate.content.parts) {
          // 檢查內聯圖片數據
          if (part.inlineData) {
            return `data:${part.inlineData.mimeType || 'image/png'};base64,${part.inlineData.data}`
          }
          // 檢查圖片 URL
          if (part.image && part.image.url) {
            const imageResponse = await fetch(part.image.url)
            const blob = await imageResponse.blob()
            return await blobToDataURL(blob)
          }
          // 檢查是否有 base64 數據
          if (part.image && part.image.data) {
            return `data:image/png;base64,${part.image.data}`
          }
        }
      }
      
      // 檢查是否有直接的圖片數據
      if (candidate.imageData) {
        return `data:image/png;base64,${candidate.imageData}`
      }
      
      // 如果只有文本回應，記錄並拋出錯誤
      if (candidate.content && candidate.content.parts) {
        const textParts = candidate.content.parts.filter(p => p.text)
        if (textParts.length > 0) {
          console.error('API 返回了文本而不是圖片:', textParts.map(p => p.text).join('\n'))
          throw new Error(`API 返回了文本回應而不是圖片。回應內容: ${textParts[0].text.substring(0, 200)}`)
        }
      }
    }

    // 如果標準格式沒有圖片，嘗試其他可能的格式
    if (data.images && data.images.length > 0) {
      const imageData = data.images[0]
      if (imageData.base64) {
        return `data:image/png;base64,${imageData.base64}`
      }
      if (imageData.url) {
        const imageResponse = await fetch(imageData.url)
        const blob = await imageResponse.blob()
        return await blobToDataURL(blob)
      }
    }

    // 詳細的錯誤信息
    console.error('無法找到圖片數據，完整回應:', data)
    throw new Error(`API 回應中沒有找到圖片數據。回應格式: ${JSON.stringify(data).substring(0, 500)}`)
  } catch (error) {
    console.error('生成主要圖片失敗:', error)
    throw error
  }
}

/**
 * 生成標籤圖片（無文字，角色為主，乾淨背景，96x74）
 * @param {string} apiKey - Gemini API Key
 * @param {string} characterImageDataUrl - 角色圖片（Data URL）
 * @param {string} theme - 主題說明
 * @returns {Promise<string>} 生成的圖片 Data URL
 */
export async function generateTabImage(apiKey, characterImageDataUrl, theme) {
  const genAI = new GoogleGenerativeAI(apiKey)
  const model = genAI.getGenerativeModel({ model: 'gemini-3-pro-image-preview' })

  // 清理主題
  const cleanTheme = theme.trim()
  
  const prompt = `Create a tab image for a messaging sticker pack based on the character reference image.

Character Reference: Use the provided character image as reference
Theme: ${cleanTheme}

Technical Requirements:
1. Use the character design from the reference image as the main focus
2. Maintain visual consistency with the reference character
3. **DO NOT add any text** - this is a tab image without text or words
4. Clean and simple background (solid, high-contrast, distinct from character)
5. **EXACT dimensions: 96px width × 74px height** (must be exactly 96×74 pixels)
6. Target Aspect Ratio: 4:3 (Landscape) - COMPOSITION MUST FIT LANDSCAPE RATIO
7. Character should be the main and central element, clearly visible
8. Simple and clean design suitable for chat room thumbnail
8. High quality digital illustration despite small size
9. Character should be well-centered and recognizable even at this small size
10. Minimalist design - keep it simple and clean since it's a small thumbnail image
11. Safe, family-friendly content`

  try {
    // 檢查並提取 base64 數據
    if (!characterImageDataUrl) {
      throw new Error('角色圖片數據為空')
    }
    
    let base64Data
    if (characterImageDataUrl.includes(',')) {
      base64Data = characterImageDataUrl.split(',')[1]
    } else {
      base64Data = characterImageDataUrl
    }
    
    if (!base64Data || base64Data.length === 0) {
      throw new Error('無法提取圖片 base64 數據')
    }
    
    // 清理 base64 數據（移除可能的空白字符）
    base64Data = base64Data.trim().replace(/\s/g, '')
    
    // 驗證 base64 格式
    if (!/^[A-Za-z0-9+/=]+$/.test(base64Data)) {
      throw new Error('base64 數據格式無效，包含非法字符')
    }
    
    // 檢查 base64 長度（圖片應該有一定大小）
    if (base64Data.length < 100) {
      throw new Error('base64 數據長度不足，可能不是有效的圖片數據')
    }

    // 構建請求體
    // 注意：根據最初可用的版本，應該包含 maxOutputTokens
    const requestBody = {
      contents: [{
        parts: [
          {
            text: prompt
          },
          {
            inlineData: {
              mimeType: 'image/png',
              data: base64Data
            }
          }
        ]
      }],
      generationConfig: {
        temperature: 0.8,
        topK: 40,
        topP: 0.95,
        maxOutputTokens: 2048,
      }
    }
    
    console.log('發送圖片生成請求:', {
      promptLength: prompt.length,
      base64Length: base64Data.length,
      model: 'gemini-3-pro-image-preview'
    })

    // 添加超時控制（60秒）
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 60000)

    let response
    try {
      response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-image-preview:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(requestBody),
          signal: controller.signal
        }
      )
      clearTimeout(timeoutId)
    } catch (fetchError) {
      clearTimeout(timeoutId)
      if (fetchError.name === 'AbortError') {
        throw new Error('請求超時（超過60秒），請稍後再試或減少同時生成的數量')
      }
      throw fetchError
    }

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      console.error('API 錯誤詳情:', {
        status: response.status,
        statusText: response.statusText,
        error: errorData
      })
      const errorMessage = errorData.error?.message || errorData.message || response.statusText
      throw new Error(`API 錯誤: ${errorMessage}`)
    }

    const data = await response.json()
    console.log('生成標籤圖片 - API 完整回應:', JSON.stringify(data, null, 2))
    
    // 檢查是否有錯誤
    if (data.error) {
      throw new Error(`API 錯誤: ${data.error.message || JSON.stringify(data.error)}`)
    }
    
    // 檢查 finishReason
    if (data.candidates && data.candidates[0]) {
      const candidate = data.candidates[0]
      
      if (candidate.finishReason && candidate.finishReason !== 'STOP') {
        console.warn('Finish reason:', candidate.finishReason)
        if (candidate.finishReason === 'SAFETY' || candidate.finishReason === 'IMAGE_SAFETY') {
          const finishMessage = candidate.finishMessage || ''
          const errorMsg = finishMessage || '生成的圖片被 Google 安全過濾器阻止。這可能是因為 prompt 中的某些內容觸發了安全策略。'
          throw new Error(`圖片生成被安全過濾器阻止。\n\n建議：\n1. 嘗試調整描述文字，避免可能敏感的內容\n2. 簡化 prompt，使用更中性的描述\n3. 如果認為這是誤判，可以向 Google 反饋\n\n詳細信息：${errorMsg}`)
        }
        if (candidate.finishReason === 'RECITATION') {
          throw new Error('內容可能包含受版權保護的內容')
        }
      }
      
      // 檢查 content.parts
      if (candidate.content && candidate.content.parts) {
        for (const part of candidate.content.parts) {
          // 檢查內聯圖片數據
          if (part.inlineData) {
            return `data:${part.inlineData.mimeType || 'image/png'};base64,${part.inlineData.data}`
          }
          // 檢查圖片 URL
          if (part.image && part.image.url) {
            const imageResponse = await fetch(part.image.url)
            const blob = await imageResponse.blob()
            return await blobToDataURL(blob)
          }
          // 檢查是否有 base64 數據
          if (part.image && part.image.data) {
            return `data:image/png;base64,${part.image.data}`
          }
        }
      }
      
      // 檢查是否有直接的圖片數據
      if (candidate.imageData) {
        return `data:image/png;base64,${candidate.imageData}`
      }
      
      // 如果只有文本回應，記錄並拋出錯誤
      if (candidate.content && candidate.content.parts) {
        const textParts = candidate.content.parts.filter(p => p.text)
        if (textParts.length > 0) {
          console.error('API 返回了文本而不是圖片:', textParts.map(p => p.text).join('\n'))
          throw new Error(`API 返回了文本回應而不是圖片。回應內容: ${textParts[0].text.substring(0, 200)}`)
        }
      }
    }

    // 如果標準格式沒有圖片，嘗試其他可能的格式
    if (data.images && data.images.length > 0) {
      const imageData = data.images[0]
      if (imageData.base64) {
        return `data:image/png;base64,${imageData.base64}`
      }
      if (imageData.url) {
        const imageResponse = await fetch(imageData.url)
        const blob = await imageResponse.blob()
        return await blobToDataURL(blob)
      }
    }

    // 詳細的錯誤信息
    console.error('無法找到圖片數據，完整回應:', data)
    throw new Error(`API 回應中沒有找到圖片數據。回應格式: ${JSON.stringify(data).substring(0, 500)}`)
  } catch (error) {
    console.error('生成標籤圖片失敗:', error)
    throw error
  }
}

/**
 * 生成一張包含8宮格的圖片（2列4行布局）
 * @param {string} apiKey - Gemini API Key
 * @param {string} characterImageDataUrl - 角色圖片（Data URL）
 * @param {Array<{description: string, text: string}>} stickers - 8個貼圖的描述和文字
 * @param {string} textStyleDescription - 文字樣式描述
 * @returns {Promise<string>} 生成的8宮格圖片 Data URL（740x1280）
 */
export async function generateGrid8Image(
  apiKey,
  characterImageDataUrl,
  stickers,
  textStyleDescription = ''
) {
  const safeTextStyle = textStyleDescription && textStyleDescription.trim() 
    ? textStyleDescription.trim() 
    : 'Cute and clear style with visible text box'

  // 構建包含8個貼圖描述的prompt
  const stickersDescription = stickers.map((sticker, index) => {
    const row = Math.floor(index / 2) + 1
    const col = (index % 2) + 1
    return `位置 ${row}-${col} (第${index + 1}個): ${sticker.description}, 文字: "${sticker.text}"`
  }).join('\n')

  const prompt = `Create a single image containing 8 LINE stickers arranged in a strict 2-column by 4-row grid layout.

Character Reference: **STRICTLY FOLLOW the provided character image.** The stickers MUST look exactly like the same character in different poses. Maintain the same facial features, clothing, colors, and proportions.
Background Requirement: **High contrast solid background** (e.g., white) in each cell to facilitate automatic background removal. The background color MUST be distinct from the character and text box colors.
Target Aspect Ratio: 9:16 (Vertical Portrait)
Text Style Guidelines: ${safeTextStyle}

⚠️⚠️⚠️ ABSOLUTE SIZE REQUIREMENT - CRITICAL - NO EXCEPTIONS ⚠️⚠️⚠️
The image must be EXACTLY 740 pixels wide × 1280 pixels high.
Calculation: 370px × 2 columns = 740px width, 320px × 4 rows = 1280px height.

🚫🚫🚫 ABSOLUTELY FORBIDDEN - NO GRID LINES, NO SEPARATORS, NO GAPS 🚫🚫🚫
**CRITICAL: DO NOT DRAW ANY LINES, BORDERS, DIVIDERS, OR SEPARATORS BETWEEN CELLS.**
**FORBIDDEN ELEMENTS - ABSOLUTE PROHIBITION:**
- ❌ NO vertical lines between columns (especially at x=370)
- ❌ NO horizontal lines between rows (especially at y=320, 640, 960)
- ❌ NO cross lines (十字線) or intersection lines
- ❌ NO grid lines of any kind, thickness, or color
- ❌ NO borders around cells or around the entire grid
- ❌ NO gaps or spaces between cells
- ❌ NO visible separators, dividers, or boundaries
- ❌ NO dividing lines, even if they are subtle or faint
- ❌ NO dark lines, light lines, or any colored lines between cells
- ❌ NO shadows or outlines that create visual separation
**The 8 cells must be SEAMLESSLY CONNECTED with ZERO visible separators.**
**The entire image must appear as ONE CONTINUOUS SURFACE with 8 distinct sticker areas.**
**Cells should touch each other DIRECTLY with NO lines, NO borders, NO gaps, NO dividers.**
**Think of it as ONE single image divided into 8 areas by content only, NOT by lines.**
**IMPORTANT: Even if you think a line would help organize the layout, DO NOT draw it. The cells must blend seamlessly.**

⚠️⚠️⚠️ CELL BOUNDARY REQUIREMENT - STRICT - MANDATORY ⚠️⚠️⚠️
Each cell is EXACTLY 370 pixels wide × 320 pixels high.
**ALL content in each cell MUST be contained WITHIN its 370×320 pixel boundary.**
**NO content can extend beyond the cell boundaries.**
**Each cell is like a separate 370×320 canvas - content must fit completely inside.**

Strict Grid Boundaries (pixel coordinates):
- Column 1: x = 0 to 369 (exactly 370px wide)
- Column 2: x = 370 to 739 (exactly 370px wide)
- Row 1: y = 0 to 319 (exactly 320px high)
- Row 2: y = 320 to 639 (exactly 320px high)
- Row 3: y = 640 to 959 (exactly 320px high)
- Row 4: y = 960 to 1279 (exactly 320px high)

Cell Positions and Content:
- Cell 1 (Row 1, Col 1): x=0-369, y=0-319 (370×320) - ${stickers[0]?.description || 'N/A'}, text: "${stickers[0]?.text || ''}"
- Cell 2 (Row 1, Col 2): x=370-739, y=0-319 (370×320) - ${stickers[1]?.description || 'N/A'}, text: "${stickers[1]?.text || ''}"
- Cell 3 (Row 2, Col 1): x=0-369, y=320-639 (370×320) - ${stickers[2]?.description || 'N/A'}, text: "${stickers[2]?.text || ''}"
- Cell 4 (Row 2, Col 2): x=370-739, y=320-639 (370×320) - ${stickers[3]?.description || 'N/A'}, text: "${stickers[3]?.text || ''}"
- Cell 5 (Row 3, Col 1): x=0-369, y=640-959 (370×320) - ${stickers[4]?.description || 'N/A'}, text: "${stickers[4]?.text || ''}"
- Cell 6 (Row 3, Col 2): x=370-739, y=640-959 (370×320) - ${stickers[5]?.description || 'N/A'}, text: "${stickers[5]?.text || ''}"
- Cell 7 (Row 4, Col 1): x=0-369, y=960-1279 (370×320) - ${stickers[6]?.description || 'N/A'}, text: "${stickers[6]?.text || ''}"
- Cell 8 (Row 4, Col 2): x=370-739, y=960-1279 (370×320) - ${stickers[7]?.description || 'N/A'}, text: "${stickers[7]?.text || ''}"

MANDATORY REQUIREMENTS FOR EACH CELL:
1. **Content Boundary**: ALL visual content (character, text, background) MUST be within the cell's 370×320 pixel area
2. **No Overflow**: NO part of the character, text, or any element can extend beyond the cell boundaries
3. **Complete Containment**: Think of each cell as a separate 370×320 canvas - everything must fit inside
4. **Character**: Must fit within the cell, scaled appropriately to fit in 370×320
5. **Text**: Must be positioned within the cell boundaries, with clear background box
6. **Background**: White background within each cell's 370×320 area
7. **Text appears ONCE**: Each text must appear exactly once in its designated cell
8. **Text visibility**: Text must have a clear, solid color background box (bright, contrasting colors)

Layout Rules:
- Each cell is completely independent
- Content in one cell cannot overlap or extend into adjacent cells
- Maintain character consistency across all 8 cells
- Each cell should be a complete, self-contained sticker design
- Safe, family-friendly content
- **ABSOLUTELY NO grid lines, borders, dividers, or gaps between cells - seamless connection**
- **Cells must touch each other directly with ZERO visible separators**
- **NO cross lines (十字線), NO vertical lines, NO horizontal lines**
- **The image should look like ONE continuous surface, NOT 8 separate boxes with lines**

VERIFICATION CHECKLIST:
✓ Image is exactly 740×1280 pixels
✓ Each cell is exactly 370×320 pixels
✓ All content in Cell 1 is within x=0-369, y=0-319
✓ All content in Cell 2 is within x=370-739, y=0-319
✓ All content in Cell 3 is within x=0-369, y=320-639
✓ All content in Cell 4 is within x=370-739, y=320-639
✓ All content in Cell 5 is within x=0-369, y=640-959
✓ All content in Cell 6 is within x=370-739, y=640-959
✓ All content in Cell 7 is within x=0-369, y=960-1279
✓ All content in Cell 8 is within x=370-739, y=960-1279
✓ No content extends beyond cell boundaries
✓ **NO vertical lines between columns (x=370)**
✓ **NO horizontal lines between rows (y=320, 640, 960)**
✓ **NO cross lines (十字線) anywhere in the image**
✓ **NO grid lines, borders, or dividers of any kind**
✓ **Cells are seamlessly connected with ZERO visible separators**

FINAL INSTRUCTION:
Generate the complete 8-grid image with STRICT adherence to cell boundaries. Each cell must be a perfect 370×320 pixel box with all content contained within. **MOST IMPORTANTLY: The image must appear as ONE CONTINUOUS SURFACE with NO lines, NO borders, NO gaps, and NO separators between the 8 cells. The cells should blend seamlessly together.**`

  try {
    if (!characterImageDataUrl) {
      throw new Error('角色圖片數據為空')
    }
    
    let base64Data
    if (characterImageDataUrl.includes(',')) {
      base64Data = characterImageDataUrl.split(',')[1]
    } else {
      base64Data = characterImageDataUrl
    }
    
    if (!base64Data || base64Data.length === 0) {
      throw new Error('無法提取圖片 base64 數據')
    }
    
    base64Data = base64Data.trim().replace(/\s/g, '')
    
    if (!/^[A-Za-z0-9+/=]+$/.test(base64Data)) {
      throw new Error('base64 數據格式無效')
    }
    
    if (base64Data.length < 100) {
      throw new Error('base64 數據長度不足')
    }

    const requestBody = {
      contents: [{
        parts: [
          {
            text: prompt
          },
          {
            inlineData: {
              mimeType: 'image/png',
              data: base64Data
            }
          }
        ]
      }],
      generationConfig: {
        temperature: 0.8,
        topK: 40,
        topP: 0.95,
        maxOutputTokens: 2048,
      }
    }
    
    console.log('發送8宮格圖片生成請求:', {
      promptLength: prompt.length,
      base64Length: base64Data.length,
      stickersCount: stickers.length
    })

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 90000) // 8宮格需要更長時間，90秒

    let response
    try {
      response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-image-preview:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(requestBody),
          signal: controller.signal
        }
      )
      clearTimeout(timeoutId)
    } catch (fetchError) {
      clearTimeout(timeoutId)
      if (fetchError.name === 'AbortError') {
        throw new Error('請求超時（超過90秒），請稍後再試')
      }
      throw fetchError
    }

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      console.error('API 錯誤詳情:', {
        status: response.status,
        statusText: response.statusText,
        error: errorData
      })
      const errorMessage = errorData.error?.message || errorData.message || response.statusText
      throw new Error(`API 錯誤: ${errorMessage}`)
    }

    const data = await response.json()
    console.log('生成8宮格 - API 完整回應:', JSON.stringify(data, null, 2))
    
    if (data.error) {
      throw new Error(`API 錯誤: ${data.error.message || JSON.stringify(data.error)}`)
    }
    
    if (data.candidates && data.candidates[0]) {
      const candidate = data.candidates[0]
      
      if (candidate.finishReason && candidate.finishReason !== 'STOP') {
        console.warn('Finish reason:', candidate.finishReason)
        const finishMessage = candidate.finishMessage || ''
        
        if (candidate.finishReason === 'SAFETY' || candidate.finishReason === 'IMAGE_SAFETY') {
          const errorMsg = finishMessage || '生成的圖片被 Google 安全過濾器阻止。'
          throw new Error(`圖片生成被安全過濾器阻止。\n\n詳細信息：${errorMsg}`)
        }
        if (candidate.finishReason === 'RECITATION') {
          throw new Error('內容可能包含受版權保護的內容，請調整描述')
        }
      }
      
      if (candidate.content && candidate.content.parts) {
        for (const part of candidate.content.parts) {
          if (part.inlineData) {
            return `data:${part.inlineData.mimeType || 'image/png'};base64,${part.inlineData.data}`
          }
          if (part.image && part.image.url) {
            const imageResponse = await fetch(part.image.url)
            const blob = await imageResponse.blob()
            return await blobToDataURL(blob)
          }
          if (part.image && part.image.data) {
            return `data:image/png;base64,${part.image.data}`
          }
        }
      }
      
      if (candidate.imageData) {
        return `data:image/png;base64,${candidate.imageData}`
      }
    }

    if (data.images && data.images.length > 0) {
      const imageData = data.images[0]
      if (imageData.base64) {
        return `data:image/png;base64,${imageData.base64}`
      }
      if (imageData.url) {
        const imageResponse = await fetch(imageData.url)
        const blob = await imageResponse.blob()
        return await blobToDataURL(blob)
      }
    }

    console.error('無法找到圖片數據，完整回應:', data)
    throw new Error(`API 回應中沒有找到圖片數據。回應格式: ${JSON.stringify(data).substring(0, 500)}`)
  } catch (error) {
    console.error('生成8宮格失敗:', error)
    throw error
  }
}

/**
 * 生成帶文字的貼圖圖片（用於 8 宮格）
 * @param {string} apiKey - Gemini API Key
 * @param {string} characterImageDataUrl - 角色圖片（Data URL）
 * @param {string} description - 圖片描述
 * @param {string} text - 要添加的文字
 * @param {string} textStyleDescription - 文字樣式描述
 * @param {number} width - 圖片寬度
 * @param {number} height - 圖片高度
 * @returns {Promise<string>} 生成的圖片 Data URL
 */
export async function generateStickerWithText(
  apiKey,
  characterImageDataUrl,
  description,
  text,
  textStyleDescription = '',
  width = 370,
  height = 320
) {
  // 確保 textStyleDescription 不是 undefined 或空
  const safeTextStyle = textStyleDescription && textStyleDescription.trim() 
    ? textStyleDescription.trim() 
    : 'Cute and clear style with visible text box'

  // 構建更嚴格的 prompt，確保文字只出現一次
  const textInstruction = `⚠️ ABSOLUTE REQUIREMENT - NO EXCEPTIONS ⚠️
The text "${text}" MUST appear EXACTLY ONE TIME in the image.
- Write "${text}" ONCE, not twice, not three times
- DO NOT repeat "${text}" anywhere in the image
- DO NOT duplicate "${text}" in any form
- Place "${text}" in ONE single location
- Before finalizing, verify "${text}" appears only 1 time (count it: must be 1, not 2 or more)`

  const textStyleInstruction = `🎨 TEXT STYLE REQUIREMENT - CRITICAL 🎨
The text "${text}" must have a CLEAR and VISIBLE text box/background:
- Add a solid color background box behind the text "${text}"
- Use bright, contrasting colors (white, yellow, light blue, pink, etc.)
- The text box should have clear borders or shadows
- Ensure the text "${text}" is highly visible against dark LINE backgrounds
- The text box color should contrast strongly with the text color
- Recommended: White or light colored text box with dark text, OR dark text box with white/light text
- The text box should be clearly defined, not transparent or faint
- Make sure the text "${text}" stands out clearly and is easily readable`

  // 清理描述和文字，避免觸發安全過濾
  const cleanDescription = description.trim()
  const cleanText = text.trim()
  
  const prompt = `Create a cute and friendly LINE sticker style illustration.

Character Reference: Use the provided character image as reference for style and appearance.
Scene Description: ${cleanDescription}
Text Content: "${cleanText}"
Text Style Guidelines: ${safeTextStyle}

${textInstruction}

${textStyleInstruction}

IMPORTANT: Follow the text style description "${safeTextStyle}" consistently. All text in this image must use the same style.

Technical Requirements:
1. Use the character design from the reference image
2. Maintain visual consistency with the reference character
3. Display the text "${cleanText}" exactly once in a single, clear location
4. Add a solid, brightly colored background box behind the text "${cleanText}" for visibility
5. Use bright, contrasting colors (white, yellow, light blue, pink) for the text box
6. White background (solid white color, not transparent)
7. Exact image dimensions: ${width}px width × ${height}px height
8. Cute, expressive, and friendly illustration style suitable for messaging stickers
9. High quality, professional digital illustration
10. Safe, appropriate, and family-friendly content

Final Verification: 
- Ensure the text "${cleanText}" appears exactly 1 time (count: must be 1)
- Verify the text "${cleanText}" has a clear, visible background box
- Confirm the text is readable on both light and dark backgrounds`

  try {
    // 檢查並提取 base64 數據
    if (!characterImageDataUrl) {
      throw new Error('角色圖片數據為空')
    }
    
    let base64Data
    if (characterImageDataUrl.includes(',')) {
      base64Data = characterImageDataUrl.split(',')[1]
    } else {
      base64Data = characterImageDataUrl
    }
    
    if (!base64Data || base64Data.length === 0) {
      throw new Error('無法提取圖片 base64 數據')
    }
    
    // 清理 base64 數據（移除可能的空白字符）
    base64Data = base64Data.trim().replace(/\s/g, '')
    
    // 驗證 base64 格式
    if (!/^[A-Za-z0-9+/=]+$/.test(base64Data)) {
      throw new Error('base64 數據格式無效，包含非法字符')
    }
    
    // 檢查 base64 長度（圖片應該有一定大小）
    if (base64Data.length < 100) {
      throw new Error('base64 數據長度不足，可能不是有效的圖片數據')
    }

    // 構建請求體
    // 注意：根據最初可用的版本，應該包含 maxOutputTokens
    const requestBody = {
      contents: [{
        parts: [
          {
            text: prompt
          },
          {
            inlineData: {
              mimeType: 'image/png',
              data: base64Data
            }
          }
        ]
      }],
      generationConfig: {
        temperature: 0.8,
        topK: 40,
        topP: 0.95,
        maxOutputTokens: 2048,
      }
    }
    
    console.log('發送圖片生成請求:', {
      promptLength: prompt.length,
      base64Length: base64Data.length,
      model: 'gemini-3-pro-image-preview'
    })

    // 添加超時控制（60秒）
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 60000)

    let response
    try {
      response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-image-preview:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(requestBody),
          signal: controller.signal
        }
      )
      clearTimeout(timeoutId)
    } catch (fetchError) {
      clearTimeout(timeoutId)
      if (fetchError.name === 'AbortError') {
        throw new Error('請求超時（超過60秒），請稍後再試或減少同時生成的數量')
      }
      throw fetchError
    }

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      console.error('API 錯誤詳情:', {
        status: response.status,
        statusText: response.statusText,
        error: errorData
      })
      const errorMessage = errorData.error?.message || errorData.message || response.statusText
      throw new Error(`API 錯誤: ${errorMessage}`)
    }

    const data = await response.json()
    console.log('生成貼圖 - API 完整回應:', JSON.stringify(data, null, 2))
    
    // 檢查是否有錯誤
    if (data.error) {
      throw new Error(`API 錯誤: ${data.error.message || JSON.stringify(data.error)}`)
    }
    
    // 檢查 finishReason
    if (data.candidates && data.candidates[0]) {
      const candidate = data.candidates[0]
      
      if (candidate.finishReason && candidate.finishReason !== 'STOP') {
        console.warn('Finish reason:', candidate.finishReason)
        if (candidate.finishReason === 'SAFETY' || candidate.finishReason === 'IMAGE_SAFETY') {
          const finishMessage = candidate.finishMessage || ''
          const errorMsg = finishMessage || '生成的圖片被 Google 安全過濾器阻止。這可能是因為 prompt 中的某些內容觸發了安全策略。'
          throw new Error(`圖片生成被安全過濾器阻止。\n\n建議：\n1. 嘗試調整描述文字，避免可能敏感的內容\n2. 簡化 prompt，使用更中性的描述\n3. 如果認為這是誤判，可以向 Google 反饋\n\n詳細信息：${errorMsg}`)
        }
        if (candidate.finishReason === 'RECITATION') {
          throw new Error('內容可能包含受版權保護的內容')
        }
      }
      
      // 檢查 content.parts
      if (candidate.content && candidate.content.parts) {
        for (const part of candidate.content.parts) {
          // 檢查內聯圖片數據
          if (part.inlineData) {
            return `data:${part.inlineData.mimeType || 'image/png'};base64,${part.inlineData.data}`
          }
          // 檢查圖片 URL
          if (part.image && part.image.url) {
            const imageResponse = await fetch(part.image.url)
            const blob = await imageResponse.blob()
            return await blobToDataURL(blob)
          }
          // 檢查是否有 base64 數據
          if (part.image && part.image.data) {
            return `data:image/png;base64,${part.image.data}`
          }
        }
      }
      
      // 檢查是否有直接的圖片數據
      if (candidate.imageData) {
        return `data:image/png;base64,${candidate.imageData}`
      }
      
      // 如果只有文本回應，記錄並拋出錯誤
      if (candidate.content && candidate.content.parts) {
        const textParts = candidate.content.parts.filter(p => p.text)
        if (textParts.length > 0) {
          console.error('API 返回了文本而不是圖片:', textParts.map(p => p.text).join('\n'))
          throw new Error(`API 返回了文本回應而不是圖片。回應內容: ${textParts[0].text.substring(0, 200)}`)
        }
      }
    }

    // 如果標準格式沒有圖片，嘗試其他可能的格式
    if (data.images && data.images.length > 0) {
      const imageData = data.images[0]
      if (imageData.base64) {
        return `data:image/png;base64,${imageData.base64}`
      }
      if (imageData.url) {
        const imageResponse = await fetch(imageData.url)
        const blob = await imageResponse.blob()
        return await blobToDataURL(blob)
      }
    }

    // 詳細的錯誤信息
    console.error('無法找到圖片數據，完整回應:', data)
    throw new Error(`API 回應中沒有找到圖片數據。回應格式: ${JSON.stringify(data).substring(0, 500)}`)
  } catch (error) {
    console.error('生成貼圖失敗:', error)
    throw error
  }
}

/**
 * 將 Blob 轉換為 Data URL
 */
async function blobToDataURL(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => resolve(reader.result)
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}
