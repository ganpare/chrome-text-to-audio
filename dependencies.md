# モジュール依存関係図

```mermaid
graph TD
    subgraph Chrome拡張機能
        manifest[manifest.json]
        background[background.js]
        content[contentScript.js]
        db[dbHelper.js]
        options[options.js]
        optionsHTML[options.html]
        styles[styles.css]
    end

    subgraph 外部サービス
        falai[fal.ai API]
    end

    %% マニフェストの依存関係
    manifest -->|定義| background
    manifest -->|定義| content
    manifest -->|定義| optionsHTML

    %% バックグラウンドスクリプトの依存関係
    background -->|API通信| falai
    background -->|メッセージ| content
    background -->|ストレージ| chrome-storage[Chrome Storage API]

    %% コンテンツスクリプトの依存関係
    content -->|データ保存| db
    content -->|メッセージ| background
    content -->|UI表示| styles

    %% オプションページの依存関係
    optionsHTML -->|スタイル| styles
    optionsHTML -->|ロード| options
    optionsHTML -->|ロード| db
    options -->|データ操作| db
    options -->|ストレージ| chrome-storage

    %% データベースの依存関係
    db -->|保存| indexedDB[IndexedDB]

    %% スタイルの適用
    styles -.->|スタイル適用| optionsHTML

    %% Chrome APIの利用
    chrome-apis[Chrome APIs] --> background
    chrome-apis --> content
    chrome-apis --> options

    classDef external fill:#f9f,stroke:#333,stroke-width:2px
    classDef chrome fill:#bbf,stroke:#333,stroke-width:2px
    class falai,indexedDB external
    class chrome-apis,chrome-storage chrome
```

## 依存関係の説明

### コアモジュール間の依存関係
- `manifest.json` はすべてのコンポーネントの設定と権限を定義
- `background.js` は拡張機能のバックグラウンドプロセスとしてfal.ai APIとの通信を管理
- `contentScript.js` はWebページ上でのUI表示と音声再生を担当
- `dbHelper.js` はIndexedDBを使用したデータ永続化を提供
- `options.js` は設定と保存済み音声の管理インターフェースを提供

### 外部依存関係
1. Chrome APIs
   - Storage API: 設定の保存
   - Tabs API: タブ管理
   - Runtime API: メッセージング
   - ContextMenus API: 右クリックメニュー

2. 外部サービス
   - fal.ai API: 音声合成サービス

3. ブラウザAPI
   - IndexedDB: 音声データの永続化
   - Audio API: 音声再生

### データフロー
1. ユーザー操作 → `contentScript.js`
2. `contentScript.js` → `background.js` → fal.ai API
3. 音声データ → `dbHelper.js` → IndexedDB
4. 設定データ → Chrome Storage API