
# Chrome拡張機能でのデータ保存：IndexedDBからChrome Storage APIへの移行ガイド

## はじめに

Chrome拡張機能でデータを永続的に保存する方法は複数ありますが、主に使われるのは以下の2つです：

1. **IndexedDB**: ブラウザ標準のNoSQLデータベースで、大量のデータやバイナリデータを扱える
2. **Chrome Storage API**: Chrome拡張機能専用のストレージAPIで、シンプルかつ信頼性が高い

この記事では、IndexedDBからChrome Storage APIへの移行方法と、特に**バイナリデータ（音声・画像など）の保存**について解説します。

## なぜIndexedDBよりChrome Storage APIが良いのか？

Chrome拡張機能でデータを保存する場合、以下の理由からChrome Storage APIが推奨されます：

- **信頼性**: Chrome自体が管理しているため、接続エラーが少ない
- **シンプルさ**: 単純なキー・バリューの仕組みで使いやすい
- **同期**: 拡張機能の複数のコンポーネント間で自動的に同期される
- **安定性**: バックグラウンドスクリプトとのやり取りが安定している

## Chrome Storage APIの基本

Chrome Storage APIには2種類あります：

- `chrome.storage.sync`: 複数のデバイス間で同期される（容量制限あり）
- `chrome.storage.local`: 現在のデバイスのみ（容量が大きい）

バイナリデータを保存する場合は、`chrome.storage.local`を使用します。

## 実装例：音声・画像データを保存するクラス

以下はChrome Storage APIを使って音声データを保存・管理するクラスの例です。

```javascript
class StorageManager {
  static instance = null;

  constructor() {
    this.storageKey = 'myExtensionData';
  }

  // シングルトンパターン
  static getInstance() {
    if (!StorageManager.instance) {
      StorageManager.instance = new StorageManager();
    }
    return StorageManager.instance;
  }

  // バイナリデータ（BlobやFile）をbase64エンコードに変換
  blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  // base64からBlobに戻す変換
  base64ToBlob(base64, mimeType) {
    try {
      const parts = base64.split(',');
      const byteString = atob(parts[1]);
      const ab = new ArrayBuffer(byteString.length);
      const ia = new Uint8Array(ab);
      
      for (let i = 0; i < byteString.length; i++) {
        ia[i] = byteString.charCodeAt(i);
      }
      
      return new Blob([ab], { type: mimeType || 'application/octet-stream' });
    } catch (error) {
      console.error('Error converting base64 to blob:', error);
      return null;
    }
  }

  // データを保存（バイナリ＋メタデータ）
  async saveData(binaryData, metadata = {}) {
    try {
      // バイナリをbase64に変換
      const base64 = await this.blobToBase64(binaryData);
      
      // 既存データを取得
      const result = await chrome.storage.local.get(this.storageKey);
      let items = result[this.storageKey] || [];
      
      // 新しいアイテムを作成
      const newItem = {
        id: Date.now(),                        // タイムスタンプをIDとして使用
        binaryData: base64,                    // base64エンコードされたバイナリ
        fileSize: binaryData.size,             // ファイルサイズ
        mimeType: binaryData.type,             // MIMEタイプ
        timestamp: new Date().getTime(),       // 保存時刻
        ...metadata                            // その他のメタデータ
      };
      
      // 配列に追加
      items.push(newItem);
      
      // 保存
      await chrome.storage.local.set({ [this.storageKey]: items });
      console.log('Data saved successfully with ID:', newItem.id);
      
      return newItem.id;
    } catch (error) {
      console.error('Error saving data:', error);
      throw error;
    }
  }

  // データ一覧を取得
  async getItemList() {
    try {
      const result = await chrome.storage.local.get(this.storageKey);
      return result[this.storageKey] || [];
    } catch (error) {
      console.error('Error getting item list:', error);
      return [];
    }
  }

  // 特定のデータを取得（IDで検索）
  async getItem(id) {
    try {
      const items = await this.getItemList();
      const item = items.find(item => item.id === id);
      
      if (!item) return null;
      
      // base64データをBlobに変換
      if (item.binaryData) {
        item.blob = this.base64ToBlob(item.binaryData, item.mimeType);
      }
      
      return item;
    } catch (error) {
      console.error('Error getting item:', error);
      return null;
    }
  }

  // データを削除
  async deleteItem(id) {
    try {
      const items = await this.getItemList();
      const newItems = items.filter(item => item.id !== id);
      
      await chrome.storage.local.set({ [this.storageKey]: newItems });
      return true;
    } catch (error) {
      console.error('Error deleting item:', error);
      return false;
    }
  }
}
```

## 使用例

### データの保存

