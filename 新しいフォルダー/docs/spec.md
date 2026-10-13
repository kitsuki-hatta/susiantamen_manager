# 漁場生産力・水産多面的機能強化対策 活動管理システム（大分県・藻場/干潟版）仕様書

## 1. 目的

大分県内で漁場生産力・水産多面的機能強化対策事業（藻場・干潟の保全活動）に
取り組む活動組織が、日次の計画・実績・物品・予算・支払管理から、
国指定様式（様式1〜6）の報告書作成までを一元的に行えるようにする。

## 2. 設計方針

- 従来の「管理アプリ」と「報告書アプリ」を完全統合し、同一 store を直接参照
- 国の要綱で規定される固定項目（活動項目・費目・期）はハードコード
- 組織ごとに異なる運用（賃金方式・地区・名簿・使用活動項目・年度・代表者）はマスタ化
- 複数の活動組織を切り替えて管理し、業務データを組織単位で分離
- 予算は水産多面的（単一事業）に一本化
- 対象活動メニューは藻場・干潟の保全に限定（大分県版）
- クライアント完結型を維持（localStorage + IndexedDB、認証なし）
- 旧アサリ版データの取込機能は搭載しない

## 3. システム境界

- クライアントのみで完結（HTML/CSS/JavaScript + ExcelJS）
- 通常の業務データは localStorage（標準キー `moba_`）。追加組織は組織IDを含む名前空間を使用
- 日々の作業データ・画像Blobは組織別IndexedDBにも保存
- 認証・ユーザー権限機能は未実装

## 4. 既存アプリ（アサリ版）との分離要件【必須】

- 全 localStorage キーは `moba_` プレフィックス（`asari_` 使用禁止）
- バックアップ format 識別子は `moba_full_backup_v1`
- 復元時、format が `moba_full_backup_v1` でないファイルは拒否
- 同一端末で併用してもデータ混在なし
- 本アプリ一式は独立ディレクトリに配置

## 5. 固定マスタ（要綱規定・ハードコード）

### 5.1 活動項目マスタ

各組織は「単価・設定」で使用項目を有効化（enabled）できる。

#### 藻場の保全（category: moba）
| code | label |
|---|---|
| moba_01 | 母藻の設置 |
| moba_02 | 海藻の種苗生産 |
| moba_03 | 海藻の種苗投入 |
| moba_04 | アマモの移植及び播種 |
| moba_05 | 食害生物の除去（ウニ類） |
| moba_06 | 食害生物の除去（魚類） |
| moba_07 | 保護区域の設定 |
| moba_08 | ウニの密度管理 |
| moba_09 | 栄養塩類の供給 |
| moba_10 | 岩盤清掃 |
| moba_11 | 流域における植林 |
| moba_12 | 浮遊・堆積物の除去 |
| moba_13 | その他の特認活動 |
| moba_14 | モニタリング |

#### 干潟等の保全（category: higata）
| code | label |
|---|---|
| higata_01 | 砂泥の移動防止 |
| higata_02 | 客土 |
| higata_03 | 耕うん |
| higata_04 | 死殻の除去 |
| higata_05 | 機能低下を招く生物の除去（腹足類） |
| higata_06 | 機能低下を招く生物の除去（魚類） |
| higata_07 | 機能低下を招く生物の除去（節足類） |
| higata_08 | 機能低下を招く生物の除去（その他） |
| higata_09 | 保護区域の設定 |
| higata_10 | 稚貝等の沈着促進 |
| higata_11 | 稚貝の密度管理 |
| higata_12 | 機能強化のための生物移植 |
| higata_13 | 流域における植林 |
| higata_14 | 浮遊・堆積物の除去 |
| higata_15 | その他の特認活動 |
| higata_16 | モニタリング |

### 5.2 費目マスタ（expenseItems）

出納簿・報告書の費目分類（①〜⑮）。報告書レイヤーと共通。
| code | key | name |
|---|---|---|
| ① | jinken | 日当 |
| ② | shakin | 謝金 |
| ③ | yousen | 傭船料 |
| ④ | shizai | 資材費 |
| … | … | …（⑮まで要綱に準拠） |

### 5.3 期マスタ（periods）

| id | label | range | months |
|---|---|---|---|
| 1 | 第1回 | 4-6月 | 4,5,6 |
| 2 | 第2回 | 7-10月 | 7,8,9,10 |
| 3 | 第3回 | 11-2月 | 11,12,1,2 |

### 5.4 費目振分ルール（allocationRules）

