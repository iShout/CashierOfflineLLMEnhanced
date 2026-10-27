import { getDB } from "../index";

export type DeviceIdentityRecord = {
  id: number;
  device_id: string;
  hardware_fingerprint: string | null;
  hardware_snapshot: string | null;
  platform: string;
  confidence: string;
  created_at: string;
  updated_at: string;
};

export type CreateDeviceIdentityParams = {
  deviceId: string;
  hardwareFingerprint: string | null;
  hardwareSnapshot: Record<string, unknown>;
  platform: string;
  confidence: string;
};

export const getLocalDeviceIdentity = (): DeviceIdentityRecord | null => {
  return (
    (getDB()
      .prepare(
        `
          SELECT *
          FROM local_device_identity
          WHERE id = 1
          LIMIT 1
        `,
      )
      .get() as DeviceIdentityRecord | undefined) ?? null
  );
};

export const getLocalHardwareSnapshot = (): Record<string, unknown> | null => {
  const identity = getLocalDeviceIdentity();

  if (!identity?.hardware_snapshot) {
    return null;
  }

  try {
    return JSON.parse(identity.hardware_snapshot) as Record<string, unknown>;
  } catch {
    return null;
  }
};

export const createLocalDeviceIdentity = (params: CreateDeviceIdentityParams): DeviceIdentityRecord => {
  const now = new Date().toISOString();

  // 设备身份是本机安装实例的稳定标识，只在首次生成时插入单行记录。
  getDB()
    .prepare(
      `
        INSERT INTO local_device_identity (
          id,
          device_id,
          hardware_fingerprint,
          hardware_snapshot,
          platform,
          confidence,
          created_at,
          updated_at
        )
        VALUES (
          1,
          @device_id,
          @hardware_fingerprint,
          @hardware_snapshot,
          @platform,
          @confidence,
          @created_at,
          @updated_at
        )
      `,
    )
    .run({
      device_id: params.deviceId,
      hardware_fingerprint: params.hardwareFingerprint,
      hardware_snapshot: JSON.stringify(params.hardwareSnapshot),
      platform: params.platform,
      confidence: params.confidence,
      created_at: now,
      updated_at: now,
    });

  const identity = getLocalDeviceIdentity();

  if (!identity) {
    throw new Error("Failed to create local device identity.");
  }

  return identity;
};
