# Antigravityを使ってみよう
**〜 とりあえずAI Agentを使って、ゲーム制作を少しでも楽にしよう 〜**

---

## 1. はじめに

本資料では、AI Agentに触ったことがない方でもスムーズに導入でき、実際にUnityプロジェクトでAIにコードを書かせてゲームを動かすところまでを解説します。

### なぜAntigravityなのか？
1. **Googleアカウントがあれば誰でも無料で使える**  
   複雑なAPIキーの取得やクレジットカード登録なしで、手軽にAI Agentを試せます。
2. **雑にそこそこ動いてくれる**  
   他のAIエージェントと比べ、利用コストが安価で気軽に利用できます。
3. **簡単にインストール・削除ができる**  
   インストーラーが用意されており、不要になった場合も簡単にアンインストール可能です。
4. **VS Codeベースで馴染みやすい**  
   エディタ部分は広く使われているVS Codeがベースになっているため、拡張機能や操作感そのままに、右パネルのAI Agentと対話しながら開発できます。

---

## 2. インストールと初期セットアップ

Antigravity環境は、複数のアプリケーションから構成されます。
今回は以下の2つのアプリケーションを使用します。
- **Antigravity 2.0**（AI Agentのコア・スタンドアロン実行アプリ／アイコンが白っぽい）
- **Antigravity IDE**（Agentが統合された統合開発環境／アイコンが黒っぽい）

> [!IMPORTANT]
> **インストールの順番についての注意**  
> 必ず **① Antigravity（本体） → ② Antigravity IDE** の順番でインストールを行ってください。

---

### 2.1 インストーラーのダウンロード

まずは公式サイトのダウンロードページにアクセスします。