- perPerson: 参加人数 × 日当/時給単価 → jinken
- perBoat: 用船隻数 × 用船料 → yousen
- perCar: 車両台数 × 車両代 → kotsu
- 資材費（shizai）は invLog(type="in") の購入行として計上

## 6. 画面別仕様

### 6.1 ダッシュボード
- 予算対比（執行/計画見込/見込み残額）、地区別・活動項目別内訳
- 警告：不足消耗品／実績未入力／支払未入力（未払い額>0）
- 支払未入力判定：実績算出額 − 既支払額（複数紐づけは算出額比率で按分、比率0は均等割り）
- 初心者向けチェックリスト：組織、地区・活動項目、予算、計画、実績、バックアップの現在状態を登録データから算出し、各画面へ移動可能
- 年度ふりかえり：活動日数、実績件数、延べ参加人数、計画件数、活動項目別件数、写真を表示。年度選択と印刷/PDF保存が可能
- 達成バッジ：初回計画・実績、実績10件、藻場/干潟双方の実績、写真、バックアップの達成状態を表示。独立の装飾機能で、帳票・公式集計値に影響しない
- 集計グラフ、実績、交付金収受、物品、入出庫等の空状態に次の入力案内と関連画面・登録操作への導線を表示

### 6.2 予算管理
- 水産多面的予算（単一）の当初予算入力/保存
- 交付金収受フロー（複数件CRUD）
- 支出実績（手入力）CRUD、実績/物品購入との複数紐づけ、差額チェック

### 6.3 単価・設定（組織マスタ）
- 組織設定：組織名、年度（令和X）、1日あたり活動時間、代表者名
- 賃金計算方式：daily（日当）| hourly（時給）
- 賃金単価：wageDaily / wageHourly
- 用船料（yousen）/ 車両代（sharyo）
- 地区設定（可変）：追加/編集/削除、各地区 id・name・standardPeople
- 人員名簿：地区別に登録/保存、実績入力の参加者候補に反映
- 活動項目設定：藻場14/干潟16から有効/無効を選択

### 6.4 物品管理
- 台帳CRUD（bihin/shomohin）、入庫処理（費用は水産多面的一本化）
- 入出庫履歴CRUD、入庫時に保管場所更新、消耗品不足判定
- 作業記録・様式5位置図・様式6写真に関連する画像は、縮小・圧縮後にIndexedDBのBlobとして管理

### 6.5 作業計画
- 計画CRUD、活動項目選択（有効項目）、地区選択（地区マスタ）
- 使用物品選択、見込み費用算出（賃金方式対応）
- 月間カレンダー、日付クリックで潮位グラフを選択・固定、日付ダブルクリックで新規計画入力
- 既存計画はカレンダー上の活動項目ラベルから編集、削除には確認を表示
- 潮位グラフは縦軸を−50〜250 cmに固定し、50 cm刻みで表示。グラフ上のポインター位置に対応する時刻・潮位を表示
- 選択日と一致する作業実績に開始・終了時刻がある場合、実作業時間帯をグラフ上に緑色の帯で表示
- 当月の計画がない場合、登録方法と計画登録モーダルへの案内を表示
- ICS出力（指定期間、全地区・全作業、.ics）

### 6.6 実績記録
- 実績CRUD、計画紐づけ/計画外、活動項目記録（必須）
- 使用物品による在庫連動、分割追加、月内絞り込み
- 賃金計算：daily=人数×日当単価／hourly=作業時間(start〜end自動算出)×人数×時給単価
- 単価指定（specialPay、対象者上書き）、CSV出力
- 必須チェック：活動項目／潜水作業の有無／特記事項

### 6.7 支払先集計
- 個人別／地区別／活動項目別／総合計

### 6.8 潮位データ
- 「単価・設定」の潮位データ画面からHD16形式のテキストファイルを取り込み、日付別・時間別の潮位データとして保存
- 作業計画画面では選択した日付の24時間潮位グラフを表示。該当日のデータがなければ「潮位データなし」を表示
- グラフ縦軸は年間データの範囲を考慮した固定値（−50〜250 cm）。ポインター位置の時刻・潮位は時間データ間を補間して表示

### 6.9 報告書：様式1（交付金交付申請書）
- 交付申請額の差額（④）を自動計算、Word（.doc）出力

### 6.10 報告書：様式2（交付金執行状況報告書）
- 計画額入力、期別集計（summarizeByPeriod）を自動読込、Excel出力
- バリデーション：計画額0で警告、各期実績を提示

### 6.11 報告書：様式3（金銭出納簿）
- 活動行＋資材購入行を統合表示（buildLedgerRows）
- 領収書番号の編集をデータ保存、Excel出力（帳簿形式）
- 残高：runningBalance = Σ(収入 − 支出)

