'use strict'

// Puppeteerヘッドレスモード
const HEADLESS_MODE = true;

// 文字色
const ANSI_RED = '\u001b[31m';
const ANSI_GREEN = '\u001b[32m';
const ANSI_RESET = '\u001b[0m';

// 保存用ディレクトリ
const COMMON_PATH = "./";                       //  共通のパス
const IMG_DIR = COMMON_PATH + "img/";           //  イラスト保存先ディレクトリ
const IMG_INFO_DIR = COMMON_PATH + "img-info/"; //  イラスト情報保存ディレクトリ
const COOKIE_DIR = COMMON_PATH + "cookie/";     //  ログイン情報保存先ディレクトリ
const LOG_DIR = COMMON_PATH + "log/";           //  ログ保存先ディレクトリ
const REQUIRED_DIR = [IMG_DIR, IMG_INFO_DIR, COOKIE_DIR, LOG_DIR];  //  使用するディレクトリ一覧
const LAST_SAVED_PATH = `${LOG_DIR}last-saved-illust.json`; //  最後に保存処理したイラスト情報保存先

// プログラム実行時の日付作成
const DATE = new Date();
const YEAR = String(DATE.getFullYear());  //  年
const MONTH = ('00' + String(DATE.getMonth() + 1)).substr(-2);  //  月
const DAY = ('00' + String(DATE.getDate())).substr(-2); //  日
const START_DATE = YEAR + MONTH + DAY;  //  プログラム実行時の日付

// 使用するモジュール
const puppeteer = require('puppeteer');     //  ブラウザ自動操作用ライブラリ
const fs = require('fs');                   //  ファイルシステム用
const url = require("url");                 //  URL処理用
const querystring = require('querystring'); //  クエリ文字列処理用

// current target illust infomation (bookmark page number and index)
//  現在のブックマークページの情報（ブックマークのページ番号とそのページ内での処理番号（進行度））
let currentInfo = {
  bookmark: 0,
  progress: 0
}

//  使用するディレクトリを作成する関数
const makeRequiredDir = async () => {
  //  使用するディレクトリ全てに対して処理する
  for (const dir of REQUIRED_DIR) {
    console.log(`Check exist directory: ${dir}`);

    //  ディレクトリが存在するかチェック
    const isExistDir = await fs.existsSync(dir);

    if(isExistDir){
      // ディレクトリが存在する場合は何もしない
      console.log(`Exist directory: ${dir}`);
    }else{
      // ディレクトリが存在しない場合はディレクトリを新規作成
      console.log(`Make directory: ${dir}`);
      await fs.mkdirSync(dir);
    }
  }
}

// ブックマークページのURLを取得する関数
// page:  Puppeteerのページオブジェクト
// 戻り値: ブックマークページのURL（String）
const getBaseBookmarkUrl = async (page) => {
  // 現在（2021/12/17）のブックマークページのURLにはユーザidが必要だが，
  // 旧ブックマークページのURLはidが必要ないので，旧URLでページ遷移して現在のURLを取得する．

  // 以前使われていたブックーマークページのURL
  const oldBookmarkPageUrl = "https://www.pixiv.net/bookmark.php";
  // ページ遷移後の標準出力用メッセージ
  const messageAfterGoing = "Go to user's bookmark page."

  // ブックマークページへ遷移
  await goToPage(page, oldBookmarkPageUrl, messageAfterGoing);

  // ブックマークページのURL取得
  const latestBookmarkPageUrl = await page.url();

  return await latestBookmarkPageUrl;
}

// ページ遷移後，読込が完了するまで待つ関数
// page:    Puppeteerのページオブジェクト
// pageUrl: 遷移先URL（String）
// output:  ページ遷移完了後，標準出力するメッセージ（String）
const goToPage = async (page, pageUrl, output = "") => {
  // ページ遷移完了まで待つプロミス
  const waitGotoPage = new Promise(resolve => page.once('load', resolve));

  // ページ遷移
  await page.goto(pageUrl);

  // ページ遷移完了
  await waitGotoPage.then(() => {
    // ページ遷移完了後，標準出力
    if(output)  console.log(output);
  });
}

