import { CameraOutlined, RedoOutlined } from "@ant-design/icons";
import { Alert, Button, Modal } from "antd";
import PropTypes from "prop-types";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

const CameraCaptureModal = ({ open, onCapture, onCancel, title, capturedAlt, canCancel = false, cancelText }) => {
  const { t } = useTranslation();
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [cameraError, setCameraError] = useState("");
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const [capturedImage, setCapturedImage] = useState("");

  // 停止摄像头媒体流，避免弹窗关闭后摄像头仍被占用。
  const stopCamera = useCallback(() => {
    if (!streamRef.current) {
      return;
    }

    streamRef.current.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  // 打开摄像头并把实时画面绑定到 video 元素。
  const startCamera = useCallback(async () => {
    setCameraError("");
    setIsCameraReady(false);
    setCapturedImage("");
    stopCamera();

    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("Current device does not support camera access.");
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "user",
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });

      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      setIsCameraReady(true);
    } catch (error) {
      setCameraError(error?.message || String(error));
      setIsCameraReady(false);
      stopCamera();
    }
  }, [stopCamera]);

  // 弹窗打开时启动摄像头，关闭时释放摄像头并清理状态。
  useEffect(() => {
    if (open) {
      startCamera();
      return;
    }

    stopCamera();
    setCapturedImage("");
    setCameraError("");
    setIsCameraReady(false);
  }, [open, startCamera, stopCamera]);

  // 组件卸载时兜底释放摄像头。
  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, [stopCamera]);

  const handleRetake = () => {
    startCamera();
  };

  // 从 video 当前帧绘制到 canvas，并导出为 JPEG data URL。
  const handleCapture = async () => {
    const video = videoRef.current;

    if (!video || !isCameraReady) {
      return;
    }

    setIsCapturing(true);

    try {
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;

      const context = canvas.getContext("2d");
      context.drawImage(video, 0, 0, canvas.width, canvas.height);

      const dataUrl = canvas.toDataURL("image/jpeg", 0.8);
      setCapturedImage(dataUrl);
      stopCamera();
    } finally {
      setIsCapturing(false);
    }
  };

  // 将拍照结果交给调用方，后续保存和业务处理由 hook/调用方继续完成。
  const handleConfirm = async () => {
    if (!capturedImage) {
      return;
    }

    await onCapture({
      dataUrl: capturedImage,
      mimeType: "image/jpeg",
    });
  };

  return (
    <Modal
      width={720}
      centered
      open={open}
      closable={false}
      maskClosable={false}
      title={title || t("staff.take_photo")}
      footer={
        <div className="flex justify-end gap-3">
          {canCancel ? <Button onClick={onCancel}>{cancelText || t("components.cancel")}</Button> : null}
          {capturedImage ? (
            <>
              <Button icon={<RedoOutlined />} onClick={handleRetake}>
                {t("staff.retake_photo")}
              </Button>
              <Button type="primary" onClick={handleConfirm}>
                {t("components.confirm")}
              </Button>
            </>
          ) : (
            <Button
              type="primary"
              icon={<CameraOutlined />}
              loading={isCapturing}
              disabled={!isCameraReady}
              onClick={handleCapture}
            >
              {t("staff.take_photo")}
            </Button>
          )}
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        {cameraError ? <Alert type="error" showIcon message="Unable to open camera" description={cameraError} /> : null}

        <div className="relative aspect-video w-full overflow-hidden rounded bg-black">
          {capturedImage ? (
            <img
              src={capturedImage}
              alt={capturedAlt || t("staff.captured_photo")}
              className="h-full w-full object-cover"
            />
          ) : (
            <video ref={videoRef} muted playsInline className="h-full w-full object-cover" />
          )}

          {!capturedImage && !isCameraReady && !cameraError ? (
            <div className="absolute inset-0 flex items-center justify-center text-white">
              {t("staff.opening_camera")}
            </div>
          ) : null}
        </div>
      </div>
    </Modal>
  );
};

CameraCaptureModal.propTypes = {
  open: PropTypes.bool,
  onCapture: PropTypes.func.isRequired,
  onCancel: PropTypes.func,
  title: PropTypes.string,
  capturedAlt: PropTypes.string,
  canCancel: PropTypes.bool,
  cancelText: PropTypes.string,
};

export default CameraCaptureModal;
