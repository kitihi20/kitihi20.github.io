# dekamonitor大雑把ステージ作成方法

## 新しいゲームのSceneを作成したいとき
- TestSceneをコピペ
- Levelの中にステージの素材を配置
- StageManager等の内容を変更


## 大まかなステージの作り方
- 3Dモデルを配置
- StageEncounterPointを配置
- StageEncounterPointを大雑把に繋ぐSplineを配置
- 敵移動経路のSplineを配置
- StageEncounterPointの敵出現設定を調整


## Splineの作り方
- このプロジェクトのプレイヤーの移動経路や敵の移動経路は全てSplineを用いて制御する
- 作り方はこの動画を参照
<video width="99%" src="./CreateSpline.mp4" controls="true"></video>


## StageManagerとその子の中身

### StageManager
現在のステージの情報を持つ
- StageName以外変更する必要なし

### StageMovementController
ステージの移動を管理
- PathSegments[]: 移動経路情報
  - SegmentName: 識別名、テキトーでOK
  - SplineContainer: 移動経路を示すSpline
  - MoveDuration: 移動にかかる時間
  - MoveCurve: どれくらいの時間でどれくらいの割合の場所にいるか
  - DestinationEncounter: 戦闘する場所
  - IsGoalSegment: ゴールへ続く道か
  - Goalの場合移動経路のみでOK

### StageEncounterPoint
戦闘する場所の情報を持つ
- EncounterType
  - Stop: その場に停止して戦う
  - LoopPath: LoopSplineに沿って移動しながら戦う
- LoopSpline: 上記設定に用いるループ用のSpline
- LoopCycleDuration: 上記の1ループにかかる時間
- EnemyWave: 敵の出現情報
  - WaveName: 現在未使用
  - Enemies[]: 出現する敵の情報
    - EnemyPrefab: 出現させる敵のプレハブ
    - MovementSpline: 敵の移動経路を示すSpline
    - SplineStartT: 上Splineのどこから出現させるか
    - SplineEndT: 上Splineのどこから出現させるか
    - SplineMoveDuration: 上Splineを移動する時間、0以下の場合敵の移動速度参照
    - SplineMoveCurve: 上Splineをどれくらいの時間でどれくらいの割合の場所にいるか
    - SpawnPoint: 上Splineが無いときの敵出現位置
    - CombatAnchor: 上Splineが無いときの敵戦闘位置
    - SpawnDelay: この場所に来てから何秒後にこの敵を出現させるか