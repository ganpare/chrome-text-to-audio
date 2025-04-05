
class AudioDatabase {
  static instance = null;

  constructor() {
    this.dbName = 'kokoroTts';
    this.dbVersion = 2;
    this.db = null;
    this.isOpening = false;
  }

  static getInstance() {
    if (!AudioDatabase.instance) {
      AudioDatabase.instance = new AudioDatabase();
      console.log('Created new AudioDatabase instance');
    }
    return AudioDatabase.instance;
  }

  async openDB(forceReopen = false) {
    // 既に接続中で強制再オープンでなければ既存の接続を返す
    if (this.db && !forceReopen) {
      console.log('Using existing database connection');
      return this.db;
    }

    // 既存の接続を閉じる
    if (this.db && forceReopen) {
      try {
        this.db.close();
        this.db = null;
        console.log('Closed existing database connection');
      } catch (err) {
        console.warn('Error closing database:', err);
      }
    }

    // 既に開いている処理がある場合は待機
    if (this.isOpening) {
      console.log('Database opening in progress, waiting...');
      // 1秒ごとに確認して最大10秒待機
      for (let i = 0; i < 10; i++) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        if (this.db) {
          console.log('Database opened by another process');
          return this.db;
        }
      }
    }

    this.isOpening = true;
    console.log('Opening new database connection...');

