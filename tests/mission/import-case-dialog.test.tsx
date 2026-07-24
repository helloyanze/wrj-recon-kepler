import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {act, cleanup, fireEvent, render, renderHook, screen, waitFor} from "@testing-library/react";
import {afterEach, describe, expect, it, vi} from "vitest";
import {ImportCaseDialog} from "../../src/components/workspace/ImportCaseDialog";
import {
  type CaseRepository
} from "../../src/features/cases/caseRepository";
import {
  type ImportWorkerRequest,
  type ImportWorkerResponse
} from "../../src/features/cases/importPackage";
import {
  useCaseImport,
  type CaseImportDependencies,
  type ImportWorkerClient
} from "../../src/hooks/useCaseImport";
import type {CaseBundleV2} from "../../src/features/cases/caseBundle";

const bundle = JSON.parse(readFileSync(resolve(
  "public/data/integration-cases/R10-LONG-TRANSIT-01/bundle.json"
), "utf8")) as CaseBundleV2;

class FakeWorker implements ImportWorkerClient {
  onmessage: ((event: MessageEvent<ImportWorkerResponse>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  postMessage = vi.fn();
  terminate = vi.fn();

  respond(response: ImportWorkerResponse): void {
    this.onmessage?.({data: response} as MessageEvent<ImportWorkerResponse>);
  }
}

function zipFile(name = "R10.zip"): File {
  const file = new File(["zip"], name, {type: "application/zip"});
  Object.defineProperty(file, "arrayBuffer", {
    value: vi.fn(async () => new Uint8Array([1, 2, 3]).buffer)
  });
  return file;
}

function harness(existing?: CaseBundleV2) {
  const worker = new FakeWorker();
  const repository: CaseRepository = {
    persistent: true,
    list: vi.fn(async () => []),
    get: vi.fn(async () => existing),
    save: vi.fn(async () => undefined),
    remove: vi.fn(async () => undefined)
  };
  const dependencies: CaseImportDependencies = {
    createWorker: vi.fn(() => worker),
    openCaseRepository: vi.fn(async () => repository)
  };
  return {worker, repository, dependencies};
}

function latestParse(worker: FakeWorker): Extract<
ImportWorkerRequest, {type: "parse"}> {
  const call = worker.postMessage.mock.calls.find(
    ([message]) => (message as ImportWorkerRequest).type === "parse"
  );
  if (call === undefined) throw new Error("parse request not posted");
  return call[0] as Extract<ImportWorkerRequest, {type: "parse"}>;
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("useCaseImport", () => {
  it("transfers the file buffer, reports progress and saves only after confirmation", async () => {
    const {worker, repository, dependencies} = harness();
    const {result} = renderHook(() => useCaseImport({dependencies}));

    await act(async () => result.current.chooseFile(zipFile()));
    const request = latestParse(worker);
    expect(request).toMatchObject({
      type: "parse",
      fileName: "R10.zip",
      bytes: expect.any(ArrayBuffer)
    });
    expect(worker.postMessage).toHaveBeenCalledWith(
      request,
      [request.bytes]
    );

    act(() => worker.respond({
      type: "progress",
      requestId: request.requestId,
      stage: "validate",
      percent: 55
    }));
    expect(result.current.progress).toEqual({stage: "validate", percent: 55});

    act(() => worker.respond({
      type: "success",
      requestId: request.requestId,
      bundle,
      preview: {
        caseId: bundle.case.caseId,
        uavCount: bundle.metrics.uavCount,
        sortieCount: bundle.metrics.sortieCount,
        batchCount: bundle.metrics.batchCount,
        stripCount: bundle.metrics.stripCount,
        durationSec: bundle.metrics.missionMakespanSec,
        warnings: ["测试提示"]
      }
    }));
    await waitFor(() => expect(result.current.status).toBe("preview"));
    expect(repository.save).not.toHaveBeenCalled();

    let savedKey: string | undefined;
    await act(async () => {
      savedKey = await result.current.confirm();
    });
    expect(repository.save).toHaveBeenCalledWith(bundle, {overwrite: false});
    expect(savedKey).toBe(
      `${bundle.case.caseId}:${bundle.case.planId}:imported`
    );
    expect(result.current.status).toBe("saved");
  });

  it("requires explicit overwrite for a duplicate case and plan", async () => {
    const {worker, repository, dependencies} = harness(bundle);
    const {result} = renderHook(() => useCaseImport({dependencies}));
    await act(async () => result.current.chooseFile(zipFile()));
    const request = latestParse(worker);

    act(() => worker.respond({
      type: "success",
      requestId: request.requestId,
      bundle,
      preview: {
        caseId: bundle.case.caseId,
        uavCount: 2,
        sortieCount: 5,
        batchCount: 3,
        stripCount: 20,
        durationSec: 3598,
        warnings: []
      }
    }));
    await waitFor(() => expect(result.current.duplicate).toBe(true));

    await expect(result.current.confirm()).rejects.toThrow("已存在");
    expect(repository.save).not.toHaveBeenCalled();
    await act(async () => {
      await result.current.confirm(true);
    });
    expect(repository.save).toHaveBeenCalledWith(bundle, {overwrite: true});
  });

  it("sends a typed cancel, ignores stale responses and terminates on unmount", async () => {
    const {worker, dependencies} = harness();
    const {result, unmount} = renderHook(() => useCaseImport({dependencies}));
    await act(async () => result.current.chooseFile(zipFile("first.zip")));
    const first = latestParse(worker);

    act(() => result.current.cancel());
    expect(worker.postMessage).toHaveBeenLastCalledWith({
      type: "cancel",
      requestId: first.requestId
    });
    expect(result.current.status).toBe("idle");

    act(() => worker.respond({
      type: "failure",
      requestId: first.requestId,
      message: "stale failure"
    }));
    expect(result.current.error).toBeNull();
    unmount();
    expect(worker.terminate).toHaveBeenCalledTimes(1);
  });
});

describe("ImportCaseDialog", () => {
  it("rejects non-ZIP files and previews imported mission details", async () => {
    const {worker, dependencies} = harness();
    render(
      <ImportCaseDialog
        open
        dependencies={dependencies}
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />
    );

    const input = screen.getByLabelText("选择 ZIP 文件");
    const json = new File(["{}"], "plan.json", {type: "application/json"});
    fireEvent.change(input, {target: {files: [json]}});
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "请选择 .zip 格式"
    );
    expect(screen.getByRole("button", {name: "确认导入"})).toBeDisabled();

    fireEvent.change(input, {target: {files: [zipFile()]}});
    await waitFor(() => expect(worker.postMessage).toHaveBeenCalled());
    const request = latestParse(worker);
    act(() => worker.respond({
      type: "success",
      requestId: request.requestId,
      bundle,
      preview: {
        caseId: bundle.case.caseId,
        uavCount: 2,
        sortieCount: 5,
        batchCount: 3,
        stripCount: 20,
        durationSec: 3598.185,
        warnings: ["航迹包含等待段"]
      }
    }));

    expect(await screen.findByText(bundle.case.caseId)).toBeInTheDocument();
    expect(screen.getByText("R10.zip")).toBeInTheDocument();
    expect(screen.getByText("2 架")).toBeInTheDocument();
    expect(screen.getByText("5 架次")).toBeInTheDocument();
    expect(screen.getByText("3 批次")).toBeInTheDocument();
    expect(screen.getByText("20 条")).toBeInTheDocument();
    expect(screen.getByText("航迹包含等待段")).toBeInTheDocument();
    expect(screen.getByText(/LOCAL_CARTESIAN_M/)).toBeInTheDocument();
    expect(screen.getByRole("button", {name: "确认导入"})).toBeEnabled();
  });

  it("blocks duplicate confirmation until overwrite is checked and reports save errors", async () => {
    const {worker, repository, dependencies} = harness(bundle);
    vi.mocked(repository.save).mockRejectedValueOnce(new Error("存储空间不足"));
    render(
      <ImportCaseDialog
        open
        dependencies={dependencies}
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />
    );
    fireEvent.change(screen.getByLabelText("选择 ZIP 文件"), {
      target: {files: [zipFile()]}
    });
    await waitFor(() => expect(worker.postMessage).toHaveBeenCalled());
    const request = latestParse(worker);
    act(() => worker.respond({
      type: "success",
      requestId: request.requestId,
      bundle,
      preview: {
        caseId: bundle.case.caseId,
        uavCount: 2,
        sortieCount: 5,
        batchCount: 3,
        stripCount: 20,
        durationSec: 3598,
        warnings: []
      }
    }));

    const confirm = await screen.findByRole("button", {name: "确认导入"});
    expect(confirm).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox", {name: "覆盖已有同名算例"}));
    expect(confirm).toBeEnabled();
    fireEvent.click(confirm);
    expect(await screen.findByRole("alert")).toHaveTextContent("存储空间不足");
    expect(screen.getByRole("button", {name: "重试保存"})).toBeEnabled();
  });

  it("shows the session-only fallback warning and closes through cancel", async () => {
    const {dependencies, repository} = harness();
    repository.persistent = false;
    const onClose = vi.fn();
    render(
      <ImportCaseDialog
        open
        dependencies={dependencies}
        onClose={onClose}
        onSaved={vi.fn()}
      />
    );

    expect(await screen.findByText(
      "仅当前会话有效，刷新后不会保留"
    )).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", {name: "取消"}));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
