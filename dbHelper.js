class AudioDatabase {
  static instance = null;
  static db = null;
  static dbPromise = null;

  constructor() {
    this.dbName = 'kokoroTts';
    this.dbVersion = 1;
    this.db = null;
    this.isInitialized = false;
    this.initPromise = this.init();
  }

  static getInstance() {
    if (!AudioDatabase.instance) {
      try {
        AudioDatabase.instance = new AudioDatabase();
        console.log('Created new AudioDatabase instance');
      } catch (error) {
        console.error('Failed to create AudioDatabase instance:', error);
        throw error;
      }
    }
    return AudioDatabase.instance;
  }

  async init() {
    console.log('Initializing AudioDatabase...');
    try {
      return new Promise((resolve, reject) => {
        const request = indexedDB.open(this.dbName, this.dbVersion);

        request.onerror = (event) => {
          console.error('Database error:', event.target.error);
          this.isInitialized = false;
          reject(event.target.error);
        };

        request.onupgradeneeded = (event) => {
          console.log('Database upgrade needed');
          const db = event.target.result;
          if (!db.objectStoreNames.contains('audios')) {
            const store = db.createObjectStore('audios', { keyPath: 'id', autoIncrement: true });
            store.createIndex('timestamp', 'timestamp', { unique: false });
            store.createIndex('text', 'text', { unique: false });
            console.log('Created audios object store');
          }
        };

        request.onsuccess = (event) => {
          this.db = event.target.result;
          this.isInitialized = true;
          console.log('Database initialized successfully');

          // データベース接続が切断された場合の処理
          this.db.onversionchange = () => {
            this.db.close();
            console.log('Database connection closed due to version change');
            this.isInitialized = false;
          };

          resolve(this.db);
        };
      });
    } catch (error) {
      console.error('Error in init:', error);
      this.isInitialized = false;
      throw error;
    }
  }

  async openDB() {
    console.log('Opening database connection...');

    // 初期化が完了するのを待つ
    if (!this.isInitialized) {
      try {
        console.log('Waiting for database initialization...');
        await this.initPromise;
      } catch (error) {
        console.error('Error waiting for initialization:', error);
        throw error;
      }
    }

    if (this.db) {
      try {
        // 接続が生きているか簡単なチェック
        const transaction = this.db.transaction(['audios'], 'readonly');
        transaction.abort(); // 実際には使わないのでアボート
        console.log('Existing database connection is valid');
        return this.db;
      } catch (error) {
        console.warn('Existing database connection is invalid, reopening...', error);
        this.db = null;
        this.isInitialized = false;
      }
    }

    // データベース接続の再作成
    try {
      return new Promise((resolve, reject) => {
        console.log('Creating new database connection');
        const request = indexedDB.open(this.dbName, this.dbVersion);

        request.onupgradeneeded = (event) => {
          console.log('Database upgrade needed (reopening)');
          const db = event.target.result;
          if (!db.objectStoreNames.contains('audios')) {
            const store = db.createObjectStore('audios', { keyPath: 'id', autoIncrement: true });
            store.createIndex('timestamp', 'timestamp', { unique: false });
            store.createIndex('text', 'text', { unique: false });
            console.log('Created audios object store (reopening)');
          }
        };

        request.onerror = (event) => {
          console.error('Error opening database:', event.target.error);
          this.isInitialized = false;
          reject(event.target.error);
        };

        request.onsuccess = (event) => {
          this.db = event.target.result;
          this.isInitialized = true;
          console.log('Database reopened successfully');
          
          // データベース接続が切断された場合の処理
          this.db.onversionchange = () => {
            this.db.close();
            console.log('Database connection closed due to version change');
            this.isInitialized = false;
          };
          
          resolve(this.db);
        };
      });
    } catch (error) {
      console.error('Critical error reopening database:', error);
      this.isInitialized = false;
      throw error;
    }
  }

  async saveAudio(audioBlob, text) {
    console.log('Saving audio to database...');
    try {
      await this.openDB();

      // メタデータを同期的に取得（推定値）
      let fileSize = audioBlob.size;
      const metadata = this.getAudioMetadataSync(audioBlob);
      const duration = metadata.duration;
      console.log(`Audio metadata (estimated): duration=${duration.toFixed(2)}s, size=${fileSize}bytes`);

      // データベースへの保存操作
      return new Promise((resolve, reject) => {
        try {
          const transaction = this.db.transaction(['audios'], 'readwrite');
          
          transaction.onerror = (event) => {
            console.error('Transaction error:', event.target.error);
            reject(event.target.error);
          };

          const store = transaction.objectStore('audios');
          const timestamp = new Date();

          const record = {
            blob: audioBlob,
            text: text.substring(0, 1000), // テキストが長すぎる場合は切り詰める
            timestamp: timestamp,
            duration: duration,
            fileSize: fileSize
          };

          console.log(`Saving audio record to database...`);
          const request = store.add(record);

          request.onsuccess = (event) => {
            const id = event.target.result;
            console.log('Audio saved successfully with ID:', id);
          };

          request.onerror = (event) => {
            console.error('Error adding record:', event.target.error);
            reject(event.target.error);
          };
          
          // トランザクションが完了したことを確認
          transaction.oncomplete = () => {
            console.log('Transaction completed successfully');
            resolve(request.result); // トランザクション完了後に解決
          };
          
          transaction.onerror = (event) => {
            console.error('Transaction failed:', event.target.error);
            reject(event.target.error);
          };

        } catch (transactionError) {
          console.error('Error creating transaction:', transactionError);
          reject(transactionError);
        }
      });
    } catch (dbError) {
      console.error('Database error in saveAudio:', dbError);
      throw dbError;
    }
  }
  
  // 音声ファイルからメタデータを取得する関数 (同期バージョン)
  getAudioMetadataSync(audioBlob) {
    // メタデータが取得できない場合は推定値を返す
    // WAVファイルの場合、44100Hz, 16bit, stereoと仮定して推定
    const estimatedBytesPerSecond = 44100 * 2 * 2; // サンプリングレート * ビット深度(バイト) * チャンネル数
    const estimatedDuration = audioBlob.size / estimatedBytesPerSecond;
    
    return {
      duration: estimatedDuration,
      fileSize: audioBlob.size
    };
  }
  
  // 音声ファイルからメタデータを取得する関数 (非同期バージョン)
  async getAudioMetadata(audioBlob) {
    // トランザクションの問題を回避するため、同期的に推定値を返す
    return this.getAudioMetadataSync(audioBlob);
  }


  // データベースの状態を確認
  async checkDatabaseState() {
    try {
      const db = await this.openDB();

      // オブジェクトストアが存在しない場合は、データベースを削除して再作成
      if (!db.objectStoreNames.contains('audios')) {
        console.log('Object store not found, deleting database...');
        await this.deleteDatabase();
        console.log('Database deleted, reopening...');
        return await this.checkDatabaseState();
      }

      const transaction = db.transaction('audios', 'readonly');
      const store = transaction.objectStore('audios');
      const countRequest = store.count();

      return new Promise((resolve, reject) => {
        countRequest.onsuccess = () => {
          const state = {
            isOpen: !!db,
            objectStoreExists: db.objectStoreNames.contains('audios'),
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
        this.db = null;
        this.isInitialized = false;
        resolve();
      };
      request.onerror = () => {
        console.error('Error deleting database:', request.error);
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
        const transaction = db.transaction(['audios'], 'readonly');
        const store = transaction.objectStore('audios');
        const request = store.getAll();

        request.onsuccess = () => {
          const result = request.result;
          console.log('Raw database results:', result);

          const audioFiles = result.map(audio => ({
            id: audio.id,
            text: audio.text,
            timestamp: audio.timestamp,
            duration: audio.duration,
            fileSize: audio.fileSize
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
      const transaction = db.transaction(['audios'], 'readonly');
      const store = transaction.objectStore('audios');
      const request = store.get(id);

      request.onsuccess = () => {
        resolve(request.result);
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
      const transaction = db.transaction(['audios'], 'readwrite');
      const store = transaction.objectStore('audios');
      const request = store.delete(id);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }
}