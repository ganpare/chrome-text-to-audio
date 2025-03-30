// IndexedDBの初期化と操作を管理するクラス
class AudioDatabase {
  constructor() {
    this.dbName = 'audioStorage';
    this.dbVersion = 2;
    this.storeName = 'audioFiles';
    this._db = null;
  }

  // データベースを開く
  async openDB() {
    if (this._db) {
      console.log('Using existing database connection');
      return this._db;
    }

    return new Promise((resolve, reject) => {
      console.log('Opening database:', this.dbName);
      const request = indexedDB.open(this.dbName, this.dbVersion);

      request.onerror = () => {
        console.error('Database open error:', request.error);
        reject(request.error);
      };

      request.onsuccess = () => {
        console.log('Database opened successfully');
        this._db = request.result;
        resolve(this._db);
      };

      request.onupgradeneeded = (event) => {
        console.log('Database upgrade needed');
        const db = event.target.result;
        
        // 既存のオブジェクトストアを削除（バージョンアップグレード時）
        if (db.objectStoreNames.contains(this.storeName)) {
          db.deleteObjectStore(this.storeName);
        }

        // 新しいオブジェクトストアを作成
        console.log('Creating object store:', this.storeName);
        const store = db.createObjectStore(this.storeName, { keyPath: 'id', autoIncrement: true });
        
        // インデックスの作成
        store.createIndex('timestamp', 'timestamp', { unique: false });
        store.createIndex('text', 'text', { unique: false });
        store.createIndex('fileName', 'fileName', { unique: false });
        store.createIndex('duration', 'duration', { unique: false });
      };
    });
  }

  // 音声データを保存
  async saveAudio(audioBlob, originalText) {
    console.log('Saving audio with text:', originalText);
    const db = await this.openDB();

    // ファイル名の生成（タイムスタンプと元のテキストの一部を使用）
    const timestamp = new Date();
    const sanitizedText = originalText.slice(0, 20).replace(/[^a-z0-9]/gi, '_');
    const fileName = `audio_${timestamp.getTime()}_${sanitizedText}.wav`;

    // 音声の長さを取得
    let duration = 0;
    try {
      const audioElement = new Audio();
      audioElement.src = URL.createObjectURL(audioBlob);
      await new Promise((resolve) => {
        audioElement.addEventListener('loadedmetadata', () => {
          duration = audioElement.duration;
          URL.revokeObjectURL(audioElement.src);
          resolve();
        });
      });
    } catch (error) {
      console.warn('Failed to get audio duration:', error);
    }

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);

      const audio = {
        blob: audioBlob,
        text: originalText,
        timestamp: timestamp.toISOString(),
        fileName: fileName,
        duration: duration,
        fileSize: audioBlob.size,
        mimeType: audioBlob.type
      };

      const request = store.add(audio);

      request.onsuccess = () => {
        console.log('Audio saved successfully with ID:', request.result);
        resolve(request.result);
      };
      request.onerror = () => {
        console.error('Failed to save audio:', request.error);
        reject(request.error);
      };
    });
  }

  // 保存された音声の一覧を取得（メタデータのみ）
  async getAudioList() {
    console.log('getAudioList called');
    const db = await this.openDB();
    return new Promise((resolve, reject) => {
      try {
        console.log('Starting transaction for getAudioList');
        const transaction = db.transaction([this.storeName], 'readonly');
        const store = transaction.objectStore(this.storeName);
        const request = store.getAll();

        request.onsuccess = () => {
          const result = request.result;
          console.log('Raw database results:', result);
          
          const audioFiles = result.map(audio => ({
            id: audio.id,
            text: audio.text,
            timestamp: audio.timestamp,
            fileName: audio.fileName,
            duration: audio.duration,
            fileSize: audio.fileSize,
            mimeType: audio.mimeType
          }));
          
          console.log('Processed audio files:', audioFiles);
          console.log('Number of audio files found:', audioFiles.length);
          resolve(audioFiles);
        };

        request.onerror = () => {
          console.error('Error in getAudioList:', request.error);
          reject(request.error);
        };

        transaction.oncomplete = () => {
          console.log('Transaction completed successfully');
        };

        transaction.onerror = () => {
          console.error('Transaction error:', transaction.error);
        };
      } catch (error) {
        console.error('Error in getAudioList transaction:', error);
        reject(error);
      }
    });
  }

  // 特定のIDの音声を取得
  async getAudio(id) {
    console.log('Getting audio with ID:', id);
    const db = await this.openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([this.storeName], 'readonly');
      const store = transaction.objectStore(this.storeName);
      const request = store.get(id);

      request.onsuccess = () => {
        const audio = request.result;
        if (audio) {
          console.log('Retrieved audio:', audio.fileName);
        } else {
          console.log('Audio not found');
        }
        resolve(audio);
      };
      request.onerror = () => {
        console.error('Failed to get audio:', request.error);
        reject(request.error);
      };
    });
  }

  // 音声データを削除
  async deleteAudio(id) {
    const db = await this.openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);
      const request = store.delete(id);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }
}