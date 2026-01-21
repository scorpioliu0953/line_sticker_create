import { GoogleGenerativeAI } from '@google/generative-ai'

/**
 * 生成文字風格描述（如果未提供）
 * @param {string} apiKey - Gemini API Key
 * @param {string} theme - 主題說明
 * @param {string} characterDescription - 角色描述
 * @returns {Promise<string>} 文字風格描述
 */
export async function generateTextStyle(apiKey, theme, characterDescription) {
  try {
    const genAI = new GoogleGenerativeAI(apiKey)
    const model = genAI.getGenerativeModel({ model: 'gemini-3-pro-preview' })

    const prompt = `你是一個專業的 LINE 貼圖設計師。根據以下資訊，生成文字風格描述。

主題說明：${theme}
角色描述：${characterDescription}

請生成一個簡潔的文字風格描述，說明：
1. 文字應該使用的風格（例如：可愛、簡潔、粗體、圓潤等）
2. 文字的顏色建議
3. 文字的大小和位置建議
4. 文字應該傳達的感覺
5. **重要**：文字框的背景顏色（必須使用明亮、對比強烈的顏色，如白色、黃色、淺藍色等，確保在深色 LINE 背景下也能清晰可見）

請用 1-3 句話簡潔描述，直接輸出描述文字，不要其他說明。`

    // 添加重試機制
    let result = null
    let response = null
    let retryCount = 0
    const maxRetries = 3
    
    while (retryCount < maxRetries) {
      try {
        result = await model.generateContent(prompt)
        response = await result.response
        return response.text().trim()
      } catch (error) {
        retryCount++
        const errorMessage = error.message || error.toString() || ''
        const isOverloaded = errorMessage.includes('overloaded') || 
                            errorMessage.includes('overload') ||
                            errorMessage.includes('503')
        
        if (retryCount < maxRetries) {
          const baseDelay = isOverloaded ? 10000 : 5000
          const delay = baseDelay * Math.pow(2, retryCount - 1)
          console.warn(`生成文字風格失敗，重試中 (${retryCount}/${maxRetries})...`, errorMessage)
          await new Promise(resolve => setTimeout(resolve, delay))
        } else {
          console.error('生成文字風格失敗，已重試', maxRetries, '次:', error)
          // 如果重試失敗，返回預設值
          return '可愛簡潔的風格，文字清晰易讀'
        }
      }
    }
    
    return '可愛簡潔的風格，文字清晰易讀'
  } catch (error) {
    console.error('生成文字風格失敗:', error)
    return '可愛簡潔的風格，文字清晰易讀'
  }
}

/**
 * 使用 Gemini API 生成圖片描述和文字
 * @param {string} apiKey - Gemini API Key
 * @param {string} theme - 主題說明
 * @param {string} textStyle - 文字風格描述
 * @param {number} count - 需要生成的圖片數量
 * @param {Array<string>} excludedTexts - 要排除的文字列表（可選）
 * @returns {Promise<Array<{description: string, text: string}>>} 圖片描述和文字陣列
 */