// 既に保存してあるログイン情報（Cookie）をページにセットする関数
// page:  Puppeteerのページオブジェクト
const setCookieToPage = async (page) => {
  console.log(`[page] : readdir`);

  // 全てのクッキーファイル名を読み込み
  const cookieFileNames = await fs.readdirSync(COOKIE_DIR);

  console.log(`[page] : readFileSync`);

  // 全てのクッキーファイルを処理
  for (let cookieName of cookieFileNames) {
    console.log(`[page] : setCookie "${cookieName}"`);

    const savedPath = `${COOKIE_DIR}${cookieName}`;       // Cookieファイルのパス
    const cookieJson = await fs.readFileSync(savedPath);  // json形式で保存されているcookieファイルを読み取り
    const cookie = await JSON.parse(cookieJson);          // cookieオブジェクトとしてパース

    // ページにcookieをセット
    await page.setCookie(cookie);
  }

  await console.log();
}

// 最後に保存処理したイラストの情報を取得する関数
// 戻り値:
// イラスト情報を取得できなかったらnull
// イラスト情報を取得できたらイラスト情報を含んだオブジェクトを返す
const getLastSavedInfo = async () => {
  // ファイルが存在しているかチェック
  const isExistFile = await fs.existsSync(LAST_SAVED_PATH);

  if(isExistFile){
    // jsonファイル読み込みとパース
    const lastSavedInfoJson = await fs.readFileSync(LAST_SAVED_PATH);
    const lastSavedInfo = await JSON.parse(lastSavedInfoJson);

    return await lastSavedInfo;
  }else{
    // ファイルが存在していなかった場合はnullを返す
    return null;
  }
}

// 保存処理を始めるブックマークページを決定する
// page:  Puppeteerのページオブジェクト
// baseBookmarkPageUrl: ブックマークページのURL（クエリ文字列含まない）
// 戻り値:
// ページ遷移成功した場合，true
// ページ遷移失敗した場合，false
const adjustStartPage = async (page, baseBookmarkPageUrl) => {
  // 最後に保存したイラスト情報を取得
  const lastSavedInfo = await getLastSavedInfo();

  // 最後に保存したイラスト情報の有無で処理を切り替え
  if (lastSavedInfo) {
    // 最後に保存したイラストが表示されているブックマークページへたどり着くまでページ遷移する

    // 最後に保存したイラスト情報をもとにブックマークページの番号を取得し，遷移先のURLを作成
    // 現在遷移しているブックマークページの番号
    let currBookmarkPageNum = await lastSavedInfo.bookmarkPageNum;
    // 保存処理を開始するブックマークページのURL（クエリ文字列含む）
    let startBookmarkPageUrl = await `${baseBookmarkPageUrl}?p=${currBookmarkPageNum}`;

    // ページ遷移
    await goToPage(page, startBookmarkPageUrl);

    // 最後に保存したイラストが表示されているブックマークページへたどり着くまでページ遷移を繰り返す
    while(1){
      // ブックマークページに表示されているイラスト情報（約48枚分）オブジェクト取得
      const UrlsAndTypes = await getIllustTypesAndURLs(page);

      // イラスト情報からURLのみを取得してループ
      for (const {url: illustUrl} of UrlsAndTypes){
        // 現在のブックマークページに最後に保存したイラストが存在すれば処理終了
        if(illustUrl == lastSavedInfo.url){
          await console.log(`${ANSI_GREEN}Success adjusting!!${ANSI_RESET}`);
          return true;
        }
      }

      // 現在のブックマークページに最後に保存したイラストがなかった場合，次のブックマークページに遷移
      currBookmarkPageNum++;
      startBookmarkPageUrl = `${baseBookmarkPageUrl}?p=${currBookmarkPageNum}`;
      await goToPage(page, startBookmarkPageUrl, "Go to next bookmark page for adjusting");

      // ブックマークページにイラストが存在している場合に必ず取得できるタグを取得
      const isIllusts = await page.$(`div[type=illust]`);

      // イラストが存在していないブックマークページの場合，遷移失敗
      if(!isIllusts)
        return false;
    }
  }else{
    // 最後に保存したイラスト情報がなかった場合，一番最後のブックマークページに遷移させる

    // 1ページ目のブックマークページのタグからブックマークしているイラストの総数を取得
    const allBookmarkIllustCount = await page.$eval("h2+div>div>span", span => parseInt(span.innerHTML.replace(/,/g, "")));
    await console.log(`All bookmark illust count: ${ANSI_GREEN}${allBookmarkIllustCount}${ANSI_RESET}`);

    // ブックマークページに表示されるイラストの数
    const bookmarkPageIllustsUnit = await 6*8;

    // ブックマークしているイラスト総数とブックマークページに表示されるイラストの数から最後のブックマークページ番号を取得
    const lastBookmarkPageNum = await Math.ceil(allBookmarkIllustCount/bookmarkPageIllustsUnit);

    // 最後のブックマークページのURL
    const startBookmarkPageUrl = await `${baseBookmarkPageUrl}?p=${lastBookmarkPageNum}`;

    // 最後のブックマークページへ遷移
    await goToPage(page, startBookmarkPageUrl, "go to start bookmark page");
    return true;
  }
}