### 6.12 報告書：様式4（活動記録簿）
- 活動データから自動生成（activityCode参照）、行クリックで様式5/6へ、Excel出力

### 6.13 報告書：様式5（活動記録日誌）
- 個別活動の詳細入力、位置図エディタ（矩形/円/テキスト、背景画像）
- 活動IDで様式6と連動、Excel/PDF

### 6.14 報告書：様式6（作業写真整理帳）
- 活動別に写真3枚単位で追加、回転±90°/スケール30-200%
- A4 3写真/ページ、活動別印刷・全体一括印刷、自動ページ番号

### 6.15 一括出力
- 様式1/2/3/4 をまとめて出力

### 6.16 バックアップ
- CSVバックアップ（写真なし・軽量）／フルバックアップ（写真込み・JSON）
- フル format = `moba_full_backup_v1`。通常業務データ、様式5・6データ、IndexedDB作業データ・画像を含む
- フルJSONの復元は現在の通常業務データとIndexedDB作業データを置き換える。バックアップの活動組織名が現在選択中の組織と一致しない場合は拒否
- CSVは確認・集計向けの軽量出力で、フルJSONの復元形式ではない
- IndexedDB作業データは `moba_indexeddb_backup_v1` 形式で個別にJSON出力・復元可能。日付単位の一覧・容量確認・選択削除に対応
- File System Access API対応ブラウザーでは保存先フォルダーを設定して出力可能。未対応・権限失効時は通常のダウンロードを使用
- 復元・削除は確認のうえで実行し、復元前には現データのバックアップを推奨

### 6.17 ヘルプ・使い方
- サイドバーから利用手順、画面ごとの概要、データ保護上の注意を参照
- ダッシュボードのはじめてガイド・年度ふりかえり・達成バッジと、潮位グラフの作業時間帯表示について説明
- 緊急時問い合わせ先を表示：杵築市役所 農林水産課 水産係（TEL: 0978-62-1809、E-mail: osamu-hatta@city.kitsuki.lg.jp）

## 7. データ仕様（概略）

### 7.1 保存キー（moba_）
moba_org / moba_settings / moba_budget / moba_grant_flow /
moba_budget_expense / moba_master / moba_areas / moba_members /
moba_activities / moba_plan / moba_record / moba_inventory /
moba_inv_log / moba_tide_record / moba_tide_data / moba_form5 /
moba_form6 / moba_last_backup

- 組織一覧 `moba_organizations_v1` と現在選択中の組織ID `moba_active_organization_id` は全組織で共有
- 既定組織は従来の `moba_` キーを維持。追加組織は `moba_{orgId}_{key}` 形式のキーを利用
- 作業用IndexedDBは既定組織が `moba_work_data`、追加組織が `moba_work_data_{orgId}`。日付別データと画像Blobを別ストアに保存
- 既存画面との互換性のため、実績等の一部はlocalStorageにもミラーされる。画像データ本体はIndexedDBに保存し、localStorage側では参照を使用

### 7.2 組織・設定（moba_org / moba_settings）
- orgName: string
- wageMode: "daily" | "hourly"
- year: number（令和X）
- defaultHours: number（1日あたり活動時間、既定3.5）
- chairman: string（代表者名）

### 7.3 マスタ（moba_master）
- wageDaily: number / wageHourly: number
- yousen: number / sharyo: number

### 7.4 地区マスタ（moba_areas）※可変配列
- id: string / name: string / standardPeople: number

### 7.5 人員名簿（moba_members）
- areaId ごとに string[]（地区別名簿）

### 7.6 活動項目マスタ（moba_activities）
- code: string / category: "moba" | "higata" / label: string / enabled: boolean

### 7.7 計画（moba_plan）
- id, date, areaId, activityCode, start, end, content,
  people, boat, car, usedItems, tools

### 7.8 実績（moba_record）
- id, planId, date, areaId, activityCode（必須）, content,
  members[], people, volunteer, boatOwners[], carOwners[],
  boat, car, usedItems[], diving, weather, note,
  workHours（hourly時、start〜end自動算出）,
  specialPay: { mode:"daily"|"hourly", unit:number, members:string[] } | null

- 作業実績は日付をキーとするIndexedDBのレコードとして保存・更新・削除し、従来画面向けにlocalStorage側の実績データとも同期

### 7.9 支出実績（moba_budget_expense）
- id, date, amount, payer, recordIds[]

