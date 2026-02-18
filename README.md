# Syakensyo-Renamer

Google Drive 上の車検証画像を Gemini AI で解析し、規則的なファイル名に自動リネームする Google Apps Script です。リネーム完了後、Chatwork に通知を送信します。

## 機能概要

- Google Drive の指定フォルダ内にある未処理の車検証画像を自動検出
- Gemini API（画像認識）で車検証から必要情報を抽出
- 統一フォーマットのファイル名に自動リネーム
- リネーム結果を Chatwork ルームに通知
- 10分間隔のトリガーによる自動実行

## リネーム規則

### ファイル名フォーマット

```
YYYYMMDD_[フラグ]_使用者名_登録番号_車台番号.拡張子
```

### フラグの種類

| フラグ | 条件 |
|---|---|
| `_抹消` | 返納証明書の場合 |
| `_更新` | 記録年月日と交付年月日が異なる場合 |
| (なし) | 上記以外 |

### 日付の決定ルール

- **抹消の場合**: 交付年月日を使用
- **それ以外**: 記録年月日を使用

### 使用者名の決定ルール

- 使用者が `***` の場合 → 所有者名を使用
- 法人格は短縮表記に変換（`株式会社` → `(株)`、`合同会社` → `(同)` など）
- 空白は全て削除

## セットアップ

### 1. スクリプトプロパティの設定

Google Apps Script エディタの「プロジェクトの設定」から、以下のスクリプトプロパティを追加してください。

| プロパティ名 | 説明 |
|---|---|
| `GEMINI_API_KEY` | [Google AI Studio](https://aistudio.google.com/) で取得した API キー |
| `CHATWORK_API_TOKEN` | Chatwork の API 設定から発行したトークン |
| `CHATWORK_ROOM_ID` | 通知先の Chatwork ルーム ID |

### 2. 対象フォルダの設定

`コード.gs` 内の `pro_TARGET_FOLDER_ID` を、監視対象の Google Drive フォルダ ID に変更してください。

```javascript
const pro_TARGET_FOLDER_ID = "your-folder-id-here";
```

### 3. トリガーの設定

Apps Script エディタで `pro_createTimeDrivenTrigger` 関数を実行すると、10分間隔の自動実行トリガーが設定されます。

## 関数一覧

| 関数名 | 説明 |
|---|---|
| `pro_renameFilesInSimpleFolder()` | メイン処理。未処理ファイルを検出しリネームを実行 |
| `pro_getSuggestedNameFromGemini(file)` | Gemini API で画像を解析しファイル名を生成 |
| `pro_postFileToChatwork(file, originalFileName)` | リネーム結果を Chatwork に通知 |
| `pro_createTimeDrivenTrigger()` | 10分間隔の自動実行トリガーを設定 |

## エラー処理

- AI 解析に失敗したファイルには `[AI_ERROR]_` プレフィックスが付与され、次回以降の処理対象から除外されます
- エラーログは Google Cloud の Stackdriver Logging に記録されます

## 使用技術

- Google Apps Script (V8 ランタイム)
- [Gemini API](https://ai.google.dev/) (gemini-3-flash-preview)
- [Chatwork API](https://developer.chatwork.com/) v2