// イラストの種類を取得．Pixivにはうごイラと1枚だけのイラストと複数イラストの3種類がある
// element: イラスト種類を識別するための要素．PuppeteerのElementHandleオブジェクト
// 戻り値:
// うごイラの場合，0（Number）
// 1枚だけのイラストの場合，1（Number）
// 複数イラストの場合，イラストの枚数（Number）
const getIllustType = async (element) => {
  // うごイラを識別用正規表現
  const regUgoira = /うごイラ$/;

  // imgタグのalt属性から代替テキスト取得
  const alt = await element.$eval(`img`, img => img.alt);
  // うごイラ正規表現に当てはまかどうかチェック
  const isUgoira = await regUgoira.test(alt);
  // 引数のelmentにsvgタグが含まれているかどうかチェック（複数イラストなら含まれている）
  const isManga = await element.$(`svg`);

  if(isUgoira){
    // うごイラの場合
    return 0
  }else if(isManga){
    // 複数イラストの場合

    // 引数のelementからイラストの枚数を取得
    const illustNum = await element.$eval(`span:nth-child(2)`, span => parseInt(span.innerHTML));
    return await illustNum
  }else{
    // 1枚だけのイラスト場合
    return 1
  }
}

// ブックマークページに表示されているイラストの種類（枚数）とURLを取得
// page: Puppeteerのページオブジェクト
// 戻り値: イラストの種類とURL
const getIllustTypesAndURLs = async (page) => {
  await console.log("Reading bookmark page's illusts tag... wait...");

  // ブックマークページに表示されているイラストのaタグまでのセレクター
  const illustSelector = `div[type=illust] a`;
  // ブックマークページに表示されている全イラストの要素（element）
  let illustElements;

  // ブックマークページに表示されているイラストのタグを全て取得したかどうかのフラグ
  while(1){
    // ブックマークページに表示されているイラストのタグが全て取得できるまで繰り返す

    // ブックマークページに表示されている全イラストのaタグを取得
    illustElements = await page.$$(illustSelector);

    // 全イラストのタグに対してフォーカスする
    for (const ele of illustElements)
      await ele.focus();

    // ブックマークページに表示されているイラストのimgタグまでのセレクター
    const imgSelector = `${illustSelector} img`;
    // ブックマークページに表示されている全イラストのimgタグを取得
    const imgElement = await page.$$(imgSelector);

    // ブックマークページに表示されているイラストのaタグとimgタグが一致すれば繰り返し処理終了
    if(illustElements.length > 0 && illustElements.length == imgElement.length)
      break;
  }

  // ブックマークページに表示さている全イラストのタイプとURLを格納する配列
  const UrlsAndTypes = [];
  for (const element of illustElements) {
    const illustUrl = await element.evaluate(a => a.href);  // イラストのURL
    const illustNum = await getIllustType(element);         // イラストの種類（枚数）
    // イラストのURL，種類，イラストの要素（ElmentHandle）をセットにして配列に追加
    await UrlsAndTypes.push({url: illustUrl, num: illustNum, ele: element});
  }

  return await UrlsAndTypes;
}

// 最後に保存したイラスト情報を後進する関数
// num: ブックマークページの番号
// illustUrl: 最後に保存したイラストのURL
const updateLastSavedIllust = async (num, illustUrl) => {
  // 最後に保存したイラスト情報のオブジェクトをjsonに変換
  const lastSavedIllustInfo = await JSON.stringify({
    bookmarkPageNum: num,
    url: illustUrl
  }, null, "\t");

  //  最後に保存したイラスト情報をjsonで保存
  await fs.writeFileSync(LAST_SAVED_PATH, lastSavedIllustInfo);
};

