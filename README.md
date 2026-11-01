# Personal Browser OS

ブラウザの中に、自分専用のデスクトップ環境を作るプロジェクトです。GitHub Pagesで公開できる、ビルド不要の静的Webアプリとして構成しています。

## Features

- デスクトップ画面、アプリランチャー、ドック
- ウィンドウの移動、リサイズ、最大化、最小化、終了
- Calculator：四則演算と括弧に対応した電卓
- Notes：入力内容をブラウザ内に自動保存
- Image Viewer：端末内の画像をローカルでプレビュー
- Settings：テーマと壁紙の切り替え
- App Center：Webサイトや自作Webアプリをランチャーに登録
- PWA manifest と Service Worker によるインストール・オフライン起動の基盤

## Run locally

リポジトリをクローンして、ルートディレクトリでローカルHTTPサーバーを起動してください。

Pythonが使える場合：

    python -m http.server 8000

ブラウザで http://localhost:8000/ を開きます。

Service Worker と PWA の動作確認には、localhost または HTTPS が必要です。HTMLファイルを直接開く file:// では一部機能が動作しません。

## Publish with GitHub Pages

1. GitHubでこのリポジトリの Settings を開きます。
2. 左側の Pages を開きます。
3. Build and deployment の Source を Deploy from a branch にします。
4. Branch を main、Folder を / (root) にして Save します。
5. 公開完了後、次のURLでアクセスできます。

   https://temesotejam.github.io/personal-browser-os/

## Data and privacy

- Notes、外観設定、追加したアプリ情報は localStorage に保存されます。
- 保存先は利用中のブラウザ・端末です。別のブラウザや端末とは自動同期されません。
- Image Viewerで選択した画像はブラウザ内でプレビューするだけで、サーバーへアップロードしません。
- 追加したWebアプリはサンドボックス化したiframe内で表示します。サイト側の設定（X-Frame-Options / Content-Security-Policy）によっては埋め込みが拒否される場合があります。

## Project structure

- index.html — デスクトップの基本構造
- styles.css — デスクトップ、ウィンドウ、アプリのスタイル
- app.js — ウィンドウ管理、ランチャー、各アプリの動作
- manifest.webmanifest — PWA設定
- sw.js — アプリシェルのキャッシュ
- assets/icon.svg — アプリアイコン

## Next ideas

- ファイル管理アプリとデスクトップ上のショートカット管理
- ウィンドウ配置・サイズの保存
- アプリごとの設定やショートカットキー
- 自作ツールを追加しやすいアプリAPI
- ウィジェットや通知センター

---

Built for a personal workspace. No build step, no backend, no account required.