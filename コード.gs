/**
 * @OnlyCurrentDoc
 *
 * Gemini APIを利用して、車検証ファイルを「日付8桁_使用者名_車両番号_車体番号」に自動リネームし、
 * その後Chatworkに通知します。
 * このスクリプトは承認プロセスを介さず、直接ファイルをリネーム・通知します。
 */

// ▼▼▼ 設定項目 ▼▼▼
// 1. 自動リネームを適用したいフォルダのID
const pro_TARGET_FOLDER_ID = "1vP-Y3TsLFDKbY4K79cks6mJVivnSdR7l"; 

// 2. スクリプトプロパティに以下の3つを設定してください
//    - GEMINI_API_KEY      : Google AI Studioで取得したAPIキー
//    - CHATWORK_API_TOKEN  : ChatworkのAPI設定から発行したAPIトークン
//    - CHATWORK_ROOM_ID    : 通知したいChatworkのルームID
// ▲▲▲ 設定項目 ▲▲▲

// Gemini APIのエンドポイントURL
const pro_GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=";


/**
 * メインの処理関数。
 */
function pro_renameFilesInSimpleFolder() {
  try {
    const folder = DriveApp.getFolderById(pro_TARGET_FOLDER_ID);
    const files = folder.getFiles();
    const namePattern = /^\d{8}_.+/;

    while (files.hasNext()) {
      const file = files.next();
      const originalFileName = file.getName();

      if (!namePattern.test(originalFileName) && !originalFileName.startsWith("[AI_ERROR]")) {
        console.log(`未処理ファイルを検出: ${originalFileName}`);
        
        const suggestedName = pro_getSuggestedNameFromGemini(file);

        if (suggestedName && !suggestedName.startsWith("エラー")) {
          const finalName = suggestedName.split('\n')[0].trim();
          
          let originalExtension = '';
          const lastDotIndex = originalFileName.lastIndexOf('.');
          if (lastDotIndex > 0 && lastDotIndex < originalFileName.length - 1) {
            originalExtension = originalFileName.substring(lastDotIndex);
          }
          
          const newName = `${finalName}${originalExtension}`;
          
          file.setName(newName);
          console.log(`リネームしました: ${originalFileName} -> ${newName}`);

          // リネーム成功後、Chatworkに通知
          pro_postFileToChatwork(file, originalFileName);

        } else {
          console.error(`AIによる解析に失敗したため、ファイル名を変更してスキップします: ${originalFileName}`);
          file.setName(`[AI_ERROR]_${originalFileName}`);
        }
      }
    }
  } catch (e) {
    console.error(`エラーが発生しました: ${e.toString()}`);
  }
}

/**
 * リネームされたファイルの情報をChatworkにメッセージとして投稿する関数
 * @param {GoogleAppsScript.Drive.File} file - 投稿するファイルオブジェクト
 * @param {string} originalFileName - 元のファイル名
 */
function pro_postFileToChatwork(file, originalFileName) {
  const properties = PropertiesService.getScriptProperties();
  const apiToken = properties.getProperty('CHATWORK_API_TOKEN');
  const roomId = properties.getProperty('CHATWORK_ROOM_ID');

  if (!apiToken || !roomId) {
    console.error("ChatworkのAPIトークンまたはルームIDがスクリプトプロパティに設定されていません。");
    return;
  }

  const url = `https://api.chatwork.com/v2/rooms/${roomId}/messages`;
  
  const fileUrl = file.getUrl();
  
  // ★★ 修正 ★★
  // フォルダリンクを削除し、ファイルリンクのみのシンプルなメッセージに変更
  const messageBody = `[info][title]車検証ファイルが自動リネームされました[/title]新ファイル名: ${file.getName()}\n${fileUrl}[/info]`;


  const payload = {
    body: messageBody,
  };

  const options = {
    method: 'post',
    headers: {
      'X-ChatWorkToken': apiToken,
    },
    payload: payload,
    muteHttpExceptions: true,
  };

  try {
    const response = UrlFetchApp.fetch(url, options);
    const responseCode = response.getResponseCode();
    const responseBody = response.getContentText();

    if (responseCode === 200) {
      console.log("Chatworkへのファイル投稿に成功しました。");
    } else {
      console.error(`Chatworkへの投稿に失敗しました。ステータス: ${responseCode}, 応答: ${responseBody}`);
    }
  } catch (e) {
    console.error(`Chatwork API呼び出し中にエラー: ${e.toString()}`);
  }
}


/**
 * Gemini APIに画像を送信し、推奨ファイル名を取得する関数。
 */