// 現在のブックマークページの番号をURLから取得する関数
// bookmarkPageUrl: 現在のブックマークページのURL
// 戻り値
// ページ番号を取得できた場合，取得した番号（Number）
// ページ番号を取得できなかった場合，1（Number）
const getCurrBookmarkNum = async (bookmarkPageUrl) => {
  // 現在のブックマークページのURLのクエリ文字列をオブジェクトとして取得
  const query = await url.parse(bookmarkPageUrl).query;
  // ブックマークページ番号を表すクエリ文字列pを取得
  const pageNum = await querystring.parse(query).p;

  if(pageNum)
    // ページ番号を取得できればその番号を返す
    return parseInt(pageNum);
  else
    // ページ番号を取得できなければ1を返す
    return 1;
};

// イラスト情報（タイトルや作者など）を取得する関数
// page:  Puppeteerのページオブジェクト
// obj: イラスト情報保存用オブジェクト
const getIllustInfo = async (page, obj) => {
  // イラストのタイトル取得
  try {
    obj.title = await page.$eval('figcaption h1', val => val.innerHTML);
  } catch (e) {
    obj.title = '';
  }

  // イラストの作者名取得
  const authorTag = 'main div h2 a';
  try {
    obj.author = await page.$eval(authorTag + '+a div', val => val.innerHTML);
  } catch (e) {
    obj.author = '';
  }

  // イラストのURL取得
  try {
    obj.author_page = await page.$eval(authorTag, val => val.href);
  } catch (e) {
    obj.author_page = '';
  }

  // イラストの投稿日取得
  try {
    const posDateTag = 'figcaption div[title="投稿日時"]';
    obj.posting_date = await page.$eval(posDateTag, val => val.innerHTML);
  } catch (e) {
    obj.posting_date = '';
  }

  // イラストの説明文取得
  try {
    obj.description = await page.$eval('#expandable-paragraph-0', val => val.innerHTML);
  } catch (e) {
    obj.description = '';
  }

  // イラストに付けれているタグへのセレクター
  const tagsLi = `figcaption footer ul li`;

  // イラストに付けられているタグの数を取得
  let tagsNum = 0;
  try {
    tagsNum = (await page.$$(tagsLi)).length;
  } catch (e) {
    tagsNum = 0;
  }

  // イラストに付けられているタグの取得
  let tags = [];
  for (let i = 0; i < tagsNum - 1; i++) {
    const tag = await page.$eval(`${tagsLi}:nth-of-type(${i+1})  a`, val => val.innerHTML);
    await tags.push(tag);
  }
  obj.tagsNum = await tagsNum - 1;
  obj.tags = await tags;
}

// 処理を一時的に止めるための処理（デバッグ用）
const stopProcess = async () => {
  await console.log(`Stop process...`);
  const stopPromise = new Promise(resolve => {});
  await stopPromise.then();
}

// ネタバレ表示ボタンがあるかどうかチェックする関数
// page:  Puppeteerのページオブジェクト
// illustAnchor: イラストへのセレクター
const checkNetabare = async (page, illustAnchor) => {
  try {
    await page.waitForSelector(illustAnchor);
  } catch (e) {
    // ネタバレ表示ボタンへのセレクター
    const netabareSelector = `main figure button`;

    // ネタバレ表示ボタンの有無
    const isNetabare = await page.$eval(netabareSelector, button => button.innerHTML.includes("表示"));

    // ネタバレ表示ボタンがあった場合はクリック
    if(isNetabare)
      await page.click(netabareSelector);
  }
}