```javascript
// インスタンスを取得
const storage = StorageManager.getInstance();

// 音声ファイル（BlobまたはFile）を保存
async function saveAudioFile(audioBlob, title) {
  try {
    const id = await storage.saveData(audioBlob, {
      title: title,
      duration: audioDuration,  // 音声の長さ（秒）
      category: 'audio'         // カテゴリ（任意）
    });
    console.log('Audio saved with ID:', id);
    return id;
  } catch (error) {
    console.error('Failed to save audio:', error);
    return null;
  }
}
```

### データの取得と再生

```javascript
// 保存した音声を再生
async function playAudio(id) {
  try {
    // データを取得
    const audioData = await storage.getItem(id);
    
    if (!audioData || !audioData.blob) {
      throw new Error('Audio data not found');
    }
    
    // BlobからオブジェクトURLを作成
    const blobUrl = URL.createObjectURL(audioData.blob);
    
    // Audio要素で再生
    const audio = new Audio(blobUrl);
    
    // 再生終了時のクリーンアップ
    audio.onended = () => {
      URL.revokeObjectURL(blobUrl);
    };
    
    // 再生開始
    await audio.play();
    return true;
  } catch (error) {
    console.error('Error playing audio:', error);
    return false;
  }
}
```

### 一覧表示

```javascript
// 保存されたデータを一覧表示
async function displaySavedItems() {
  const container = document.getElementById('item-list');
  container.innerHTML = '';
  
  try {
    const items = await storage.getItemList();
    
    if (items.length === 0) {
      container.innerHTML = '<div class="empty-state">保存されたデータはありません</div>';
      return;
    }
    
    // 日付でソート（新しい順）
    items.sort((a, b) => b.timestamp - a.timestamp);
    
    // 各アイテムをDOM要素として追加
    items.forEach(item => {
      const element = document.createElement('div');
      element.className = 'item';
      element.innerHTML = `
        <div class="item-title">${item.title || 'Untitled'}</div>
        <div class="item-meta">
          <span>${new Date(item.timestamp).toLocaleString()}</span>
          <span>${(item.fileSize / 1024).toFixed(1)} KB</span>
        </div>
        <div class="item-actions">
          <button class="play-btn">再生</button>
          <button class="delete-btn">削除</button>
        </div>
      `;
      
      // 再生ボタンのイベントリスナー
      element.querySelector('.play-btn').addEventListener('click', () => {
        playAudio(item.id);
      });
      
      // 削除ボタンのイベントリスナー
      element.querySelector('.delete-btn').addEventListener('click', async () => {
        if (confirm('削除してもよろしいですか？')) {
          await storage.deleteItem(item.id);
          displaySavedItems(); // リストを更新
        }
      });
      
      container.appendChild(element);
    });
  } catch (error) {
    console.error('Error displaying items:', error);
    container.innerHTML = `<div class="error-state">エラーが発生しました: ${error.message}</div>`;
  }
}
```

## 移行のポイント

IndexedDBからChrome Storage APIへ移行する際の重要ポイント：

1. **バイナリデータの形式変換**:
   - IndexedDBではBlobを直接保存できるが、Chrome Storage APIでは文字列化（base64など）が必要
   - Base64エンコードとデコードの処理を追加する

2. **データ構造の再設計**:
   - オブジェクトストアの代わりにJSON配列を使用
   - インデックスクエリーの代わりにJavaScriptのfilter/findメソッドでフィルタリング

3. **エラーハンドリング**:
   - Chrome Storage APIではエラーパターンが少なく、より単純化できる

4. **データの同期**:
   - Chrome Storage APIではイベントリスナーを使ってデータ更新を検知可能
   ```javascript
   chrome.storage.onChanged.addListener((changes, namespace) => {
     if (namespace === 'local' && changes[this.storageKey]) {
       console.log('Storage data changed:', changes[this.storageKey]);
       // 更新処理
     }
   });
   ```

## 制限事項

Chrome Storage APIを使用する際の制限：

1. **ストレージ容量**: 
   - `chrome.storage.local`: 最大10MB（拡張機能ごと）
   - `chrome.storage.sync`: 最大100KB（キーごと）

2. **パフォーマンス**:
   - 大量のデータを扱う場合はIndexedDBの方が効率的な場合も
   - バイナリデータはbase64エンコードにより約33%サイズが増加

3. **クエリ機能**:
   - 高度なクエリやインデックスが必要な場合はIndexedDBの方が適している

## まとめ

Chrome拡張機能でのデータ保存において、IndexedDBよりもChrome Storage APIを使用することで、以下のメリットがあります：

- より安定した接続と操作
- シンプルなコード構造
- 拡張機能のコンポーネント間での自動同期
- エラー処理の簡素化

特に音声や画像のようなバイナリデータを扱う場合でも、base64エンコードを利用することで、Chrome Storage APIで効率的に管理できます。データ量が多くなる場合は、容量制限に注意しつつ、必要に応じて外部ストレージサービスとの連携も検討すると良いでしょう。
