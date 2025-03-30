# Kokoro TTS Reader Chrome拡張機能 コード解析

## プロジェクト概要
テキスト選択からKokoro TTSを使用して音声合成を行うChrome拡張機能です。音声データの保存と再生管理機能を備えています。

## ファイル構成と役割

### manifest.json
- Chrome拡張機能の設定ファイル
- Manifest V3を採用
- 主な権限：contextMenus, storage, activeTab, scripting
- ホスト権限：すべてのURL、fal.runとfal.mediaドメイン
- セキュリティポリシーとリソースアクセスの設定
- アイコンとオプションページの設定

### background.js
バックグラウンドサービスワーカー
- **主な機能**：
  - APIキーの管理
  - コンテキストメニューの作成と管理
  - Kokoro TTS APIとの通信
  - 音声生成リクエストの処理
- **重要な関数**：
  - `getFalApiKey()`: ストレージからAPIキーを取得
  - `pollStatus()`: 音声生成の状態を監視
  - `showErrorMessage()`: エラーメッセージの表示
  - `getResponseResult()`: API応答の取得

### contentScript.js
Webページに注入されるスクリプト
- **主な機能**：
  - 音声の再生制御
  - 再生用UIの表示
  - データベースとの連携
- **重要な変数**：
  - `playbackState`: 再生状態の管理
  - `currentAudio`: 現在再生中の音声
- **主な関数**：
  - `handleAudioPlayback()`: 音声再生の制御
  - `showPlayButton()`: 再生コントロールUIの表示
  - `refreshOptionsPage()`: オプションページの更新

### dbHelper.js
IndexedDBを使用したデータ管理クラス
- **クラス**: `AudioDatabase`
  - シングルトンパターンを採用
- **データベース構成**：
  - データベース名: 'audioStorage'
  - オブジェクトストア: 'audioStore'
  - インデックス: timestamp, text, fileName, duration
- **主なメソッド**：
  - `saveAudio()`: 音声データの保存
  - `getAudioList()`: 保存済み音声一覧の取得
  - `getAudio()`: 特定の音声データの取得
  - `deleteAudio()`: 音声データの削除

### options.js
設定ページの制御
- **主な機能**：
  - APIキーの設定と保存
  - 保存済み音声の管理と再生
  - 音声検索機能
- **重要な変数**：
  - `audioFiles`: 保存済み音声リスト
  - `currentAudio`: 現在再生中の音声
- **主な関数**：
  - `loadAudioList()`: 音声一覧の読み込みと表示
  - `playAudio()`: 音声の再生
  - `playNextAudio()`, `playPreviousAudio()`: 音声の切り替え

## データ構造

### 音声データ
```javascript
{
  id: number,              // 自動採番ID
  text: string,            // 元のテキスト
  timestamp: string,       // 保存日時
  fileName: string,        // ファイル名
  duration: number,        // 音声の長さ（秒）
  fileSize: number,        // ファイルサイズ（バイト）
  mimeType: string,        // MIMEタイプ
  data: string            // Base64エンコードされた音声データ
}
```

## 外部依存関係
- **fal.ai API**: 音声合成サービス
  - エンドポイント: https://queue.fal.run/fal-ai/kokoro/american-english
  - 認証: APIキーベース

## 処理フロー
1. テキスト選択とコンテキストメニュークリック
2. APIキー確認とKokoro TTS APIリクエスト
3. 音声生成状態の監視（ポーリング）
4. 音声データの取得と再生
5. IndexedDBへの保存（任意）
6. オプションページでの音声管理と再生