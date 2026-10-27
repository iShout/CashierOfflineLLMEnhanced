import crypto from "node:crypto";
import os from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  createLocalDeviceIdentity,
  getLocalDeviceIdentity,
  type DeviceIdentityRecord,
} from "@db/DBManager/device-identity";

const execFileAsync = promisify(execFile);
const DEVICE_HASH_PREFIX = "swifood-offline-device-v1";
let pendingDeviceIdentity: Promise<DeviceIdentity> | null = null;
const INVALID_VALUES = new Set([
  "",
  "0",
  "none",
  "null",
  "undefined",
  "unknown",
  "default string",
  "system serial number",
  "to be filled by o.e.m.",
  "to be filled by oem",
  "not specified",
  "not available",
  "00000000-0000-0000-0000-000000000000",
  "ffffffff-ffff-ffff-ffff-ffffffffffff",
]);

type HardwareSnapshot = {
  biosSerial?: string | null;
  systemUuid?: string | null;
  machineGuid?: string | null;
  serialNumber?: string | null;
  physicalMac?: string | null;
  platform: NodeJS.Platform;
};

export type DeviceIdentity = {
  deviceId: string;
  hardwareFingerprint: string | null;
  hardwareSnapshot: HardwareSnapshot | null;
  platform: string;
  confidence: string;
  source: "persisted" | "generated";
  createdAt: string;
  updatedAt: string;
};

const normalizeValue = (value?: string | null): string | null => {
  const normalized = String(value ?? "").trim();

  if (!normalized) {
    return null;
  }

  const compact = normalized.replace(/\s+/g, " ");
  const comparable = compact.toLowerCase();

  if (INVALID_VALUES.has(comparable)) {
    return null;
  }

  if (/^0+$/.test(compact.replace(/[-:]/g, ""))) {
    return null;
  }

  return compact;
};

const hashValue = (value: string): string => {
  return crypto.createHash("sha256").update(value).digest("hex");
};

const parseJsonObject = (value: string | null): HardwareSnapshot | null => {
  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value) as HardwareSnapshot;
  } catch {
    return null;
  }
};

const toDeviceIdentity = (
  record: DeviceIdentityRecord,
  source: DeviceIdentity["source"],
): DeviceIdentity => ({
  deviceId: record.device_id,
  hardwareFingerprint: record.hardware_fingerprint,
  hardwareSnapshot: parseJsonObject(record.hardware_snapshot),
  platform: record.platform,
  confidence: record.confidence,
  source,
  createdAt: record.created_at,
  updatedAt: record.updated_at,
});

const getPrimaryPhysicalMac = (): string | null => {
  const virtualKeywords = [
    "loopback",
    "virtual",
    "vmware",
    "virtualbox",
    "docker",
    "hyper-v",
    "bluetooth",
    "vpn",
    "tap",
    "tunnel",
    "pseudo",
  ];
  const candidates: Array<{ name: string; mac: string; score: number }> = [];
  const interfaces = os.networkInterfaces();

  Object.entries(interfaces).forEach(([name, values]) => {
    const lowerName = name.toLowerCase();
    const isVirtualName = virtualKeywords.some((keyword) => lowerName.includes(keyword));

    values?.forEach((networkInterface) => {
      const mac = normalizeValue(networkInterface.mac);

      if (!mac || networkInterface.internal || isVirtualName) {
        return;
      }

      candidates.push({
        name,
        mac: mac.toLowerCase(),
        score: lowerName.includes("ethernet") || lowerName === "en0" ? 0 : 1,
      });
    });
  });

  candidates.sort((left, right) => left.score - right.score || left.name.localeCompare(right.name));

  return candidates[0]?.mac ?? null;
};