export async function generateImageDescriptionsWithText(apiKey, theme, textStyle, count, excludedTexts = []) {
  try {
    const genAI = new GoogleGenerativeAI(apiKey)
    const model = genAI.getGenerativeModel({ model: 'gemini-3-pro-preview' })

    // 構建排除文字的提示
    let excludedTextsPrompt = ''
    if (excludedTexts && excludedTexts.length > 0) {
      const excludedList = excludedTexts.join('、')
      excludedTextsPrompt = `
⚠️⚠️⚠️ 絕對禁止使用以下文字（這些文字已經在之前的系列中使用過，必須完全避免）：
${excludedTexts.map(text => `- "${text}"`).join('\n')}

**嚴格禁止**：
- 不能使用以上任何一個文字
- 不能使用與以上文字相似或包含以上文字的文字
- 不能使用以上文字的任何變體、同義詞或相似表達
- 生成的文字必須與以上所有文字完全不同
`
    }

    const prompt = `你是一個專業的 LINE 貼圖設計師。根據以下主題和文字風格，生成 ${count} 個不同的貼圖圖片描述和要添加的文字。

主題說明：${theme}
文字風格：${textStyle}
${excludedTextsPrompt}
嚴格要求：
1. 每個描述應該對應一張獨特的貼圖圖片
2. **所有文字內容絕對不能重複，每個文字必須完全唯一**（例如：不能有「飛越越」和「飛越」這樣的重複，不能有「沒問題」出現兩次）
3. 文字內容不能有重複的字詞、短語或相似表達
4. ${excludedTexts && excludedTexts.length > 0 ? '**絕對不能使用已排除的文字列表中的任何文字**' : ''}
5. 風格要適合 LINE 貼圖（可愛、簡潔、表情豐富）
6. 人物或角色要保持一致性（如果是角色貼圖）
7. 每張貼圖應該有不同的表情、動作或情境
8. 描述要簡潔明確，適合用於圖片生成
9. 每張貼圖需要添加簡短的文字（1-5個字），文字要符合貼圖的情境和表情，並遵循文字風格：${textStyle}
10. 文字必須多樣化，避免使用相似的字詞組合

請仔細檢查，確保所有 ${count} 個文字都完全不相同，沒有任何重複或相似，${excludedTexts && excludedTexts.length > 0 ? '並且完全避開已排除的文字列表' : ''}。

請以 JSON 格式輸出，格式如下：
[
  {"description": "描述1", "text": "文字1"},
  {"description": "描述2", "text": "文字2"},
  ...
]

直接輸出 JSON 陣列，不要其他說明文字。`

    // 添加重試機制
    let result = null
    let response = null
    let text = null
    let retryCount = 0
    const maxRetries = 5
    
    while (retryCount < maxRetries && !text) {
      try {
        result = await model.generateContent(prompt)
        response = await result.response
        text = response.text()
        break // 成功，跳出循環
      } catch (error) {
        retryCount++
        const errorMessage = error.message || error.toString() || ''
        const isOverloaded = errorMessage.includes('overloaded') || 
                            errorMessage.includes('overload') ||
                            errorMessage.includes('503') ||
                            errorMessage.includes('請稍後再試')
        
        if (retryCount < maxRetries) {
          // 使用指數退避策略
          const baseDelay = isOverloaded ? 10000 : 5000
          const delay = baseDelay * Math.pow(2, retryCount - 1)
          
          console.warn(`生成文字描述失敗，重試中 (${retryCount}/${maxRetries})...`, errorMessage)
          await new Promise(resolve => setTimeout(resolve, delay))
        } else {
          // 最後一次重試失敗，拋出錯誤
          console.error(`生成文字描述失敗，已重試 ${maxRetries} 次:`, error)
          throw new Error(`生成圖片描述失敗（已重試 ${maxRetries} 次）: ${errorMessage}`)
        }
      }
    }
    
    if (!text) {
      throw new Error('生成文字描述失敗：無法獲取回應')
    }

    // 嘗試解析 JSON
    let items = []
    try {
      // 提取 JSON 部分（可能包含 markdown 代碼塊）
      const jsonMatch = text.match(/\[[\s\S]*\]/)
      if (jsonMatch) {
        items = JSON.parse(jsonMatch[0])
      } else {
        items = JSON.parse(text)
      }
    } catch (error) {
      // 如果 JSON 解析失敗，嘗試手動解析
      console.warn('JSON 解析失敗，嘗試手動解析:', error)
      const lines = text.split('\n').filter(line => line.trim())
      items = lines.slice(0, count).map((line, index) => {
        const match = line.match(/["']([^"']+)["']/)
        return {
          description: match ? match[1] : `貼圖 ${index + 1}`,
          text: `文字${index + 1}`
        }
      })
    }

    // 確保格式正確
    items = items.map(item => ({
      description: item.description || item.desc || `貼圖描述`,
      text: (item.text || item.txt || '文字').trim()
    }))

    // 檢查並移除重複的文字，以及與排除文字重複的文字
    const usedTexts = new Set()
    const excludedTextsSet = new Set(excludedTexts || [])
    const uniqueItems = []
    for (const item of items) {
      const text = item.text.trim()
      // 檢查是否與排除的文字重複
      if (excludedTextsSet.has(text)) {
        console.warn(`發現與排除文字重複: ${text}，已移除`)
        continue
      }
      // 檢查是否與已使用的文字重複
      if (!usedTexts.has(text)) {
        usedTexts.add(text)
        uniqueItems.push(item)
      } else {
        console.warn(`發現重複文字: ${text}，已移除`)
      }
    }
    items = uniqueItems

    // 如果生成的項目不足，補充一些
    if (items.length < count) {
      const additionalCount = count - items.length
      const existingTexts = Array.from(usedTexts).join('、')
      const excludedList = excludedTexts && excludedTexts.length > 0 ? excludedTexts.join('、') : ''
      const excludedTextsSection = excludedList ? `\n⚠️ 絕對禁止使用以下已排除的文字：${excludedList}` : ''
      
      const additionalPrompt = `根據主題「${theme}」和文字風格「${textStyle}」，再生成 ${additionalCount} 個不同的貼圖描述和文字。

嚴格要求：
1. 文字必須與以下已使用的文字完全不同：${existingTexts}
2. ${excludedList ? `**絕對不能使用以下已排除的文字：${excludedList}**` : ''}
3. 不能有任何重複、相似或包含已使用文字的情況
4. 每個文字必須完全唯一
5. 文字長度 1-5 個字
6. 遵循文字風格：${textStyle}
${excludedTextsSection}

以 JSON 格式輸出：[{"description": "描述", "text": "文字"}, ...]`
      
      try {
        // 補充生成也添加重試機制
        let additionalResult = null
        let additionalResponse = null
        let additionalText = null
        let additionalRetryCount = 0
        const additionalMaxRetries = 3
        
        while (additionalRetryCount < additionalMaxRetries && !additionalText) {
          try {
            additionalResult = await model.generateContent(additionalPrompt)
            additionalResponse = await additionalResult.response
            additionalText = additionalResponse.text()
            break
          } catch (e) {
            additionalRetryCount++
            const errorMessage = e.message || e.toString() || ''
            const isOverloaded = errorMessage.includes('overloaded') || 
                                errorMessage.includes('overload') ||
                                errorMessage.includes('503')
            
            if (additionalRetryCount < additionalMaxRetries) {
              const baseDelay = isOverloaded ? 10000 : 5000
              const delay = baseDelay * Math.pow(2, additionalRetryCount - 1)
              console.warn(`補充生成失敗，重試中 (${additionalRetryCount}/${additionalMaxRetries})...`)
              await new Promise(resolve => setTimeout(resolve, delay))
            } else {
              throw e
            }
          }
        }
        
        if (!additionalText) {
          throw new Error('補充生成失敗：無法獲取回應')
        }
        
        const additionalJsonMatch = additionalText.match(/\[[\s\S]*\]/)
        if (additionalJsonMatch) {
          const additionalItems = JSON.parse(additionalJsonMatch[0])
          const newItems = additionalItems.map(item => ({
            description: item.description || item.desc || `貼圖描述`,
            text: (item.text || item.txt || '文字').trim()
          }))
          
          // 再次檢查重複（包括排除文字）
          for (const newItem of newItems) {
            const text = newItem.text.trim()
            // 檢查是否與排除的文字重複
            if (excludedTextsSet.has(text)) {
              console.warn(`補充項目中發現與排除文字重複: ${text}，已移除`)
              continue
            }
            // 檢查是否與已使用的文字重複
            if (!usedTexts.has(text)) {
              usedTexts.add(text)
              items.push(newItem)
            } else {
              console.warn(`補充項目中發現重複文字: ${text}，已移除`)
            }
          }
        }
      } catch (e) {
        console.warn('補充生成失敗:', e)
      }
    }

    // 確保有足夠的項目（使用唯一編號避免重複）
    const usedIndices = new Set()
    while (items.length < count) {
      let index = items.length + 1
      while (usedIndices.has(index)) {
        index++
      }
      usedIndices.add(index)
      items.push({
        description: `${theme} - 表情 ${index}`,
        text: `貼${index}`
      })
    }

    // 最終檢查：確保所有文字都是唯一的，且不與排除文字重複
    const finalTexts = new Set()
    const finalItems = []
    for (const item of items) {
      let text = item.text.trim()
      // 如果與排除文字重複，添加編號
      if (excludedTextsSet.has(text)) {
        let counter = 1
        let uniqueText = `${text}${counter}`
        while (excludedTextsSet.has(uniqueText) || finalTexts.has(uniqueText)) {
          counter++
          uniqueText = `${text}${counter}`
        }
        text = uniqueText
        console.warn(`文字 "${item.text}" 與排除文字重複，已改為 "${text}"`)
      }
      // 如果與已使用的文字重複，添加編號
      if (finalTexts.has(text)) {
        let counter = 1
        let uniqueText = `${text}${counter}`
        while (excludedTextsSet.has(uniqueText) || finalTexts.has(uniqueText)) {
          counter++
          uniqueText = `${text}${counter}`
        }
        text = uniqueText
        console.warn(`文字 "${item.text}" 重複，已改為 "${text}"`)
      }
      finalTexts.add(text)
      finalItems.push({ ...item, text })
    }

    return finalItems.slice(0, count)
  } catch (error) {
    console.error('Gemini API 錯誤:', error)
    throw new Error(`生成圖片描述失敗: ${error.message}`)
  }
}
