'use strict'

// 標準入力
process.stdin.setEncoding("utf8");
const reader = require("readline").createInterface({input: process.stdin});

// 使用するモジュール
const puppeteer = require('puppeteer'); // ブラウザ自動操作用ライブラリ
const fs = require('fs');               //  ファイルシステム用

// 保存用ディレクトリ
const COMMON_PATH = "./";                   // 共通のパス
const COOKIE_DIR = COMMON_PATH + "cookie/"; // ログイン情報保存先ディレクトリ
const REQUIRED_DIR = [COOKIE_DIR];          // 使用するディレクトリ一覧

// Pixivのトップページ
const PIXIV_URL = "https://www.pixiv.net/";

// Puppeteerのブラウザオブジェクト
let browser;

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

// 標準入力改行イベントハンドラー
reader.on("line", async (line) => {
  // 入力文字列を全て小文字にする
  await line.toLowerCase();
  await console.log(`input: ${line}`);

  // 入力コマンドに応じて処理を分ける
  switch (line) {
    // login: 保存されたcookieファイルをブラウザにセットしてログイン
    case "login":
      await console.log("Set saved cookies to this page.");
      await setCookieToPage((await browser.pages())[0]);
      await ((await browser.pages())[0]).reload();
    break;
    // save: 現在のページのcookieを保存
    case "save":
      await console.log(`Set current page's cookies and finish puppeteer`);
      await saveCookies((await browser.pages())[0]);
      await browser.close();
      await process.exit();
      break;
    // finish: 本プログラムの終了
    case "finish":
      await console.log("Finish this process....");
      await process.exit();
      break;
    // 無効な入力の場合は使用可能なコマンドを表示
    default:
      await console.log(`Invalid input. If you want to confirm login state, you should input "login" command.`);
      await console.log(`Invalid input. If you want to set cookies, you should input "save" command.`);
      await console.log(`Invalid input. If you want to finish this process, you should input "finish" command.`);
  }

  process.stdout.write(">>");
});

// 標準入力ストリームの終了イベントハンドラー
reader.on("close", async () => {
  // ブラウザを閉じる
  await browser.close();
  await console.log(`stream is closed.`);
});

// 手動でログインしてcookieを保存のメイン処理
(async () => {
  // 必要なディレクトリの作成
  await makeRequiredDir();

  await console.log("Launch Chromium...");

  // ブラウザ立ち上げ
  browser = await puppeteer.launch({
    headless: false,
    defaultViewport: null,
  });

  // 1つ目のタブを取得
  const page = (await browser.pages())[0];
  // Pixivのトップページへ遷移
  await page.goto(PIXIV_URL);

  // コマンドガイド
  await console.log();
  await console.log("~~~~コマンド一覧~~~~");
  await console.log("login  保存されたログイン情報を用いてログイン");
  await console.log("save   ログイン情報の保存");
  await console.log("finish 本プログラムの終了");
  await console.log("~~~~~~~~~~~~~~~~~~~~");
  await console.log();
  await console.log("現在立ち上げたブラウザでログインしてください");
  await console.log(`ログイン後はブラウザを閉じずに，以下に"save"と打ち込んでください`);
  process.stdout.write(">>");
})();