- **ダウンロードURL**: [https://antigravity.google/download](https://antigravity.google/download)

自身のOS（Windows環境であれば通常は **Windows x64**）に合わせて、以下の2つをダウンロードします。

1. **Antigravity 2.0** (`Download for x64`)
2. **Antigravity IDE (Standalone)** (`Download for x64`)

| Antigravity 2.0のダウンロード | Antigravity IDEのダウンロード |
| :---: | :---: |
| ![Antigravity 2.0 のダウンロード](1_jpg/01_download_antigravity.jpg) | ![Antigravity IDE のダウンロード](1_jpg/02_download_antigravity_ide.jpg) |

---

### 2.2 Antigravity（本体・白い方）のインストールと認証

まずは本体となる **Antigravity** を起動してセットアップを行います。

#### Step 1: 起動とGoogleサインイン
ダウンロードしたインストーラーを実行し、起動すると「Welcome to Antigravity」という画面が表示されます。  
中央の **「Continue with Google」** をクリックします。

| Welcome to Antigravity |
| :---: |
| ![Welcome to Antigravity](1_jpg/03_antigravity_welcome.jpg) |

#### Step 2: Webブラウザでアカウント連携
Webブラウザが自動的に立ち上がり、Googleアカウントのログイン画面が表示されます。  
使用するGoogleアカウントを選択してください。

| Googleアカウントの選択 |
| :---: |
| ![Googleアカウントの選択](1_jpg/04_google_auth_account_select.jpg) |

「このアプリを Google からダウンロードしたことをご確認ください」という画面が出たら、**「ログイン」** をクリックします。

| ダウンロード元の確認とログイン |
| :---: |
| ![ダウンロード元の確認とログイン](1_jpg/05_google_auth_confirm.jpg) |

ブラウザに「You have successfully authenticated.」と表示され、「Antigravity を開きますか？」というダイアログが出るので、**「Antigravity を開く」** をクリックしてアプリに戻ります。

| Antigravityを開くダイアログ |
| :---: |
| ![Antigravityを開くダイアログ](1_jpg/06_google_auth_launch_app.jpg) |

#### Step 3: セキュリティ規約への同意とテーマ選択
アプリ側に戻ると、「Security Notice & Data Use」が表示されます。内容を確認してチェックを入れ、**「Next」** を押します。

| Security Notice & Data Use |
| :---: |
| ![Security Notice & Data Use](1_jpg/07_antigravity_security_notice.jpg) |

好みのカラーテーマ（System / Light / Dark）を選択し、**「Finish」** をクリックします。

| テーマ選択 |
| :---: |
| ![テーマ選択](1_jpg/08_antigravity_select_theme.jpg) |

Antigravityのメイン画面が表示されれば、本体のセットアップは完了です！

| Antigravityメイン画面 |
| :---: |
| ![Antigravityメイン画面](1_jpg/09_antigravity_main_window.jpg) |

---

### 2.3 Antigravity IDE（エディタ・黒い方）のインストール

次に、日常の開発でコードを書く統合開発環境 **Antigravity IDE** をインストールします。

#### Step 1: インストーラーの実行
ダウンロードした `Antigravity IDE` のインストーラーを実行します。

1. **使用許諾契約書の同意**: 内容を確認し、「同意する」を選んで **「次へ」** をクリックします。

| 使用許諾契約書の同意 |
| :---: |
| ![使用許諾契約書の同意](1_jpg/11_ide_install_license.jpg) |

2. **インストール先の指定**: デフォルトのままで問題なければ **「次へ」** をクリックします。

| インストール先の指定 |
| :---: |
| ![インストール先の指定](1_jpg/12_ide_install_destination.jpg) |

3. **スタートメニューフォルダーの指定**: そのまま **「次へ」** をクリックします。

| スタートメニューフォルダーの指定 |
| :---: |
| ![スタートメニューフォルダーの指定](1_jpg/13_ide_install_startmenu.jpg) |

4. **追加タスクの選択**: デスクトップアイコンの作成や、PATHへの追加など好みのオプションを選択して **「次へ」** をクリックします。

| 追加タスクの選択 |
| :---: |
| ![追加タスクの選択](1_jpg/14_ide_install_tasks.jpg) |

5. **インストール進行と完了**: ファイル展開が進み、完了画面で「Antigravity IDE を実行する」にチェックを入れた状態で **「完了」** を押します。

| インストール進行状況 | セットアップウィザード完了 |
| :---: | :---: |
| ![インストール進行状況](1_jpg/15_ide_install_progress.jpg) | ![セットアップウィザード完了](1_jpg/16_ide_install_finish.jpg) |

---

### 2.4 Antigravity IDEの初期セットアップウィザード

IDEが起動すると、初回セットアップウィザードが表示されます。

#### 1. Googleアカウントでのログイン
「Welcome to Antigravity IDE」画面で **「Continue with Google」** を押し、ブラウザでログインを完了させます。  
「Success, Continuing...」と表示されたら、右下の青い **「Next」** ボタンをクリックします。

| Welcome to Antigravity IDE | ログイン成功・Next |
| :---: | :---: |
| ![Welcome to Antigravity IDE](1_jpg/17_ide_welcome_login.jpg) | ![ログイン成功・Next](1_jpg/18_ide_login_success.jpg) |

#### 2. セットアップフローの選択
「Choose setup flow」画面では、**「Start fresh」** を選択して **「Next」** をクリックします（新規推奨）。  
※既存のVS Code設定を引き継ぎたい場合は「Import from VS Code」でも構いません。

| Choose setup flow |
| :---: |
| ![Choose setup flow](1_jpg/19_ide_setup_flow.jpg) |

#### 3. カラーテーマの選択
好みのエディタ配色（Dark Modern、Solarized Dark、Light Modernなど）を選んで **「Next」** をクリックします。

| Select Theme |
| :---: |
| ![Select Theme](1_jpg/20_ide_select_theme.jpg) |

#### 4. AI Agentの動作モード選択（超重要！）
「How do you want to use the Antigravity IDE Agent?」という画面が表示されます。  
ここでは **「Review-driven development（推奨）」** を選択してください。

| Review-driven development推奨 |
| :---: |
| ![Review-driven development推奨](1_jpg/21_ide_agent_mode_review.jpg) |

> [!TIP]
> **なぜ「Review-driven development」なのか？**  
> AIが勝手にすべてのファイルを書き換えるのではなく、「こういうコマンドを実行して良いか？」「このコード差分を適用して良いか？」を人間に対してこまめに確認（Review）してくれる安全なモードです。予期しないファイル破壊を防ぎ、AIが何をしているかを把握しやすくなります。慣れてきたらAgent-driven developmentに変更するのも良いでしょう。

#### 5. エディタ設定（キーバインド・拡張機能）
- **Keybindings**: 通常は「Normal」のままでOKです（Vim使いの方は「Vim」も選択可能）。
- **Extensions**: 「Recommended」のままで **「Next」** をクリックします。

| Configure Your Editor |
| :---: |
| ![Configure Your Editor](1_jpg/22_ide_configure_editor.jpg) |

#### 6. セキュリティとデータ利用の確認
規約内容を確認してチェックを入れ、**「Next」** をクリックします。

| Security Notice & Data Use (IDE) |
| :---: |
| ![Security Notice & Data Use (IDE)](1_jpg/23_ide_security_notice.jpg) |

これで初期セットアップはすべて完了です！  
右側にAI Agentのチャットパネルが統合されたAntigravity IDEのメイン画面が立ち上がります。

| Antigravity IDEメイン画面 |
| :---: |
| ![Antigravity IDEメイン画面](1_jpg/24_ide_main_window.jpg) |

---

## 3. 実践：UnityでAI Agentを使ってみる！

ここからは、実際にUnityプロジェクトをAntigravity IDEで開き、AI Agentに「3D FPSゲーム」を丸ごと作らせてみます。

### 3.1 Unityプロジェクトの作成

まずはUnity Hubから普段通りにプロジェクトを作成します。

1. Unity Hubを起動し、「新しいプロジェクト」をクリック。
2. テンプレートとして **「Universal 3D」**（または通常の3D）を選択。
3. プロジェクト名を決めて（例: `AntigravityTest`）、**「プロジェクトを作成」** をクリック。
4. Unityエディタが起動したら、Inspector内にある **「Remove Readme Assets」** をクリックして初期テンプレートの余計なアセットを削除しておきます。

| Unity Hubで新規プロジェクト作成 | Unityエディタの初期画面 |
| :---: | :---: |
| ![Unity Hubで新規プロジェクト作成](2_jpg/01_unity_new_project.jpg) | ![Unityエディタの初期画面](2_jpg/02_unity_remove_readme.jpg) |

---

### 3.2 Antigravity IDEでプロジェクトを開く

作成したUnityプロジェクトをAntigravity IDEで読み込みます。

#### Step 1: プロジェクトのフォルダパスをコピー
1. Unity Hubのプロジェクト一覧画面で、作成したプロジェクトの右端にあるメニュー（`...`）をクリック。
2. **「エクスプローラーで表示」** を選択します。
3. エクスプローラーで該当プロジェクトフォルダーを右クリックし、**「パスのコピー」**（またはアドレスバーからコピー）します。

| Unity Hubからエクスプローラーで表示 | パスのコピー |
| :---: | :---: |
| ![Unity Hubからエクスプローラーで表示](2_jpg/03_unityhub_show_explorer.jpg) | ![パスのコピー](2_jpg/04_explorer_copy_path.jpg) |

#### Step 2: Antigravity IDEで開く
1. Antigravity IDEのメニューから **File > Open Folder...** をクリックします。
2. 先ほどコピーしたプロジェクトパスを貼り付けてフォルダーを選択します。
3. 「Do you trust the authors of the files in this folder?（このフォルダーの作成者を信頼しますか？）」というセキュリティダイアログが表示されるので、**「Yes, I trust the authors」** をクリックします。

| File > Open Folder | Open Folderダイアログ | フォルダの信頼確認 |
| :---: | :---: | :---: |
| ![File > Open Folder](2_jpg/05_ide_open_folder_menu.jpg) | ![Open Folderダイアログ](2_jpg/06_ide_open_folder_dialog.jpg) | ![フォルダの信頼確認](2_jpg/07_ide_trust_authors.jpg) |

プロジェクトのフォルダツリーが読み込まれれば準備完了です！

| プロジェクト読み込み完了 |
| :---: |
| ![プロジェクト読み込み完了](2_jpg/08_ide_project_opened.jpg) |

---

### 3.3 AI Agentにゲームを作らせてみる

いよいよAI Agentに実装の指示を出します。

#### 1. AIモデルの確認・選択
右側のAgentチャット入力欄の下にあるモデル選択メニューを開き、**「Gemini 3.8 Flash Medium」** を選択します。  

| モデル選択 |
| :---: |
| ![モデル選択](2_jpg/09_ide_select_model.jpg) |

#### 2. プロンプト（指示テキスト）の入力
チャット欄に以下のような要件を詳しく記述したプロンプトを入力し、送信します。

```text
Unityで3DのFPSゲームを作成してください
ハンドガン片手に、壁走りを用いたアクションをできるようにしてください
射撃は画面の中央から一定距離の円の中に含まれる画面中央に最も近い敵を攻撃するようにしてください
この射撃範囲の円と狙っている対象をUIで表示するようにしてください
射撃範囲は画面のサイズの縦もしくは横に合わせた比率をベースとして設定できるようにしてください
壁走りは一定時間壁に沿って移動でき、一定時間後は下に落ちていくようにしてください
テストが行えるSceneも作成してください
```

| プロンプトの入力 |
| :---: |
| ![プロンプトの入力](2_jpg/10_ide_input_prompt.jpg) |

#### 3. Agentの提案と承認（Review-driven development）
送信すると、AI Agentがプロジェクト構造を調査し、Unityのプロセス確認やスクリプト作成のコマンドを実行しようとします。

「Review-driven development」に設定しているため、コマンド実行前に **「Allow checking Unity process?」** などの承認ダイアログが表示されます。  
内容を確認し、**「1 Yes, allow this time」** を選択して **「Submit」** を押します。
Submitボタンが押せない場合は、1 Yes...を押した後、1キーを押すと進みます。

| コマンド実行の承認ダイアログ |
| :---: |
| ![コマンド実行の承認ダイアログ](2_jpg/11_ide_allow_action_dialog.jpg) |

#### 4. 生成されたコードの確認と反映
AI Agentは必要なC#スクリプトや素材等を一気に作成・修正します。

右パネルには変更されたファイルの一覧（例: `10 Files with Changes`）が表示され、中央エディタでは差分をプレビューできます。  
問題なければ **「Accept all」**（または各ファイルの `Accept`）をクリックしてプロジェクトへ変更を確定させます。

| 変更ファイルのレビューとAccept |
| :---: |
| ![変更ファイルのレビューとAccept](2_jpg/12_ide_review_changes_accept.jpg) |

---

### 3.4 Unityで動作を確認する！

Unityエディタに戻ると、AIが自動生成したスクリプトとテスト用シーンが反映されています。

再生ボタン（Play）を押してテストしてみましょう！
※時と場合によって生成されるものは変わるため、今回の結果と異なる場合があります。

| Unityでの実行テスト |
| :---: |
| ![Unityでの実行テスト](2_jpg/13_unity_play_test.jpg) |

指示文ひとつで、ゲームのプロトタイプができました！

---

## 4. AI Agentを上手に使いこなすためのコツ

### 1. 「丸投げ」よりも「機能単位」や「拡張」で使う
今回はデモとしてゲーム全体を一度に作らせましたが、AIにすべてを丸ごと作らせると、**「AIにとって作りやすい構造」** になりがちで、人間が後から手を入れるのが大変になることがあります。(2026年10月現在)

本格的な制作では、以下の使い方がおすすめです。
- 自分で書いた基本コードを渡し、「このクラスに壁走り判定の処理を追加して」と依頼する
- 「指定した座標に敵をスポーンさせる関数を作って」とパーツ単位で依頼する
- 「バグでジャンプが連続で出てしまうので、原因を特定して直して」とデバッグを依頼する

### 2. モデルの特徴を理解する
- **Gemini 3.8 Flash**: 軽快に動き、日常的なコード生成・日本語での意思疎通・小規模なタスクに最適ですが、大規模なアーキテクチャ設計やグラフィック演出の調整は苦手な面があります。
- より複雑な要件や綿密な設計が必要な場合は、ClaudeのOpus、Chat-GPTのSolなどの他ツール・上位モデルと使い分けるとさらに効果的です。

### 3. コードリーディングや調査にも活用する
他人が書いたコードや、Asset Storeで購入したアセットの仕様がよく分からない時、**「このプロジェクト全体の構造を解説して」「PlayerControllerがどのコンポーネントと通信しているか図解して」** と質問すると、プロジェクト全体を走査してわかりやすいレポートを作ってくれます。

---

## 5. おわりに

AI Agentは、現代の開発においてなくてはならない存在になりました。
まずはGoogleアカウントひとつで手軽に始められるAntigravityを使って、ゲーム制作の「ちょっと面倒な作業」をAIに任せてみてください。開発のスピードと楽しさがグッと跳ね上がるはずです！

> [!NOTE]
> 実は、この解説資料自体も人間が下書きと画像を用意し、Antigravityが構成の補完・詳細な手順の解説・画像の整理とレイアウトを行い、最後に人間が少し手直しをして完成しました。
> コード作成だけでなく、ドキュメント作成や資料作成のパートナーとしても大いに役立ちます！
