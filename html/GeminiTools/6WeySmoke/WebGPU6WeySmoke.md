# WebGPU 6-Way Smoke & Explosion Flipbook Generator 仕様書

## 技術スタック
- フレームワーク不使用の Vanilla JS (ES Modules) + HTML/CSS (ダークテーマUI)
- グラフィックス/計算: WebGPU API & WGSL (Compute Shader / Render Pipeline)
- 画像エンコード: 16-bit PNG 書き出し用に `fast-png` (CDNまたはローカル) のみ使用可

## 出力フォーマット (Unity Six-way Smoke Lit 互換)
以下の2枚のフリップブックテクスチャ (例: 2048x2048, 8x8グリッド = 64フレーム) を生成・ダウンロード可能にする:
1. `Lightmap_Pos.png` (16-bit RGBA): R=+X光, G=+Y光, B=+Z光, A=Alpha(吸収率)
2. `Lightmap_Neg.png` (16-bit RGBA): R=-X光, G=-Y光, B=-Z光, A=Emissive(温度/発光)

## 実装フェーズ
- **Phase 1**: WebGPU初期化、64x64x64の3Dボリュームへのプロシージャルノイズ生成(Compute)、レイマーチングプレビュー表示。
- **Phase 2**: 6方向レイマーチングベイクパスと、画面上で仮想ライトの向きを動かして陰影を確認できるSix-wayプレビューシェーダーの実装。
- **Phase 3**: 3Dグリッド流体シミュレーション(移流・浮力・渦度閉じ込め・圧力投影)のCompute Shader実装と、プリセット(煙・爆発・砂埃・蒸気)のUIパラメータ化。
- **Phase 4**: 全フレームの自動ベイク、Atlasパッキング、`GPUBuffer.mapAsync` による非同期リードバック、2枚の16-bit PNG一括ダウンロード機能。

## 制約事項
- すべてのWGSLシェーダーは独立した `.wgsl` ファイルに分離すること。
- 各フェーズ完了時にブラウザのコンソールエラーおよび `device.pushErrorScope('validation')` のエラーがゼロであることを確認すること。