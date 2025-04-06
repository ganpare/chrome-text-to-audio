class AudioDatabase {
  static instance = null;

  constructor() {
    this.storageKey = 'kokoroTtsAudios';
  }

  static getInstance() {
    if (!AudioDatabase.instance) {
      AudioDatabase.instance = new AudioDatabase();
      console.log('Created new AudioDatabase instance');
    }
    return AudioDatabase.instance;
  }

  // 互換性のためだけの関数
  async openDB() {
    console.log('Chrome Storage API is already available');
    return true;
  }

  // 音声データを保存
  async saveAudio(audioBlob, text, voiceType = 'af_heart') {
    console.log('Saving audio data...', new Date().toISOString());

    try {
      // Blobをbase64に変換
      const base64 = await this.blobToBase64(audioBlob);

      // 既存のデータを取得
      let audios = await this.getAudioList();

      // 新しい音声データを作成
      const timestamp = new Date();
      const newAudio = {
        id: Date.now(),
        blobData: base64,
        text: text && typeof text === 'string' ? text.substring(0, 1000) : '音声データ',
        timestamp: timestamp.getTime(),
        fileSize: audioBlob.size,
        mimeType: audioBlob.type,
        voiceType: voiceType // 音声タイプを保存
      };

      // 配列に追加
      audios.push(newAudio);

      // 保存
      await chrome.storage.local.set({ [this.storageKey]: audios });
      console.log('Audio saved successfully with ID:', newAudio.id);

      return newAudio.id;
    } catch (error) {
      console.error('Error in saveAudio:', error);
      throw error;
    }
  }

  // Blobをbase64に変換
  blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  // base64をBlobに変換
  base64ToBlob(base64, mimeType) {
    try {
      // Data URL形式からbase64部分を抽出
      const parts = base64.split(',');
      const byteString = atob(parts[1]);

      // バイナリデータに変換
      const ab = new ArrayBuffer(byteString.length);
      const ia = new Uint8Array(ab);
      for (let i = 0; i < byteString.length; i++) {
        ia[i] = byteString.charCodeAt(i);
      }

      return new Blob([ab], { type: mimeType || 'audio/wav' });
    } catch (error) {
      console.error('Error converting base64 to blob:', error);
      return null;
    }
  }

  // 音声リストを取得
  async getAudioList() {
    console.log('Getting audio list...');

    try {
      const result = await chrome.storage.local.get(this.storageKey);
      const audios = result[this.storageKey] || [];
      console.log(`Retrieved ${audios.length} audio records`);
      return audios;
    } catch (error) {
      console.error('Error in getAudioList:', error);
      return [];
    }
  }

  // 特定の音声データを取得
  async getAudio(id) {
    console.log('Getting audio with ID:', id);

    if (!id) {
      throw new Error('無効なIDです');
    }

    try {
      // 全てのデータを取得
      const audios = await this.getAudioList();

      // 指定されたIDのデータを検索
      const audio = audios.find(a => a.id === id);

      if (!audio) {
        console.warn(`Audio ID ${id} not found`);
        return null;
      }

      // base64データをBlobに変換して返す
      if (audio.blobData) {
        audio.blob = this.base64ToBlob(audio.blobData, audio.mimeType);
        console.log(`Found audio ID ${id}, created blob: ${audio.blob.size} bytes`);
      }

      return audio;
    } catch (error) {
      console.error('Error in getAudio:', error);
      throw error;
    }
  }

  // 音声データを削除
  async deleteAudio(id) {
    console.log('Deleting audio with ID:', id);

    if (!id) {
      throw new Error('無効なIDです');
    }

    try {
      // 全てのデータを取得
      let audios = await this.getAudioList();

      // 指定されたIDのデータを除外
      const newAudios = audios.filter(a => a.id !== id);

      // 保存
      await chrome.storage.local.set({ [this.storageKey]: newAudios });
      console.log(`Audio ID ${id} deleted successfully`);

      return true;
    } catch (error) {
      console.error('Error in deleteAudio:', error);
      throw error;
    }
  }

  // データベース状態の確認（互換性のため）
  async checkDatabaseState() {
    try {
      const audios = await this.getAudioList();

      return {
        isOpen: true,
        objectStoreExists: true,
        recordCount: audios.length,
        dbName: 'chromeStorage',
        dbVersion: 1
      };
    } catch (error) {
      console.error('Error checking database state:', error);
      return {
        isOpen: false,
        objectStoreExists: false,
        recordCount: 0,
        error: error.message
      };
    }
  }
}