// イラストをクリックして新規タブで開く関数（新規タブでURL遷移すると403になる場合があるため）
// brwoser: Puppeteerのブラウザオブジェクト
// page:    Puppeteerのページオブジェクト
// sel:     クリックするイラストへのセレクター
const popupIllust = async (browser, page, sel) => {
  // クリックするセレクターがあることを確認
  await page.waitForSelector(sel);

  // 新規タブが開かれるまで待つためのプロミス
  const newPopupPromise = new Promise((resolve) => {
    browser.once('targetcreated', target => resolve(target));
  });

  // クリック回数
  let i = 0;
  // クリック数上限
  const maxLoop = 20;
  // クリックに失敗することがあるので，20回ほどクリックする
  for (; i < maxLoop; i++) {
    try {
      // マウスのホイール押し込みでポップアップ
      await page.click(sel, {
        button: 'middle',
      });
    } catch (e) {
      // クリック失敗．もう一度クリックするためにcontinueする．
      await console.log(`${ANSI_RED}~~~~~~!!CLICK ERROR!!~~~~~~${ANSI_RESET}`);
      await console.log(`${ANSI_RED}${e}${ANSI_RESET}`);
      await console.log(`${i+1}th click again middle click`);
      continue;
    }

    // エラーをキャッチしなかった場合，クリックできているので処理終了
    break;
  }

  // クリック回数が上限と一致している場合，イラストのポップアップに失敗しているのでエラーを投げる
  if (i == maxLoop)
    throw "error popup illust";

  // イラストのポップアップが完了するまで待つ
  await newPopupPromise.then(target => console.log(`popup !!`));
}

// イラスト(png or jpg)とイラスト情報(json)を保存する関数
// page:        Puppeteerのページオブジェクト
// imgBuffer:   保存するイラスト画像のデータ
// illustInfo:  イラスト情報
const saveIllustAndInfo = async (page, imgBuffer, illustInfo) => {
  // オリジナルサイズのイラストURL
  let originalImgUrl;

  try {
    // オリジナルサイズのイラストURL取得
    originalImgUrl = await page.$eval('img', val => val.src);
  } catch (e) {
    console.log("error in saveIllustAndInfo()");
    console.log(e);
    throw e;
  }

  await console.log(originalImgUrl);

  // イラストファイル名取得用正規表現
  const regExpFileName = /\d+\_p\d+\.\D+/;
  //オリジナルサイズのイラストURLからファイル名を取得
  const imgFileName = await originalImgUrl.match(regExpFileName)[0];
  await console.log(`file name : ${imgFileName}`);

  // イラストが保存済みかどうかチェック
  const isExistFile = await fs.existsSync(IMG_DIR + imgFileName);

  // finish process if this illust has been already saved
  if (isExistFile) {
    // イラストが保存済みの場合，処理終了
    await console.log(`${ANSI_GREEN}this illust has been already seved${ANSI_RESET}`);
    return;
  } else {
    // イラストが保存済みでない場合，イラストを保存
    await fs.writeFileSync(IMG_DIR + imgFileName, imgBuffer);

    // 保存したイラストのファイル名をイラスト情報に追加
    illustInfo.file_name = await imgFileName;
    await console.log(illustInfo);
  }

  // 拡張子以降とファイル名を分割するための正規表現
  const regExpSplitExtention = /\.\D+/;
  // 拡張子を省いたイラストのファイル名を取得
  const illustInfoFileName = imgFileName.split(regExpSplitExtention)[0];
  // イラスト情報をjsonに変換
  const illustInfoJson = await JSON.stringify(illustInfo, null, "\t");
  // イラスト情報をjsonで保存
  await fs.writeFileSync(`${IMG_INFO_DIR}${illustInfoFileName}.json`, illustInfoJson);
}

// レスポンスから画像ファイルのデータを取得する関数
// page:        Puppeteerのページオブジェクト
// illustInfo:  イラスト情報
const saveIllustFromResponse = async (page, illustInfo) => {
  // 今は必要ないかも．以前はこれがないとエラーが出ていた．
  await page._client.send('Network.enable', {
    maxResourceBufferSize: 2147483647,
    maxTotalBufferSize: 2147483647,
  })

  // 一応imgタグがあることを確認
  await page.waitForSelector("img");

  // ページを再読み込みしてレスポンス取得（HttpRequest）
  const response = await page.reload({
    timeout: 120000
  });

  const responseUrl = await response.url(); // レスポンスのURL
  const targetUrl = await page.url();       // オリジナルサイズのイラストのURL

  // レスポンスで取得したURLとオリジナルサイズのイラスト（現在のページ）のURLが一致するか確認
  if (responseUrl === targetUrl) {
    // レスポンスのボディ（イラストの画像データ）取得
    const body = await response.buffer();
    // 画像とイラスト情報の保存
    await saveIllustAndInfo(page, body, illustInfo);
  }else{
    // 一致しなかった場合，エラーを投げる
    throw "response error in process of illust saving from response";
  }
}

