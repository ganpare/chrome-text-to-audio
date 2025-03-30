// IndexedDBの初期化と操作を管理するクラス
class AudioDatabase {
  static instance = null;
  static db = null;
  static dbPromise = null;

  constructor() {
    if (AudioDatabase.instance) {
      return AudioDatabase.instance;
    }
    AudioDatabase.instance = this;
    this.dbName = 'audioStorage';
    this.dbVersion = 2;
    this.objectStoreName = 'audioStore';
  }

  static getInstance() {
    if (!AudioDatabase.instance) {
      AudioDatabase.instance = new AudioDatabase();
    }
    return AudioDatabase.instance;
  }

  // データベースを開く
  async openDB() {
    if (AudioDatabase.db) {
      console.log('Using existing database connection');
      return AudioDatabase.db;
    }

    if (AudioDatabase.dbPromise) {
      console.log('Using existing database promise');
      return AudioDatabase.dbPromise;
    }

    console.log('Opening database:', this.dbName);
    AudioDatabase.dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.dbVersion);

      request.onerror = (event) => {
        console.error('Database error:', event.target.error);
        AudioDatabase.dbPromise = null;
        reject(event.target.error);
      };

      request.onsuccess = (event) => {
        console.log('Database opened successfully');
        AudioDatabase.db = event.target.result;
        resolve(AudioDatabase.db);
      };

      request.onupgradeneeded = (event) => {
        console.log('Database upgrade needed');
        const db = event.target.result;
        
        // 既存のオブジェクトストアを削除（バージョンアップグレード時）
        if (db.objectStoreNames.contains(this.objectStoreName)) {
          db.deleteObjectStore(this.objectStoreName);
        }

        // 新しいオブジェクトストアを作成
        console.log('Creating object store:', this.objectStoreName);
        const store = db.createObjectStore(this.objectStoreName, { keyPath: 'id', autoIncrement: true });
        
        // インデックスの作成
        store.createIndex('timestamp', 'timestamp', { unique: false });
        store.createIndex('text', 'text', { unique: false });
        store.createIndex('fileName', 'fileName', { unique: false });
        store.createIndex('duration', 'duration', { unique: false });
      };
    });

    return AudioDatabase.dbPromise;
  }

  // データベースの状態を確認
  async checkDatabaseState() {
    try {
      const db = await this.openDB();
      
      // オブジェクトストアが存在しない場合は、データベースを削除して再作成
      if (!db.objectStoreNames.contains(this.objectStoreName)) {
        console.log('Object store not found, deleting database...');
        await this.deleteDatabase();
        console.log('Database deleted, reopening...');
        return await this.checkDatabaseState();
      }

      const transaction = db.transaction(this.objectStoreName, 'readonly');
      const store = transaction.objectStore(this.objectStoreName);
      const countRequest = store.count();
      
      return new Promise((resolve, reject) => {
        countRequest.onsuccess = () => {
          const state = {
            isOpen: !!db,
            objectStoreExists: db.objectStoreNames.contains(this.objectStoreName),
            recordCount: countRequest.result,
            dbName: this.dbName,
            dbVersion: this.dbVersion
          };
          console.log('Database state:', state);
          resolve(state);
        };
        countRequest.onerror = () => reject(countRequest.error);
      });
    } catch (error) {
      console.error('Error checking database state:', error);
      return {
        isOpen: false,
        objectStoreExists: false,
        recordCount: 0,
        dbName: this.dbName,
        dbVersion: this.dbVersion,
        error: error.message
      };
    }
  }

  // データベースを削除
  async deleteDatabase() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.deleteDatabase(this.dbName);
      request.onsuccess = () => {
        console.log('Database deleted successfully');
        AudioDatabase.db = null;
        AudioDatabase.dbPromise = null;
        resolve();
      };
      request.onerror = () => {
        console.error('Error deleting database:', request.error);
        reject(request.error);
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

    // BlobをBase64に変換
    const base64Data = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(audioBlob);
    });

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([this.objectStoreName], 'readwrite');
      const store = transaction.objectStore(this.objectStoreName);

      const audio = {
        text: originalText,
        timestamp: timestamp.toISOString(),
        fileName: fileName,
        duration: duration,
        fileSize: audioBlob.size,
        mimeType: audioBlob.type,
        data: base64Data  // Base64形式でデータを保存
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
        const transaction = db.transaction([this.objectStoreName], 'readonly');
        const store = transaction.objectStore(this.objectStoreName);
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
      const transaction = db.transaction([this.objectStoreName], 'readonly');
      const store = transaction.objectStore(this.objectStoreName);
      const request = store.get(id);

      request.onsuccess = () => {
        const audio = request.result;
        if (audio) {
          console.log('Retrieved audio:', audio.fileName);
          // Base64データをBlobに変換
          const byteString = atob(audio.data.split(',')[1]);
          const ab = new ArrayBuffer(byteString.length);
          const ia = new Uint8Array(ab);
          for (let i = 0; i < byteString.length; i++) {
            ia[i] = byteString.charCodeAt(i);
          }
          audio.blob = new Blob([ab], { type: audio.mimeType });
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
      const transaction = db.transaction([this.objectStoreName], 'readwrite');
      const store = transaction.objectStore(this.objectStoreName);
      const request = store.delete(id);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }
}