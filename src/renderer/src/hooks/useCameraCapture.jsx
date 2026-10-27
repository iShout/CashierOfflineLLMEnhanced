import { useCallback, useMemo, useRef, useState } from "react";
import CameraCaptureModal from "@renderer/components/CameraCaptureModal";

const DEFAULT_CAPTURE_OPTIONS = {
  sourceType: "camera",
  sourceKey: "camera-capture",
  canCancel: true,
};

const useCameraCapture = () => {
  const resolverRef = useRef(null);
  const rejecterRef = useRef(null);
  const [captureOptions, setCaptureOptions] = useState(null);

  const closeCapture = useCallback(() => {
    setCaptureOptions(null);
    resolverRef.current = null;
    rejecterRef.current = null;
  }, []);

  const openCameraCapture = useCallback((options = {}) => {
    return new Promise((resolve, reject) => {
      resolverRef.current = resolve;
      rejecterRef.current = reject;
      setCaptureOptions({
        ...DEFAULT_CAPTURE_OPTIONS,
        ...options,
      });
    });
  }, []);

  const handleCancel = useCallback(() => {
    resolverRef.current?.(null);
    closeCapture();
  }, [closeCapture]);

  const handleCapture = useCallback(
    async (photo) => {
      try {
        // 统一保存本地拍照资源，调用方只接收可用于业务字段的 asset。
        const asset = await window.api.assets.saveImageFromDataUrl({
          dataUrl: photo.dataUrl,
          sourceType: captureOptions?.sourceType ?? DEFAULT_CAPTURE_OPTIONS.sourceType,
          sourceKey: captureOptions?.sourceKey ?? DEFAULT_CAPTURE_OPTIONS.sourceKey,
        });

        resolverRef.current?.({
          asset,
          photo,
        });
        closeCapture();
      } catch (error) {
        rejecterRef.current?.(error);
        closeCapture();
      }
    },
    [captureOptions, closeCapture],
  );

  const cameraCaptureHolder = useMemo(
    () => (
      <CameraCaptureModal
        open={Boolean(captureOptions)}
        title={captureOptions?.title}
        capturedAlt={captureOptions?.capturedAlt}
        canCancel={captureOptions?.canCancel}
        cancelText={captureOptions?.cancelText}
        onCancel={handleCancel}
        onCapture={handleCapture}
      />
    ),
    [captureOptions, handleCancel, handleCapture],
  );

  return {
    cameraCaptureHolder,
    openCameraCapture,
  };
};

export default useCameraCapture;