### 7.10 物品（moba_inventory）
- id, name, category, qty, unit, place, min, memo, budgetUnit, photoThumb

### 7.11 入出庫ログ（moba_inv_log）
- id, itemId, itemName, type("in"|"out"), qty, date, memo,
  unitPrice, extraCost, totalCost（入庫時）

### 7.12 潮位・作業記録（moba_tide_record）
- 実績入力で潮位データを参照し、潮位（tideLevel）を自動補完可能。潮位メモ（tideNote）は入力・保存可能
- `moba_tide_record` は従来データとの互換用キー。現在の日別潮汐データは `moba_tide_data` に保存

### 7.13 潮汐データ（moba_tide_data）
- キー: YYYY-MM-DD ／ 値: number[24]（欠損は null）

### 7.14 様式5データ（moba_form5）
- recordId ごとの日誌本文・位置図（図形/テキスト/背景画像）。画像本体はIndexedDBのBlobを参照

### 7.15 様式6データ（moba_form6）
- recordId ごとの写真エントリ（画像Blob参照・回転・スケール・ページ/写真番号）。画像本体はIndexedDBに保存

## 8. 計算仕様

### 8.1 実績算出額（Calc.allocateRecord）
- daily: 人数 × wageDaily → jinken
- hourly: 作業時間(start〜end) × 人数 × wageHourly → jinken
- 用船: boat × yousen → yousen ／ 車両: car × sharyo → kotsu
- 資材: invLog(type="in") の totalCost（無ければ unitPrice×qty+extraCost）→ shizai
- specialPay 対象者は単価上書き

### 8.2 実施時間計算
- end 未入力時：start + defaultHours
- 実施時間 = end − start（日跨ぎ対応）

### 8.3 期判定（Core.periodOf）
- 月 → 期ID（4-6=1／7-10=2／11-2=3）

### 8.4 出納簿（Calc.buildLedgerRows）
- 協議会から組織への交付金収入行、活動支出行、資材購入行を統合し、残高 = Σ(収入 − 支出)
- 「組織 → 漁協（立替者）」の資金移動は組織収入として計上しない
- 活動の区分は表示名でなく活動コードを基準に藻場・干潟へ分類

### 8.5 期別集計（Calc.summarizeByPeriod）
- 期ごとの件数・支出合計・費目別内訳、総合計、採択額、残額、執行率
- 様式2で使用

### 8.6 支払按分
- 1紐づけ=全額／複数=算出額比率で配分／比率0=均等割り

### 8.7 潮位評価
- 指定時間帯の潮位最小/最大、干満は開始/終了差で簡易判定、潮名は月齢近似

## 9. 非機能要件・画面レイアウト
- クライアント側で動作。可用性・保存容量はブラウザーおよび端末に依存
- 認証・権限管理・暗号化は未実装。組織の切替は同一ブラウザー内でのデータ分離であり、アクセス制御ではない
- 画面ヘッダーとサイドバーは固定領域とし、メインコンテンツを独立して縦スクロールする
- 保全は手動バックアップを前提とする。保存先フォルダー指定は対応ブラウザーの権限に依存

## 10. 制約
- localStorage と IndexedDB の利用可能容量はブラウザー・端末・空き容量に依存。一定期間・件数の保存を保証しない
- 画像は保存時に縮小・圧縮するが、定期バックアップを推奨
- 複数ユーザー同時編集非対応／端末間同期なし
- 組織切替によるデータ分離は同一ブラウザー内のローカル保存。複数組織間の自動共有はしない
- 旧アサリ版データの取込は非対応
- フォルダーへの直接バックアップはFile System Access API対応ブラウザーとユーザー許可が必要。利用不可時は通常のダウンロードとなる
- 画像アップロード・背景画像読込等はブラウザーの実行環境・権限に依存（file:// では一部制限）

## 11. 旧2アプリからの主な統合・変更点
- 管理アプリと報告書アプリを1アプリに統合、CSV間接連携を廃止（同一store直接参照）
- 予算区分を水産多面的単一に一本化（suisan/shiitaku/hanbai 廃止）
- 賃金に時給方式を追加（日当/時給切替、時給は作業時間自動算出）
- 地区を固定2地区から可変マスタ化、名簿を地区別に
- 活動項目マスタ（藻場14/干潟16）を追加し計画・実績・様式に反映
- 物品費用の市単費/水産多面的振分を廃止し一本化
- 費目マスタ・期・費目振分・出納簿・期別集計を管理側に統合
- 様式5位置図・様式6写真をフルバックアップに包含
- localStorage を moba_ に統一、format=moba_full_backup_v1（アサリ版と分離）
