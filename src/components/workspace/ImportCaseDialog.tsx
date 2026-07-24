import {useEffect, useRef, useState, type DragEvent} from "react";
import type {CaseBundleV2} from "../../features/cases/caseBundle";
import {
  useCaseImport,
  type CaseImportDependencies
} from "../../hooks/useCaseImport";

export interface ImportCaseDialogProps {
  open: boolean;
  dependencies?: CaseImportDependencies;
  onClose(): void;
  onSaved(key: string, bundle: CaseBundleV2): void | Promise<void>;
}

const STAGE_LABELS = {
  unzip: "解压",
  validate: "校验",
  convert: "转换"
} as const;

function formatDuration(seconds: number): string {
  const totalSeconds = Math.max(0, Math.round(seconds));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const remainingSeconds = totalSeconds % 60;
  return hours > 0
    ? `${hours} 小时 ${minutes} 分 ${remainingSeconds} 秒`
    : `${minutes} 分 ${remainingSeconds} 秒`;
}

export function ImportCaseDialog({
  open,
  dependencies,
  onClose,
  onSaved
}: ImportCaseDialogProps) {
  const importer = useCaseImport({dependencies});
  const cancelImport = importer.cancel;
  const [overwrite, setOverwrite] = useState(false);
  const [dragging, setDragging] = useState(false);
  const previouslyOpen = useRef(open);

  useEffect(() => {
    if (previouslyOpen.current && !open) cancelImport();
    previouslyOpen.current = open;
    if (!open) {
      setOverwrite(false);
      setDragging(false);
    }
  }, [cancelImport, open]);

  if (!open) return null;

  const chooseFile = (file: File | undefined): void => {
    if (file === undefined) return;
    setOverwrite(false);
    void importer.chooseFile(file);
  };

  const drop = (event: DragEvent<HTMLDivElement>): void => {
    event.preventDefault();
    setDragging(false);
    chooseFile(event.dataTransfer.files[0]);
  };

  const close = (): void => {
    importer.cancel();
    onClose();
  };

  const confirm = (): void => {
    void importer.confirm(overwrite).then(async key => {
      if (importer.preview === null) return;
      await onSaved(key, importer.preview.bundle);
      importer.reset();
      onClose();
    }).catch(() => {
      // The hook exposes the readable save error in the dialog.
    });
  };

  const preview = importer.preview;
  const processing =
    importer.status === "reading" || importer.status === "processing";
  const canConfirm =
    preview !== null &&
    !processing &&
    importer.status !== "saving" &&
    (!importer.duplicate || overwrite);
  const progressLabel = importer.status === "saving"
    ? "保存"
    : importer.progress === null
      ? null
      : STAGE_LABELS[importer.progress.stage];

  return (
    <div className="import-dialog-backdrop">
      <section
        className="import-case-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="import-case-title"
      >
        <header>
          <div>
            <small>ALGORITHM CASE PACKAGE</small>
            <h2 id="import-case-title">本地导入算例</h2>
          </div>
          <button type="button" aria-label="关闭导入窗口" onClick={close}>×</button>
        </header>

        <div className="import-dialog-content">
          {importer.persistent === false ? (
            <p className="import-fallback-warning">
              仅当前会话有效，刷新后不会保留
            </p>
          ) : null}

          <div
            className={`import-drop-zone ${dragging ? "dragging" : ""}`}
            onDragEnter={event => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragOver={event => event.preventDefault()}
            onDragLeave={() => setDragging(false)}
            onDrop={drop}
          >
            <strong>拖放算法 ZIP 文件到此处</strong>
            <span>或从本机选择固定格式的算例包</span>
            <label>
              选择文件
              <input
                aria-label="选择 ZIP 文件"
                type="file"
                accept=".zip,application/zip"
                disabled={processing || importer.status === "saving"}
                onChange={event => {
                  chooseFile(event.currentTarget.files?.[0]);
                  event.currentTarget.value = "";
                }}
              />
            </label>
          </div>

          {progressLabel !== null ? (
            <div className="import-progress" aria-live="polite">
              <div>
                <span>{progressLabel}中…</span>
                <b>{importer.status === "saving"
                  ? "正在写入"
                  : `${Math.round(importer.progress?.percent ?? 0)}%`}</b>
              </div>
              <progress
                aria-label={`${progressLabel}进度`}
                max={100}
                value={importer.status === "saving"
                  ? 100
                  : importer.progress?.percent ?? 0}
              />
            </div>
          ) : null}

          {importer.error !== null ? (
            <p className="import-error" role="alert">{importer.error}</p>
          ) : null}

          {preview !== null ? (
            <section className="import-preview" aria-label="导入预览">
              <header>
                <div>
                  <small>算例</small>
                  <strong>{preview.details.caseId}</strong>
                </div>
                <span>{preview.sourceName}</span>
              </header>
              <dl>
                <div><dt>无人机</dt><dd>{preview.details.uavCount} 架</dd></div>
                <div><dt>架次</dt><dd>{preview.details.sortieCount} 架次</dd></div>
                <div><dt>批次</dt><dd>{preview.details.batchCount} 批次</dd></div>
                <div><dt>条带</dt><dd>{preview.details.stripCount} 条</dd></div>
                <div>
                  <dt>任务时长</dt>
                  <dd>{formatDuration(preview.details.durationSec)}</dd>
                </div>
              </dl>
              {preview.details.warnings.length > 0 ? (
                <div className="import-warnings">
                  <strong>数据提示</strong>
                  <ul>
                    {preview.details.warnings.map((warning, index) => (
                      <li key={`${index}:${warning}`}>{warning}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              <p className="import-coordinate-notice">
                数据坐标为 LOCAL_CARTESIAN_M。展示时会锚定到日月湾，
                该位置不代表真实地理定位。
              </p>
              {importer.duplicate ? (
                <label className="import-overwrite">
                  <input
                    type="checkbox"
                    checked={overwrite}
                    onChange={event => setOverwrite(event.currentTarget.checked)}
                  />
                  覆盖已有同名算例
                </label>
              ) : null}
            </section>
          ) : null}
        </div>

        <footer>
          <button type="button" onClick={close}>取消</button>
          <button
            type="button"
            className="primary"
            disabled={!canConfirm}
            onClick={confirm}
          >
            {importer.status === "error" && preview !== null
              ? "重试保存"
              : importer.status === "saving"
                ? "保存中…"
                : "确认导入"}
          </button>
        </footer>
      </section>
    </div>
  );
}