// cookieをjsonで保存する関数
// page:  Puppeteerのページオブジェクト
const saveCookies = async page => {
  console.log(`[page] : goto "pixiv.net"`);
  await goToPage(page, "https://www.pixiv.net/", "reloaded!!");

  // 現在のページのcookieオブジェクト取得
  const cookies = await page.cookies();

  // 取得したcookieを全て保存
  for (let cookie of cookies) {
    console.log(`[page] : writeFileSync "${cookie.name}.json"`);

    // cookieオブジェクトをjsonに変換
    const cookieJson = await JSON.stringify(cookie);
    // cookieをjson形式で保存
    await fs.writeFileSync(`${COOKIE_DIR}${cookie.name}.json`, cookieJson);
  }
}

// 現在の日時を取得する関数
// 戻り値: 日時を表す文字列
const getCurrDateAndTimeStr = () => {
  const date = new Date();
  const year = String(date.getFullYear());                        // 年
  const month = ('00' + String(date.getMonth() + 1)).substr(-2);  // 月
  const day = ('00' + String(date.getDate())).substr(-2);         // 日
  const hour = ('00' + String(date.getHours())).substr(-2);       // 時
  const minutes = ('00' + String(date.getMinutes())).substr(-2);  // 分

  // 年/月/日 時:分　の形式で返す
  return `${year}/${month}/${day} ${hour}:${minutes}`;
}

// ログファイルの書き込みを行う関数
// message: ログファイルに書き込む内容
const writeLog = async message => {
  // 現在日時の取得
  const currDateAndTime = await getCurrDateAndTimeStr();

  // ログファイルへ書き込み
  await fs.appendFileSync(`${LOG_DIR}log${START_DATE}.txt`, `${currDateAndTime} ${message}\n`);
}


// キャッチできなかったエラー(uncaughtException)をまとめて受け取るイベントハンドラー
process.on('uncaughtException', async (err, origin) => {
  await console.log(`${ANSI_RED}Uncaught Exception Error${ANSI_RESET}`);
  await console.log(err);

  // エラーの内容と発生源のログをとる
  await writeLog(`[${currentInfo.bookmark} - ${currentInfo.progress}] Uncaught Exception Error\nError: ${err}\nOrigin: ${origin}`);

  // 終了コード1で終了
  await process.exit(1);
});

// キャッチできなかったエラー(unhandledRejection)をまとめて受け取るイベントハンドラー
process.on('unhandledRejection', async (err, origin) => {
  await console.log(`${ANSI_RED}Unhandled Rejection Error${ANSI_RESET}`);
  await console.log(err);

  // エラーの内容と発生源のログをとる
  await writeLog(`[${currentInfo.bookmark} - ${currentInfo.progress}] Unhandled Rejection Error\nError: ${err}\nOrigin: ${origin}`);

  // 終了コード1で終了
  await process.exit(1);
});

// イラストが保存されているかどうかをイラストidから確認する関数
// targetUrl: イラストidが含まれるURL
// p: イラストの番号（1枚だけなら0）
// 戻り値:
// イラストが保存済みの場合，true
// イラストが未保存の場合，false
const isExistImg = async (targetUrl, p) => {
  // イラストid
  const illustId = await targetUrl.match(/\d+/)[0];
  // 探す対象となる画像ファイル名
  const searchFileName = await `${illustId}_p${p}`;
  // 保存されている画像のファイル名一覧
  const savedFileNames = await fs.readdirSync(IMG_DIR);

  await console.log(`search file name: ${searchFileName}`);

  // 保存されている画像のファイル名を全て確認する
  for (const fileName of savedFileNames) {
    // 探す対象となる画像ファイル名を含む画像ファイルがあれば終了
    if(await fileName.includes(searchFileName))
      return await true;
  }

  // 未保存の場合，false
  return await false;
};

