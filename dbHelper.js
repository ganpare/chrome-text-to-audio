
class AudioDatabase {
  static instance = null;

  constructor() {
    this.dbName = 'kokoroTts';
    this.dbVersion = 2;
    this.db = null;
    this.isInitialized = false;
    this.connectionPromise = null;
  }

  static getInstance() {
    if (!AudioDatabase.instance) {
      AudioDatabase.instance = new AudioDatabase();
      console.log('Created new AudioDatabase instance');
    }
    return AudioDatabase.instance;
  }

  async getConnection() {
    // 既存の接続プロミスがあれば、それを返す
    if (this.connectionPromise) {
      return this.connectionPromise;
    }

    // 新しい接続を作成
    this.connectionPromise = new Promise((resolve, reject) => {
      console.log('Opening new database connection...');
      const request = indexedDB.open(this.dbName, this.dbVersion);

      request.onerror = (event) => {
        console.error('Database error:', event.target.error);
        this.connectionPromise = null;
        reject(event.target.error);
      };

      request.onupgradeneeded = (event) => {
        console.log('Database upgrade needed');
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
        this.isInitialized = true;
        console.log('Database connection established successfully');

        db.onversionchange = () => {
          db.close();
          this.isInitialized = false;
          this.connectionPromise = null;
        };

        resolve(db);
      };
    });

    return this.connectionPromise;
  }

  async openDB(forceReopen = false) {
    if (forceReopen) {
      if (this.db) {
        this.db.close();
      }
      this.db = null;
      this.isInitialized = false;
      this.connectionPromise = null;
    }
    return this.getConnection();
  }

  async saveAudio(audioBlob, text) {
    console.log('Starting saveAudio operation...');

    try {
      if (!audioBlob || !(audioBlob instanceof Blob)) {
        throw new Error('無効な音声データです');
      }
      
      if (!text || typeof text !== 'string') {
        throw new Error('無効なテキストデータです');
      }

      const db = await this.getConnection();
      
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(['audios'], 'readwrite');
        
        transaction.onerror = (event) => {
          console.error('Transaction error:', event.target.error);
          reject(event.target.error);
        };
        
        const store = transaction.objectStore('audios');

        const record = {
          blob: audioBlob,
          text: text.substring(0, 1000),
          timestamp: new Date(),
          fileSize: audioBlob.size
        };

        const request = store.add(record);

        request.onsuccess = (event) => {
          const id = event.target.result;
          console.log('Audio saved with ID:', id);
          resolve(id);
        };

        request.onerror = (event) => {
          console.error('Error in save operation:', event.target.error);
          reject(event.target.error);
        };
      });
    } catch (error) {
      console.error('Error in saveAudio:', error);
      throw error;
    }
  }

  async getAudioList() {
    console.log('Getting audio list...');
    
    try {
      const db = await this.getConnection();
      
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(['audios'], 'readonly');
        
        transaction.onerror = (event) => {
          console.error('Transaction error:', event.target.error);
          reject(event.target.error);
        };
        
        const store = transaction.objectStore('audios');
        const request = store.getAll();

        request.onsuccess = (event) => {
          const records = event.target.result || [];
          console.log(`Retrieved ${records.length} audio records`);
          resolve(records);
        };

        request.onerror = (event) => {
          console.error('Error getting audio list:', event.target.error);
          reject(event.target.error);
        };
      });
    } catch (error) {
      console.error('Error in getAudioList:', error);
      return [];
    }
  }

  async getAudio(id) {
    console.log('Getting audio with ID:', id);
    
    try {
      const db = await this.getConnection();
      
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(['audios'], 'readonly');
        const store = transaction.objectStore('audios');
        const request = store.get(id);

        request.onsuccess = (event) => {
          resolve(request.result);
        };

        request.onerror = (event) => {
          console.error('Error getting audio:', event.target.error);
          reject(event.target.error);
        };
      });
    } catch (error) {
      console.error('Error in getAudio:', error);
      throw error;
    }
  }

  async deleteAudio(id) {
    console.log('Deleting audio with ID:', id);
    
    try {
      const db = await this.getConnection();
      
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(['audios'], 'readwrite');
        const store = transaction.objectStore('audios');
        const request = store.delete(id);

        request.onsuccess = () => {
          console.log('Audio deleted successfully');
          resolve();
        };

        request.onerror = (event) => {
          console.error('Error deleting audio:', event.target.error);
          reject(event.target.error);
        };
      });
    } catch (error) {
      console.error('Error in deleteAudio:', error);
      throw error;
    }
  }

  async checkDatabaseState() {
    try {
      const db = await this.getConnection();
      
      return new Promise((resolve, reject) => {
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
          reject(event.target.error);
        };
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
