import JSZip from 'jszip'
import { resizeImage } from './imageUtils'

/**
 * 將 Data URL 轉換為 Blob
 * @param {string} dataUrl - Data URL
 * @returns {Blob} Blob 物件
 */
function dataURLtoBlob(dataUrl) {
  const arr = dataUrl.split(',')
  const mime = arr[0].match(/:(.*?);/)[1]
  const bstr = atob(arr[1])
  let n = bstr.length
  const u8arr = new Uint8Array(n)
  while (n--) {
    u8arr[n] = bstr.charCodeAt(n)
  }
  return new Blob([u8arr], { type: mime })
}

/**
 * 打包並下載所有圖片為 ZIP 檔案
 * @param {Array} images - 貼圖圖片陣列 [{index, description, dataUrl}, ...]
 * @param {string} mainImage - 主要圖片 Data URL
 * @param {string} tabImage - 標籤圖片 Data URL
 * @param {string} theme - 主題名稱（用於檔案命名）
 */
export async function downloadAsZip(images, mainImage, tabImage, theme) {
  try {
    const zip = new JSZip()
    const folder = zip.folder(theme || 'LINE_Stickers')

    // 添加主要圖片
    if (mainImage) {
      try {
        const resizedMain = await resizeImage(mainImage, 240, 240)
        const mainBlob = dataURLtoBlob(resizedMain)
        folder.file('main.png', mainBlob)
      } catch (err) {
        console.error('主要圖片縮放失敗，使用原圖', err)
        const mainBlob = dataURLtoBlob(mainImage)
        folder.file('main.png', mainBlob)
      }
    }

    // 添加標籤圖片
    if (tabImage) {
      try {
        const resizedTab = await resizeImage(tabImage, 96, 74)
        const tabBlob = dataURLtoBlob(resizedTab)
        folder.file('tab.png', tabBlob)
      } catch (err) {
        console.error('標籤圖片縮放失敗，使用原圖', err)
        const tabBlob = dataURLtoBlob(tabImage)
        folder.file('tab.png', tabBlob)
      }
    }

    // 添加貼圖圖片
    images.forEach((img) => {
      const blob = dataURLtoBlob(img.dataUrl)
      // 檔案名格式：01.png, 02.png, ...
      const index = img.index || 1
      const filename = `${String(index).padStart(2, '0')}.png`
      folder.file(filename, blob)
    })

    // 生成 ZIP 檔案
    const zipBlob = await zip.generateAsync({ type: 'blob' })

    // 創建下載連結
    const url = URL.createObjectURL(zipBlob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${theme || 'LINE_Stickers'}_${new Date().getTime()}.zip`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  } catch (error) {
    console.error('ZIP 打包錯誤:', error)
    throw new Error(`打包失敗: ${error.message}`)
  }
}