// イラスト自動保存のメイン処理
(async () => {
  // 必要なディレクトリの作成
  await makeRequiredDir();

  const chromiumWindowWidth = 700;    // Chromiumのウィンドウ幅
  const chromiumWindowHeight = 1070;  // Chromiumのウィンドウ高
  const chromiumX = 0;  // Chromiumのウィンドウ位置X
  const chromiumY = 5;  // Chromiumのウィンドウ位置Y

  // ブックマークページブラウザ用の起動オプション
  const bookmarkBrowserlaunchOpt = {
    headless: HEADLESS_MODE,
    defaultViewport: null,
    devtools: false,
    args: [
      `--window-position=${chromiumX},${chromiumY}`,
      `--window-size=${chromiumWindowWidth},${chromiumWindowHeight}`
    ]
  };

  // イラストページブラウザ用の起動オプション
  const illustBrowserlaunchOpt = {
    headless: HEADLESS_MODE,
    slowMo: 1,
    defaultViewport: null,
    devtools: false,
    args: [
      `--window-position=${chromiumX + chromiumWindowWidth},${chromiumY}`,
      `--window-size=${chromiumWindowWidth},${chromiumWindowHeight}`
    ]
  };

  // ブックマークページブラウザ起動
  const bookmarkBrowser = await puppeteer.launch(bookmarkBrowserlaunchOpt);

  // ブックマークページブラウザの一つ目のタブ（ページ）を取得
  const bookmarkPage = (await bookmarkBrowser.pages())[0];

  // ブックマークページブラウザにcookieをセットしてPixivにログイン
  await setCookieToPage(bookmarkPage);

  // ブックマークページのURL取得
  const baseBookmarkUrl = await getBaseBookmarkUrl(bookmarkPage);

  // 前回の続きから始めるために，前回のブックマークページへ遷移
  const successAdjusting = await adjustStartPage(bookmarkPage, baseBookmarkUrl);

  // ブックマークページに遷移失敗した場合，エラーを投げる
  if(!successAdjusting)
    throw "Failed to adjust";

  // 現在のcookie情報を取得
  const pixivCookies = await bookmarkPage.cookies();

  // bookmark page navigation loop
  // ブックマークページ遷移ループ．ブックマークページ内の全イラストの処理が完了したら次のページへ遷移する．
  while (1) {
    // 現在のブックマークページのURL取得
    const currentURL = await bookmarkPage.url();
    await console.log(currentURL);

    // 現在のブックマークページ番号取得
    const currBookmarkPageNum = await getCurrBookmarkNum(currentURL);
    await console.log(`current page list : ${currBookmarkPageNum}`);

    // 現在のブックマークページ番号の情報後進
    currentInfo.bookmark = await currBookmarkPageNum;
    await writeLog(`[${currentInfo.bookmark}] ${currentURL}`);

    // ブックマークページに表示されている全イラストの種類とURLを取得
    const UrlsAndTypes = await getIllustTypesAndURLs(bookmarkPage);

    // ブックマークページに表示されている全イラスト数を取得
    const bookmarkNum = UrlsAndTypes.length;
    await console.log(`bookmarkNum : ${bookmarkNum}\n`);

    // ブックマークページのイラスト保存処理の進行度
    let progress = 0;

    // ブックマークページの全イラストの保存処理
    for(const {url: illustUrl, num: illustsNum, ele: targetEle} of UrlsAndTypes){
      // ブックマークページ内のイラスト保存処理進行度を進める
      progress++;

      // これから保存処理するイラストへフォーカス
      await targetEle.focus();
      await console.log(`bookmark ${ANSI_GREEN}${currBookmarkPageNum} - ${progress}/${bookmarkNum}${ANSI_RESET}`);
      await console.log(illustUrl);

      // 進行度を更新
      currentInfo.progress = progress;
      await writeLog(`[${currentInfo.bookmark} - ${currentInfo.progress}] ${illustUrl}`);

      // イラストの枚数に応じてイラスト種類を判別して，標準出力
      if(illustsNum === 0){
        // うごイラ
        console.log(`${ANSI_GREEN}<-----------------------------------------ugoira----------------------------------------->${ANSI_RESET}`);
        console.log("Next illust !!");
        console.log(`${ANSI_GREEN}<---------------------------------------------------------------------------------------->${ANSI_RESET}\n`);
        // うごイラには未対応のため，次のイラストに．
        continue;
      }else if(illustsNum === 1){
        // 1枚だけのイラスト
        console.log(`${ANSI_GREEN}<--------------------------------------1page illust-------------------------------------->${ANSI_RESET}`);
      }else{
        // 複数イラスト
        console.log(`${ANSI_GREEN}<------------------------------------------manga------------------------------------------>${ANSI_RESET}`);
      }

      // イラストページブラウザ起動
      const illustBrowser = await puppeteer.launch(illustBrowserlaunchOpt);

      // イラストページブラウザの一つ目のタブ（ページ）を取得
      let illustPage = (await illustBrowser.pages())[0];

      // 新しいブラウザなので，cookieをセットしてログイン
      for (const cookie of pixivCookies)
        await illustPage.setCookie(cookie);

      // 保存するイラストのページへ遷移
      await goToPage(illustPage, illustUrl, "current illust page is loaded !!");

      // イラスト情報用のオブジェクト作成
      let illustInfoObj = new Object();

      // イラストのURLを保存
      illustInfoObj.url = illustUrl;

      // イラスト情報を取得
      await getIllustInfo(illustPage, illustInfoObj);

      // イラストへのaタグ
      const illustAnchor = 'div[role="presentation"]>a';

      //　ネタバレ注意表示の有無をチェックし，あった場合には表示する
      await checkNetabare(illustPage, illustAnchor);

      // 複数イラストかどうか判別
      const isManga = illustsNum > 1;
      if(isManga){
        try {
          // 複数イラストの場合，一度イラストをクリックしないと2枚目以降のイラストのタグが現れないのでクリックする
          await illustPage.click(illustAnchor);
          await console.log("click for opening all illusts");
        } catch (e) {
          // クリック失敗した場合，エラーを投げる
          console.log(`${ANSI_RED}${e}${ANSI_RESET}`);
          throw `Manga illust click error: ${e}`
        }

        console.log(`${ANSI_GREEN} ${illustsNum} pages manga\n${ANSI_RESET}`);
      }

      // イラストを1枚ずつ画像ファイルとして保存するループ
      for (let i = 1; i <= illustsNum; i++) {
        await console.log(`${ANSI_GREEN}${i}${ANSI_RESET}/${ANSI_GREEN}${illustsNum}${ANSI_RESET}`);

        // この時点でイラストが保存済みかどうか確認する
        if(await isExistImg(illustUrl, i-1)){
          // 保存済みの場合，次のイラストへ．
          await console.log(`${ANSI_GREEN}this illust has been already seved before middle click.${ANSI_RESET}`);
          continue;
        }

        // クリックするイラストへのセレクター
        let clickIllustAnchor = illustAnchor;

        // 複数イラストの場合，タグが1階層多くなるのでセレクターにその分を追加
        if (isManga) {
          clickIllustAnchor = await `div[id="${i}"] + ${clickIllustAnchor}`;
        }

        // 1つ目のタブに制御切り替え
        illustPage = (await illustBrowser.pages())[0];

        // イラストを新しいタブで開く
        await popupIllust(illustBrowser, illustPage, clickIllustAnchor);

        try {
          // 新しく開いたタブに制御切り替え
          illustPage = (await illustBrowser.pages())[1];
          await illustPage.bringToFront();
        } catch (e) {
          await console.log("Can't get page...");
          throw e;
        }

        // イラストを保存
        await saveIllustFromResponse(illustPage, illustInfoObj);

        // 最後に保存したイラストの情報を更新
        await updateLastSavedIllust(currBookmarkPageNum, illustUrl);

        //　新しく開いたタブを閉じる
        await illustPage.close();
      }

      // イラストページブラウザを閉じる
      await illustBrowser.close();

      await console.log(`${ANSI_GREEN}<---------------------------------------------------------------------------------------->${ANSI_RESET}\n`);
    }

    // ブックマークページを手前に表示
    await bookmarkPage.bringToFront();

    // 次のブックマークページ番号
    const nextBookmarkPageNum = currBookmarkPageNum - 1;

    // 次のブックマークページ番号が0なら終了
    if(nextBookmarkPageNum === 0)
      break;

    // 次のブックマークページのURLを作成
    const nextURL = `${baseBookmarkUrl}?p=${nextBookmarkPageNum}`;

    // 次のブックマークページへ遷移
    await goToPage(bookmarkPage, nextURL, "next bookmark page loaded!!");
  }

  await console.log('complete saving all bookmarked illust\n');

  // cookieの更新として新たに上書き保存
  await saveCookies(bookmarkPage);
  await console.log(`${ANSI_GREEN}save cookies${ANSI_RESET}`);

  await console.log('close browser');

  // ブックマークページブラウザを閉じて終了
  await bookmarkBrowser.close();
})();