const readWindowsHardwareSnapshot = async (): Promise<HardwareSnapshot> => {
  const command = `
$bios = Get-CimInstance Win32_BIOS
$system = Get-CimInstance Win32_ComputerSystemProduct
$machine = Get-ItemProperty 'HKLM:\\SOFTWARE\\Microsoft\\Cryptography'
[PSCustomObject]@{
  biosSerial = $bios.SerialNumber
  systemUuid = $system.UUID
  machineGuid = $machine.MachineGuid
} | ConvertTo-Json -Compress
`;

  try {
    const { stdout } = await execFileAsync(
      "powershell.exe",
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", command],
      { timeout: 8000 },
    );
    const payload = JSON.parse(stdout.trim() || "{}") as Record<string, string>;

    return {
      biosSerial: normalizeValue(payload.biosSerial),
      systemUuid: normalizeValue(payload.systemUuid),
      machineGuid: normalizeValue(payload.machineGuid),
      physicalMac: getPrimaryPhysicalMac(),
      platform: process.platform,
    };
  } catch {
    return {
      physicalMac: getPrimaryPhysicalMac(),
      platform: process.platform,
    };
  }
};

const readMacHardwareSnapshot = async (): Promise<HardwareSnapshot> => {
  try {
    const { stdout } = await execFileAsync("/usr/sbin/ioreg", ["-rd1", "-c", "IOPlatformExpertDevice"], {
      timeout: 8000,
    });
    const serialMatch = stdout.match(/"IOPlatformSerialNumber"\s=\s"([^"]+)"/);
    const uuidMatch = stdout.match(/"IOPlatformUUID"\s=\s"([^"]+)"/);

    return {
      serialNumber: normalizeValue(serialMatch?.[1]),
      systemUuid: normalizeValue(uuidMatch?.[1]),
      physicalMac: getPrimaryPhysicalMac(),
      platform: process.platform,
    };
  } catch {
    return {
      physicalMac: getPrimaryPhysicalMac(),
      platform: process.platform,
    };
  }
};

const readHardwareSnapshot = async (): Promise<HardwareSnapshot> => {
  if (process.platform === "win32") {
    return readWindowsHardwareSnapshot();
  }

  if (process.platform === "darwin") {
    return readMacHardwareSnapshot();
  }

  return {
    physicalMac: getPrimaryPhysicalMac(),
    platform: process.platform,
  };
};

const buildFingerprintInput = (snapshot: HardwareSnapshot): string[] => {
  return [
    snapshot.systemUuid,
    snapshot.biosSerial,
    snapshot.serialNumber,
    snapshot.machineGuid,
    snapshot.physicalMac,
  ]
    .map(normalizeValue)
    .filter((value): value is string => Boolean(value))
    .map((value) => value.toLowerCase());
};

const getConfidence = (validFieldCount: number): string => {
  if (validFieldCount >= 3) {
    return "high";
  }

  if (validFieldCount >= 2) {
    return "medium";
  }

  return "low";
};

const createOrReadDeviceIdentity = async (): Promise<DeviceIdentity> => {
  const existingIdentity = getLocalDeviceIdentity();

  if (existingIdentity) {
    return toDeviceIdentity(existingIdentity, "persisted");
  }

  const hardwareSnapshot = await readHardwareSnapshot();
  const fingerprintFields = buildFingerprintInput(hardwareSnapshot);
  const fingerprintInput =
    fingerprintFields.length > 0
      ? `${DEVICE_HASH_PREFIX}|${fingerprintFields.join("|")}`
      : `${DEVICE_HASH_PREFIX}|fallback|${crypto.randomUUID()}`;
  const hardwareFingerprint = hashValue(fingerprintInput);

  // device_id 首次生成后写入本地表，后续始终复用，避免硬件字段变化导致业务设备号漂移。
  const createdIdentity = createLocalDeviceIdentity({
    deviceId: hardwareFingerprint,
    hardwareFingerprint,
    hardwareSnapshot,
    platform: process.platform,
    confidence: getConfidence(fingerprintFields.length),
  });

  return toDeviceIdentity(createdIdentity, "generated");
};

export const getDeviceIdentity = async (): Promise<DeviceIdentity> => {
  if (!pendingDeviceIdentity) {
    // 首次调用可能被多个窗口同时触发，用同一个 Promise 防止重复插入 singleton 记录。
    pendingDeviceIdentity = createOrReadDeviceIdentity().finally(() => {
      pendingDeviceIdentity = null;
    });
  }

  return pendingDeviceIdentity;
};