    try {
      return await new Promise((resolve, reject) => {
        const request = indexedDB.open(this.dbName, this.dbVersion);

        request.onerror = (event) => {
          console.error('Database open error:', event.target.error);
          this.isOpening = false;
          reject(event.target.error);
        };

        request.onupgradeneeded = (event) => {
          console.log('Database upgrade needed, version:', event.oldVersion, '->', event.newVersion);
          const db = event.target.result;
          
          if (!db.objectStoreNames.contains('audios')) {
            console.log('Creating audios object store');
            const store = db.createObjectStore('audios', { 
              keyPath: 'id', 
              autoIncrement: true 
            });
            store.createIndex('timestamp', 'timestamp', { unique: false });
            store.createIndex('text', 'text', { unique: false });
          }
        };

        request.onsuccess = (event) => {
          const db = event.target.result;
          this.db = db;
          this.isOpening = false;
          console.log('Database connection established successfully');

          db.onversionchange = () => {
            console.log('Database version changed by another connection');
            db.close();
            this.db = null;
          };

          resolve(db);
        };
      });
    } catch (error) {
      this.isOpening = false;
      console.error('Error in openDB:', error);
      throw error;
    }
  }

  async saveAudio(audioBlob, text) {
    console.log('Saving audio data...', new Date().toISOString());

    try {
      // 入力データの検証
      if (!audioBlob) {
        console.error('無効な音声データ: audioBlob is null or undefined');
        throw new Error('無効な音声データです');
      }
      
      if (!(audioBlob instanceof Blob)) {
        console.error('無効な音声データ: Not a Blob object, type is:', typeof audioBlob);
        throw new Error('無効な音声データです (Blobではありません)');
      }
      
      console.log('Blob検証OK:', audioBlob.size, 'bytes,', audioBlob.type);
      
      const textToSave = text && typeof text === 'string' 
        ? text.substring(0, 1000) 
        : '音声データ';
      console.log('保存するテキスト長:', textToSave.length, '文字');

      // データベース接続を確保
      const db = await this.openDB();
      console.log('データベース接続確保完了');
      
      // トランザクションを開始
      return await new Promise((resolve, reject) => {
        try {
          console.log('トランザクション開始');
          const transaction = db.transaction(['audios'], 'readwrite');
          
          transaction.oncomplete = () => {
            console.log('Save transaction completed successfully', new Date().toISOString());
          };
          
          transaction.onerror = (event) => {
            console.error('Save transaction error:', event.target.error);
            reject(event.target.error);
          };
          
          const store = transaction.objectStore('audios');
          console.log('オブジェクトストア取得完了:', store.name);

          // 保存するレコードを作成
          const timestamp = new Date();
          const record = {
            blob: audioBlob,
            text: textToSave,
            timestamp: timestamp,
            fileSize: audioBlob.size,
            duration: null // 音声の長さがわかれば設定
          };
          console.log('保存レコード作成完了:', 
                     'テキスト長:', record.text.length,
                     'タイムスタンプ:', timestamp.toISOString(),
                     'サイズ:', record.fileSize);

          // レコードを追加
          console.log('store.add実行開始');
          const request = store.add(record);
          console.log('store.add実行完了、結果待ち');

          request.onsuccess = (event) => {
            const id = event.target.result;
            console.log('Audio saved successfully with ID:', id, new Date().toISOString());
            resolve(id);
          };

          request.onerror = (event) => {
            console.error('Error in save operation:', event.target.error);
            reject(event.target.error);
          };
        } catch (transactionError) {
          console.error('Error creating transaction:', transactionError);
          reject(transactionError);
        }
      });
    } catch (error) {
      console.error('Error in saveAudio:', error);
      throw error;
    }
  }

  async getAudioList() {
    console.log('Getting audio list...');
    
    try {
      // データベース接続を確保
      const db = await this.openDB();
      
      // トランザクションを開始
      return await new Promise((resolve, reject) => {
        try {
          const transaction = db.transaction(['audios'], 'readonly');
          
          transaction.oncomplete = () => {
            console.log('GetAudioList transaction completed successfully');
          };
          
          transaction.onerror = (event) => {
            console.error('GetAudioList transaction error:', event.target.error);
            reject(event.target.error);
          };
          
          const store = transaction.objectStore('audios');
          
          // 全てのレコードを取得
          const request = store.getAll();

          request.onsuccess = (event) => {
            const records = event.target.result || [];
            console.log(`Retrieved ${records.length} audio records`);
            
            // 結果のチェック
            if (records.length > 0) {
              const sampleRecord = records[0];
              const hasBlob = sampleRecord.blob instanceof Blob;
              console.log(`Sample record: ID=${sampleRecord.id}, has blob=${hasBlob}, size=${hasBlob ? sampleRecord.blob.size : 'N/A'}`);
            }
            
            resolve(records);
          };

          request.onerror = (event) => {
            console.error('Error getting audio list:', event.target.error);
            reject(event.target.error);
          };
        } catch (transactionError) {
          console.error('Error creating transaction for getAudioList:', transactionError);
          reject(transactionError);
        }
      });
    } catch (error) {
      console.error('Error in getAudioList:', error);
      return [];
    }
  }

  async getAudio(id) {
    console.log('Getting audio with ID:', id);
    
    if (!id) {
      throw new Error('無効なIDです');
    }
    
    try {
      // データベース接続を確保
      const db = await this.openDB();
      
      // IDが数値の場合は変換
      const numericId = typeof id === 'string' ? parseInt(id, 10) : id;
      
      // トランザクションを開始
      return await new Promise((resolve, reject) => {
        try {
          const transaction = db.transaction(['audios'], 'readonly');
          const store = transaction.objectStore('audios');
          const request = store.get(numericId);

          request.onsuccess = () => {
            const result = request.result;
            if (result) {
              console.log(`Found audio ID ${numericId}, has blob: ${result.blob instanceof Blob}`);
              resolve(result);
            } else {
              console.warn(`Audio ID ${numericId} not found`);
              resolve(null);
            }
          };

          request.onerror = (event) => {
            console.error('Error getting audio:', event.target.error);
            reject(event.target.error);
          };
        } catch (transactionError) {
          console.error('Error creating transaction for getAudio:', transactionError);
          reject(transactionError);
        }
      });
    } catch (error) {
      console.error('Error in getAudio:', error);
      throw error;
    }
  }

  async deleteAudio(id) {
    console.log('Deleting audio with ID:', id);
    
    if (!id) {
      throw new Error('無効なIDです');
    }
    
    try {
      // データベース接続を確保
      const db = await this.openDB();
      
      // IDが数値の場合は変換
      const numericId = typeof id === 'string' ? parseInt(id, 10) : id;
      
      // トランザクションを開始
      return await new Promise((resolve, reject) => {
        try {
          const transaction = db.transaction(['audios'], 'readwrite');
          
          transaction.oncomplete = () => {
            console.log('Delete transaction completed successfully');
          };
          
          transaction.onerror = (event) => {
            console.error('Delete transaction error:', event.target.error);
            reject(event.target.error);
          };
          
          const store = transaction.objectStore('audios');
          const request = store.delete(numericId);

          request.onsuccess = () => {
            console.log(`Audio ID ${numericId} deleted successfully`);
            resolve();
          };

          request.onerror = (event) => {
            console.error('Error deleting audio:', event.target.error);
            reject(event.target.error);
          };
        } catch (transactionError) {
          console.error('Error creating transaction for deleteAudio:', transactionError);
          reject(transactionError);
        }
      });
    } catch (error) {
      console.error('Error in deleteAudio:', error);
      throw error;
    }
  }

  async checkDatabaseState() {
    try {
      // データベース接続を確保
      const db = await this.openDB();
      
      return new Promise((resolve, reject) => {
        try {
          const transaction = db.transaction(['audios'], 'readonly');
          const store = transaction.objectStore('audios');
          const countRequest = store.count();

          countRequest.onsuccess = () => {
            resolve({
              isOpen: true,
              objectStoreExists: true,
              recordCount: countRequest.result,
              dbName: this.dbName,
              dbVersion: this.dbVersion
            });
          };

          countRequest.onerror = (event) => {
            console.error('Error in count request:', event.target.error);
            reject(event.target.error);
          };
        } catch (error) {
          console.error('Error checking store:', error);
          resolve({
            isOpen: true,
            objectStoreExists: false,
            error: error.message,
            dbName: this.dbName,
            dbVersion: this.dbVersion
          });
        }
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
}
