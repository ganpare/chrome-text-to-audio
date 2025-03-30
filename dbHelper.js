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

      return new Promise((resolve, reject) => {
        try {
          const transaction = this.db.transaction(['audios'], 'readwrite');
          transaction.onerror = (event) => {
            console.error('Transaction error:', event.target.error);
            reject(event.target.error);
          };

          const store = transaction.objectStore('audios');

          // メタデータ取得用の音声要素
          const audio = new Audio();
          const blobUrl = URL.createObjectURL(audioBlob);
          audio.src = blobUrl;

          // メタデータ読み込み完了時
          audio.onloadedmetadata = () => {
            const duration = audio.duration;
            URL.revokeObjectURL(blobUrl);

            const fileSize = audioBlob.size;
            const timestamp = new Date();

            console.log(`Saving audio: duration=${duration}s, size=${fileSize}bytes`);

            const record = {
              blob: audioBlob,
              text: text.substring(0, 1000), // テキストが長すぎる場合は切り詰める
              timestamp: timestamp,
              duration: duration,
              fileSize: fileSize
            };

            try {
              const request = store.add(record);

              request.onsuccess = (event) => {
                const id = event.target.result;
                console.log('Audio saved successfully with ID:', id);
                resolve(id);
              };

              request.onerror = (event) => {
                console.error('Error adding record:', event.target.error);
                reject(event.target.error);
              };
            } catch (storeError) {
              console.error('Error in store.add:', storeError);
              reject(storeError);
            }
          };

          // エラー時の処理
          audio.onerror = (error) => {
            console.warn('Failed to get audio metadata:', error);
            URL.revokeObjectURL(blobUrl);

            // メタデータの取得に失敗した場合でも保存を試みる
            const fileSize = audioBlob.size;
            const timestamp = new Date();

            const record = {
              blob: audioBlob,
              text: text.substring(0, 1000),
              timestamp: timestamp,
              duration: null,
              fileSize: fileSize
            };

            try {
              const request = store.add(record);

              request.onsuccess = (event) => {
                const id = event.target.result;
                console.log('Audio saved without metadata with ID:', id);
                resolve(id);
              };

              request.onerror = (event) => {
                console.error('Error adding record (fallback):', event.target.error);
                reject(event.target.error);
              };
            } catch (fallbackError) {
              console.error('Error in fallback store.add:', fallbackError);
              reject(fallbackError);
            }
          };

          // 5秒以内にメタデータが読み込まれない場合はタイムアウト
          setTimeout(() => {
            if (audio.duration === undefined || audio.duration === 0) {
              console.warn('Metadata loading timeout');
              audio.onerror(new Error('Metadata loading timeout'));
            }
          }, 5000);

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