function pro_getSuggestedNameFromGemini(file) {
  try {
    // ★★ 更新: 新しいプロンプトをここに反映 ★★
    const prompt = `
      この自動車検査証の画像から以下の情報を抽出してください。
      1.  **記録年月日**: (例: 令和6年10月24日)
      2.  **交付年月日**: (例: 令和6年10月20日)
      3.  **使用者の氏名又は名称**:
      4.  **所有者の氏名又は名称**:
      5.  **登録番号**: (例: 品川 300 わ 1234)
      6.  **車台番号**:
      7.  **返納証明書フラグ**: (画像内に「返納証明書」「自動車検査証返納証明書」といった記載があれば true, なければ false)

      そして、以下のルールに厳密に従って、ファイル名を**1行の文字列**として生成してください。

      # ファイル名形式
      (日付)_(フラグ)_(使用者名)_(登録番号)_(車台番号)

      # ルール詳細

      1.  **(日付) の決定:**
          * **抹消の場合:** (ルール7の「返納証明書フラグ」が true の場合)、抽出した「交付年月日」をYYYYMMDD形式（西暦）に変換して使用します。
          * **上記以外の場合:** 抽出した「記録年月日」をYYYYMMDD形式（西暦）に変換して使用します。

      2.  **(フラグ) の決定 (オプション):**
          * **抹消の場合:** (ルール7の「返納証明書フラグ」が true の場合)、日付の直後に \`_抹消\` を追加します。
          * **更新の場合:** (抹消ではない AND 「記録年月日」と「交付年月日」が異なる日付の場合)、日付の直後に \`_更新\` を追加します。
          * **上記以外の場合:** フラグは追加しません (日付の直後は \`_\` になります)。

      3.  **(使用者名) の決定:**
          * **もし「使用者の氏名又は名称」が「***」の場合:** 「所有者の氏名又は名称」を使用します。
          * **もし「使用者の氏名又は名称」が「株式会社橋本商会」 AND 「登録番号」に「わ」が含まれる場合:** \`(株)橋本ﾚﾝﾀｶｰ\` という文字列を使用します。
          * **上記以外の場合:** 「使用者の氏名又は名称」を使用します。

      4.  **短縮・整形ルール:**
          * (使用者名)、(登録番号)、(車台番号) に含まれる全ての空白（半角・全角）は、**完全に削除**してください。
          * (使用者名) に含まれる法人格は、以下のように短縮してください。
              * \`株式会社\` → \`(株)\`
              * \`合同会社\` → \`(同)\`
              * （その他、有限会社→(有) など、一般的な法人格も同様に短縮してください）

      5.  **結合ルール:**
          * 各要素（日付、(使用者名)、(登録番号)、(車台番号)）は、必ずアンダースコア(_)で区切ってください。
          * (フラグ) が存在する場合、\`日付_フラグ_使用者名...\` のようになります。
          * (フラグ) が存在しない場合、\`日付_使用者名...\` のようになります。

      6.  **最終出力ルール:**
          * 説明、前置き、箇条書き、追加のテキストは一切含めないでください。
          * **応答は、生成されたファイル名文字列のみ**にしてください。
    `;
    
    const imageBlob = file.getBlob();
    const base64ImageData = Utilities.base64Encode(imageBlob.getBytes());
    const payload = { contents: [{ parts: [ { text: prompt }, { inlineData: { mimeType: imageBlob.getContentType(), data: base64ImageData } } ] }] };
    const options = { method: 'post', contentType: 'application/json', payload: JSON.stringify(payload), muteHttpExceptions: true };
    
    const apiKey = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
    if (!apiKey) {
      console.error("Gemini APIキーがスクリプトプロパティに設定されていません。");
      return "エラー: APIキー未設定";
    }

    const response = UrlFetchApp.fetch(`${pro_GEMINI_API_URL}${apiKey}`, options);
    const result = JSON.parse(response.getContentText());

    if (result.candidates && result.candidates[0].content.parts[0].text) {
      return result.candidates[0].content.parts[0].text.trim();
    } else {
      console.error("Gemini APIからの応答が無効です:", result);
      return "エラー: APIからの無効な応答";
    }
  } catch (e) {
    console.error(`Gemini API呼び出し中にエラー: ${e.toString()}`);
    return `エラー: ${e.message}`;
  }
}


/**
 * トリガー設定用の関数。
 */
function pro_createTimeDrivenTrigger() {
  const allTriggers = ScriptApp.getProjectTriggers();
  for (const trigger of allTriggers) {
    if (trigger.getHandlerFunction() === "pro_renameFilesInSimpleFolder") {
      ScriptApp.deleteTrigger(trigger);
    }
  }

  ScriptApp.newTrigger("pro_renameFilesInSimpleFolder")
    .timeBased()
    .everyMinutes(10)
    .create();
  
  console.log("10分ごとの自動実行トリガーを設定しました。");
}